'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useRouter } from 'next/navigation'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Send,
  Users,
  ArrowLeft,
  RefreshCw,
  Crown,
} from 'lucide-react'
import WebRTCManager from '@/lib/webrtc-manager'
import {
  initializeSocket,
  joinRoom,
  leaveRoom as socketLeaveRoom,
  onUserJoined,
  onUserLeft,
  sendOffer,
  sendAnswer,
  sendIceCandidate,
  onWebRTCOffer,
  onWebRTCAnswer,
  onWebRTCIceCandidate,
  disconnectSocket,
  getSocket,
} from '@/lib/socket-client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface Participant {
  id: string
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  is_audio_enabled: boolean
  is_video_enabled: boolean
  is_host: boolean
}

interface Message {
  id: string
  content: string
  user_id: string
  display_name: string
  avatar_url: string | null
  created_at: string
}

interface RoomInfo {
  id: string
  name: string
  description: string
  host_id: string
  room_type: string
}

interface RoomPageProps {
  roomId: string
}

export default function RoomPage({ roomId }: RoomPageProps) {
  const router = useRouter()
  const supabase = createClient()
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const webrtcManagerRef = useRef<WebRTCManager | null>(null)
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map())
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const channelParticipantsRef = useRef<any>(null)
  const channelMessagesRef = useRef<any>(null)

  useEffect(() => {
    initializeRoom()
    return () => {
      // Cleanup on unmount
      leaveRoom()
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closeAllConnections()
        webrtcManagerRef.current.stopLocalStream()
      }
      disconnectSocket()
    }
  }, [roomId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Polling fallback for participants and messages
  useEffect(() => {
    if (loading) return

    const interval = setInterval(() => {
      loadParticipants()
      loadMessages()
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [loading, roomId])

  // Attach local stream to video element
  useEffect(() => {
    if (webrtcManagerRef.current && localVideoRef.current) {
      const localStream = webrtcManagerRef.current.getLocalStream()
      if (localStream) {
        localVideoRef.current.srcObject = localStream
        console.log('[v0] Local stream attached to video element')
      }
    }
  }, [isAudioEnabled, isVideoEnabled])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const initializeRoom = async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()

      if (!authUser) {
        router.push('/auth/login')
        return
      }

      // Get room info
      const { data: roomData } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      setRoom(roomData)

      // Get user profile
      const { data: userProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      setCurrentUser(userProfile)

      // Join room
      const { data: existingParticipant } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', authUser.id)
        .single()

      if (!existingParticipant) {
        await supabase.from('room_participants').insert({
          room_id: roomId,
          user_id: authUser.id,
          is_audio_enabled: true,
          is_video_enabled: false,
        })
      }

      // Initialize WebRTC Manager
      webrtcManagerRef.current = new WebRTCManager()

      // Initialize local stream (audio only by default)
      try {
        await webrtcManagerRef.current.initializeLocalStream(
          isAudioEnabled,
          isVideoEnabled
        )
        console.log('[v0] Local stream initialized, audio:', isAudioEnabled, 'video:', isVideoEnabled)
      } catch (error) {
        console.warn('[v0] Could not get user media:', error)
      }

      // Initialize Socket.io
      const socket = initializeSocket()
      console.log('[v0] Socket initialized, connected:', socket?.connected)

      // Join room via Socket.io for WebRTC signaling
      if (userProfile) {
        joinRoom(roomId, authUser.id, userProfile.display_name)
        console.log('[v0] Joined room via socket:', roomId)
      }

      // Setup WebRTC signal handlers
      setupWebRTCSignaling(authUser.id)

      // Load participants
      loadParticipants()

      // Load messages
      loadMessages()

      // Subscribe to real-time updates (with error handling)
      try {
        channelParticipantsRef.current = supabase.channel(`room:${roomId}:participants`)

        channelParticipantsRef.current.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'room_participants',
            filter: `room_id=eq.${roomId}`,
          },
          () => {
            loadParticipants()
          }
        )

        channelParticipantsRef.current.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('[v0] Participants channel subscribed')
          }
        })
      } catch (err) {
        console.warn('[v0] Participants channel error:', err)
      }

      try {
        channelMessagesRef.current = supabase.channel(`room:${roomId}:messages`)

        channelMessagesRef.current.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload: any) => {
            const newMessage: Message = {
              id: payload.new.id,
              content: payload.new.content,
              user_id: payload.new.user_id,
              display_name: '',
              created_at: payload.new.created_at,
            }
            setMessages((prev) => [...prev, newMessage])
          }
        )

        channelMessagesRef.current.subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('[v0] Messages channel subscribed')
          }
        })
      } catch (err) {
        console.warn('[v0] Messages channel error:', err)
      }

      setLoading(false)

      return () => {
        if (channelParticipantsRef.current) {
          supabase.removeChannel(channelParticipantsRef.current)
        }
        if (channelMessagesRef.current) {
          supabase.removeChannel(channelMessagesRef.current)
        }
      }
    } catch (error) {
      console.error('[v0] Error initializing room:', error)
      setLoading(false)
    }
  }

  const setupWebRTCSignaling = (currentUserId: string) => {
    const socket = getSocket()
    if (!socket) return

    // Handle incoming offer
    onWebRTCOffer(roomId, ({ fromUserId, offer }) => {
      if (!webrtcManagerRef.current) return

      const peer = webrtcManagerRef.current.createPeerConnection(
        fromUserId,
        false,
        (stream) => {
          remoteStreamsRef.current.set(fromUserId, stream)
        },
        (signal) => {
          sendAnswer(roomId, fromUserId, signal)
        },
        (error) => console.error('[v0] Peer error:', error),
        () => {
          remoteStreamsRef.current.delete(fromUserId)
        }
      )

      peer.signal(offer)
    })

    // Handle incoming answer
    onWebRTCAnswer(roomId, ({ fromUserId, answer }) => {
      if (!webrtcManagerRef.current) return

      webrtcManagerRef.current.addSignal(fromUserId, answer)
    })

    // Handle incoming ICE candidate
    onWebRTCIceCandidate(roomId, ({ fromUserId, candidate }) => {
      if (!webrtcManagerRef.current) return

      webrtcManagerRef.current.addSignal(fromUserId, candidate)
    })

    // Handle user joined
    onUserJoined(roomId, ({ userId, userName }) => {
      if (userId === currentUserId || !webrtcManagerRef.current) return

      // Create peer connection for new user
      const peer = webrtcManagerRef.current.createPeerConnection(
        userId,
        true,
        (stream) => {
          remoteStreamsRef.current.set(userId, stream)
        },
        (signal) => {
          sendOffer(roomId, userId, signal)
        },
        (error) => console.error('[v0] Peer error:', error),
        () => {
          remoteStreamsRef.current.delete(userId)
        }
      )
    })

    // Handle user left
    onUserLeft(roomId, (userId) => {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closePeerConnection(userId)
      }
      remoteStreamsRef.current.delete(userId)
    })
  }

  const loadParticipants = async () => {
    try {
      // First get the room to know who the host is
      const { data: roomData } = await supabase
        .from('rooms')
        .select('host_id')
        .eq('id', roomId)
        .single()

      const hostId = roomData?.host_id

      const { data, error } = await supabase
        .from('room_participants')
        .select(
          `
          id,
          user_id,
          is_audio_enabled,
          is_video_enabled,
          users(username, display_name, avatar_url)
        `
        )
        .eq('room_id', roomId)
        .is('left_at', null)

      if (error) {
        console.warn('[v0] Error loading participants:', error.message)
        // Try fallback - maybe room_participants table doesn't exist yet
        return
      }

      if (data) {
        const participantsList = data.map((p: any) => ({
          id: p.id,
          user_id: p.user_id,
          username: p.users?.username,
          display_name: p.users?.display_name,
          avatar_url: p.users?.avatar_url,
          is_audio_enabled: p.is_audio_enabled,
          is_video_enabled: p.is_video_enabled,
          is_host: p.user_id === hostId,
        }))
        setParticipants(participantsList)
      }
    } catch (err) {
      console.warn('[v0] Could not load participants:', err)
    }
  }

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(
          `
          id,
          content,
          user_id,
          created_at,
          users(display_name, avatar_url)
        `
        )
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      if (error) {
        console.warn('[v0] Messages table not available:', error.message)
        // Silently fail - messages are optional
        setMessages([])
        return
      }

      if (data) {
        const messagesList = data.map((m: any) => ({
          id: m.id,
          content: m.content,
          user_id: m.user_id,
          display_name: m.users?.display_name || 'Unknown',
          avatar_url: m.users?.avatar_url || null,
          created_at: m.created_at,
        }))
        setMessages(messagesList)
      }
    } catch (err) {
      console.warn('[v0] Could not load messages:', err)
      setMessages([])
    }
  }

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!messageInput.trim() || !currentUser) return

    try {
      const { error } = await supabase.from('messages').insert({
        room_id: roomId,
        user_id: currentUser.id,
        content: messageInput,
      })

      if (error) {
        console.error('[v0] Error sending message:', error.message, error.details)
        return
      }
      setMessageInput('')
    } catch (error: any) {
      console.error('[v0] Error sending message:', error?.message || error)
    }
  }

  const toggleAudio = async () => {
    const newState = !isAudioEnabled
    setIsAudioEnabled(newState)

    // Enable/disable audio tracks
    if (webrtcManagerRef.current) {
      const localStream = webrtcManagerRef.current.getLocalStream()
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.enabled = newState
        })
      }
    }

    // Update participant status
    const participant = participants.find((p) => p.user_id === currentUser?.id)
    if (participant) {
      await supabase
        .from('room_participants')
        .update({ is_audio_enabled: newState })
        .eq('id', participant.id)
    }
  }

  const toggleVideo = async () => {
    const newState = !isVideoEnabled
    setIsVideoEnabled(newState)

    // Reinitialize local stream with new video state
    if (webrtcManagerRef.current) {
      try {
        await webrtcManagerRef.current.initializeLocalStream(isAudioEnabled, newState)
        const localStream = webrtcManagerRef.current.getLocalStream()
        if (localStream && localVideoRef.current) {
          localVideoRef.current.srcObject = localStream
        }
        console.log('[v0] Video toggled, new state:', newState)
      } catch (error) {
        console.error('[v0] Error toggling video:', error)
      }
    }

    // Update participant status
    const participant = participants.find((p) => p.user_id === currentUser?.id)
    if (participant) {
      await supabase
        .from('room_participants')
        .update({ is_video_enabled: newState })
        .eq('id', participant.id)
    }
  }

  const leaveRoom = async () => {
    if (!currentUser || !room) return

    try {
      const participant = participants.find((p) => p.user_id === currentUser.id)
      const isOwner = room.host_id === currentUser.id

      console.log('[v0] Leaving room:', {
        userId: currentUser.id,
        hostId: room.host_id,
        isOwner
      })

      if (participant) {
        const { error: leaveError } = await supabase
          .from('room_participants')
          .update({ left_at: new Date().toISOString() })
          .eq('id', participant.id)

        if (leaveError) {
          console.error('[v0] Error updating participant:', leaveError)
        }
      }

      // If owner leaves, delete the room completely
      if (isOwner) {
        console.log('[v0] Owner leaving - deleting room:', room.id)
        const { error: deleteError } = await supabase
          .from('rooms')
          .delete()
          .eq('id', room.id)

        if (deleteError) {
          console.error('[v0] Error deleting room:', deleteError)
        } else {
          console.log('[v0] Room deleted successfully')
        }
      }
    } catch (error) {
      console.error('[v0] Error leaving room:', error)
    }
  }

  const handleLeaveRoomClick = () => {
    setShowLeaveConfirm(true)
  }

  const confirmLeaveRoom = async () => {
    await leaveRoom()
    // Force refresh to ensure dashboard gets updated room list
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading room...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{room?.name}</h1>
              <p className="text-sm text-muted-foreground">
                {participants.length} participant
                {participants.length !== 1 ? 's' : ''}
                {room?.host_id === currentUser?.id && ' • You are the owner'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadParticipants(); loadMessages(); }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant={isAudioEnabled ? 'default' : 'destructive'}
              size="sm"
              onClick={toggleAudio}
            >
              {isAudioEnabled ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant={isVideoEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLeaveRoomClick}>
              <Phone className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Fixed Layout */}
      <main className="h-[calc(100vh-73px)] flex">
        {/* Left Side - Video Area */}
        <div className="flex-1 p-4 overflow-y-auto">
          {/* Video Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
            {/* Local Video */}
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              {isVideoEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
                  <div className="text-center">
                    <Avatar className="w-16 h-16 mx-auto">
                      <AvatarImage src={currentUser?.avatar_url || ''} alt={currentUser?.display_name} />
                      <AvatarFallback className="text-2xl font-bold">
                        {currentUser?.display_name?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm font-medium mt-2">{currentUser?.display_name}</p>
                    <p className="text-xs text-muted-foreground">You</p>
                  </div>
                </div>
              )}
              {/* Status indicators */}
              <div className="absolute bottom-2 left-2 flex gap-1">
                {!isAudioEnabled && (
                  <div className="bg-red-500 p-1 rounded">
                    <MicOff className="h-3 w-3 text-white" />
                  </div>
                )}
                {!isVideoEnabled && (
                  <div className="bg-red-500 p-1 rounded">
                    <VideoOff className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
            </div>

            {/* Remote Videos - will be populated by WebRTC */}
            {participants.filter(p => p.user_id !== currentUser?.id && p.is_video_enabled).map((participant) => (
              <div key={participant.id} className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar className="w-16 h-16">
                    <AvatarImage src={participant.avatar_url || ''} alt={participant.display_name} />
                    <AvatarFallback className="text-2xl font-bold">
                      {(participant.display_name || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="absolute bottom-2 left-2">
                  <p className="text-xs text-white bg-black/50 px-2 py-1 rounded">{participant.display_name}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Participants List */}
          <div className="bg-card rounded-lg p-4">
            <h3 className="font-semibold flex items-center gap-2 mb-4">
              <Users className="h-4 w-4" />
              Active Participants ({participants.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="p-4 bg-muted rounded-lg flex flex-col items-center text-center"
                >
                  <div className="relative">
                    <Avatar className="h-14 w-14">
                      <AvatarImage src={participant.avatar_url || ''} alt={participant.display_name} />
                      <AvatarFallback className="text-xl font-bold">
                        {(participant.display_name || 'U').charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {/* Status indicators */}
                    <div className="absolute -bottom-1 -right-1">
                      {participant.is_audio_enabled ? (
                        <div className="bg-green-500 p-1 rounded-full">
                          <Mic className="h-2.5 w-2.5 text-white" />
                        </div>
                      ) : (
                        <div className="bg-red-500 p-1 rounded-full">
                          <MicOff className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="font-medium text-sm mt-2 truncate w-full">
                    {participant.display_name}
                  </p>
                  {participant.is_host && (
                    <span className="inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded mt-2">
                      <Crown className="h-3 w-3" />
                      Owner
                    </span>
                  )}
                  {participant.user_id === currentUser?.id && (
                    <span className="text-xs text-muted-foreground mt-2">You</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side - Chat (Fixed/Sticky) */}
        <div className="w-80 border-l bg-card flex flex-col">
          <div className="p-4 border-b">
            <CardTitle className="text-lg">Chat</CardTitle>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                No messages yet. Start chatting!
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${
                    message.user_id === currentUser?.id
                      ? 'flex-row-reverse'
                      : ''
                  }`}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={message.avatar_url || ''} alt={message.display_name} />
                    <AvatarFallback className="text-xs">
                      {(message.display_name || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={`max-w-[180px] px-3 py-2 rounded-lg ${
                      message.user_id === currentUser?.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="font-medium text-xs mb-1">
                      {message.display_name}
                    </p>
                    <p className="text-sm break-words">
                      {message.content}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={sendMessage} className="p-4 border-t flex gap-2">
            <Input
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              disabled={!currentUser}
              className="flex-1"
            />
            <Button size="sm" type="submit" disabled={!messageInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </main>

      {/* Leave Confirmation Dialog */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Room?</AlertDialogTitle>
            <AlertDialogDescription>
              {room?.host_id === currentUser?.id
                ? 'You are the owner of this room. Leaving will close the room for all participants. Are you sure you want to leave?'
                : 'Are you sure you want to leave this room?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLeaveRoom} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, Leave Room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

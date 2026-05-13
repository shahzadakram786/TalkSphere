'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
import Link from 'next/link'
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
  Loader2,
} from 'lucide-react'
import WebRTCManager from '@/lib/webrtc-manager'
import {
  initializeSocket,
  joinRoom,
  leaveRoom as socketLeaveRoom,
  onUserJoined,
  onUserLeft,
  onRoomUsers,
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

interface RemoteVideo {
  odiceId: string
  stream: MediaStream
  displayName: string
  avatarUrl: string | null
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
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const webrtcManagerRef = useRef<WebRTCManager | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map())
  const channelParticipantsRef = useRef<any>(null)
  const channelMessagesRef = useRef<any>(null)
  const [remoteVideos, setRemoteVideos] = useState<RemoteVideo[]>([])
  const [localStreamReady, setLocalStreamReady] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const isMountedRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    initializeRoom()
    return () => {
      // Cleanup on unmount
      if (isMountedRef.current) {
        leaveRoom()
        if (webrtcManagerRef.current) {
          webrtcManagerRef.current.closeAllConnections()
          webrtcManagerRef.current.stopLocalStream()
        }
        disconnectSocket()
      }
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
    }, 10000) // Refresh every 10 seconds to avoid rate limiting

    return () => clearInterval(interval)
  }, [loading, roomId])

  // Attach local stream to video element
  useEffect(() => {
    const attachStream = async () => {
      if (webrtcManagerRef.current && localVideoRef.current && localStreamReady) {
        const localStream = webrtcManagerRef.current.getLocalStream()
        if (localStream) {
          // Only attach if video is enabled
          if (localStream.getVideoTracks().length > 0 && localStream.getVideoTracks()[0].enabled) {
            localVideoRef.current.srcObject = localStream
            try {
              if (localVideoRef.current.paused) {
                await localVideoRef.current.play()
              }
            } catch (e) {
              // Ignore play errors - common when switching streams
            }
          } else if (isVideoEnabled && isAudioEnabled) {
            // Video is enabled but no video track - attach anyway
            localVideoRef.current.srcObject = localStream
          }
        }
      }
    }

    attachStream()
  }, [isAudioEnabled, isVideoEnabled, localStreamReady])

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

      // Join room - check for existing participation
      const { data: existingParticipants } = await supabase
        .from('room_participants')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', authUser.id)
        .is('left_at', null)

      if (!existingParticipants || existingParticipants.length === 0) {
        await supabase.from('room_participants').insert({
          room_id: roomId,
          user_id: authUser.id,
          is_audio_enabled: true,
          is_video_enabled: false,
        })
      } else if (existingParticipants.length > 1) {
        // Clean up duplicates - keep only the first one
        const keepId = existingParticipants[0].id
        const deleteIds = existingParticipants.slice(1).map((p: { id: string }) => p.id)
        await supabase
          .from('room_participants')
          .delete()
          .in('id', deleteIds)
      }

      // Initialize WebRTC Manager
      webrtcManagerRef.current = new WebRTCManager()

      // Initialize local stream only if audio or video is enabled
      const audioEnabled = isAudioEnabled
      const videoEnabled = isVideoEnabled
      if (audioEnabled || videoEnabled) {
        try {
          await webrtcManagerRef.current.initializeLocalStream(audioEnabled, videoEnabled)
          console.log('[v0] Local stream initialized, audio:', audioEnabled, 'video:', videoEnabled)
          setLocalStreamReady(true)

          // Set up voice activity detection
          if (audioEnabled) {
            setupVoiceActivityDetection()
          }
        } catch (error) {
          console.warn('[v0] Could not get user media:', error)
        }
      } else {
        console.log('[v0] No media enabled - waiting for user to enable')
      }

      // Initialize Socket.io
      const socket = initializeSocket()
      console.log('[v0] Socket initialized, connected:', socket?.connected)

      // Track socket connection status
      socket.on('connect', () => {
        setConnectionStatus('connected')
        console.log('[v0] Socket connected')
      })

      socket.on('disconnect', () => {
        setConnectionStatus('disconnected')
        console.log('[v0] Socket disconnected')
      })

      // Join room via Socket.io for WebRTC signaling
      if (userProfile) {
        joinRoom(roomId, authUser.id, userProfile.display_name)
        console.log('[v0] Joined room via socket:', roomId)
      }

      // Setup WebRTC signal handlers after a short delay to ensure socket is connected
      setTimeout(() => {
        setupWebRTCSignaling(authUser.id)
        console.log('[v0] WebRTC signaling setup complete')
      }, 1000)

      // Load participants
      loadParticipants()

      // Load messages
      loadMessages()

      // Subscribe to real-time updates for participants
      // Subscribe to real-time updates - use polling as fallback
      // Supabase realtime can have issues with callback ordering
      console.log('[v0] Setting up polling for participants and messages')

      // Just use polling - more reliable
      const pollInterval = setInterval(() => {
        if (!loading) {
          loadParticipants()
          loadMessages()
        }
      }, 5000)

      setLoading(false)

      return () => {
        clearInterval(pollInterval)
        if (channelParticipantsRef.current) {
          supabase.removeChannel(channelParticipantsRef.current)
        }
        if (channelMessagesRef.current) {
          supabase.removeChannel(channelMessagesRef.current)
        }
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
    if (!socket) {
      console.log('[v0] Socket not available')
      return
    }

    console.log('[v0] Setting up WebRTC signaling for user:', currentUserId)

    // Handle incoming offer (when someone calls us)
    onWebRTCOffer(roomId, ({ fromUserId, targetUserId, offer }) => {
      // Only process if this offer is meant for us
      if (targetUserId !== currentUserId) {
        console.log('[v0] Ignoring offer meant for:', targetUserId)
        return
      }
      console.log('[v0] Received offer from:', fromUserId)
      if (!webrtcManagerRef.current) {
        console.log('[v0] WebRTC manager not available')
        return
      }

      // Always close existing connection and create new one
      // This handles cases where video was toggled and we need new stream
      if (webrtcManagerRef.current.isConnectedTo(fromUserId)) {
        console.log('[v0] Closing existing connection to:', fromUserId)
        webrtcManagerRef.current.closePeerConnection(fromUserId)
        setRemoteVideos(prev => prev.filter(v => v.odiceId !== fromUserId))
      }

      const peer = webrtcManagerRef.current.createPeerConnection(
        fromUserId,
        false, // Not initiator, we received an offer
        (stream) => {
          console.log('[v0] Received stream from:', fromUserId)
          const participant = participants.find(p => p.user_id === fromUserId)
          setRemoteVideos(prev => {
            if (prev.some(v => v.odiceId === fromUserId)) {
              return prev
            }
            return [...prev, {
              odiceId: fromUserId,
              stream,
              displayName: participant?.display_name || 'User',
              avatarUrl: participant?.avatar_url || null
            }]
          })
        },
        (signal) => {
          console.log('[v0] Sending answer to:', fromUserId)
          sendAnswer(roomId, currentUserId, fromUserId, signal)
        },
        (error) => console.error('[v0] Peer error:', error),
        () => {
          console.log('[v0] Peer connection closed:', fromUserId)
          setRemoteVideos(prev => prev.filter(v => v.odiceId !== fromUserId))
        }
      )

      console.log('[v0] Signaling offer to peer')
      peer.signal(offer)
    })

    // Handle incoming answer (when we call someone and they answer)
    onWebRTCAnswer(roomId, ({ fromUserId, targetUserId, answer }) => {
      // Only process if this answer is meant for us
      if (targetUserId !== currentUserId) {
        console.log('[v0] Ignoring answer meant for:', targetUserId)
        return
      }
      console.log('[v0] Received answer from:', fromUserId)
      if (!webrtcManagerRef.current) return

      webrtcManagerRef.current.addSignal(fromUserId, answer)
    })

    // Handle incoming ICE candidate
    onWebRTCIceCandidate(roomId, ({ fromUserId, targetUserId, candidate }) => {
      // Only process if this ICE is meant for us
      if (targetUserId !== currentUserId) {
        console.log('[v0] Ignoring ICE meant for:', targetUserId)
        return
      }
      console.log('[v0] Received ICE from:', fromUserId)
      if (!webrtcManagerRef.current) return

      webrtcManagerRef.current.addSignal(fromUserId, candidate)
    })

    // Handle existing users in room (when we join, we get a list of users already there)
    onRoomUsers(roomId, (existingUsers) => {
      console.log('[v0] Existing users in room:', existingUsers.length)
      existingUsers.forEach((user: any) => {
        if (user.userId !== currentUserId && webrtcManagerRef.current && !webrtcManagerRef.current.isConnectedTo(user.userId)) {
          console.log('[v0] Connecting to existing user:', user.userId)
          const peer = webrtcManagerRef.current.createPeerConnection(
            user.userId,
            true,
            (stream) => {
              console.log('[v0] Received stream from existing user:', user.userId)
              setRemoteVideos(prev => {
                if (prev.some(v => v.odiceId === user.userId)) {
                  return prev
                }
                return [...prev, {
                  odiceId: user.userId,
                  stream,
                  displayName: user.userName || 'User',
                  avatarUrl: null
                }]
              })
            },
            (signal) => {
              console.log('[v0] Sending offer to existing user:', user.userId)
              sendOffer(roomId, currentUserId, user.userId, signal)
            },
            (error) => console.error('[v0] Peer error:', error),
            () => {
              console.log('[v0] Peer connection closed for:', user.userId)
              setRemoteVideos(prev => prev.filter(v => v.odiceId !== user.userId))
            }
          )
        }
      })
    })

    // Handle user joined (when a new user joins, we call them)
    onUserJoined(roomId, ({ userId, userName }) => {
      console.log('[v0] User joined:', userId, userName)
      if (userId === currentUserId || !webrtcManagerRef.current) return

      // If we already have a connection, skip
      if (webrtcManagerRef.current.isConnectedTo(userId)) {
        console.log('[v0] Already connected to:', userId)
        return
      }

      // Create peer connection for new user (we are the initiator)
      console.log('[v0] Creating peer connection for:', userId)
      const peer = webrtcManagerRef.current.createPeerConnection(
        userId,
        true, // Initiator - we start the call
        (stream) => {
          console.log('[v0] Received stream from new user:', userId)
          setRemoteVideos(prev => {
            if (prev.some(v => v.odiceId === userId)) {
              return prev
            }
            return [...prev, {
              odiceId: userId,
              stream,
              displayName: userName || 'User',
              avatarUrl: null
            }]
          })
        },
        (signal) => {
          console.log('[v0] Sending offer to:', userId)
          sendOffer(roomId, currentUserId, userId, signal)
        },
        (error) => console.error('[v0] Peer error:', error),
        () => {
          console.log('[v0] Peer connection closed for:', userId)
          setRemoteVideos(prev => prev.filter(v => v.odiceId !== userId))
        }
      )
    })

    // Handle user left
    onUserLeft(roomId, (userId) => {
      console.log('[v0] User left:', userId)
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.closePeerConnection(userId)
      }
      setRemoteVideos(prev => prev.filter(v => v.odiceId !== userId))
    })
  }

  // Helper to set up a peer connection with a specific user
  const setupSinglePeerConnection = (senderUserId: string, userId: string, userName?: string) => {
    if (!webrtcManagerRef.current || webrtcManagerRef.current.isConnectedTo(userId)) {
      return
    }

    console.log('[v0] Setting up peer connection with:', userId)
    const peer = webrtcManagerRef.current.createPeerConnection(
      userId,
      true, // We're the initiator
      (stream) => {
        console.log('[v0] Received stream from:', userId)
        setRemoteVideos(prev => {
          if (prev.some(v => v.odiceId === userId)) {
            return prev
          }
          return [...prev, {
            odiceId: userId,
            stream,
            displayName: userName || 'User',
            avatarUrl: null
          }]
        })
      },
      (signal) => {
        console.log('[v0] Sending offer to:', userId)
        sendOffer(roomId, senderUserId, userId, signal)
      },
      (error) => console.error('[v0] Peer error:', error),
      () => {
        console.log('[v0] Peer connection closed for:', userId)
        setRemoteVideos(prev => prev.filter(v => v.odiceId !== userId))
      }
    )
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
        // Remove duplicates based on user_id
        const uniqueUsers = new Map()
        data.forEach((p: any) => {
          if (!uniqueUsers.has(p.user_id)) {
            uniqueUsers.set(p.user_id, p)
          }
        })

        const participantsList = Array.from(uniqueUsers.values()).map((p: any) => ({
          id: p.id,
          odiceId: p.user_id,
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

  // Voice activity detection
  const setupVoiceActivityDetection = () => {
    try {
      const localStream = webrtcManagerRef.current?.getLocalStream()
      if (!localStream) return

      // Create audio context and analyser
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256

      const source = audioContextRef.current.createMediaStreamSource(localStream)
      source.connect(analyserRef.current)

      // Check audio levels periodically
      const checkAudioLevel = () => {
        if (!analyserRef.current || !isMountedRef.current) return

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate average volume
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        const isActive = average > 20 // Threshold for detecting speech

        setIsSpeaking(isActive)

        if (isMountedRef.current) {
          requestAnimationFrame(checkAudioLevel)
        }
      }

      checkAudioLevel()
    } catch (error) {
      console.warn('[v0] Could not set up voice detection:', error)
    }
  }

  const toggleAudio = async () => {
    const newState = !isAudioEnabled
    setIsAudioEnabled(newState)

    // Enable/disable audio tracks or initialize stream if not exists
    if (webrtcManagerRef.current) {
      const localStream = webrtcManagerRef.current.getLocalStream()

      if (localStream) {
        // Stream exists - just toggle audio tracks
        localStream.getAudioTracks().forEach(track => {
          track.enabled = newState
        })
      } else if (newState) {
        // No stream but enabling audio - initialize with audio only
        try {
          const newStream = await webrtcManagerRef.current.initializeLocalStream(true, false)
          if (localVideoRef.current && newStream) {
            localVideoRef.current.srcObject = newStream
          }
          setLocalStreamReady(true)
          setupVoiceActivityDetection()
        } catch (error) {
          console.error('[v0] Error enabling audio:', error)
        }
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

    if (webrtcManagerRef.current) {
      const currentStream = webrtcManagerRef.current.getLocalStream()

      if (newState) {
        // Turning video ON - reinitialize stream with video (respect current audio state)
        try {
          const audioEnabled = isAudioEnabled // Use current state, not newState
          const newStream = await webrtcManagerRef.current.initializeLocalStream(audioEnabled, true)
          if (localVideoRef.current && newStream) {
            localVideoRef.current.srcObject = newStream
            localVideoRef.current.play().catch(console.error)
          }
          // Ensure audio state matches
          if (audioEnabled) {
            setIsAudioEnabled(true)
            setupVoiceActivityDetection()
          }
          setLocalStreamReady(true)

          // Close all existing peer connections - they'll be recreated with the new stream
          const existingPeers = Array.from(webrtcManagerRef.current.getPeers().keys())
          existingPeers.forEach(peerUserId => {
            webrtcManagerRef.current?.closePeerConnection(peerUserId)
            setRemoteVideos(prev => prev.filter(v => v.odiceId !== peerUserId))
          })

          // Trigger reconnection after a short delay
          // We need to wait for connections to fully close before creating new ones
          setTimeout(async () => {
            // Reload participants to get updated list
            const { data } = await supabase
              .from('room_participants')
              .select('user_id')
              .eq('room_id', roomId)
              .is('left_at', null)

            if (data && currentUser) {
              const otherUsers = data.filter((p: { user_id: string }) => p.user_id !== currentUser.id)
              // Create new connections for all other users
              for (const p of otherUsers) {
                if (!webrtcManagerRef.current?.isConnectedTo(p.user_id)) {
                  setupSinglePeerConnection(currentUser.id, p.user_id, 'User')
                }
              }
            }
          }, 1000)

          console.log('[v0] Video toggled ON - reconnecting')
        } catch (error) {
          console.error('[v0] Error enabling video:', error)
        }
      } else {
        // Turning video OFF - stop video tracks and clear the stream
        if (currentStream) {
          currentStream.getVideoTracks().forEach(track => {
            track.stop() // Actually stop the camera, not just disable
          })
          // Remove video tracks from stream
          currentStream.getVideoTracks().forEach(track => {
            currentStream.removeTrack(track)
          })
        }
        // Also clear the video element
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null
        }
        console.log('[v0] Video toggled OFF - camera released')
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
    // Stop local stream first to release camera
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.stopLocalStream()
      webrtcManagerRef.current.closeAllConnections()
    }
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between px-2 sm:px-4 py-3 sm:py-4 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <img
                src="/Untitled design/favicon.png"
                alt="TalkSphere"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-white p-1"
              />
              <h1 className="text-lg sm:text-xl font-bold hidden sm:block">TalkSphere</h1>
            </Link>
            <div className="hidden md:block border-l h-8 mx-2" />
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold truncate">{room?.name}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                <span className="hidden sm:inline">{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
                <span className="sm:hidden">{participants.length}</span>
                {room?.host_id === currentUser?.id && <span className="hidden md:inline"> • Owner</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => { loadParticipants(); loadMessages(); }} className="p-2 sm:px-3">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant={isAudioEnabled ? 'default' : 'destructive'}
              size="sm"
              onClick={toggleAudio}
              className="p-2 sm:px-3"
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
              className="p-2 sm:px-3"
            >
              {isVideoEnabled ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLeaveRoomClick} className="p-2 sm:px-3">
              <Phone className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content - Responsive Layout */}
      <main className="h-[calc(100vh-73px)] flex flex-col sm:flex-row">
        {/* Left Side - Video Area */}
        <div className="flex-1 p-2 sm:p-4 overflow-y-auto min-h-0 flex flex-col">
          {/* Main Remote Video Area - Large view like WhatsApp */}
          <div className="flex-1 flex items-center justify-center mb-4">
            {remoteVideos.length > 0 ? (
              <div className="relative w-full max-w-4xl aspect-video bg-muted rounded-lg overflow-hidden">
                {remoteVideos[0] && (
                  <>
                    <video
                      ref={(el) => {
                        if (el && el.srcObject !== remoteVideos[0].stream) {
                          el.srcObject = remoteVideos[0].stream
                          el.play().catch(e => console.log('[v0] Video play error:', e.message))
                        }
                      }}
                      autoPlay
                      playsInline
                      muted={false}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 flex items-center gap-2 bg-black/50 px-2 py-1 rounded">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={remoteVideos[0].avatarUrl || ''} alt={remoteVideos[0].displayName} />
                        <AvatarFallback className="text-xs">
                          {remoteVideos[0].displayName?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white text-sm">{remoteVideos[0].displayName}</span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground">
                <p>Waiting for other participants...</p>
                <p className="text-sm">Share the room link to invite others</p>
              </div>
            )}
          </div>

          {/* Other Remote Videos (if more than 1) */}
          {remoteVideos.length > 1 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
              {remoteVideos.slice(1).map((video) => (
                <div key={video.odiceId} className="relative aspect-video bg-muted rounded-lg overflow-hidden">
                  <video
                    ref={(el) => {
                      if (el && el.srcObject !== video.stream) {
                        el.srcObject = video.stream
                        el.play().catch(e => console.log('[v0] Video play error:', e.message))
                      }
                    }}
                    autoPlay
                    playsInline
                    muted={false}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/50 px-1 rounded">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={video.avatarUrl || ''} alt={video.displayName} />
                      <AvatarFallback className="text-[8px]">
                        {video.displayName?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-white text-xs">{video.displayName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Local Video - Small Picture-in-Picture like WhatsApp */}
          <div className="self-end w-32 sm:w-40 md:w-48 lg:w-56">
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden shadow-lg border-2 border-background">
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
                  <Avatar className="h-10 w-10 sm:h-12 sm:w-12">
                    <AvatarImage src={currentUser?.avatar_url || ''} alt={currentUser?.display_name} />
                    <AvatarFallback className="text-lg font-bold">
                      {currentUser?.display_name?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              {/* Status indicators */}
              <div className="absolute bottom-1 left-1 flex gap-1 items-center">
                {!isAudioEnabled && (
                  <div className="bg-red-500 p-0.5 rounded">
                    <MicOff className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
                {isAudioEnabled && isSpeaking && (
                  <div className="flex items-center gap-0.5 bg-green-500 px-1 rounded h-4">
                    <span className="w-0.5 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <span className="w-0.5 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <span className="w-0.5 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                )}
                {!isVideoEnabled && (
                  <div className="bg-red-500 p-0.5 rounded">
                    <VideoOff className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </div>
              <div className="absolute bottom-1 right-1 text-[8px] text-white bg-black/50 px-1 rounded">
                You
              </div>
            </div>
          </div>

          {/* Hidden audio elements for remote streams */}
          {remoteVideos.map((video) => (
            <audio
              key={`audio-${video.odiceId}`}
              ref={(el) => {
                if (el && el.srcObject !== video.stream) {
                  el.srcObject = video.stream
                  el.play().catch(e => console.log('[v0] Audio play error:', e.message))
                }
              }}
              autoPlay
              playsInline
              muted={false}
            />
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

        {/* Right Side - Chat - full width on mobile, sidebar on desktop */}
        <div className="w-full sm:w-80 border-t sm:border-l bg-card flex flex-col h-1/3 sm:h-full min-h-[200px] sm:min-h-0">
          <div className="p-3 sm:p-4 border-b">
            <CardTitle className="text-base sm:text-lg">Chat</CardTitle>
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

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Badge } from '@/components/ui/badge'
import { Search, Plus, LogOut, RefreshCw, User, Settings, Camera, Loader2, Globe, Tag, Users, Crown, BarChart3 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Room {
  id: string
  name: string
  description: string
  host_id: string
  host_name?: string
  host_avatar?: string
  is_public: boolean
  room_type: string
  language?: string
  topic_tags?: string[]
  level?: string
  max_capacity?: number
  created_at: string
  participant_count: number
}

interface User {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  native_language?: string
  learning_languages?: string[]
}

interface Stats {
  totalRooms: number
  onlineUsers: number
  popularTopics: { name: string; count: number }[]
}

interface Props {
  user?: { id: string } | null
}

export default function Dashboard({ user: initialUser }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<User | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [filteredRooms, setFilteredRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats>({ totalRooms: 0, onlineUsers: 0, popularTopics: [] })

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [roomTypeFilter, setRoomTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  // Form state
  const [newRoom, setNewRoom] = useState({
    name: '',
    description: '',
    room_type: 'general',
    is_public: true,
    language: 'English',
    level: 'Intermediate',
    max_capacity: 20,
    topic_tags: [] as string[],
  })

  // Profile dialog
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null)
  const [editedDisplayName, setEditedDisplayName] = useState('')
  const [editedBio, setEditedBio] = useState('')
  const [editedNativeLanguage, setEditedNativeLanguage] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Room switching
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null)
  const [showJoinConfirm, setShowJoinConfirm] = useState(false)
  const isMountedRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    loadUserAndRooms()
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Apply filters whenever rooms or filter state changes
  useEffect(() => {
    applyFilters()
  }, [rooms, searchQuery, languageFilter, levelFilter, roomTypeFilter, sortBy])

  const applyFilters = useCallback(() => {
    let filtered = [...rooms]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(room =>
        room.name.toLowerCase().includes(query) ||
        room.description?.toLowerCase().includes(query) ||
        room.host_name?.toLowerCase().includes(query) ||
        room.topic_tags?.some(tag => tag.toLowerCase().includes(query))
      )
    }

    // Language filter
    if (languageFilter !== 'all') {
      filtered = filtered.filter(room => room.language === languageFilter)
    }

    // Level filter
    if (levelFilter !== 'all') {
      filtered = filtered.filter(room => room.level === levelFilter)
    }

    // Room type filter
    if (roomTypeFilter === 'public') {
      filtered = filtered.filter(room => room.is_public)
    } else if (roomTypeFilter === 'private') {
      filtered = filtered.filter(room => !room.is_public)
    }

    // Sort
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (sortBy === 'most_active') {
      filtered.sort((a, b) => b.participant_count - a.participant_count)
    }

    setFilteredRooms(filtered)
  }, [rooms, searchQuery, languageFilter, levelFilter, roomTypeFilter, sortBy])

  const loadUserAndRooms = useCallback(async (skipAuth = false) => {
    if (!isMountedRef.current) return

    try {
      setLoading(true)
      setLoadError(null)

      const { data: { user: authUser } } = await supabase.auth.getUser()
      const currentUser = authUser || initialUser

      if (currentUser) {
        // Get user profile
        const { data: userProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', currentUser.id)
          .single()

        setUser(userProfile)

        // Check if user is in any room
        const { data: currentParticipant } = await supabase
          .from('room_participants')
          .select('room_id')
          .eq('user_id', currentUser.id)
          .is('left_at', null)
          .maybeSingle()

        if (currentParticipant) {
          setCurrentRoomId(currentParticipant.room_id)
        }
      }

      // Get all public rooms
      const { data: publicRooms, error: roomsError } = await supabase
        .from('rooms')
        .select(`
          *,
          room_participants(count)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })

      if (roomsError) {
        console.error('[v0] Error fetching rooms:', roomsError)
        setLoadError('Failed to load rooms. Please refresh to try again.')
      }

      if (publicRooms && publicRooms.length > 0) {
        const hostIds = [...new Set(publicRooms.map((r: any) => r.host_id))]
        let hostMap = new Map()
        if (hostIds.length > 0) {
          const { data: hostProfiles } = await supabase
            .from('users')
            .select('id, username, display_name, avatar_url')
            .in('id', hostIds)

          if (hostProfiles) {
            hostMap = new Map(hostProfiles.map((h: any) => [h.id, {
              displayName: h.display_name || h.username || 'Unknown',
              avatarUrl: h.avatar_url
            }]))
          }
        }

        const roomsWithCount = publicRooms.map((room: any) => {
          const hostInfo = hostMap.get(room.host_id) || { displayName: 'Unknown', avatarUrl: null }
          return {
            ...room,
            participant_count: room.room_participants?.[0]?.count || 0,
            host_name: hostInfo.displayName,
            host_avatar: hostInfo.avatarUrl,
          }
        })
        setRooms(roomsWithCount)
        setStats(prev => ({ ...prev, totalRooms: roomsWithCount.length }))
      } else {
        setRooms([])
      }

      // For demo, set some stats
      setStats({
        totalRooms: publicRooms?.length || 0,
        onlineUsers: Math.floor(Math.random() * 50) + 10,
        popularTopics: [
          { name: 'Travel', count: 12 },
          { name: 'Music', count: 8 },
          { name: 'Business', count: 6 },
          { name: 'Technology', count: 5 },
          { name: 'Sports', count: 4 },
        ]
      })
    } catch (error) {
      console.error('[v0] Error loading data:', error)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [router, supabase, initialUser])

  const handleCreateRoom = async () => {
    setCreateError(null)

    if (!newRoom.name.trim()) {
      setCreateError('Room name is required')
      return
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()
    const currentUser = authUser || initialUser

    if (!currentUser) {
      router.push('/auth/login?redirect=/')
      return
    }

    try {
      setIsCreatingRoom(true)

      const { data, error } = await supabase
        .from('rooms')
        .insert({
          name: newRoom.name.trim(),
          description: newRoom.description.trim(),
          room_type: newRoom.room_type,
          is_public: newRoom.is_public,
          host_id: currentUser.id,
          language: newRoom.language,
          level: newRoom.level,
          max_capacity: newRoom.max_capacity,
          topic_tags: newRoom.topic_tags,
        })
        .select()
        .single()

      if (error) throw error

      if (data) {
        // Join room as host
        await supabase.from('room_participants').insert({
          room_id: data.id,
          user_id: currentUser.id,
          is_audio_enabled: true,
          is_video_enabled: false,
        })

        setNewRoom({
          name: '',
          description: '',
          room_type: 'general',
          is_public: true,
          language: 'English',
          level: 'Intermediate',
          max_capacity: 20,
          topic_tags: [],
        })
        router.push(`/room/${data.id}`)
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'An error occurred while creating the room'
      console.error('[v0] Error creating room:', errorMessage)
      setCreateError(errorMessage)
    } finally {
      setIsCreatingRoom(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (file.size > 5 * 1024 * 1024) {
      setProfileUpdateError('File size must be less than 5MB')
      return
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      setProfileUpdateError('Invalid file type. Please use JPG, PNG, WebP or GIF.')
      return
    }

    setIsUploadingAvatar(true)
    setProfileUpdateError(null)

    try {
      // Try Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      let avatarUrl: string
      if (uploadError) {
        // Fallback to data URL
        avatarUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      } else {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
        avatarUrl = urlData.publicUrl
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)

      if (updateError) {
        setUser({ ...user, avatar_url: avatarUrl })
        setProfileUpdateError('Avatar saved locally. Database update pending setup.')
        return
      }
      setUser({ ...user, avatar_url: avatarUrl })
    } catch (error: any) {
      console.error('[v0] Avatar upload error:', error)
      setProfileUpdateError(error?.message || 'Failed to upload avatar.')
    } finally {
      setIsUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const handleProfileSave = async () => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: editedDisplayName || user.display_name,
          bio: editedBio || user.bio,
          native_language: editedNativeLanguage || user.native_language,
        })
        .eq('id', user.id)

      if (error) throw error

      setUser({
        ...user,
        display_name: editedDisplayName || user.display_name,
        bio: editedBio || user.bio,
        native_language: editedNativeLanguage || user.native_language,
      })
      setIsProfileOpen(false)
    } catch (error) {
      console.error('[v0] Profile update error:', error)
      setProfileUpdateError('Failed to update profile.')
    }
  }

  const openProfileDialog = () => {
    if (user) {
      setEditedDisplayName(user.display_name || '')
      setEditedBio(user.bio || '')
      setEditedNativeLanguage(user.native_language || '')
    }
    setIsProfileOpen(true)
  }

  const handleRoomClick = (roomId: string) => {
    if (!user) {
      router.push(`/auth/login?redirect=/room/${roomId}`)
      return
    }

    if (currentRoomId && currentRoomId !== roomId) {
      setPendingRoomId(roomId)
      setShowJoinConfirm(true)
    } else {
      router.push(`/room/${roomId}`)
    }
  }

  const confirmJoinRoom = async () => {
    if (!pendingRoomId || !user) return

    if (currentRoomId) {
      await supabase
        .from('room_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', currentRoomId)
        .eq('user_id', user.id)
    }

    setCurrentRoomId(null)
    setShowJoinConfirm(false)
    router.push(`/room/${pendingRoomId}`)
  }

  const languages = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Portuguese', 'Italian', 'Russian']
  const levels = ['Beginner', 'Intermediate', 'Advanced']
  const topics = ['Travel', 'Music', 'Business', 'Technology', 'Sports', 'Food', 'Art', 'Science', 'Fashion', 'Gaming']

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between px-2 sm:px-4 py-3 gap-2">
          {/* Logo */}
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/Untitled design/favicon.png"
              alt="TalkSphere"
              className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-white p-1 flex-shrink-0"
            />
            <h1 className="text-lg sm:text-xl font-bold truncate">TalkSphere</h1>
          </div>

          {/* Search Bar - hidden on small screens */}
          <div className="hidden md:flex flex-1 max-w-xl mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rooms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <>
                <Button variant="outline" size="sm" onClick={loadUserAndRooms} className="hidden sm:flex">
                  <RefreshCw className="h-4 w-4 mr-1" />
                  <span className="hidden lg:inline">Refresh</span>
                </Button>
                <Button variant="outline" size="sm" onClick={loadUserAndRooms} className="sm:hidden p-2">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-1 sm:gap-2 px-1 sm:px-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.avatar_url || ''} alt={user?.display_name} />
                        <AvatarFallback>
                          {(user?.display_name || user?.username || 'U').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium hidden md:inline truncate max-w-[100px]">{user?.display_name || user?.username}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>{user?.display_name || user?.username}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">@{user?.username}</div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={openProfileDialog}>
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <Button variant="ghost" size="sm" onClick={() => router.push('/auth/login')}>
                  <span className="hidden sm:inline">Log in</span>
                  <span className="sm:hidden">Login</span>
                </Button>
                <Button size="sm" onClick={() => router.push('/auth/sign-up')}>
                  <span className="hidden sm:inline">Sign up</span>
                  <span className="sm:hidden">Sign Up</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-2 sm:px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {/* Language Filter */}
            <div className="flex items-center gap-1 sm:gap-2">
              <Globe className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Select value={languageFilter} onValueChange={setLanguageFilter}>
                <SelectTrigger className="w-28 sm:w-40">
                  <SelectValue placeholder="Language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Languages</SelectItem>
                  {languages.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Level Filter */}
            <div className="flex items-center gap-1 sm:gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-28 sm:w-40">
                  <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  {levels.map(level => (
                    <SelectItem key={level} value={level}>{level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Room Type Filter */}
            <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
              <SelectTrigger className="w-28 sm:w-40">
                <SelectValue placeholder="Room Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rooms</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-28 sm:w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="most_active">Most Active</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto text-xs sm:text-sm text-muted-foreground">
              {filteredRooms.length} room{filteredRooms.length !== 1 ? 's' : ''} found
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Sidebar - Desktop only */}
          <aside className="w-full md:w-64 flex-shrink-0 hidden md:block">
            <div className="sticky top-24 space-y-4">
              {/* Stats Card */}
              <div className="bg-card rounded-lg p-4 border">
                <h3 className="font-semibold mb-3">Community</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Rooms</span>
                    <span className="font-medium">{stats.totalRooms}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Online Users</span>
                    <span className="font-medium text-green-500">{stats.onlineUsers}</span>
                  </div>
                </div>
              </div>

              {/* Popular Topics */}
              <div className="bg-card rounded-lg p-4 border">
                <h3 className="font-semibold mb-3">Popular Topics</h3>
                <div className="space-y-2">
                  {stats.popularTopics.map(topic => (
                    <div key={topic.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{topic.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{topic.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Room Grid */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold">Rooms</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full sm:w-auto">
                    <Plus className="mr-1 sm:mr-2 h-4 w-4" />
                    <span className="sm:hidden">Create</span>
                    <span className="hidden sm:inline">Create Room</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Create a New Room</DialogTitle>
                    <DialogDescription>
                      Set up a new room for communication
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="room-name">Room Name</Label>
                      <Input
                        id="room-name"
                        placeholder="e.g., English Conversation Practice"
                        value={newRoom.name}
                        onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="room-description">Description</Label>
                      <Textarea
                        id="room-description"
                        placeholder="What is this room about?"
                        value={newRoom.description}
                        onChange={(e) => setNewRoom({ ...newRoom, description: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Language</Label>
                        <Select
                          value={newRoom.language}
                          onValueChange={(value) => setNewRoom({ ...newRoom, language: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {languages.map(lang => (
                              <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Level</Label>
                        <Select
                          value={newRoom.level}
                          onValueChange={(value) => setNewRoom({ ...newRoom, level: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {levels.map(level => (
                              <SelectItem key={level} value={level}>{level}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label>Topics</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {topics.map(topic => (
                          <Badge
                            key={topic}
                            variant={newRoom.topic_tags.includes(topic) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              const tags = newRoom.topic_tags.includes(topic)
                                ? newRoom.topic_tags.filter(t => t !== topic)
                                : [...newRoom.topic_tags, topic]
                              setNewRoom({ ...newRoom, topic_tags: tags })
                            }}
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is-public"
                        checked={newRoom.is_public}
                        onChange={(e) => setNewRoom({ ...newRoom, is_public: e.target.checked })}
                      />
                      <Label htmlFor="is-public">Public Room</Label>
                    </div>
                    {createError && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-md text-sm">
                        {createError}
                      </div>
                    )}
                    <Button
                      onClick={handleCreateRoom}
                      disabled={!newRoom.name.trim() || isCreatingRoom}
                      className="w-full"
                    >
                      {isCreatingRoom ? 'Creating...' : 'Create Room'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Room Cards */}
            {loadError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-md mb-6">
                {loadError}
              </div>
            )}

            {filteredRooms.length === 0 && !loadError ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No rooms found</p>
                <Button onClick={() => { setSearchQuery(''); setLanguageFilter('all'); setLevelFilter('all'); }}>
                  Clear Filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredRooms.map((room) => (
                  <div
                    key={room.id}
                    onClick={() => handleRoomClick(room.id)}
                    className="cursor-pointer"
                  >
                    <Card className="h-full hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg line-clamp-1">{room.name}</CardTitle>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {room.language && (
                                <Badge variant="outline" className="text-xs">
                                  <Globe className="h-3 w-3 mr-1" />
                                  {room.language}
                                </Badge>
                              )}
                              {room.level && (
                                <Badge variant="secondary" className="text-xs">{room.level}</Badge>
                              )}
                              {!room.is_public && (
                                <Badge variant="outline" className="text-xs">Private</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {room.description || 'No description'}
                        </p>

                        {/* Topic Tags */}
                        {room.topic_tags && room.topic_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {room.topic_tags.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs py-0">{tag}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-3 border-t">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={room.host_avatar || ''} alt={room.host_name} />
                              <AvatarFallback className="text-xs">
                                {(room.host_name || 'U').charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-medium">{room.host_name}</span>
                              <Crown className="h-3 w-3 text-amber-500" />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {room.participant_count}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Profile Dialog */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>Update your profile information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-col items-center">
              <div className="relative">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={user?.avatar_url || ''} alt={user?.display_name} />
                  <AvatarFallback className="text-2xl">
                    {(user?.display_name || user?.username || 'U').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </Button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
            </div>
            <div>
              <Label>Display Name</Label>
              <Input value={editedDisplayName} onChange={(e) => setEditedDisplayName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea value={editedBio} onChange={(e) => setEditedBio(e.target.value)} placeholder="Tell about yourself..." rows={3} />
            </div>
            <div>
              <Label>Native Language</Label>
              <Select value={editedNativeLanguage} onValueChange={setEditedNativeLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(lang => (
                    <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {profileUpdateError && <p className="text-sm text-red-500">{profileUpdateError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsProfileOpen(false)}>Cancel</Button>
              <Button onClick={handleProfileSave}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join Room Confirmation */}
      <AlertDialog open={showJoinConfirm} onOpenChange={setShowJoinConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Join Another Room?</AlertDialogTitle>
            <AlertDialogDescription>You are currently in another room. Leave and join this one?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={confirmJoinRoom}>Yes, Join</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Globe, Calendar, Clock, Users, Crown, MessageSquare, Activity, Award, ArrowLeft } from 'lucide-react'

interface ProfileUser {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  native_language?: string
  learning_languages?: string[]
  created_at: string
  total_talk_time?: number
  email?: string
}

interface Room {
  id: string
  name: string
  description: string
  language?: string
  level?: string
  participant_count: number
  created_at: string
}

export default function ProfilePage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)

  useEffect(() => {
    loadProfile()
  }, [params.id])

  const loadProfile = async () => {
    try {
      setLoading(true)

      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
        setCurrentUser(userData)
      }

      // Get profile user
      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', params.id)
        .single()

      if (profileData) {
        // Only show email to the profile owner
        const isOwnProfile = authUser?.id === params.id
        const profileWithEmail = isOwnProfile && authUser?.email
          ? { ...profileData, email: authUser.email }
          : profileData
        setProfileUser(profileWithEmail)

        // Check if following
        if (authUser && authUser.id !== params.id) {
          const { data: followData } = await supabase
            .from('follows')
            .select('id')
            .eq('follower_id', authUser.id)
            .eq('following_id', params.id)
            .maybeSingle()
          setIsFollowing(!!followData)
        }

        // Get followers count
        const { count: followers } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', params.id)
        setFollowersCount(followers || 0)

        // Get following count
        const { count: following } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('follower_id', params.id)
        setFollowingCount(following || 0)

        // Get rooms hosted by this user
        const { data: roomsData } = await supabase
          .from('rooms')
          .select('*, room_participants(count)')
          .eq('host_id', params.id)
          .order('created_at', { ascending: false })
          .limit(10)

        if (roomsData) {
          setRooms(roomsData.map((r: any) => ({
            ...r,
            participant_count: r.room_participants?.[0]?.count || 0
          })))
        }
      }
    } catch (error) {
      console.error('[v0] Error loading profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = async () => {
    if (!currentUser || !profileUser) return

    if (isFollowing) {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', profileUser.id)
      setIsFollowing(false)
      setFollowersCount(prev => prev - 1)
    } else {
      await supabase
        .from('follows')
        .insert({ follower_id: currentUser.id, following_id: profileUser.id })
      setIsFollowing(true)
      setFollowersCount(prev => prev + 1)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const formatTalkTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hr`
    return `${Math.floor(hours / 24)} days`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading profile...</p>
      </div>
    )
  }

  if (!profileUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">User not found</p>
      </div>
    )
  }

  const isOwnProfile = currentUser?.id === profileUser.id

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/Untitled design/favicon.png"
                alt="TalkSphere"
                className="h-10 w-10 rounded-lg bg-white p-1"
              />
              <h1 className="text-xl font-bold">TalkSphere</h1>
            </Link>
            <div className="hidden md:block border-l h-8 mx-2" />
            <div>
              <h2 className="text-lg font-semibold">Profile</h2>
              <p className="text-sm text-muted-foreground">@{profileUser?.username}</p>
            </div>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Back</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Profile Header */}
          <div className="flex flex-col md:flex-row gap-6 mb-8">
            <Avatar className="w-32 h-32 mx-auto md:mx-0">
              <AvatarImage src={profileUser.avatar_url || ''} alt={profileUser.display_name} />
              <AvatarFallback className="text-4xl font-bold">
                {(profileUser.display_name || 'U').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold">{profileUser.display_name}</h1>
                {isOwnProfile && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Crown className="h-3 w-3" />
                    You
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mb-3">@{profileUser.username}</p>

              {/* Email - only visible to profile owner */}
              {profileUser.email && (
                <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                  {profileUser.email}
                  <Badge variant="outline" className="text-xs">Private</Badge>
                </p>
              )}

              {/* Language badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                {profileUser.native_language && (
                  <Badge variant="default" className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    Native: {profileUser.native_language}
                  </Badge>
                )}
                {profileUser.learning_languages?.map(lang => (
                  <Badge key={lang} variant="outline">Learning: {lang}</Badge>
                ))}
              </div>

              {profileUser.bio && (
                <p className="text-muted-foreground">{profileUser.bio}</p>
              )}

              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Joined {formatDate(profileUser.created_at)}
                </div>
                {profileUser.total_talk_time && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatTalkTime(profileUser.total_talk_time)} spoken
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {!isOwnProfile && currentUser && (
                <Button onClick={handleFollow} variant={isFollowing ? 'outline' : 'default'}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
              )}
              {!isOwnProfile && !currentUser && (
                <Button onClick={() => router.push('/auth/login')}>
                  Login to Follow
                </Button>
              )}
              {isOwnProfile && (
                <Button variant="outline" onClick={() => router.push('/settings')}>
                  Edit Profile
                </Button>
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold">{followersCount}</div>
                <p className="text-sm text-muted-foreground">Followers</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold">{followingCount}</div>
                <p className="text-sm text-muted-foreground">Following</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold">{rooms.length}</div>
                <p className="text-sm text-muted-foreground">Rooms Hosted</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="activity">
            <TabsList className="w-full">
              <TabsTrigger value="activity" className="flex-1">
                <Activity className="h-4 w-4 mr-2" />
                Activity
              </TabsTrigger>
              <TabsTrigger value="about" className="flex-1">
                <MessageSquare className="h-4 w-4 mr-2" />
                About
              </TabsTrigger>
              <TabsTrigger value="badges" className="flex-1">
                <Award className="h-4 w-4 mr-2" />
                Badges
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Rooms</CardTitle>
                </CardHeader>
                <CardContent>
                  {rooms.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No rooms hosted yet</p>
                  ) : (
                    <div className="space-y-3">
                      {rooms.map(room => (
                        <div
                          key={room.id}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80"
                          onClick={() => router.push(`/room/${room.id}`)}
                        >
                          <div>
                            <p className="font-medium">{room.name}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {room.language && <span>{room.language}</span>}
                              {room.level && <span>• {room.level}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            {room.participant_count}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="about" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent>
                  {profileUser.bio ? (
                    <p>{profileUser.bio}</p>
                  ) : (
                    <p className="text-muted-foreground">No bio yet</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="badges" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Badges & Achievements</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-muted rounded-lg">
                      <Award className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                      <p className="font-medium">First Room</p>
                      <p className="text-xs text-muted-foreground">Hosted first room</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <Users className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p className="font-medium">Social</p>
                      <p className="text-xs text-muted-foreground">10+ followers</p>
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <Clock className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                      <p className="font-medium">Active</p>
                      <p className="text-xs text-muted-foreground">10+ hours spoken</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}
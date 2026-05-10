'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Camera, Loader2, User, Bell, Lock, Volume2, Trash2, LogOut } from 'lucide-react'

interface UserProfile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  native_language?: string
  learning_languages?: string[]
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Form states
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [nativeLanguage, setNativeLanguage] = useState('')
  const [learningLanguages, setLearningLanguages] = useState<string[]>([])

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [pushNotifications, setPushNotifications] = useState(true)

  // Privacy settings
  const [showOnlineStatus, setShowOnlineStatus] = useState(true)
  const [allowDMs, setAllowDMs] = useState('everyone')

  // Audio/Video settings
  const [selectedMic, setSelectedMic] = useState('default')
  const [selectedCamera, setSelectedCamera] = useState('default')
  const [selectedSpeaker, setSelectedSpeaker] = useState('default')
  const [devices, setDevices] = useState<{ mics: MediaDeviceInfo[]; cameras: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({
    mics: [],
    cameras: [],
    speakers: []
  })

  const languages = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Portuguese', 'Italian', 'Russian']

  useEffect(() => {
    loadUserData()
    loadDevices()
  }, [])

  const loadUserData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        router.push('/auth/login')
        return
      }

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single()

      if (userData) {
        setUser(userData)
        setDisplayName(userData.display_name || '')
        setBio(userData.bio || '')
        setNativeLanguage(userData.native_language || '')
        setLearningLanguages(userData.learning_languages || [])
      }
    } catch (err) {
      console.error('[v0] Error loading user:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        mics: devices.filter(d => d.kind === 'audioinput'),
        cameras: devices.filter(d => d.kind === 'videoinput'),
        speakers: devices.filter(d => d.kind === 'audiooutput')
      })
    } catch (err) {
      console.error('[v0] Error loading devices:', err)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB')
      return
    }

    setSaving(true)
    try {
      // Try storage first
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

      let avatarUrl: string
      if (uploadError) {
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

      await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', user.id)
      setUser({ ...user, avatar_url: avatarUrl })
      setSuccess('Avatar updated!')
    } catch (err) {
      setError('Failed to upload avatar')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      await supabase.from('users').update({
        display_name: displayName,
        bio: bio,
        native_language: nativeLanguage,
        learning_languages: learningLanguages,
      }).eq('id', user.id)

      setUser({ ...user, display_name: displayName, bio, native_language: nativeLanguage, learning_languages: learningLanguages })
      setSuccess('Profile saved!')
    } catch (err) {
      setError('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        // Delete user data
        await supabase.from('users').delete().eq('id', authUser.id)
        await supabase.auth.signOut()
        router.push('/')
      }
    } catch (err) {
      setError('Failed to delete account')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const toggleLearningLanguage = (lang: string) => {
    if (learningLanguages.includes(lang)) {
      setLearningLanguages(learningLanguages.filter(l => l !== lang))
    } else {
      setLearningLanguages([...learningLanguages, lang])
    }
  }

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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-muted-foreground">Manage your account and preferences</p>
          </div>
          <Button variant="ghost" onClick={() => router.push('/')}>
            ← Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="profile" className="max-w-4xl">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="privacy" className="gap-2">
              <Lock className="h-4 w-4" />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="audio-video" className="gap-2">
              <Volume2 className="h-4 w-4" />
              Audio/Video
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-2">
              <LogOut className="h-4 w-4" />
              Account
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>Update your profile details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={user?.avatar_url || ''} alt={user?.display_name} />
                    <AvatarFallback className="text-2xl">
                      {(user?.display_name || 'U').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                      Change Photo
                    </Button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP. Max 5MB.</p>
                  </div>
                </div>

                {/* Display Name */}
                <div>
                  <Label>Display Name</Label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your display name"
                  />
                </div>

                {/* Bio */}
                <div>
                  <Label>Bio</Label>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                </div>

                {/* Native Language */}
                <div>
                  <Label>Native Language</Label>
                  <Select value={nativeLanguage} onValueChange={setNativeLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select your native language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map(lang => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Learning Languages */}
                <div>
                  <Label>Learning Languages</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {languages.map(lang => (
                      <Button
                        key={lang}
                        variant={learningLanguages.includes(lang) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleLearningLanguage(lang)}
                      >
                        {lang}
                      </Button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}
                {success && <p className="text-sm text-green-500">{success}</p>}

                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Control how you receive notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive updates via email</p>
                  </div>
                  <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Push Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive browser notifications</p>
                  </div>
                  <Switch checked={pushNotifications} onCheckedChange={setPushNotifications} />
                </div>
                <Button>Save Preferences</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy Tab */}
          <TabsContent value="privacy" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Privacy Settings</CardTitle>
                <CardDescription>Control your privacy preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Show Online Status</p>
                    <p className="text-sm text-muted-foreground">Let others see when you're online</p>
                  </div>
                  <Switch checked={showOnlineStatus} onCheckedChange={setShowOnlineStatus} />
                </div>
                <div>
                  <p className="font-medium mb-2">Who can send you direct messages?</p>
                  <Select value={allowDMs} onValueChange={setAllowDMs}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="everyone">Everyone</SelectItem>
                      <SelectItem value="following">People you follow</SelectItem>
                      <SelectItem value="none">No one</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button>Save Privacy Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Audio/Video Tab */}
          <TabsContent value="audio-video" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Audio & Video Settings</CardTitle>
                <CardDescription>Configure your input and output devices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Microphone</Label>
                  <Select value={selectedMic} onValueChange={setSelectedMic}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Microphone</SelectItem>
                      {devices.mics.map((mic, i) => (
                        <SelectItem key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || `Microphone ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Camera</Label>
                  <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Camera</SelectItem>
                      {devices.cameras.map((cam, i) => (
                        <SelectItem key={cam.deviceId} value={cam.deviceId}>
                          {cam.label || `Camera ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Speaker</Label>
                  <Select value={selectedSpeaker} onValueChange={setSelectedSpeaker}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default Speaker</SelectItem>
                      {devices.speakers.map((speaker, i) => (
                        <SelectItem key={speaker.deviceId} value={speaker.deviceId}>
                          {speaker.label || `Speaker ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button>Test Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Tab */}
          <TabsContent value="account" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>Manage your account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Sign Out</p>
                    <p className="text-sm text-muted-foreground">Sign out of your account</p>
                  </div>
                  <Button variant="outline" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                  <div>
                    <p className="font-medium text-red-600">Delete Account</p>
                    <p className="text-sm text-muted-foreground">Permanently delete your account and data</p>
                  </div>
                  <Button variant="destructive" onClick={handleDeleteAccount}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
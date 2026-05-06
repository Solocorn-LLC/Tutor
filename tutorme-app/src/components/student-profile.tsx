'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  User,
  Settings,
  Target,
  BookOpen,
  Clock,
  TrendingUp,
  GraduationCap,
  Edit3,
  Save,
  X,
} from 'lucide-react'

interface UserProfile {
  id: string
  name: string | null
  email: string | null
  image: string | null
  profile?: {
    school?: string
    targetScore?: number
    studyHours?: number
    bio?: string
  }
}

interface StudyStats {
  totalStudyTime: number
  subjectsCompleted: number
  quizzesTaken: number
  averageScore: number
  lessonsCompleted: number
  currentStreak: number
}

export function StudentProfile() {
  const { data: session } = useSession()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<StudyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    school: '',
    bio: '',
  })

  useEffect(() => {
    loadProfileData()
  }, [])

  const loadProfileData = async () => {
    try {
      const profileRes = await fetch('/api/user/profile')
      const profileData = await profileRes.json()

      if (profileData.profile) {
        setProfile(profileData.profile)
        setEditForm({
          name: profileData.profile.name || '',
          school: profileData.profile.school || '',
          bio: profileData.profile.bio || '',
        })
      }

      // Mock stats for now - can be fetched from a real API
      setStats({
        totalStudyTime: 47,
        subjectsCompleted: 3,
        quizzesTaken: 24,
        averageScore: 82,
        lessonsCompleted: 156,
        currentStreak: 5,
      })
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })

      if (res.ok) {
        toast.success('Profile updated successfully!')
        setIsEditing(false)
        loadProfileData()
      } else {
        toast.error('Failed to update profile')
      }
    } catch (error) {
      toast.error('Error updating profile')
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <User className="h-4 w-4" />
          Profile
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-500" />
            Student Profile
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* User Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-2xl font-bold text-white">
                      {profile?.name?.charAt(0)?.toUpperCase() || 'S'}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{profile?.name || 'Student'}</h3>
                      <p className="text-sm text-gray-500">{profile?.email}</p>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <GraduationCap className="mr-1 h-3 w-3" />
                          Student
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="school">School</Label>
                      <Input
                        id="school"
                        value={editForm.school}
                        onChange={e => setEditForm({ ...editForm, school: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bio">Bio</Label>
                      <Input
                        id="bio"
                        value={editForm.bio}
                        onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                      />
                    </div>
                    <Button onClick={handleSaveProfile} className="w-full">
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {profile?.profile?.school && (
                      <p className="text-sm">
                        <span className="text-gray-500">School:</span> {profile.profile.school}
                      </p>
                    )}
                    {profile?.profile?.bio && (
                      <p className="text-sm">
                        <span className="text-gray-500">Bio:</span> {profile.profile.bio}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Statistics Tab */}
          <TabsContent value="stats" className="space-y-4">
            {stats && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="text-2xl font-bold">{stats.totalStudyTime}h</p>
                          <p className="text-xs text-gray-500">Total Study Time</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="text-2xl font-bold">{stats.lessonsCompleted}</p>
                          <p className="text-xs text-gray-500">Lessons Completed</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-purple-500" />
                        <div>
                          <p className="text-2xl font-bold">{stats.quizzesTaken}</p>
                          <p className="text-xs text-gray-500">Quizzes Taken</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="text-2xl font-bold">{stats.averageScore}%</p>
                          <p className="text-xs text-gray-500">Average Score</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Settings className="h-4 w-4" />
                  Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-gray-500">Receive updates about your progress</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Study Reminders</p>
                    <p className="text-sm text-gray-500">Daily reminders to maintain your streak</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">AI Tutor Voice</p>
                    <p className="text-sm text-gray-500">Change voice and accent preferences</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Change
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Privacy Settings</p>
                    <p className="text-sm text-gray-500">Manage your data and privacy</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Manage
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-red-600">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:bg-red-50"
                >
                  Reset All Progress
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 hover:bg-red-50"
                >
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

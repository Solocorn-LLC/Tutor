'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAdminUsers } from '@/lib/admin/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  MoreHorizontal,
  UserCog,
  Ban,
  Mail,
  ChevronLeft,
  ChevronRight,
  Shield,
  GraduationCap,
  User,
  UserPlus,
  CheckCircle,
  Loader2,
} from 'lucide-react'

const roles = [
  { value: 'all', label: 'All Roles' },
  { value: 'student', label: 'Students' },
  { value: 'tutor', label: 'Tutors' },
  { value: 'admin', label: 'Admins' },
]

export default function UsersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useAdminUsers({
    page,
    limit: 20,
    role: roleFilter === 'all' ? undefined : roleFilter,
    search: search || undefined,
  })

  const users = data?.users || []
  const pagination = data?.pagination
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  // --- Add User ---
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({
    email: '',
    name: '',
    role: 'STUDENT',
    password: '',
  })
  const [adding, setAdding] = useState(false)
  const handleAddUser = async () => {
    setAdding(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(addForm),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Failed to create user')
        return
      }
      toast.success('User created')
      setAddOpen(false)
      setAddForm({ email: '', name: '', role: 'STUDENT', password: '' })
      refresh()
    } catch {
      toast.error('Failed to create user')
    } finally {
      setAdding(false)
    }
  }

  // --- Suspend / Activate ---
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const handleToggleSuspend = async (u: { id: string; status?: string; name?: string }) => {
    const action = u.status === 'suspended' ? 'activate' : 'suspend'
    if (
      action === 'suspend' &&
      !window.confirm(`Suspend ${u.name || 'this user'}? They will be unable to sign in.`)
    ) {
      return
    }
    setBusyUserId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Failed to update user')
        return
      }
      toast.success(action === 'suspend' ? 'User suspended' : 'User reactivated')
      refresh()
    } catch {
      toast.error('Failed to update user')
    } finally {
      setBusyUserId(null)
    }
  }

  // --- Send Email ---
  const [emailTarget, setEmailTarget] = useState<{ id: string; name?: string } | null>(null)
  const [emailForm, setEmailForm] = useState({ subject: '', message: '' })
  const [sending, setSending] = useState(false)
  const handleSendEmail = async () => {
    if (!emailTarget) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/users/${emailTarget.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(emailForm),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Failed to send message')
        return
      }
      toast.success('Message sent')
      setEmailTarget(null)
      setEmailForm({ subject: '', message: '' })
    } catch {
      toast.error('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return Shield
      case 'TUTOR':
        return GraduationCap
      default:
        return User
    }
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800 hover:bg-purple-100'
      case 'TUTOR':
        return 'bg-green-100 text-green-800 hover:bg-green-100'
      default:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-100'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-slate-500">Manage user accounts and permissions</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by name or email..."
                className="pl-9"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={handleSearch}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isLoading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              `${pagination?.total?.toLocaleString() || 0} Users`
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stats</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5)
                  .fill(0)
                  .map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-6 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8" />
                      </TableCell>
                    </TableRow>
                  ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <p className="text-slate-500">No users found</p>
                    <p className="text-sm text-slate-400">Try adjusting your search or filters</p>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user: Record<string, unknown>) => {
                  const RoleIcon = getRoleIcon(user.role as string)
                  return (
                    <TableRow key={user.id as string}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar as string} />
                            <AvatarFallback className="bg-slate-100 text-xs">
                              {(user.name as string)?.[0] || (user.email as string)?.[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{(user.name as string) || 'Unnamed'}</p>
                            <p className="text-sm text-slate-500">{user.email as string}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getRoleBadgeColor(user.role as string)}
                        >
                          <RoleIcon className="mr-1 h-3 w-3" />
                          {user.role as string}
                        </Badge>
                        {(user.adminRoles as string[])?.length > 0 && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.status === 'suspended' ? (
                          <Badge variant="destructive" className="text-xs">
                            Suspended
                          </Badge>
                        ) : (
                          <Badge
                            variant={user.isVerified ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {user.isVerified ? 'Verified' : 'Unverified'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-500">
                          <span>
                            {(user.stats as Record<string, number>)?.enrollments || 0} enrollments
                          </span>
                          <span className="mx-1">·</span>
                          <span>
                            {(user.stats as Record<string, number>)?.sessions || 0} sessions
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {new Date(user.createdAt as string).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/users/${user.id}`}>
                                <UserCog className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                setEmailTarget({
                                  id: user.id as string,
                                  name: (user.name as string) || (user.email as string),
                                })
                              }
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Send Email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={busyUserId === user.id}
                              className={
                                user.status === 'suspended' ? 'text-emerald-600' : 'text-red-600'
                              }
                              onSelect={e => {
                                e.preventDefault()
                                handleToggleSuspend({
                                  id: user.id as string,
                                  status: user.status as string,
                                  name: (user.name as string) || (user.email as string),
                                })
                              }}
                            >
                              {user.status === 'suspended' ? (
                                <>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Reactivate User
                                </>
                              ) : (
                                <>
                                  <Ban className="mr-2 h-4 w-4" />
                                  Suspend User
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add User dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>Create a new student, tutor, or parent account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addForm.email}
                onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={addForm.name}
                onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select
                value={addForm.role}
                onValueChange={v => setAddForm(f => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STUDENT">Student</SelectItem>
                  <SelectItem value="TUTOR">Tutor</SelectItem>
                  <SelectItem value="PARENT">Parent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="add-password">Temporary password</Label>
              <Input
                id="add-password"
                type="text"
                value={addForm.password}
                onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                placeholder="At least 8 characters"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={adding}>
              {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Email dialog */}
      <Dialog open={!!emailTarget} onOpenChange={open => !open && setEmailTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send message{emailTarget?.name ? ` to ${emailTarget.name}` : ''}
            </DialogTitle>
            <DialogDescription>Delivered in-app and by email to the user.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailForm.subject}
                onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                rows={5}
                value={emailForm.message}
                onChange={e => setEmailForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailTarget(null)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

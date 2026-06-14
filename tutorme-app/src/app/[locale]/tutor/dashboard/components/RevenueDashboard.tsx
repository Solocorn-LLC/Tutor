'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Calendar,
  CreditCard,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  BarChart3,
  PieChart,
  Download,
  Eye,
  ChevronRight,
  Mail,
  Send,
} from 'lucide-react'
import { DASHBOARD_THEMES, getThemeStyle } from '@/components/dashboard-theme'

interface RevenueDashboardProps {
  compact?: boolean
  defaultTab?: 'overview' | 'earnings' | 'courses' | 'analytics'
  externalEmailDialogOpen?: boolean
  onExternalEmailDialogChange?: (open: boolean) => void
  className?: string
  themeId?: string
}

interface EarningRecord {
  id: string
  date: string
  description: string
  amount: number
  type: 'class' | 'course' | 'refund' | 'payout'
  status: 'completed' | 'pending' | 'processing'
  studentName?: string
}

interface CoursePerformance {
  id: string
  name: string
  enrollments: number
  revenue: number
  conversionRate: number
  rating: number
}

interface TimeSlotPopularity {
  slot: string
  bookings: number
  revenue: number
}

// Demo data
const generateDemoEarnings = (): EarningRecord[] => [
  {
    id: '1',
    date: '2026-02-15',
    description: 'Advanced Mathematics Session',
    amount: 150,
    type: 'class',
    status: 'completed',
    studentName: 'Alice Zhang',
  },
  {
    id: '2',
    date: '2026-02-14',
    description: 'Physics 101 Course Sale',
    amount: 299,
    type: 'course',
    status: 'completed',
  },
  {
    id: '3',
    date: '2026-02-13',
    description: 'English Literature Session',
    amount: 120,
    type: 'class',
    status: 'completed',
    studentName: 'Bob Li',
  },
  {
    id: '4',
    date: '2026-02-12',
    description: 'Refund - Cancelled Session',
    amount: -150,
    type: 'refund',
    status: 'completed',
    studentName: 'Carol Wang',
  },
  {
    id: '5',
    date: '2026-02-10',
    description: 'Monthly Payout',
    amount: -1200,
    type: 'payout',
    status: 'completed',
  },
  {
    id: '6',
    date: '2026-02-09',
    description: 'Chemistry Tutoring',
    amount: 180,
    type: 'class',
    status: 'completed',
    studentName: 'David Chen',
  },
  {
    id: '7',
    date: '2026-02-08',
    description: 'Math Course Bundle',
    amount: 499,
    type: 'course',
    status: 'completed',
  },
  {
    id: '8',
    date: '2026-02-07',
    description: 'Private Session',
    amount: 200,
    type: 'class',
    status: 'pending',
    studentName: 'Emma Liu',
  },
]

const generateDemoCoursePerformance = (): CoursePerformance[] => [
  {
    id: '1',
    name: 'Advanced Mathematics',
    enrollments: 45,
    revenue: 13455,
    conversionRate: 12.5,
    rating: 4.8,
  },
  {
    id: '2',
    name: 'Physics 101',
    enrollments: 32,
    revenue: 9568,
    conversionRate: 8.3,
    rating: 4.6,
  },
  {
    id: '3',
    name: 'English Literature',
    enrollments: 28,
    revenue: 5544,
    conversionRate: 6.7,
    rating: 4.9,
  },
  {
    id: '4',
    name: 'Chemistry Basics',
    enrollments: 18,
    revenue: 5382,
    conversionRate: 5.2,
    rating: 4.4,
  },
]

const generateDemoTimeSlots = (): TimeSlotPopularity[] => [
  { slot: 'Mon-Fri 6-8 PM', bookings: 45, revenue: 6750 },
  { slot: 'Sat-Sun 10-12 AM', bookings: 38, revenue: 5700 },
  { slot: 'Mon-Fri 4-6 PM', bookings: 32, revenue: 4800 },
  { slot: 'Sat-Sun 2-4 PM', bookings: 28, revenue: 4200 },
  { slot: 'Weekday Mornings', bookings: 15, revenue: 2250 },
]

// Email Dialog Component
interface EmailStatementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  emailAddress: string
  setEmailAddress: (email: string) => void
  sendingEmail: boolean
  onSend: () => void
}

function EmailStatementDialog({
  open,
  onOpenChange,
  emailAddress,
  setEmailAddress,
  sendingEmail,
  onSend,
}: EmailStatementDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Statement
          </DialogTitle>
          <DialogDescription>
            Send your revenue statement to any email address. The statement will include all
            transactions for the current period.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter email address..."
              value={emailAddress}
              onChange={e => setEmailAddress(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSend()}
            />
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-700">Statement will include:</p>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li>• Transaction history</li>
              <li>• Revenue summary</li>
              <li>• Course performance metrics</li>
              <li>• Tax information (if applicable)</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="modal-secondary-dark" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="modal-primary-dark" onClick={onSend} disabled={sendingEmail}>
            {sendingEmail ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Statement
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RevenueDashboard({
  compact = false,
  defaultTab = 'overview',
  externalEmailDialogOpen,
  onExternalEmailDialogChange,
  className,
  themeId: controlledThemeId,
}: RevenueDashboardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [earnings] = useState<EarningRecord[]>(generateDemoEarnings())
  const [courses] = useState<CoursePerformance[]>(generateDemoCoursePerformance())
  const [timeSlots] = useState<TimeSlotPopularity[]>(generateDemoTimeSlots())
  const [internalShowEmailDialog, setInternalShowEmailDialog] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)

  // Theme state with localStorage persistence
  const [themeId, setThemeId] = useState(controlledThemeId ?? 'current')
  const selectedTheme = DASHBOARD_THEMES.find(theme => theme.id === themeId) ?? DASHBOARD_THEMES[0]
  const themeStyle = getThemeStyle(selectedTheme)

  useEffect(() => {
    if (controlledThemeId) {
      setThemeId(controlledThemeId)
      return
    }
    const savedTheme = localStorage.getItem('tutor-dashboard-theme')
    if (savedTheme) {
      setThemeId(savedTheme)
    }
  }, [controlledThemeId])

  useEffect(() => {
    if (controlledThemeId) return
    localStorage.setItem('tutor-dashboard-theme', themeId)
  }, [themeId, controlledThemeId])

  // Use external dialog state if provided, otherwise use internal
  const showEmailDialog =
    externalEmailDialogOpen !== undefined ? externalEmailDialogOpen : internalShowEmailDialog
  const setShowEmailDialog = (open: boolean) => {
    if (onExternalEmailDialogChange) {
      onExternalEmailDialogChange(open)
    }
    setInternalShowEmailDialog(open)
  }

  // Calculate metrics
  const totalRevenue = earnings
    .filter(e => e.type !== 'payout' && e.type !== 'refund')
    .reduce((sum, e) => sum + e.amount, 0)

  const pendingAmount = earnings
    .filter(e => e.status === 'pending')
    .reduce((sum, e) => sum + e.amount, 0)

  const availableBalance =
    totalRevenue -
    earnings.filter(e => e.type === 'payout').reduce((sum, e) => sum + Math.abs(e.amount), 0)

  const thisMonthRevenue = earnings
    .filter(e => e.date.startsWith('2026-02') && e.type !== 'payout' && e.type !== 'refund')
    .reduce((sum, e) => sum + e.amount, 0)

  const lastMonthRevenue = 8500 // Demo comparison
  const revenueChange = ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100

  const totalBookings = earnings.filter(e => e.type === 'class').length
  const avgBookingValue = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-600">
            Completed
          </Badge>
        )
      case 'pending':
        return (
          <Badge variant="outline" className="border-yellow-600 text-yellow-600">
            Pending
          </Badge>
        )
      case 'processing':
        return (
          <Badge variant="outline" className="border-blue-600 text-blue-600">
            Processing
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'class':
        return <Calendar className="h-4 w-4 text-blue-500" />
      case 'course':
        return <BarChart3 className="h-4 w-4 text-purple-500" />
      case 'refund':
        return <ArrowDownRight className="h-4 w-4 text-red-500" />
      case 'payout':
        return <Wallet className="h-4 w-4 text-orange-500" />
      default:
        return <DollarSign className="h-4 w-4 text-gray-500" />
    }
  }

  const handleSendEmail = async () => {
    if (!emailAddress.trim() || !emailAddress.includes('@')) {
      toast.error('Please enter a valid email address')
      return
    }
    setSendingEmail(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500))
    toast.success(`Statement sent to ${emailAddress}`)
    setSendingEmail(false)
    setShowEmailDialog(false)
    setEmailAddress('')
  }

  if (compact) {
    return (
      <>
        <Card className="border-border bg-card h-full border" style={themeStyle}>
          <CardHeader className="text-foreground pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-500" />
                <CardTitle className="text-foreground text-base">Revenue</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push('/tutor/revenue')}>
                View All
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-foreground text-2xl font-bold">
                    {formatCurrency(availableBalance)}
                  </p>
                  <p className="text-muted-foreground text-xs">Available Balance</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-green-600">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-sm font-medium">+{revenueChange.toFixed(1)}%</span>
                  </div>
                  <p className="text-muted-foreground text-xs">vs last month</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="border-border bg-muted rounded-lg border p-3">
                  <p className="text-foreground text-lg font-bold">{totalBookings}</p>
                  <p className="text-muted-foreground text-xs">Bookings</p>
                </div>
                <div className="border-border bg-muted rounded-lg border p-3">
                  <p className="text-foreground text-lg font-bold">
                    {formatCurrency(avgBookingValue)}
                  </p>
                  <p className="text-muted-foreground text-xs">Avg Value</p>
                </div>
              </div>

              {pendingAmount > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm text-yellow-800">
                    <Clock className="mr-1 inline h-4 w-4" />
                    {formatCurrency(pendingAmount)} pending clearance
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => router.push('/tutor/revenue')}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Revenue & Analytics
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="w-full" variant="outline" size="sm">
                    <Download className="mr-1 h-4 w-4" />
                    Download
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEmailDialog(true)}
                  >
                    <Mail className="mr-1 h-4 w-4" />
                    Email
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <EmailStatementDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          emailAddress={emailAddress}
          setEmailAddress={setEmailAddress}
          sendingEmail={sendingEmail}
          onSend={handleSendEmail}
        />
      </>
    )
  }

  return (
    <>
      <Card className={cn('border-border bg-card flex h-full flex-col border', className)} style={themeStyle}>
        <CardHeader className="text-foreground pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <CardTitle className="text-foreground text-base font-bold">
                Revenue & Business
              </CardTitle>
            </div>
            <div className="flex items-center gap-1">
              {!controlledThemeId && (
                <Select value={themeId} onValueChange={setThemeId}>
                  <SelectTrigger className="border-border bg-background text-foreground h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {DASHBOARD_THEMES.map(theme => (
                      <SelectItem key={theme.id} value={theme.id}>
                        {theme.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowEmailDialog(true)}>
                <Mail className="mr-1 h-4 w-4" />
                Email
              </Button>
              <Button variant="ghost" size="sm">
                <Download className="mr-1 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="border-border rounded-xl border bg-green-50 p-3">
              <p className="mb-1 text-xs text-green-600">Available Balance</p>
              <p className="text-xl font-bold text-green-800">{formatCurrency(availableBalance)}</p>
            </div>
            <div className="border-border rounded-xl border bg-blue-50 p-3">
              <p className="mb-1 text-xs text-blue-600">This Month</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold text-blue-800">
                  {formatCurrency(thisMonthRevenue)}
                </p>
                <Badge variant={revenueChange >= 0 ? 'default' : 'destructive'} className="text-xs">
                  {revenueChange >= 0 ? '+' : ''}
                  {revenueChange.toFixed(0)}%
                </Badge>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab as any} className="mt-4">
            <TabsList className="bg-muted grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="earnings" className="text-xs">
                Earnings
              </TabsTrigger>
              <TabsTrigger value="courses" className="text-xs">
                Courses
              </TabsTrigger>
              <TabsTrigger value="analytics" className="text-xs">
                Analytics
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>

        <CardContent className="flex-1 p-0">
          <ScrollArea className="h-[calc(100%-180px)]">
            <div className="px-4 pb-4">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border-border bg-card rounded-lg border p-3 text-center">
                      <p className="text-foreground text-lg font-bold">{totalBookings}</p>
                      <p className="text-muted-foreground text-xs">Total Bookings</p>
                    </div>
                    <div className="border-border bg-card rounded-lg border p-3 text-center">
                      <p className="text-foreground text-lg font-bold">
                        {formatCurrency(avgBookingValue)}
                      </p>
                      <p className="text-muted-foreground text-xs">Avg Booking Value</p>
                    </div>
                    <div className="border-border bg-card rounded-lg border p-3 text-center">
                      <p className="text-foreground text-lg font-bold">{courses.length}</p>
                      <p className="text-muted-foreground text-xs">Active Courses</p>
                    </div>
                    <div className="border-border bg-card rounded-lg border p-3 text-center">
                      <p className="text-foreground text-lg font-bold">4.7</p>
                      <p className="text-muted-foreground text-xs">Avg Rating</p>
                    </div>
                  </div>

                  {/* Recent Earnings */}
                  <div>
                    <h3 className="text-foreground mb-2 text-sm font-medium">
                      Recent Transactions
                    </h3>
                    <div className="space-y-2">
                      {earnings.slice(0, 5).map(earning => (
                        <div
                          key={earning.id}
                          className="bg-muted flex items-center justify-between rounded p-2"
                        >
                          <div className="flex items-center gap-2">
                            {getTypeIcon(earning.type)}
                            <div>
                              <p className="text-foreground text-sm font-medium">
                                {earning.description}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {formatDate(earning.date)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={cn(
                                'text-sm font-medium',
                                earning.amount < 0 ? 'text-red-600' : 'text-green-600'
                              )}
                            >
                              {earning.amount < 0 ? '' : '+'}
                              {formatCurrency(earning.amount)}
                            </p>
                            {getStatusBadge(earning.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payout Button */}
                  {availableBalance > 0 && (
                    <Button variant="modal-primary" className="w-full">
                      <Wallet className="mr-2 h-4 w-4" />
                      Request Payout ({formatCurrency(availableBalance)})
                    </Button>
                  )}
                </div>
              )}

              {activeTab === 'earnings' && (
                <div className="space-y-3">
                  {earnings.map(earning => (
                    <div key={earning.id} className="border-border bg-card rounded-lg border p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                            {getTypeIcon(earning.type)}
                          </div>
                          <div>
                            <p className="text-foreground text-sm font-medium">
                              {earning.description}
                            </p>
                            {earning.studentName && (
                              <p className="text-muted-foreground text-xs">
                                Student: {earning.studentName}
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs">{earning.date}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              'font-bold',
                              earning.amount < 0 ? 'text-red-600' : 'text-green-600'
                            )}
                          >
                            {earning.amount < 0 ? '' : '+'}
                            {formatCurrency(earning.amount)}
                          </p>
                          {getStatusBadge(earning.status)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'courses' && (
                <div className="space-y-3">
                  {courses.map(course => (
                    <div key={course.id} className="border-border bg-card rounded-lg border p-3">
                      <div className="mb-2 flex items-start justify-between">
                        <h4 className="text-foreground text-sm font-medium">{course.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          ⭐ {course.rating}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted rounded p-2">
                          <p className="text-foreground text-lg font-bold">{course.enrollments}</p>
                          <p className="text-muted-foreground text-xs">Students</p>
                        </div>
                        <div className="bg-muted rounded p-2">
                          <p className="text-foreground text-lg font-bold">
                            {formatCurrency(course.revenue)}
                          </p>
                          <p className="text-muted-foreground text-xs">Revenue</p>
                        </div>
                        <div className="bg-muted rounded p-2">
                          <p className="text-foreground text-lg font-bold">
                            {course.conversionRate}%
                          </p>
                          <p className="text-muted-foreground text-xs">Conversion</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-4">
                  {/* Conversion Funnel - Moved to top for visibility */}
                  <div className="border-border rounded-lg border bg-gradient-to-br from-blue-50/50 to-purple-50/50 p-4">
                    <h3 className="text-foreground mb-4 flex items-center gap-2 font-medium">
                      <TrendingUp className="h-5 w-5" />
                      Conversion Funnel
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-gray-700">👀 Page Views</span>
                          <span className="font-bold">1,245</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <div className="text-xs text-gray-500">▼ 36.6% conversion</div>
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-gray-700">📚 Course Views</span>
                          <span className="font-bold">456 (36.6%)</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-purple-100">
                          <div
                            className="h-full rounded-full bg-purple-500"
                            style={{ width: '36.6%' }}
                          />
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <div className="text-xs text-gray-500">▼ 27.0% conversion</div>
                      </div>

                      <div>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-medium text-gray-700">✅ Enrollments</span>
                          <span className="font-bold text-green-600">123 (27.0%)</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-green-100">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: '27.0%' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded bg-white/70 p-3 text-sm">
                      <p className="text-gray-700">
                        <strong>💡 Insight:</strong> Your course pages are converting well! Consider
                        optimizing the landing page to increase views.
                      </p>
                    </div>
                  </div>

                  {/* Popular Time Slots */}
                  <div>
                    <h3 className="text-foreground mb-3 flex items-center gap-2 text-sm font-medium">
                      <Clock className="h-4 w-4" />
                      Popular Time Slots
                    </h3>
                    <div className="space-y-2">
                      {timeSlots.map((slot, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="text-foreground w-32 truncate text-xs">{slot.slot}</span>
                          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full bg-purple-500"
                              style={{ width: `${(slot.bookings / 50) * 100}%` }}
                            />
                          </div>
                          <span className="text-foreground w-12 text-right text-xs">
                            {slot.bookings}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conversion Funnel */}
                  <div className="bg-muted rounded-lg p-3">
                    <h3 className="text-foreground mb-3 text-sm font-medium">Conversion Funnel</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Page Views</span>
                        <span className="text-foreground font-medium">1,245</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Course Views</span>
                        <span className="text-foreground font-medium">456 (36.6%)</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: '36.6%' }}
                        />
                      </div>

                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Enrollments</span>
                        <span className="text-foreground font-medium">123 (27.0%)</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-green-100">
                        <div
                          className="h-full rounded-full bg-green-500"
                          style={{ width: '27.0%' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Revenue Trend */}
                  <div className="bg-muted rounded-lg p-3">
                    <h3 className="text-foreground mb-3 text-sm font-medium">
                      Monthly Revenue Trend
                    </h3>
                    <div className="flex h-24 items-end gap-2">
                      {[65, 78, 45, 89, 92, 85, 95].map((height, idx) => (
                        <div key={idx} className="flex flex-1 flex-col items-center gap-1">
                          <div
                            className="w-full rounded-t bg-purple-500"
                            style={{ height: `${height}%` }}
                          />
                          <span className="text-muted-foreground text-xs">
                            {['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'][idx]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <EmailStatementDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        emailAddress={emailAddress}
        setEmailAddress={setEmailAddress}
        sendingEmail={sendingEmail}
        onSend={handleSendEmail}
      />
    </>
  )
}

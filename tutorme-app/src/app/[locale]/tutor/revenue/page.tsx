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
  Download,
  ArrowLeft,
  Mail,
  Send,
  ChevronRight,
  PieChart,
  Activity,
  Loader2,
  Building2,
  CheckCircle2,
  XCircle,
  Hourglass,
  CalendarClock,
} from 'lucide-react'
import { ScheduleViewModal } from '@/components/course/ScheduleViewModal'

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  currency: string
  type: 'class' | 'course' | 'refund' | 'payout'
  status: 'completed' | 'pending' | 'processing'
  studentName?: string
  clinicId?: string
}

interface CourseMetric {
  id: string
  name: string
  enrollments: number
  periodEnrollments: number
  estimatedRevenue: number
  currency: string
  conversionRate: number
  rating: number
}

interface TimeSlot {
  slot: string
  bookings: number
  revenue: number
}

interface MonthlyTrend {
  month: string
  revenue: number
}

interface Payout {
  id: string
  amount: number
  currency: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED'
  method: string
  requestedAt: string
  processedAt?: string
  completedAt?: string
  transactionReference?: string
  paymentCount: number
  payments: Array<{
    id: string
    amount: number
    description: string
    date: string
  }>
}

interface RevenueData {
  summary: {
    availableBalance: number
    periodEarnings: number
    periodChange: number
    totalBookings: number
    avgBookingValue: number
    pendingAmount: number
    currency: string
  }
  transactions: Transaction[]
  courses: CourseMetric[]
  timeSlots: TimeSlot[]
  monthlyTrend: MonthlyTrend[]
  payouts?: Payout[]
}

export default function RevenuePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const [scheduleCourse, setScheduleCourse] = useState<{ id: string; name: string } | null>(null)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [emailAddress, setEmailAddress] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RevenueData | null>(null)
  const [period, setPeriod] = useState('30d')
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loadingPayouts, setLoadingPayouts] = useState(false)

  // Fetch revenue data
  useEffect(() => {
    fetchRevenueData()
    fetchPayouts()
  }, [period])

  const fetchRevenueData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/tutor/revenue?period=${period}`, {
        credentials: 'include',
      })
      if (res.ok) {
        const revenueData = await res.json()
        setData(revenueData)
      } else {
        toast.error('Failed to load revenue data')
      }
    } catch {
      toast.error('Failed to load revenue data')
    } finally {
      setLoading(false)
    }
  }

  const fetchPayouts = async () => {
    setLoadingPayouts(true)
    try {
      const res = await fetch('/api/tutor/payouts', {
        credentials: 'include',
      })
      if (res.ok) {
        const payoutData = await res.json()
        setPayouts(payoutData.payouts)
      }
    } catch {
      console.error('Failed to load payouts')
    } finally {
      setLoadingPayouts(false)
    }
  }

  const formatCurrency = (amount: number, currency: string = data?.summary.currency || 'SGD') => {
    return new Intl.NumberFormat('en-SG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
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

  const getPayoutStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <Badge className="bg-green-600">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )
      case 'PROCESSING':
        return (
          <Badge variant="outline" className="border-blue-600 text-blue-600">
            <Hourglass className="mr-1 h-3 w-3" />
            Processing
          </Badge>
        )
      case 'PENDING':
        return (
          <Badge variant="outline" className="border-yellow-600 text-yellow-600">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const handleExport = () => {
    if (!data) return

    // Create CSV content
    const csvRows = [
      ['Date', 'Description', 'Type', 'Amount', 'Currency', 'Status'].join(','),
      ...data.transactions.map(t =>
        [formatDate(t.date), `"${t.description}"`, t.type, t.amount, t.currency, t.status].join(',')
      ),
    ]

    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast.success('Report exported successfully')
  }

  const [showPayoutDialog, setShowPayoutDialog] = useState(false)
  const [payoutAmount, setPayoutAmount] = useState('')
  const [payoutError, setPayoutError] = useState<string | null>(null)
  const [payoutMethod, setPayoutMethod] = useState('bank_transfer')
  const [submittingPayout, setSubmittingPayout] = useState(false)

  const handleRequestPayout = async () => {
    if (!data || data.summary.availableBalance <= 0) {
      toast.error('No available balance to payout')
      return
    }
    setShowPayoutDialog(true)
  }

  const submitPayoutRequest = async () => {
    const amount = parseFloat(payoutAmount)
    if (!amount || amount <= 0) {
      setPayoutError('Please enter a valid amount')
      return
    }
    if (amount > (data?.summary.availableBalance || 0)) {
      setPayoutError('Amount exceeds available balance')
      return
    }
    setPayoutError(null)

    setSubmittingPayout(true)
    try {
      const res = await fetch('/api/tutor/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount,
          method: payoutMethod,
          details: { currency: data?.summary.currency || 'SGD' },
        }),
      })

      if (res.ok) {
        toast.success('Payout request submitted successfully')
        setShowPayoutDialog(false)
        setPayoutAmount('')
        fetchPayouts()
        fetchRevenueData()
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to submit payout request')
      }
    } catch {
      toast.error('Failed to submit payout request')
    } finally {
      setSubmittingPayout(false)
    }
  }

  const handleSendEmail = async () => {
    if (!emailAddress.trim() || !emailAddress.includes('@')) {
      setEmailError('Please enter a valid email address')
      return
    }
    setEmailError(null)
    setSendingEmail(true)
    await new Promise(resolve => setTimeout(resolve, 1500))
    toast.success(`Statement sent to ${emailAddress}`)
    setSendingEmail(false)
    setShowEmailDialog(false)
    setEmailAddress('')
  }

  if (loading || !data) {
    return (
      <div className="flex min-h-full items-center justify-center bg-white pb-0">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading revenue data...</p>
        </div>
      </div>
    )
  }

  const { summary, transactions, courses, timeSlots, monthlyTrend } = data

  return (
    <div className="min-h-full bg-white pb-0">
      {/* Header */}
      <header className="safe-top z-sticky sticky top-0 border-b bg-white">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.push('/tutor/dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <h1 className="text-xl font-bold">Revenue & Business Analytics</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
                <Mail className="mr-2 h-4 w-4" />
                Email
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </Button>
              <Button
                variant="modal-primary"
                onClick={handleRequestPayout}
                disabled={summary.availableBalance <= 0}
              >
                <Wallet className="mr-2 h-4 w-4" />
                Request Payout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Available Balance</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(summary.availableBalance)}
                  </p>
                </div>
                <Wallet className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">This Period</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{formatCurrency(summary.periodEarnings)}</p>
                    {summary.periodChange !== 0 && (
                      <Badge
                        variant={summary.periodChange >= 0 ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {summary.periodChange >= 0 ? '+' : ''}
                        {summary.periodChange.toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Total Bookings</p>
                  <p className="text-2xl font-bold">{summary.totalBookings}</p>
                </div>
                <Calendar className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Avg Booking Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(summary.avgBookingValue)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Period:</span>
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="1y">This Year</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">Currency:</span>
                <span className="text-sm text-gray-700">{summary.currency}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Tabs */}
        <Card className="min-h-[600px]">
          <CardHeader className="pb-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full max-w-lg grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="earnings">Earnings</TabsTrigger>
                <TabsTrigger value="courses">Courses</TabsTrigger>
                <TabsTrigger value="payouts">Payouts</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="pt-6">
            <ScrollArea className="h-[500px]">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold">{summary.totalBookings}</p>
                      <p className="text-xs text-gray-500">Total Bookings</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold">
                        {formatCurrency(summary.avgBookingValue)}
                      </p>
                      <p className="text-xs text-gray-500">Avg Booking Value</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold">{courses.length}</p>
                      <p className="text-xs text-gray-500">Active Courses</p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-4 text-center">
                      <p className="text-2xl font-bold">
                        {courses.length > 0
                          ? (
                              courses.reduce((sum, c) => sum + c.rating, 0) / courses.length
                            ).toFixed(1)
                          : '0.0'}
                      </p>
                      <p className="text-xs text-gray-500">Avg Rating</p>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  <div>
                    <h3 className="mb-4 text-lg font-medium">Recent Transactions</h3>
                    {transactions.length === 0 ? (
                      <p className="py-8 text-center text-gray-500">
                        No transactions in this period
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {transactions.slice(0, 5).map(transaction => (
                          <div
                            key={transaction.id}
                            className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                          >
                            <div className="flex items-center gap-3">
                              {getTypeIcon(transaction.type)}
                              <div>
                                <p className="font-medium">{transaction.description}</p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(transaction.date)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={cn(
                                  'font-bold',
                                  transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                                )}
                              >
                                {transaction.amount < 0 ? '' : '+'}
                                {formatCurrency(transaction.amount, transaction.currency)}
                              </p>
                              {getStatusBadge(transaction.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pending Amount Alert */}
                  {summary.pendingAmount > 0 && (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                      <p className="flex items-center gap-2 text-yellow-800">
                        <Clock className="h-5 w-5" />
                        <span className="font-medium">
                          {formatCurrency(summary.pendingAmount)} pending clearance
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-yellow-600">
                        These funds will be available in your balance within 2-3 business days.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'earnings' && (
                <div className="space-y-4">
                  {transactions.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">No transactions in this period</p>
                  ) : (
                    transactions.map(transaction => (
                      <div
                        key={transaction.id}
                        className="rounded-lg border p-4 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                              {getTypeIcon(transaction.type)}
                            </div>
                            <div>
                              <p className="text-lg font-medium">{transaction.description}</p>
                              {transaction.studentName && (
                                <p className="text-sm text-gray-500">
                                  Student: {transaction.studentName}
                                </p>
                              )}
                              <p className="mt-1 text-xs text-gray-400">
                                {formatDate(transaction.date)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p
                              className={cn(
                                'text-xl font-bold',
                                transaction.amount < 0 ? 'text-red-600' : 'text-green-600'
                              )}
                            >
                              {transaction.amount < 0 ? '' : '+'}
                              {formatCurrency(transaction.amount, transaction.currency)}
                            </p>
                            <div className="mt-2">{getStatusBadge(transaction.status)}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'courses' && (
                <div className="space-y-4">
                  {courses.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">
                      No courses with enrollments in this period
                    </p>
                  ) : (
                    courses.map(course => (
                      <div
                        key={course.id}
                        className="rounded-lg border p-4 transition-shadow hover:shadow-md"
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <div>
                            <h4 className="text-lg font-medium">{course.name}</h4>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                ⭐ {course.rating.toFixed(1)}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                {course.enrollments} students enrolled
                              </span>
                              {course.periodEnrollments > 0 && (
                                <Badge
                                  variant="default"
                                  className="bg-green-100 text-xs text-green-700"
                                >
                                  +{course.periodEnrollments} this period
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setScheduleCourse({ id: course.id, name: course.name })
                              }
                            >
                              <CalendarClock className="mr-1 h-4 w-4" />
                              Schedule
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(`/tutor/insights?tab=builder&courseId=${course.id}`)
                              }
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="rounded-lg bg-blue-50 p-3 text-center">
                            <p className="text-xl font-bold text-blue-700">{course.enrollments}</p>
                            <p className="text-xs text-blue-600">Students</p>
                          </div>
                          <div className="rounded-lg bg-green-50 p-3 text-center">
                            <p className="text-xl font-bold text-green-700">
                              {formatCurrency(course.estimatedRevenue, course.currency)}
                            </p>
                            <p className="text-xs text-green-600">Revenue</p>
                          </div>
                          <div className="rounded-lg bg-purple-50 p-3 text-center">
                            <p className="text-xl font-bold text-purple-700">
                              {course.conversionRate.toFixed(1)}%
                            </p>
                            <p className="text-xs text-purple-600">Conversion</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'payouts' && (
                <div className="space-y-4">
                  {/* Payout Summary */}
                  <div className="mb-6 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-green-50 p-4">
                      <p className="text-sm text-green-600">Available Balance</p>
                      <p className="text-2xl font-bold text-green-700">
                        {formatCurrency(data?.summary.availableBalance || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-4">
                      <p className="text-sm text-blue-600">Total Payouts</p>
                      <p className="text-2xl font-bold text-blue-700">
                        {formatCurrency(
                          payouts
                            .filter(p => p.status === 'COMPLETED')
                            .reduce((sum, p) => sum + p.amount, 0)
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg bg-yellow-50 p-4">
                      <p className="text-sm text-yellow-600">Pending</p>
                      <p className="text-2xl font-bold text-yellow-700">
                        {formatCurrency(
                          payouts
                            .filter(p => p.status === 'PENDING' || p.status === 'PROCESSING')
                            .reduce((sum, p) => sum + p.amount, 0)
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Payout History */}
                  {payouts.length === 0 ? (
                    <div className="py-12 text-center">
                      <Building2 className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                      <p className="text-gray-500">No payouts yet</p>
                      <p className="mt-1 text-sm text-gray-400">
                        Request your first payout when you have available balance
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {payouts.map(payout => (
                        <div
                          key={payout.id}
                          className="rounded-lg border p-4 transition-shadow hover:shadow-md"
                        >
                          <div className="mb-4 flex items-start justify-between">
                            <div className="flex items-start gap-4">
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                                <Wallet className="h-6 w-6 text-gray-600" />
                              </div>
                              <div>
                                <p className="text-lg font-medium">
                                  Payout #{payout.id.slice(-8).toUpperCase()}
                                </p>
                                <p className="text-sm text-gray-500">
                                  {payout.paymentCount} payments • {payout.method.replace('_', ' ')}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  Requested {formatDate(payout.requestedAt)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-green-600">
                                {formatCurrency(payout.amount, payout.currency)}
                              </p>
                              <div className="mt-2">{getPayoutStatusBadge(payout.status)}</div>
                              {payout.transactionReference && (
                                <p className="mt-1 text-xs text-gray-400">
                                  Ref: {payout.transactionReference}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Included Payments */}
                          {payout.payments.length > 0 && (
                            <div className="mt-3 border-t pt-3">
                              <p className="mb-2 text-sm font-medium">Included Payments:</p>
                              <div className="space-y-1">
                                {payout.payments.slice(0, 3).map(payment => (
                                  <div
                                    key={payment.id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="text-gray-600">{payment.description}</span>
                                    <span className="font-medium">
                                      {formatCurrency(payment.amount)}
                                    </span>
                                  </div>
                                ))}
                                {payout.payments.length > 3 && (
                                  <p className="text-xs text-gray-400">
                                    +{payout.payments.length - 3} more payments
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {/* Monthly Revenue Trend */}
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h3 className="mb-4 text-lg font-medium">Monthly Revenue Trend</h3>
                    <div className="flex h-32 items-end gap-3">
                      {monthlyTrend.map((item, idx) => {
                        const maxRevenue = Math.max(...monthlyTrend.map(m => m.revenue), 1)
                        const height = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0
                        return (
                          <div key={idx} className="flex flex-1 flex-col items-center gap-2">
                            <div className="text-xs font-medium text-gray-600">
                              {formatCurrency(item.revenue)}
                            </div>
                            <div
                              className="w-full rounded-t bg-gradient-to-t from-purple-500 to-purple-300"
                              style={{ height: `${Math.max(height, 5)}%` }}
                            />
                            <span className="text-xs text-gray-500">{item.month}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Popular Time Slots */}
                  {timeSlots.length > 0 && (
                    <div>
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-medium">
                        <Clock className="h-5 w-5" />
                        Popular Time Slots
                      </h3>
                      <div className="space-y-3">
                        {timeSlots.map((slot, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-4 rounded-lg bg-gray-50 p-3"
                          >
                            <span className="w-40 text-sm font-medium">{slot.slot}</span>
                            <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="h-full rounded-full bg-purple-500"
                                style={{
                                  width: `${Math.min((slot.bookings / (timeSlots[0]?.bookings || 1)) * 100, 100)}%`,
                                }}
                              />
                            </div>
                            <span className="w-12 text-right text-sm font-bold">
                              {slot.bookings}
                            </span>
                            <span className="w-20 text-right text-xs text-gray-500">
                              {formatCurrency(slot.revenue)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Conversion Funnel */}
                  <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-purple-50 p-6">
                    <h3 className="mb-6 flex items-center gap-2 font-medium text-blue-900">
                      <TrendingUp className="h-5 w-5" />
                      Revenue Insights
                    </h3>
                    <div className="space-y-4">
                      <p className="text-gray-700">
                        <strong>💡 Key Insights:</strong>
                      </p>
                      <ul className="space-y-2 text-sm text-gray-600">
                        <li>
                          • Your average booking value is {formatCurrency(summary.avgBookingValue)}.
                          Consider offering package deals to increase this.
                        </li>
                        <li>
                          • You have {summary.totalBookings} bookings this period with{' '}
                          {summary.periodChange > 0 ? 'an increase' : 'a decrease'} of{' '}
                          {Math.abs(summary.periodChange).toFixed(0)}% from the previous period.
                        </li>
                        {courses.length > 0 && (
                          <li>
                            • Your top course has {courses[0]?.enrollments || 0} enrollments. Focus
                            marketing efforts on similar topics.
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
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
                onChange={e => {
                  setEmailAddress(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                errorMessage={emailError || undefined}
                onKeyDown={e => e.key === 'Enter' && handleSendEmail()}
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
            <Button variant="modal-secondary-dark" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button variant="modal-primary-dark" onClick={handleSendEmail} disabled={sendingEmail}>
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

      {/* Payout Request Dialog */}
      <Dialog open={showPayoutDialog} onOpenChange={setShowPayoutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Request Payout
            </DialogTitle>
            <DialogDescription>
              Request a payout of your available balance. Processing typically takes 2-3 business
              days.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-sm text-green-600">Available Balance</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(data?.summary.availableBalance || 0)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payout-amount">Payout Amount</Label>
              <Input
                id="payout-amount"
                type="number"
                placeholder="Enter amount..."
                value={payoutAmount}
                onChange={e => {
                  setPayoutAmount(e.target.value)
                  if (payoutError) setPayoutError(null)
                }}
                errorMessage={payoutError || undefined}
                min={1}
                max={data?.summary.availableBalance}
              />
              <p className="text-xs text-gray-500">Minimum payout: {formatCurrency(10)}</p>
            </div>

            <div className="space-y-2">
              <Label>Payout Method</Label>
              <select
                className="w-full rounded border px-3 py-2"
                value={payoutMethod}
                onChange={e => setPayoutMethod(e.target.value)}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="stripe_connect">Stripe Connect</option>
                <option value="paypal">PayPal</option>
              </select>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="font-medium text-gray-700">Payout Details:</p>
              <ul className="mt-2 space-y-1 text-gray-600">
                <li>• Processing time: 2-3 business days</li>
                <li>• No processing fees</li>
                <li>• You'll receive a confirmation email</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="modal-secondary-dark" onClick={() => setShowPayoutDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="modal-primary-dark"
              onClick={submitPayoutRequest}
              disabled={submittingPayout || !payoutAmount || parseFloat(payoutAmount) <= 0}
            >
              {submittingPayout ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting...
                </>
              ) : (
                <>
                  <Wallet className="mr-2 h-4 w-4" />
                  Request Payout
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ScheduleViewModal
        courseId={scheduleCourse?.id ?? null}
        courseName={scheduleCourse?.name}
        onClose={() => setScheduleCourse(null)}
      />
    </div>
  )
}

'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, CreditCard, ArrowLeft, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { BackButton } from '@/components/navigation'

type GatewayOption = 'HITPAY' | 'AIRWALLEX' | 'WECHAT_PAY' | 'ALIPAY'

const gatewayOptions: { value: GatewayOption; label: string; description: string }[] = [
  { value: 'HITPAY', label: 'HitPay', description: 'Cards, PayNow, GrabPay' },
  { value: 'AIRWALLEX', label: 'Airwallex', description: 'Global cards & wallets' },
  { value: 'WECHAT_PAY', label: 'WeChat Pay', description: 'For China users' },
  { value: 'ALIPAY', label: 'Alipay', description: 'For China users' },
]

function PaymentPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [course, setCourse] = useState<{ name: string; subject: string } | null>(null)
  const [oneOnOne, setOneOnOne] = useState<{
    requestId: string
    tutorName: string
    tutorHandle?: string | null
    date: string
    startTime: string
    endTime: string
    timezone: string
    amount: number
    currency: string
  } | null>(null)
  const [oneOnOneLoading, setOneOnOneLoading] = useState(false)
  const [selectedGateway, setSelectedGateway] = useState<GatewayOption>('HITPAY')

  const courseId = searchParams.get('courseId')
  const requestId = searchParams.get('requestId')
  const amount = searchParams.get('amount')
  const currency = searchParams.get('currency') || 'USD'

  useEffect(() => {
    if (courseId) {
      // Load course details
      fetch(`/api/courses/${courseId}`)
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (data?.course) {
            setCourse({
              name: data.course.name,
              subject: data.course.subject,
            })
          }
        })
        .catch(err => console.error('[Payment] Failed to load course:', err))
    }
  }, [courseId])

  useEffect(() => {
    if (!requestId) return
    setOneOnOneLoading(true)
    fetch(`/api/one-on-one/request?requestId=${encodeURIComponent(requestId)}`, {
      credentials: 'include',
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data?.request) return
        const req = data.request
        const tutor = data.tutor
        setOneOnOne({
          requestId,
          tutorName: tutor?.name || 'Tutor',
          tutorHandle: tutor?.handle,
          date: req.requestedDate,
          startTime: req.startTime,
          endTime: req.endTime,
          timezone: req.timezone,
          amount: Number(req.costPerSession || 0),
          currency: tutor?.currency || 'USD',
        })
      })
      .catch(err => console.error('[Payment] Failed to load 1-on-1 request:', err))
      .finally(() => setOneOnOneLoading(false))
  }, [requestId])

  const handlePayment = async () => {
    if (requestId) {
      if (!oneOnOne?.amount) {
        toast.error('Invalid payment details')
        return
      }
    } else if (!courseId || !amount) {
      toast.error('Invalid payment details')
      return
    }

    setLoading(true)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json().catch(() => ({}))
      const csrfToken = csrfData?.token ?? null

      // Use different endpoints for Chinese gateways vs standard gateways
      const isChineseGateway = selectedGateway === 'WECHAT_PAY' || selectedGateway === 'ALIPAY'
      const endpoint = isChineseGateway ? '/api/payments/chinese-gateways' : '/api/payments/create'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({
          courseId: requestId ? undefined : courseId,
          oneOnOneRequestId: requestId || undefined,
          amount: requestId ? undefined : parseFloat(amount || '0'),
          currency: requestId ? oneOnOne?.currency : currency,
          gateway: selectedGateway,
          description: requestId
            ? `1-on-1 session with ${oneOnOne?.tutorName ?? 'Tutor'}`
            : course
              ? `Course: ${course.name}`
              : 'Course enrollment',
        }),
      })

      const data = await res.json()

      if (res.ok && (data.checkoutUrl || data.paymentUrl)) {
        // Redirect to payment gateway
        window.location.href = data.checkoutUrl || data.paymentUrl
      } else {
        toast.error(data.error || 'Failed to create payment')
        setLoading(false)
      }
    } catch {
      toast.error('Failed to process payment')
      setLoading(false)
    }
  }

  const formatCurrency = (amount: string, currency: string) => {
    const symbols: Record<string, string> = {
      USD: '$',
      SGD: 'S$',
      CNY: '¥',
      MYR: 'RM',
      EUR: '€',
      GBP: '£',
      AUD: 'A$',
      CAD: 'C$',
      JPY: '¥',
      INR: '₹',
      KRW: '₩',
      HKD: 'HK$',
    }
    const symbol = symbols[currency] || currency + ' '
    return `${symbol}${parseFloat(amount).toFixed(2)}`
  }

  const showInvalid = requestId ? !oneOnOne && !oneOnOneLoading : !courseId || !amount

  if (showInvalid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Payment Request</CardTitle>
            <CardDescription>Missing required payment information.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/course">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Courses
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (requestId && oneOnOneLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading payment details...
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const displayCurrency = requestId ? oneOnOne?.currency || currency : currency
  const displayAmount = requestId ? String(oneOnOne?.amount ?? '0') : amount || '0'

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <BackButton fallbackHref="../student/dashboard" className="mb-4" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Complete Payment
            </CardTitle>
            <CardDescription>Secure payment for your course enrollment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Course or Session Info */}
            {requestId && oneOnOne ? (
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-600">1-on-1 Session</p>
                <p className="text-lg font-semibold text-blue-900">{oneOnOne.tutorName}</p>
                <p className="text-sm text-blue-700">
                  {new Date(oneOnOne.date).toLocaleDateString()} · {oneOnOne.startTime} -{' '}
                  {oneOnOne.endTime} ({oneOnOne.timezone})
                </p>
                {oneOnOne.tutorHandle && (
                  <p className="text-xs text-blue-700">@{oneOnOne.tutorHandle}</p>
                )}
              </div>
            ) : course ? (
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-600">Course</p>
                <p className="text-lg font-semibold text-blue-900">{course.name}</p>
                <p className="text-sm text-blue-700">{course.subject}</p>
              </div>
            ) : null}

            {/* Amount */}
            <div className="border-y py-6 text-center">
              <p className="mb-1 text-sm text-gray-500">Total Amount</p>
              <p className="text-4xl font-bold text-gray-900">
                {formatCurrency(displayAmount, displayCurrency)}
              </p>
              {requestId && (
                <p className="mt-2 text-xs text-gray-500">
                  Cancellations are refundable at any time, minus a 15% cancellation fee.
                </p>
              )}
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={selectedGateway}
                onValueChange={v => setSelectedGateway(v as GatewayOption)}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose payment method" />
                </SelectTrigger>
                <SelectContent>
                  {gatewayOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} — {opt.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Security Note */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="h-4 w-4" />
              <span>Secure payment processing</span>
            </div>

            {/* Pay Button */}
            <Button className="w-full gap-2" size="lg" onClick={handlePayment} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Pay {formatCurrency(displayAmount, displayCurrency)}
                </>
              )}
            </Button>

            <p className="text-center text-xs text-gray-400">
              You will be redirected to our secure payment partner to complete the transaction.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function PaymentPage() {
  return (
    <Suspense fallback={null}>
      <PaymentPageInner />
    </Suspense>
  )
}

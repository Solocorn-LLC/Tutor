'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ShieldAlert, Activity, Globe, KeyRound } from 'lucide-react'

interface SecurityOverview {
  summary: {
    failedLogins24h: number
    activeSessions: number
    whitelistActive: number
    whitelistEnforced: boolean
  }
  whitelist: Array<{
    id: string
    ipAddress: string
    description: string | null
    isActive: boolean
    expiresAt: string | null
  }>
  recentActions: Array<{
    id: string
    action: string
    adminId: string
    ipAddress: string | null
    createdAt: string
  }>
}

export default function SecurityPage() {
  const [data, setData] = useState<SecurityOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/security/overview', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (!cancelled) setData(json)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const s = data?.summary
  const stats = [
    {
      label: 'Failed logins (24h)',
      value: s?.failedLogins24h,
      icon: ShieldAlert,
      color: 'bg-red-100 text-red-600',
    },
    {
      label: 'Active admin sessions',
      value: s?.activeSessions,
      icon: Activity,
      color: 'bg-emerald-100 text-emerald-600',
    },
    {
      label: 'Whitelisted IPs',
      value: s?.whitelistActive,
      icon: Globe,
      color: 'bg-blue-100 text-blue-600',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Security</h1>
        <p className="text-slate-500">
          IP whitelist {s?.whitelistEnforced ? 'enforced' : 'not enforced'} · audit logging active
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
                >
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  {loading ? (
                    <Skeleton className="mt-1 h-7 w-12" />
                  ) : (
                    <p className="text-2xl font-bold">{(stat.value ?? 0).toLocaleString()}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" /> IP whitelist
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : !data?.whitelist?.length ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No IP restrictions — admin access is open to any IP.
              </p>
            ) : (
              <div className="divide-y">
                {data.whitelist.map(w => (
                  <div key={w.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-mono text-sm text-slate-900">{w.ipAddress}</p>
                      {w.description && <p className="text-xs text-slate-500">{w.description}</p>}
                    </div>
                    <Badge variant={w.isActive ? 'default' : 'secondary'} className="text-xs">
                      {w.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Recent admin actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : !data?.recentActions?.length ? (
              <p className="py-4 text-center text-sm text-slate-500">No admin actions logged yet</p>
            ) : (
              <div className="divide-y">
                {data.recentActions.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-2">
                    <span className="font-mono text-xs text-slate-700">{a.action}</span>
                    <span className="text-xs text-slate-400">
                      {a.ipAddress || '—'} · {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

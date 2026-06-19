'use client'

import { useEffect, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  SlidersHorizontal,
  DollarSign,
  Calendar,
  Languages,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchWithCsrf } from '@/lib/api/fetch-csrf'
import { VariantScheduleEditor } from './VariantScheduleEditor'
import type { ScheduleItem } from '../constants'
import { REGIONS } from '@/lib/data/tutor-categories'

interface CourseScheduleConfig {
  scheduleId?: string
  scheduleIndex: number
  name?: string | null
  schedule: ScheduleItem[]
  weeksToSchedule?: number
  maxStudents?: number | null
}

interface VariantConfig {
  category: string
  nationality: string
  isPublished: boolean
  isFree: boolean
  price: number | null
  currency: string
  languageOfInstruction: string
  schedules: CourseScheduleConfig[]
}

interface VariantManagerProps {
  templateCourseId: string
  templateCourseName?: string
  selectedCategories: string[]
  selectedCountryCodes: string[]
  defaultPrice: number | null
  defaultCurrency: string
  defaultLanguage: string
  defaultSchedule: ScheduleItem[]
  onSaved?: () => void
  onStatsChange?: (stats: { total: number; published: number }) => void
  hidePublishAction?: boolean
}

export type VariantManagerHandle = {
  publish: () => Promise<void>
  setPanelsOpen: (open: boolean) => void
}

type VariantApiItem = {
  name?: unknown
  category?: unknown
  nationality?: unknown
  isPublished?: unknown
  isFree?: unknown
  price?: unknown
  currency?: unknown
  languageOfInstruction?: unknown
  schedule?: unknown
  weeksToSchedule?: unknown
  schedules?: unknown
  publishedCourseId?: unknown
}

type PublishResponse = {
  variants?: Array<{ isPublished?: boolean }>
  count?: number
  error?: string
}

function getCountryName(code: string): string {
  if (code === 'GL') return 'Global'
  const country = REGIONS.flatMap(r => r.countries).find(c => c.code === code)
  return country?.name || code
}

export const VariantManager = forwardRef<VariantManagerHandle, VariantManagerProps>(
  function VariantManager(
    {
      templateCourseId,
      templateCourseName,
      selectedCategories,
      selectedCountryCodes,
      defaultPrice,
      defaultCurrency,
      defaultLanguage,
      defaultSchedule,
      onSaved,
      onStatsChange,
      hidePublishAction = false,
    },
    ref
  ) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [globalPrice, setGlobalPrice] = useState<string>(
      defaultPrice != null ? String(defaultPrice) : ''
    )
    const [globalCurrency, setGlobalCurrency] = useState(defaultCurrency || 'USD')
    const [globalLanguage, setGlobalLanguage] = useState(defaultLanguage || 'English')
    const [globalIsFree, setGlobalIsFree] = useState<boolean>(
      defaultPrice == null || defaultPrice === 0
    )
    const [variants, setVariants] = useState<VariantConfig[]>([])
    const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
    const [scheduleDialogVariantIndex, setScheduleDialogVariantIndex] = useState<number | null>(
      null
    )
    const [scheduleDialogScheduleIndex, setScheduleDialogScheduleIndex] = useState<number | null>(
      null
    )
    const [scheduleDialogSession, setScheduleDialogSession] = useState(0)
    const [scheduleDialogOriginalState, setScheduleDialogOriginalState] = useState<{
      schedule: ScheduleItem[]
      weeksToSchedule: number
    } | null>(null)
    const [globalDefaultsOpen, setGlobalDefaultsOpen] = useState(true)
    const [generatedVariantsOpen, setGeneratedVariantsOpen] = useState(true)

    // Load existing variants on mount
    useEffect(() => {
      let active = true
      setLoading(true)
      fetch(`/api/tutor/courses/${templateCourseId}/publish`, { credentials: 'include' })
        .then(res => (res.ok ? res.json() : { variants: [] }))
        .then(data => {
          if (!active) return
          const raw = (data as { variants?: VariantApiItem[] })?.variants ?? []
          const loaded: VariantConfig[] = raw.map(v => {
            const schedules =
              Array.isArray(v.schedules) && v.schedules.length > 0
                ? v.schedules.map((s: any, i: number) => ({
                    scheduleId: typeof s.scheduleId === 'string' ? s.scheduleId : undefined,
                    scheduleIndex: typeof s.scheduleIndex === 'number' ? s.scheduleIndex : i + 1,
                    name: typeof s.name === 'string' ? s.name : null,
                    schedule: Array.isArray(s.schedule) ? (s.schedule as ScheduleItem[]) : [],
                    weeksToSchedule: typeof s.weeksToSchedule === 'number' ? s.weeksToSchedule : 8,
                    maxStudents: typeof s.maxStudents === 'number' ? s.maxStudents : null,
                  }))
                : Array.isArray(v.schedule) && v.schedule.length > 0
                  ? [
                      {
                        scheduleIndex: 1,
                        name: null,
                        schedule: v.schedule as ScheduleItem[],
                        weeksToSchedule:
                          typeof v.weeksToSchedule === 'number' ? v.weeksToSchedule : 8,
                        maxStudents: null,
                      },
                    ]
                  : []
            return {
              category: typeof v.category === 'string' ? v.category : '',
              nationality: typeof v.nationality === 'string' ? v.nationality : '',
              isPublished: typeof v.isPublished === 'boolean' ? v.isPublished : false,
              isFree: typeof v.isFree === 'boolean' ? v.isFree : false,
              price: typeof v.price === 'number' ? v.price : null,
              currency: typeof v.currency === 'string' ? v.currency : 'USD',
              languageOfInstruction:
                typeof v.languageOfInstruction === 'string' ? v.languageOfInstruction : '',
              schedules,
            }
          })
          setVariants(loaded)
        })
        .catch(() => setVariants([]))
        .finally(() => setLoading(false))
      return () => {
        active = false
      }
    }, [templateCourseId])

    // Sync global defaults from parent when they change meaningfully
    useEffect(() => {
      setGlobalPrice(defaultPrice != null ? String(defaultPrice) : '')
      setGlobalCurrency(defaultCurrency || 'USD')
      setGlobalLanguage(defaultLanguage || 'English')
      setGlobalIsFree(defaultPrice == null || defaultPrice === 0)
    }, [defaultPrice, defaultCurrency, defaultLanguage])

    // Compute the desired variant keys from current selections
    const desiredKeys = useMemo(() => {
      const keys = new Set<string>()
      const countries = selectedCountryCodes.length > 0 ? selectedCountryCodes : ['GL']
      for (const cat of selectedCategories) {
        for (const code of countries) {
          const name = getCountryName(code)
          keys.add(`${cat}|${name}`)
        }
      }
      return keys
    }, [selectedCategories, selectedCountryCodes])

    // Sync variants with desired keys: add missing, remove extras
    useEffect(() => {
      setVariants(prev => {
        const map = new Map(prev.map(v => [`${v.category}|${v.nationality}`, v]))
        let changed = false
        // The template course schedule (course.schedule) shown as "Schedule 1"
        // for variants that have no saved CourseSchedule rows of their own.
        const baselineSchedules =
          Array.isArray(defaultSchedule) && defaultSchedule.length > 0
            ? [
                {
                  scheduleIndex: 1,
                  name: null,
                  schedule: [...defaultSchedule],
                  weeksToSchedule: 8,
                  maxStudents: null,
                },
              ]
            : []
        const variantHasSchedules = (v: VariantConfig): boolean =>
          v.schedules.some(
            s => s.scheduleId || (Array.isArray(s.schedule) && s.schedule.length > 0)
          )
        // Add missing
        for (const key of desiredKeys) {
          const existing = map.get(key)
          if (!existing) {
            const [category, nationality] = key.split('|')
            map.set(key, {
              category,
              nationality,
              isPublished: true,
              isFree: globalIsFree,
              price: globalIsFree ? 0 : globalPrice ? parseFloat(globalPrice) : null,
              currency: globalCurrency,
              languageOfInstruction: globalLanguage,
              schedules: baselineSchedules,
            })
            changed = true
          } else if (!variantHasSchedules(existing) && baselineSchedules.length > 0) {
            // Backfill: the variant was created before the course schedule had
            // loaded (course fetch is async), so adopt the template schedule now
            // instead of leaving the scheduler showing only the "Add" button.
            map.set(key, { ...existing, schedules: baselineSchedules })
            changed = true
          }
        }
        // Remove extras — but never silently drop a variant that already has
        // saved schedules. On revisit the category/country pickers don't always
        // reproduce a stored variant's exact key, and deleting it here would
        // hide the tutor's existing schedules (Schedule 1, 2, …) from the
        // scheduler, leaving only the "Add another schedule" button.
        for (const [key, variant] of map.entries()) {
          if (desiredKeys.has(key)) continue
          if (variantHasSchedules(variant)) continue
          map.delete(key)
          changed = true
        }
        if (!changed) return prev
        return Array.from(map.values()).sort((a, b) =>
          `${a.category} - ${a.nationality}`.localeCompare(`${b.category} - ${b.nationality}`)
        )
      })
    }, [desiredKeys, globalPrice, globalCurrency, globalLanguage, defaultSchedule])

    const applyGlobalsToAll = useCallback(() => {
      const price = globalPrice ? parseFloat(globalPrice) : null
      setVariants(prev =>
        prev.map(v => ({
          ...v,
          isFree: globalIsFree,
          price: globalIsFree ? 0 : price,
          currency: globalCurrency,
          languageOfInstruction: globalLanguage,
        }))
      )
      toast.success('Global defaults applied to all variants')
    }, [globalPrice, globalCurrency, globalLanguage, globalIsFree])

    const updateVariant = useCallback(
      (index: number, updater: (v: VariantConfig) => VariantConfig) => {
        setVariants(prev => {
          const next = [...prev]
          next[index] = updater(next[index])
          return next
        })
      },
      []
    )

    const openScheduleDialog = useCallback(
      (variantIndex: number, scheduleIdx: number) => {
        setScheduleDialogSession(s => s + 1)
        setScheduleDialogVariantIndex(variantIndex)
        setScheduleDialogScheduleIndex(scheduleIdx)
        const variant = variants[variantIndex]
        const schedule = variant?.schedules[scheduleIdx]
        if (schedule) {
          setScheduleDialogOriginalState({
            schedule: JSON.parse(JSON.stringify(schedule.schedule)) as ScheduleItem[],
            weeksToSchedule: schedule.weeksToSchedule ?? 8,
          })
        }
        setTimeout(() => {
          setScheduleDialogOpen(true)
        }, 0)
      },
      [variants]
    )

    const closeScheduleDialog = useCallback(() => {
      setScheduleDialogOpen(false)
      setTimeout(() => {
        setScheduleDialogVariantIndex(null)
        setScheduleDialogScheduleIndex(null)
        setScheduleDialogOriginalState(null)
      }, 300)
    }, [])

    const cancelScheduleDialog = useCallback(() => {
      if (
        scheduleDialogOriginalState &&
        scheduleDialogVariantIndex != null &&
        scheduleDialogScheduleIndex != null
      ) {
        updateVariant(scheduleDialogVariantIndex, v => {
          const newSchedules = [...v.schedules]
          newSchedules[scheduleDialogScheduleIndex] = {
            ...newSchedules[scheduleDialogScheduleIndex],
            schedule: scheduleDialogOriginalState.schedule,
            weeksToSchedule: scheduleDialogOriginalState.weeksToSchedule,
          }
          return { ...v, schedules: newSchedules }
        })
      }
      setScheduleDialogOpen(false)
      setTimeout(() => {
        setScheduleDialogVariantIndex(null)
        setScheduleDialogScheduleIndex(null)
        setScheduleDialogOriginalState(null)
      }, 300)
    }, [
      scheduleDialogOriginalState,
      scheduleDialogVariantIndex,
      scheduleDialogScheduleIndex,
      updateVariant,
    ])

    const handleSave = useCallback(async () => {
      if (variants.length === 0) {
        toast.error('No variants to save. Select categories and countries first.')
        return
      }
      setSaving(true)
      try {
        const payload = variants.map(v => ({
          ...v,
          price: v.isFree ? 0 : typeof v.price === 'number' ? v.price : null,
        }))

        const res = await fetchWithCsrf(`/api/tutor/courses/${templateCourseId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variants: payload }),
        })

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as PublishResponse
          const variantsRes = Array.isArray(data.variants) ? data.variants : []
          const published = variantsRes.filter(v => Boolean(v.isPublished)).length
          const count = typeof data.count === 'number' ? data.count : variants.length
          toast.success(`Saved ${count} variants (${published} published)`)
          onSaved?.()
        } else {
          const data = await res.json().catch(() => ({}))
          toast.error(data?.error || 'Failed to save variants')
        }
      } catch (err) {
        console.error(err)
        toast.error('Failed to save variants')
      } finally {
        setSaving(false)
      }
    }, [variants, templateCourseId, onSaved])

    const publishedCount = variants.filter(v => v.isPublished).length

    useEffect(() => {
      onStatsChange?.({ total: variants.length, published: publishedCount })
    }, [variants.length, publishedCount, onStatsChange])

    const setPanelsOpen = useCallback((open: boolean) => {
      setGlobalDefaultsOpen(open)
      setGeneratedVariantsOpen(open)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        publish: async () => {
          await handleSave()
        },
        setPanelsOpen,
      }),
      [handleSave, setPanelsOpen]
    )

    if (loading) {
      return (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            <span className="text-muted-foreground ml-2">Loading variants…</span>
          </CardContent>
        </Card>
      )
    }

    const dialogVariant =
      scheduleDialogVariantIndex != null ? variants[scheduleDialogVariantIndex] : null
    const dialogSchedule =
      dialogVariant && scheduleDialogScheduleIndex != null
        ? dialogVariant.schedules[scheduleDialogScheduleIndex]
        : null

    // Ensure schedule component remounts cleanly when switching variants
    const scheduleEditorKey =
      scheduleDialogVariantIndex != null && scheduleDialogScheduleIndex != null
        ? `schedule-editor-${scheduleDialogVariantIndex}-${scheduleDialogScheduleIndex}`
        : 'schedule-editor-empty'

    return (
      <div className="space-y-6">
        <Card
          variant="floating"
          elevation={2}
          padding="none"
          className="overflow-hidden rounded-[16px] bg-white"
        >
          <button
            type="button"
            onClick={() => setGlobalDefaultsOpen(o => !o)}
            className="panel-header panel-header-metallic w-full text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="panel-header-icon">
                  <SlidersHorizontal className="h-5 w-5 text-slate-900" />
                </div>
                <div>
                  <div className="panel-header-title">Defaults</div>
                  <div className="panel-header-subtext">
                    Set default pricing, currency, and language for all variants.
                  </div>
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                {globalDefaultsOpen ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            </div>
          </button>
          {globalDefaultsOpen ? (
            <CardContent spacing="default" className="bg-white text-slate-900">
              <div className="grid gap-6 sm:grid-cols-5">
                <div className="form-group space-y-2 sm:col-span-2">
                  <Label className="form-label font-semibold text-slate-700">Free course</Label>
                  <div className="flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                    <span className="text-sm font-medium text-slate-600">
                      {globalIsFree ? 'Enabled' : 'Disabled'}
                    </span>
                    <Switch checked={globalIsFree} onCheckedChange={setGlobalIsFree} />
                  </div>
                </div>
                <div className="form-group space-y-2">
                  <Label className="form-label font-semibold text-slate-700">Price</Label>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      min={0}
                      value={globalPrice}
                      onChange={e => setGlobalPrice(e.target.value)}
                      placeholder="0.00"
                      disabled={globalIsFree}
                      className="border-slate-200 bg-white"
                    />
                  </div>
                </div>
                <div className="form-group space-y-2">
                  <Label className="form-label font-semibold text-slate-700">Currency</Label>
                  <Select value={globalCurrency} onValueChange={setGlobalCurrency}>
                    <SelectTrigger className="border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['USD', 'SGD', 'EUR', 'GBP', 'KRW', 'JPY', 'HKD', 'CNY', 'INR'].map(c => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="form-group space-y-2">
                  <Label className="form-label font-semibold text-slate-700">Language</Label>
                  <div className="flex items-center gap-2">
                    <Languages className="h-4 w-4 text-slate-400" />
                    <Input
                      value={globalLanguage}
                      onChange={e => setGlobalLanguage(e.target.value)}
                      placeholder="e.g. English"
                      className="border-slate-200 bg-white"
                    />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyGlobalsToAll}
                    className="w-full border-slate-200 bg-white hover:border-[#1F2933] hover:bg-[#1F2933] hover:text-white"
                  >
                    Apply to all
                  </Button>
                </div>
              </div>
            </CardContent>
          ) : null}
        </Card>

        <Card
          variant="floating"
          elevation={2}
          padding="none"
          className="overflow-hidden rounded-[16px] bg-white"
        >
          <button
            type="button"
            onClick={() => setGeneratedVariantsOpen(o => !o)}
            className="panel-header panel-header-metallic w-full text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="panel-header-icon">
                  <Calendar className="h-5 w-5 text-slate-900" />
                </div>
                <div>
                  <div className="panel-header-title">Courses</div>
                  <div className="panel-header-subtext">
                    {templateCourseName
                      ? `${templateCourseName} — Edit schedule, pricing, currency, and language for your course(s).`
                      : 'Edit the schedule, pricing, currency, and language for your course(s).'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-white/80">
                  <Badge variant="outline" className="border-white/20 bg-white/10 text-white">
                    {variants.length} total
                  </Badge>
                  <Badge variant="secondary" className="border-0 bg-white/15 text-white">
                    {publishedCount} published
                  </Badge>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white">
                  {generatedVariantsOpen ? (
                    <ChevronUp className="h-5 w-5" />
                  ) : (
                    <ChevronDown className="h-5 w-5" />
                  )}
                </div>
              </div>
            </div>
          </button>

          {generatedVariantsOpen ? (
            <CardContent spacing="default" className="bg-white text-slate-900">
              {variants.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
                  Select categories and countries above to generate variant courses.
                </div>
              )}

              <div className="space-y-6">
                {variants.map((variant, index) => (
                  <div
                    key={`${variant.category}|${variant.nationality}`}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className="border-indigo-200 bg-indigo-50 text-indigo-700"
                        >
                          {variant.category} · {variant.nationality}
                        </Badge>
                        {variant.isPublished ? (
                          <Badge className="border-0 bg-emerald-500 text-white hover:bg-emerald-600">
                            Publish
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="border-0 bg-slate-100 text-slate-600"
                          >
                            Draft
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-500">
                          {variant.isPublished ? 'Publish' : 'Unpublished'}
                        </span>
                        <Switch
                          checked={variant.isPublished}
                          onCheckedChange={checked =>
                            updateVariant(index, v => ({ ...v, isPublished: checked }))
                          }
                        />
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="grid gap-6 sm:grid-cols-4">
                        <div className="form-group space-y-2">
                          <Label className="form-label font-semibold text-slate-700">Free</Label>
                          <div className="flex h-10 items-center justify-between rounded-xl border border-slate-200 bg-white px-4">
                            <span className="text-sm font-medium text-slate-600">
                              {variant.isFree ? 'Yes' : 'No'}
                            </span>
                            <Switch
                              checked={variant.isFree}
                              onCheckedChange={checked =>
                                updateVariant(index, v => ({
                                  ...v,
                                  isFree: checked,
                                  price: checked ? 0 : v.price,
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="form-group space-y-2">
                          <Label className="form-label font-semibold text-slate-700">Price</Label>
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-slate-400" />
                            <Input
                              type="number"
                              min={0}
                              value={variant.price != null ? String(variant.price) : ''}
                              onChange={e => {
                                const val = e.target.value
                                updateVariant(index, v => ({
                                  ...v,
                                  price: val === '' ? null : parseFloat(val),
                                }))
                              }}
                              placeholder="0.00"
                              disabled={variant.isFree}
                              className="border-slate-200 bg-white"
                            />
                          </div>
                        </div>
                        <div className="form-group space-y-2">
                          <Label className="form-label font-semibold text-slate-700">
                            Currency
                          </Label>
                          <Select
                            value={variant.currency}
                            onValueChange={val =>
                              updateVariant(index, v => ({ ...v, currency: val }))
                            }
                          >
                            <SelectTrigger className="border-slate-200 bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['USD', 'SGD', 'EUR', 'GBP', 'KRW', 'JPY', 'HKD', 'CNY', 'INR'].map(
                                c => (
                                  <SelectItem key={c} value={c}>
                                    {c}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="form-group space-y-2">
                          <Label className="form-label font-semibold text-slate-700">
                            Language
                          </Label>
                          <div className="flex items-center gap-2">
                            <Languages className="h-4 w-4 text-slate-400" />
                            <Input
                              value={variant.languageOfInstruction}
                              onChange={e =>
                                updateVariant(index, v => ({
                                  ...v,
                                  languageOfInstruction: e.target.value,
                                }))
                              }
                              placeholder="e.g. English"
                              className="border-slate-200 bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Schedule strips */}
                      <div className="mt-6 space-y-3">
                        {variant.schedules.map((sch, schIdx) => (
                          <div
                            key={sch.scheduleIndex}
                            className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition-all duration-300 hover:bg-slate-50/50"
                          >
                            <div className="flex items-center gap-3">
                              <Calendar className="h-5 w-5 text-indigo-500" />
                              <div>
                                <input
                                  type="text"
                                  value={sch.name || ''}
                                  onChange={e => {
                                    const newName = e.target.value
                                    updateVariant(index, v => {
                                      const newSchedules = [...v.schedules]
                                      newSchedules[schIdx] = {
                                        ...newSchedules[schIdx],
                                        name: newName || null,
                                      }
                                      return { ...v, schedules: newSchedules }
                                    })
                                  }}
                                  placeholder={`Schedule ${sch.scheduleIndex}`}
                                  className="w-full max-w-[200px] bg-transparent text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-b focus:border-indigo-300"
                                />
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {Array.isArray(sch.schedule) && sch.schedule.length > 0
                                    ? (() => {
                                        const hasDates = sch.schedule.some((s: any) => s?.date)
                                        const weeks = sch.weeksToSchedule || 8
                                        const slotsPerWeek = hasDates
                                          ? Math.ceil(sch.schedule.length / weeks)
                                          : sch.schedule.length
                                        const total = sch.schedule.length
                                        if (hasDates && weeks > 1) {
                                          return `${total} sessions (${slotsPerWeek}/week × ${weeks} weeks)`
                                        }
                                        return `${total} session${total === 1 ? '' : 's'}`
                                      })()
                                    : 'No slots configured'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                                onClick={() => {
                                  updateVariant(index, v => ({
                                    ...v,
                                    schedules: v.schedules.filter((_, i) => i !== schIdx),
                                  }))
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="min-w-[140px] border-slate-200 bg-white hover:border-[#1F2933] hover:bg-[#1F2933] hover:text-white"
                                onClick={() => openScheduleDialog(index, schIdx)}
                              >
                                {Array.isArray(sch.schedule) && sch.schedule.length > 0
                                  ? 'Edit Schedule'
                                  : 'Add Session'}
                              </Button>
                            </div>
                          </div>
                        ))}

                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full text-sm text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                          onClick={() => {
                            updateVariant(index, v => {
                              const nextIndex =
                                v.schedules.length > 0
                                  ? Math.max(...v.schedules.map(s => s.scheduleIndex)) + 1
                                  : 1
                              return {
                                ...v,
                                schedules: [
                                  ...v.schedules,
                                  {
                                    scheduleIndex: nextIndex,
                                    name: null,
                                    schedule: [],
                                    weeksToSchedule: 8,
                                    maxStudents: null,
                                  },
                                ],
                              }
                            })
                          }}
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Add another schedule
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!hidePublishAction && (
                <div className="flex justify-end gap-3 pt-6">
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || variants.length === 0}
                    className="rounded-full bg-indigo-600 px-6 text-white shadow-sm transition-all duration-300 hover:bg-indigo-700"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {saving ? 'Saving…' : `Publish (${publishedCount})`}
                  </Button>
                </div>
              )}
            </CardContent>
          ) : null}
        </Card>

        {/* Schedule Dialog */}
        <Dialog
          open={scheduleDialogOpen}
          onOpenChange={open => {
            setScheduleDialogOpen(open)
            if (!open) {
              setTimeout(() => {
                setScheduleDialogVariantIndex(null)
                setScheduleDialogScheduleIndex(null)
              }, 300)
            }
          }}
        >
          <DialogContent
            className="h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] overflow-hidden border-0 bg-[rgba(31,41,51,0.72)] p-0 shadow-[0_24px_64px_rgba(15,23,42,0.32)] backdrop-blur-[18px] sm:h-[90vh] sm:max-h-[800px] sm:w-[90vw] sm:max-w-[820px]"
            rounded="lg"
          >
            <div className="flex h-full flex-col p-5 sm:p-6">
              <DialogHeader className="p-0">
                <DialogTitle>
                  {dialogVariant && dialogSchedule
                    ? `Configure ${dialogSchedule.name || `Schedule ${dialogSchedule.scheduleIndex}`} for ${dialogVariant.category} - ${dialogVariant.nationality}`
                    : 'Configure schedule'}
                </DialogTitle>
                <DialogDescription>
                  Click a time slot to add or remove a 1-hour session.
                </DialogDescription>
              </DialogHeader>

              {dialogVariant && dialogSchedule && (
                <div className="scrollbar-hide mt-3 flex flex-1 flex-col overflow-hidden pr-2">
                  <VariantScheduleEditor
                    key={scheduleEditorKey}
                    schedule={
                      Array.isArray(dialogSchedule?.schedule) ? dialogSchedule.schedule : []
                    }
                    onScheduleChange={updater =>
                      scheduleDialogVariantIndex != null &&
                      scheduleDialogScheduleIndex != null &&
                      updateVariant(scheduleDialogVariantIndex, v => {
                        const newSchedules = [...v.schedules]
                        newSchedules[scheduleDialogScheduleIndex] = {
                          ...newSchedules[scheduleDialogScheduleIndex],
                          schedule: updater(
                            Array.isArray(newSchedules[scheduleDialogScheduleIndex].schedule)
                              ? newSchedules[scheduleDialogScheduleIndex].schedule
                              : []
                          ),
                        }
                        return { ...v, schedules: newSchedules }
                      })
                    }
                    price={dialogVariant?.price ?? 0}
                    weeksToSchedule={dialogSchedule?.weeksToSchedule || 8}
                    onWeeksChange={weeks =>
                      scheduleDialogVariantIndex != null &&
                      scheduleDialogScheduleIndex != null &&
                      updateVariant(scheduleDialogVariantIndex, v => {
                        const newSchedules = [...v.schedules]
                        newSchedules[scheduleDialogScheduleIndex] = {
                          ...newSchedules[scheduleDialogScheduleIndex],
                          weeksToSchedule: weeks,
                        }
                        return { ...v, schedules: newSchedules }
                      })
                    }
                    siblingSchedules={
                      scheduleDialogVariantIndex != null && scheduleDialogScheduleIndex != null
                        ? variants[scheduleDialogVariantIndex].schedules
                            .filter((_, i) => i !== scheduleDialogScheduleIndex)
                            .map(s => s.schedule)
                        : undefined
                    }
                    allVariantsSchedules={
                      scheduleDialogVariantIndex != null
                        ? variants
                            .filter((_, i) => i !== scheduleDialogVariantIndex)
                            .flatMap(v => v.schedules.map(s => s.schedule))
                        : undefined
                    }
                  />
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Button type="button" variant="modal-secondary-dark" onClick={cancelScheduleDialog}>
                  Cancel
                </Button>
                <Button type="button" variant="modal-primary-dark" onClick={closeScheduleDialog}>
                  Save
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }
)

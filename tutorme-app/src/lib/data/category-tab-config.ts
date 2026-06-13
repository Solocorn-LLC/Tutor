import type { ComponentType, CSSProperties } from 'react'
import {
  Globe,
  Award,
  GraduationCap,
  BookOpen,
  School,
  Flag,
  Languages,
  Wrench,
  Sparkles,
} from 'lucide-react'

export interface CategoryTabConfig {
  value: string
  label: string
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
  color: string
}

export const CATEGORY_TAB_CONFIG: CategoryTabConfig[] = [
  { value: 'global', label: 'Global', icon: Globe, color: '#0A84FF' },
  { value: 'ap', label: 'AP', icon: Award, color: '#FF1493' },
  { value: 'alevel', label: 'A Level', icon: GraduationCap, color: '#BF5AF2' },
  { value: 'ib', label: 'IB', icon: BookOpen, color: '#32D74B' },
  { value: 'igcse', label: 'IGCSE', icon: School, color: '#64D2FF' },
  { value: 'national', label: 'National', icon: Flag, color: '#FF9F0A' },
  { value: 'universities', label: 'Universities', icon: GraduationCap, color: '#FF375F' },
  { value: 'languages', label: 'Languages', icon: Languages, color: '#00C7BE' },
  { value: 'professional', label: 'Professional', icon: Award, color: '#FFD60A' },
  { value: 'diy', label: 'DIY', icon: Wrench, color: '#FF9500' },
  { value: 'specialties', label: 'Specialties', icon: Sparkles, color: '#AF52DE' },
]

export function getTabConfig(value: string): CategoryTabConfig | undefined {
  return CATEGORY_TAB_CONFIG.find(config => config.value === value)
}

export function getCategoryConfig(categoryId: string): CategoryTabConfig {
  if (categoryId.startsWith('universities-')) {
    return getTabConfig('universities')!
  }
  if (categoryId === 'languages' || categoryId.startsWith('languages-')) {
    return getTabConfig('languages')!
  }
  if (categoryId === 'professional' || categoryId.startsWith('professional-')) {
    return getTabConfig('professional')!
  }
  return getTabConfig('specialties')!
}

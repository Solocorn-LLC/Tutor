import type { CSSProperties } from 'react'

export interface DashboardThemeTokens {
  background: string
  panel: string
  surface: string
  accent: string
  accentStrong: string
  divider: string
  textPrimary: string
  textSecondary: string
}

export interface DashboardTheme {
  id: string
  name: string
  description?: string
  tokens?: DashboardThemeTokens
}

// ============================================
// REDESIGNED THEMES - Following Design System
// Primary: Blue (#1D4ED8), Secondary: Slate
// ============================================

export const DASHBOARD_THEMES: DashboardTheme[] = [
  // ----------------------------------------
  // NEW THEMES (Aura, Nimbus, Sahara)
  // ----------------------------------------
  {
    id: 'aura',
    name: 'Aura',
    description: 'Warm neutral elegance',
    tokens: {
      background: '40 3% 93%', // #EDEDED
      panel: '40 4% 87%', // #DFDFDF
      surface: '40 2% 83%', // #D4D4D3
      accent: '25 16% 75%', // #CABDB4 (warm accent)
      accentStrong: '224 76% 48%', // #1D4ED8 (blue)
      divider: '40 4% 69%', // #B0AEAB
      textPrimary: '42 6% 24%', // #3F3D39
      textSecondary: '42 4% 48%', // #7F7C77
    },
  },
  {
    id: 'nimbus',
    name: 'Nimbus',
    description: 'Cool slate modern',
    tokens: {
      background: '210 17% 95%', // #F1F3F5
      panel: '210 14% 93%', // #E9ECEF
      surface: '210 14% 89%', // #DEE2E6
      accent: '210 14% 72%', // #ADB5BD (cool accent)
      accentStrong: '224 76% 48%', // #1D4ED8 (blue)
      divider: '210 14% 83%', // #CED4DA
      textPrimary: '210 11% 15%', // #212529
      textSecondary: '208 7% 46%', // #6C757D
    },
  },
  {
    id: 'sahara',
    name: 'Sahara',
    description: 'Warm sand organic',
    tokens: {
      background: '36 24% 95%', // #F5F1EB
      panel: '36 20% 90%', // #EDE7DE
      surface: '36 20% 86%', // #E5DDD2
      accent: '32 30% 76%', // #D4C4B0 (warm sand)
      accentStrong: '226 71% 40%', // deeper blue
      divider: '32 20% 77%', // #C9B8A2
      textPrimary: '36 14% 22%', // #3D3830
      textSecondary: '36 10% 45%', // #7A7165
    },
  },
  // ----------------------------------------
  // REDESIGNED EXISTING THEMES
  // ----------------------------------------
  {
    id: 'current',
    name: 'Current (Default)',
    description: 'System default theme',
  },
  {
    id: 'aurora-mist',
    name: 'Aurora Mist',
    description: 'Soft ethereal glow',
    tokens: {
      background: '220 20% 96%', // Soft cool white
      panel: '220 15% 92%', // Light cool gray
      surface: '220 10% 88%', // Soft surface
      accent: '220 15% 80%', // Muted blue-gray
      accentStrong: '224 76% 48%', // Blue primary
      divider: '220 10% 75%', // Soft divider
      textPrimary: '220 15% 20%', // Dark cool gray
      textSecondary: '220 10% 45%', // Medium cool gray
    },
  },
  {
    id: 'quartz-wave',
    name: 'Quartz Wave',
    description: 'Crystal clear focus',
    tokens: {
      background: '200 25% 94%', // Ice white
      panel: '195 20% 90%', // Light ice
      surface: '200 15% 86%', // Soft ice
      accent: '195 20% 78%', // Muted ice blue
      accentStrong: '217 91% 60%', // Blue secondary
      divider: '200 15% 72%', // Ice divider
      textPrimary: '200 20% 18%', // Deep ice
      textSecondary: '200 15% 42%', // Medium ice
    },
  },
  {
    id: 'chrome-dune',
    name: 'Chrome Dune',
    description: 'Metallic warmth',
    tokens: {
      background: '45 10% 92%', // Warm silver
      panel: '40 8% 88%', // Light warm gray
      surface: '45 6% 84%', // Soft warm surface
      accent: '40 12% 76%', // Warm metallic
      accentStrong: '224 76% 48%', // Blue primary
      divider: '40 8% 70%', // Warm divider
      textPrimary: '40 12% 20%', // Deep warm
      textSecondary: '40 8% 45%', // Medium warm
    },
  },
  {
    id: 'silica-glow',
    name: 'Silica Glow',
    description: 'Luminous clarity',
    tokens: {
      background: '180 15% 95%', // Soft cyan white
      panel: '175 12% 91%', // Light cyan gray
      surface: '180 10% 87%', // Soft cyan surface
      accent: '175 15% 79%', // Muted cyan
      accentStrong: '224 76% 48%', // Blue primary
      divider: '180 10% 73%', // Cyan divider
      textPrimary: '180 15% 18%', // Deep cyan gray
      textSecondary: '180 10% 43%', // Medium cyan gray
    },
  },
  {
    id: 'pearl-grid',
    name: 'Pearl Grid',
    description: 'Organized elegance',
    tokens: {
      background: '0 0% 96%', // Pure pearl white
      panel: '0 0% 92%', // Light pearl
      surface: '0 0% 88%', // Soft pearl
      accent: '0 0% 80%', // Muted pearl
      accentStrong: '224 76% 48%', // Blue primary
      divider: '0 0% 74%', // Pearl divider
      textPrimary: '0 0% 18%', // Deep charcoal
      textSecondary: '0 0% 42%', // Medium gray
    },
  },
  {
    id: 'neutral-halo',
    name: 'Neutral Halo',
    description: 'Balanced neutrality',
    tokens: {
      background: '220 8% 94%', // Neutral soft white
      panel: '220 6% 90%', // Neutral light
      surface: '220 5% 86%', // Neutral surface
      accent: '220 8% 78%', // Neutral accent
      accentStrong: '224 76% 48%', // Blue secondary
      divider: '220 6% 72%', // Neutral divider
      textPrimary: '220 10% 18%', // Deep neutral
      textSecondary: '220 6% 42%', // Medium neutral
    },
  },
  {
    id: 'charcoal-dark',
    name: 'Charcoal Dark',
    description: 'Deep focus mode',
    tokens: {
      background: '220 15% 12%', // Deep charcoal
      panel: '220 12% 18%', // Charcoal panel
      surface: '220 10% 22%', // Charcoal surface
      accent: '220 8% 35%', // Muted charcoal
      accentStrong: '217 70% 55%', // Softer blue for dark
      divider: '220 10% 28%', // Charcoal divider
      textPrimary: '0 0% 95%', // Near white
      textSecondary: '0 0% 65%', // Light gray
    },
  },
  {
    id: 'graphite-mid',
    name: 'Graphite Mid',
    description: 'Medium contrast dark',
    tokens: {
      background: '220 12% 20%', // Graphite bg
      panel: '220 10% 26%', // Graphite panel
      surface: '220 8% 32%', // Graphite surface
      accent: '220 10% 45%', // Graphite accent
      accentStrong: '217 70% 55%', // Softer blue for dark
      divider: '220 8% 38%', // Graphite divider
      textPrimary: '0 0% 96%', // Near white
      textSecondary: '0 0% 72%', // Light gray
    },
  },
  {
    id: 'pearl-light',
    name: 'Pearl Light',
    description: 'Maximum brightness',
    tokens: {
      background: '0 0% 98%', // Near white
      panel: '0 0% 95%', // Very light
      surface: '0 0% 100%', // Pure white surface
      accent: '220 10% 88%', // Very light accent
      accentStrong: '224 76% 48%', // Blue primary
      divider: '220 10% 90%', // Very light divider
      textPrimary: '220 15% 15%', // Near black
      textSecondary: '220 10% 42%', // Medium gray
    },
  },
]

export const getThemeStyle = (theme?: DashboardTheme): CSSProperties => {
  if (!theme?.tokens) return {}
  return {
    '--background': theme.tokens.background,
    '--foreground': theme.tokens.textPrimary,
    '--card': theme.tokens.surface,
    '--card-foreground': theme.tokens.textPrimary,
    '--popover': theme.tokens.panel,
    '--popover-foreground': theme.tokens.textPrimary,
    '--primary': theme.tokens.accentStrong,
    '--primary-foreground': '0 0% 100%',
    '--secondary': theme.tokens.panel,
    '--secondary-foreground': theme.tokens.textPrimary,
    '--muted': theme.tokens.panel,
    '--muted-foreground': theme.tokens.textSecondary,
    '--accent': theme.tokens.accent,
    '--accent-foreground': theme.tokens.textPrimary,
    '--border': theme.tokens.divider,
    '--input': theme.tokens.divider,
    '--ring': theme.tokens.accentStrong,
    '--theme-bg': theme.tokens.background,
    '--theme-panel': theme.tokens.panel,
    '--theme-surface': theme.tokens.surface,
    '--theme-accent': theme.tokens.accent,
    '--theme-accent-strong': theme.tokens.accentStrong,
    '--theme-divider': theme.tokens.divider,
    '--theme-text': theme.tokens.textPrimary,
    '--theme-text-secondary': theme.tokens.textSecondary,
  } as CSSProperties
}

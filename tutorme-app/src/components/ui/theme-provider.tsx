'use client'

import * as React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

// ============================================
// THEME TYPES
// ============================================

type Theme = 'aura' | 'nimbus' | 'sahara'
type Mode = 'light' | 'dark' | 'system'

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  defaultMode?: Mode
  storageKey?: string
}

interface ThemeProviderState {
  theme: Theme
  mode: Mode
  resolvedMode: 'light' | 'dark'
  setTheme: (theme: Theme) => void
  setMode: (mode: Mode) => void
  toggleMode: () => void
  cycleTheme: () => void
}

// ============================================
// THEME CONTEXT
// ============================================

const ThemeContext = createContext<ThemeProviderState | undefined>(undefined)

// ============================================
// THEME PROVIDER
// ============================================

export function ThemeProvider({
  children,
  defaultTheme = 'aura',
  defaultMode = 'system',
  storageKey = 'tutorme-theme',
  ...props
}: ThemeProviderProps) {
  // Initialize state from localStorage or defaults
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [mode, setModeState] = useState<Mode>(defaultMode)
  const [resolvedMode, setResolvedMode] = useState<'light' | 'dark'>('light')

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed.theme) setThemeState(parsed.theme)
        if (parsed.mode) setModeState(parsed.mode)
      } catch {
        // Invalid storage, use defaults
      }
    }
  }, [storageKey])

  // Resolve system mode
  useEffect(() => {
    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      setResolvedMode(mediaQuery.matches ? 'dark' : 'light')

      const handler = (e: MediaQueryListEvent) => {
        setResolvedMode(e.matches ? 'dark' : 'light')
      }

      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    } else {
      setResolvedMode(mode)
    }
  }, [mode])

  // Apply theme and mode to document
  useEffect(() => {
    const root = window.document.documentElement

    // Remove old mode classes
    root.classList.remove('light', 'dark')

    // Set data-theme attribute (CSS selectors rely on this)
    root.setAttribute('data-theme', theme)

    // Add mode class
    root.classList.add(resolvedMode)

    // Store in localStorage
    localStorage.setItem(storageKey, JSON.stringify({ theme, mode }))
  }, [theme, resolvedMode, storageKey, mode])

  // Theme setter with persistence
  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
  }, [])

  // Mode setter with persistence
  const setMode = React.useCallback((newMode: Mode) => {
    setModeState(newMode)
  }, [])

  // Toggle between light and dark
  const toggleMode = React.useCallback(() => {
    setModeState(prev => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }, [])

  // Cycle through themes
  const cycleTheme = React.useCallback(() => {
    setThemeState(prev => {
      const themes: Theme[] = ['aura', 'nimbus', 'sahara']
      const currentIndex = themes.indexOf(prev)
      return themes[(currentIndex + 1) % themes.length]
    })
  }, [])

  const value = {
    theme,
    mode,
    resolvedMode,
    setTheme,
    setMode,
    toggleMode,
    cycleTheme,
  }

  return (
    <ThemeContext.Provider value={value} {...props}>
      {children}
    </ThemeContext.Provider>
  )
}

// ============================================
// HOOK
// ============================================

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// ============================================
// THEME SWITCHER COMPONENT
// ============================================

import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { Sun, Moon, Monitor, Palette, Check } from 'lucide-react'

export function ThemeSwitcher() {
  const { theme, mode, resolvedMode, setTheme, setMode } = useTheme()

  const themes: { value: Theme; label: string; description: string }[] = [
    { value: 'aura', label: 'Aura', description: 'Warm neutral elegance' },
    { value: 'nimbus', label: 'Nimbus', description: 'Cool slate modern' },
    { value: 'sahara', label: 'Sahara', description: 'Warm sand organic' },
  ]

  const modes: { value: Mode; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Palette className="h-4 w-4" />
          <span className="hidden sm:inline">Theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="text-muted-foreground px-2 py-1.5 text-sm font-medium">Color Theme</div>
        {themes.map(t => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span>{t.label}</span>
              <span className="text-muted-foreground text-xs">{t.description}</span>
            </div>
            {theme === t.value && <Check className="text-primary h-4 w-4" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <div className="text-muted-foreground px-2 py-1.5 text-sm font-medium">Mode</div>
        {modes.map(m => (
          <DropdownMenuItem
            key={m.value}
            onClick={() => setMode(m.value)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              {m.icon}
              <span>{m.label}</span>
            </div>
            {mode === m.value && <Check className="text-primary h-4 w-4" />}
          </DropdownMenuItem>
        ))}

        {mode === 'system' && (
          <>
            <DropdownMenuSeparator />
            <div className="text-muted-foreground px-2 py-1 text-xs">
              Currently: {resolvedMode === 'dark' ? 'Dark' : 'Light'}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ============================================
// QUICK TOGGLE BUTTON
// ============================================

export function ModeToggle() {
  const { resolvedMode, toggleMode } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleMode}
      className="relative"
      aria-label="Toggle theme"
    >
      <Sun
        className={`h-5 w-5 transition-all duration-300 ${
          resolvedMode === 'dark' ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
        }`}
      />
      <Moon
        className={`absolute h-5 w-5 transition-all duration-300 ${
          resolvedMode === 'dark'
            ? 'rotate-0 scale-100 opacity-100'
            : '-rotate-90 scale-0 opacity-0'
        }`}
      />
    </Button>
  )
}

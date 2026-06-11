# Tutor Dashboard Edits — Implementation Plan

## 1. Hero Panel Floating Shadow
**File:** `tutorme-app/src/app/[locale]/tutor/dashboard/components/ModernHeroSection.tsx`

The hero currently uses `shadow-[0_8px_24px_rgba(0,0,0,0.10)]`.
- Bump to `shadow-[0_14px_45px_rgba(0,0,0,0.12)]` to match the dashboard panel elevation
- Add a subtle white ring: `ring-1 ring-white/20` for extra pop against the blue gradient

## 2. Go Live Button + "Sessions" Rename
**Files:** 
- `tutorme-app/src/app/[locale]/tutor/dashboard/components/ModernHeroSection.tsx`
- `tutorme-app/src/app/[locale]/tutor/dashboard/page.tsx`

### 2a. Go Live Button Styling
Change the Go Live button from outline-white-on-blue to:
- Background: `bg-[#65A30D]` (Tailwind lime-600 — pops against blue, readable with white text)
- Text: `text-white`
- Border: `border border-white` (1px white outline as requested)
- Keep `hover:translate-y-0` and remove the outline variant nudge

### 2b. Tab Rename
- "Active Courses" → "Sessions"

### 2c. Section Heading Rename + Date
- "Courses With Enrolled Students" → "Session Schedule"
- Append current date beside the heading in a muted style, e.g.:
  `<CardTitle>Session Schedule <span className="text-muted-foreground text-sm font-normal ml-2">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></CardTitle>`

## 3. Course Builder Icon
**File:** `tutorme-app/src/app/[locale]/tutor/layout.tsx`

Swap `Lightbulb` for `Wrench` (imported from `lucide-react`) — it clearly conveys building/creating.

## 4. Nav Panel Icons with Vibrant Colors
**File:** `tutorme-app/src/app/[locale]/tutor/layout.tsx`

Add an `iconColor` field to the `NavItem` type and apply Tailwind text-color classes directly to each icon so they render in vibrant solid colors regardless of active/inactive state.

| Item | Icon | Color Class |
|------|------|-------------|
| Dashboard | LayoutDashboard | `text-[#2563EB]` (hero blue) |
| My Page | Globe | `text-[#7C3AED]` (violet) |
| Course Builder | Wrench | `text-[#EA580C]` (orange) |
| Live Sessions | Video | `text-[#16A34A]` (green) |
| Messages | MessageSquare | `text-[#EC4899]` (pink) |
| Analytics | BarChart3 | `text-[#F59E0B]` (amber) |
| Training | GraduationCap | `text-[#06B6D4]` (cyan) |
| Support | HelpCircle | `text-[#8B5CF6]` (purple) |
| Account | User | `text-[#64748B]` (slate) |
| Logout | LogOut | `text-[#EF4444]` (red) |

The active state (`bg-blue-50`) will still show these colors clearly because they're saturated and the background is very light.

---
**Total files modified:** 3
**Estimated time:** ~15 min

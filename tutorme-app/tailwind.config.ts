import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "320px",
      },
      minWidth: {
        "screen-xs": "320px",
      },
      minHeight: {
        touch: "44px",
      },
      
      // ============================================
      // COLOR SYSTEM - Three Themes
      // ============================================
      colors: {
        // Core semantic colors
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        
        // Primary - Teal accent
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "hsl(var(--primary-50))",
          100: "hsl(var(--primary-100))",
          200: "hsl(var(--primary-200))",
          300: "hsl(var(--primary-300))",
          400: "hsl(var(--primary-400))",
          500: "hsl(var(--primary-500))",
          600: "hsl(var(--primary-600))",
          700: "hsl(var(--primary-700))",
          800: "hsl(var(--primary-800))",
          900: "hsl(var(--primary-900))",
        },
        
        // Secondary - Blue accent
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          50: "hsl(var(--secondary-50))",
          100: "hsl(var(--secondary-100))",
          200: "hsl(var(--secondary-200))",
          300: "hsl(var(--secondary-300))",
          400: "hsl(var(--secondary-400))",
          500: "hsl(var(--secondary-500))",
          600: "hsl(var(--secondary-600))",
          700: "hsl(var(--secondary-700))",
          800: "hsl(var(--secondary-800))",
          900: "hsl(var(--secondary-900))",
        },
        
        // Destructive/Error
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        
        // Muted - for secondary text and backgrounds
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        
        // Accent - Warm accent for soft UI elements
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          warm: "hsl(var(--accent-warm))",
        },
        
        // Popover/Overlay surfaces
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        
        // Card surfaces
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          elevated: "hsl(var(--card-elevated))",
        },
        
        // Surface hierarchy
        surface: {
          DEFAULT: "hsl(var(--surface))",
          secondary: "hsl(var(--surface-secondary))",
          tertiary: "hsl(var(--surface-tertiary))",
          elevated: "hsl(var(--surface-elevated))",
          overlay: "hsl(var(--surface-overlay))",
        },
        
        // Status colors
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        
        // Divider/Border subtle
        divider: {
          DEFAULT: "hsl(var(--divider))",
          subtle: "hsl(var(--divider-subtle))",
        },
      },
      
      // ============================================
      // BORDER RADIUS - Soft, rounded aesthetic
      // ============================================
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        "2xl": "calc(var(--radius) + 8px)",
        "3xl": "calc(var(--radius) + 12px)",
        full: "9999px",
      },
      
      // ============================================
      // SHADOWS - Layered elevation system
      // ============================================
      boxShadow: {
        // Elevation levels (floating in space effect)
        "elevation-1": "var(--shadow-1)",
        "elevation-2": "var(--shadow-2)",
        "elevation-3": "var(--shadow-3)",
        "elevation-4": "var(--shadow-4)",
        "elevation-5": "var(--shadow-5)",
        
        // Soft diffused shadows
        soft: "var(--shadow-soft)",
        "soft-lg": "var(--shadow-soft-lg)",
        "soft-xl": "var(--shadow-soft-xl)",
        
        // Inner shadows for depth
        "inner-soft": "var(--shadow-inner-soft)",
        "inner-glow": "var(--shadow-inner-glow)",
        
        // Interactive states
        "hover-lift": "var(--shadow-hover-lift)",
        "active-press": "var(--shadow-active-press)",
        "focus-glow": "var(--shadow-focus-glow)",
        
        // Special effects
        glow: "var(--shadow-glow)",
        "glow-subtle": "var(--shadow-glow-subtle)",
        "floating": "var(--shadow-floating)",
      },
      
      // ============================================
      // ANIMATIONS - Premium, smooth interactions
      // ============================================
      animation: {
        // Fade animations
        "fade-in": "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "fade-out": "fadeOut 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "fade-in-up": "fadeInUp 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        "fade-in-down": "fadeInDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        
        // Scale animations
        "scale-in": "scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "scale-out": "scaleOut 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        "pop": "pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        
        // Slide animations
        "slide-in-right": "slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in-left": "slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in-up": "slideInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in-down": "slideInDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        
        // Float animation (for depth effect)
        "float": "float 6s ease-in-out infinite",
        "float-subtle": "floatSubtle 8s ease-in-out infinite",
        
        // Pulse and glow
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        
        // Shimmer for loading states
        "shimmer": "shimmer 2s linear infinite",
        
        // Spin
        "spin-slow": "spin 3s linear infinite",
        "spin-slower": "spin 8s linear infinite",
      },
      
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        scaleOut: {
          "0%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0", transform: "scale(0.95)" },
        },
        pop: {
          "0%": { transform: "scale(0.95)" },
          "50%": { transform: "scale(1.02)" },
          "100%": { transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideInUp: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInDown: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        floatSubtle: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        glowPulse: {
          "0%, 100%": { boxShadow: "0 0 20px hsl(var(--primary) / 0.3)" },
          "50%": { boxShadow: "0 0 40px hsl(var(--primary) / 0.5)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      
      // ============================================
      // TRANSITIONS - Premium feel
      // ============================================
      transitionTimingFunction: {
        "premium": "cubic-bezier(0.4, 0, 0.2, 1)",
        "bounce-soft": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "smooth": "cubic-bezier(0.25, 0.1, 0.25, 1)",
      },
      transitionDuration: {
        "50": "50ms",
        "150": "150ms",
        "250": "250ms",
        "350": "350ms",
        "450": "450ms",
      },
      
      // ============================================
      // TYPOGRAPHY
      // ============================================
      fontFamily: {
        sans: [
          "Fira Sans",
          "Inter",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Fira Sans",
          "Inter",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
        heading: [
          "Fira Code",
          "Fira Sans",
          "Inter",
          "system-ui",
          "-apple-system",
          "monospace",
        ],
        chinese: [
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "微软雅黑",
          "WenQuanYi Micro Hei",
          "Noto Sans SC",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      
      // ============================================
      // BACKGROUNDS - Gradients
      // ============================================
      backgroundImage: {
        // Primary gradients
        "gradient-primary": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-300)) 100%)",
        "gradient-secondary": "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--secondary-300)) 100%)",
        "gradient-accent": "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)",
        
        // Surface gradients
        "gradient-surface": "linear-gradient(180deg, hsl(var(--surface)) 0%, hsl(var(--surface-secondary)) 100%)",
        "gradient-card": "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--surface)) 100%)",
        
        // Shimmer for loading
        "shimmer": "linear-gradient(90deg, transparent 0%, hsl(var(--muted)) 50%, transparent 100%)",
        
        // Glow gradients
        "glow-primary": "radial-gradient(circle, hsl(var(--primary) / 0.3) 0%, transparent 70%)",
        "glow-subtle": "radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 60%)",
      },
      
      // ============================================
      // SPACING & LAYOUT
      // ============================================
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "30": "7.5rem",
      },
      
      // ============================================
      // Z-INDEX SCALE
      // ============================================
      zIndex: {
        "dropdown": "100",
        "sticky": "200",
        "fixed": "300",
        "modal-backdrop": "400",
        "modal": "500",
        "popover": "600",
        "tooltip": "700",
        "toast": "800",
      },
      
      // ============================================
      // BACKDROP BLUR
      // ============================================
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

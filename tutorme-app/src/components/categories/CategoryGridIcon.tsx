import * as React from 'react'

// Category Grid Icon (3×3 colorful squares with pulse + color wave)
// Extracted from landing page for reuse across the app.
export const CategoryGridIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{
      pointerEvents: 'none',
      animation: 'cat-pulse 2s ease-in-out 0s infinite',
      transformOrigin: 'center',
    }}
  >
    <style>{`
      @keyframes cat-pulse {
        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 transparent); }
        50% { transform: scale(1.25); filter: drop-shadow(0 0 8px rgba(255,255,255,0.6)); }
      }
      @keyframes cat-brighten {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; filter: brightness(1.6); }
      }
    `}</style>
    {/* Row 1 */}
    <rect
      x="1"
      y="1"
      width="6"
      height="6"
      rx="1.5"
      fill="#F5C542"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.0s' }}
    />
    <rect
      x="9"
      y="1"
      width="6"
      height="6"
      rx="1.5"
      fill="#E63946"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.1s' }}
    />
    <rect
      x="17"
      y="1"
      width="6"
      height="6"
      rx="1.5"
      fill="#9B5DE5"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.2s' }}
    />
    {/* Row 2 */}
    <rect
      x="1"
      y="9"
      width="6"
      height="6"
      rx="1.5"
      fill="#52B788"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.3s' }}
    />
    <rect
      x="9"
      y="9"
      width="6"
      height="6"
      rx="1.5"
      fill="#48CAE4"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.4s' }}
    />
    <rect
      x="17"
      y="9"
      width="6"
      height="6"
      rx="1.5"
      fill="#F4A261"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.5s' }}
    />
    {/* Row 3 */}
    <rect
      x="1"
      y="17"
      width="6"
      height="6"
      rx="1.5"
      fill="#E83F6F"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.6s' }}
    />
    <rect
      x="9"
      y="17"
      width="6"
      height="6"
      rx="1.5"
      fill="#0D9488"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.7s' }}
    />
    <rect
      x="17"
      y="17"
      width="6"
      height="6"
      rx="1.5"
      fill="#64748B"
      style={{ animation: 'cat-brighten 2s ease-in-out 0s infinite', animationDelay: '0.8s' }}
    />
  </svg>
)

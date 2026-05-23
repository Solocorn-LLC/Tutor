// @ts-nocheck
/**
 * Frontend Bundle Optimizer
 *
 * Optimizes frontend bundles for Chinese mobile networks with:
 * - Progressive loading strategies
 * - Component registry with lazy loading
 * - China-specific optimizations (Web Vitals, CDN, compression)
 * - Network-aware resource loading
 */

// ============================================================================
// Types
// ============================================================================

export interface ComponentRegistry {
  [key: string]: {
    loader: () => Promise<any>
    priority: 'critical' | 'high' | 'medium' | 'low'
    preload?: boolean
    prefetch?: boolean
  }
}

export interface NetworkInfo {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g'
  downlink: number // Mbps
  rtt: number // ms
  saveData: boolean
}

export interface BundleMetrics {
  totalSize: number
  loadedChunks: number
  loadTime: number
  cacheHitRate: number
  compressionRatio: number
}

export interface OptimizationConfig {
  slowNetworkThreshold: number
  mediumNetworkThreshold: number
  enableProgressiveLoading: boolean
  enablePrefetching: boolean
  enablePreloading: boolean
  useChinaCDN: boolean
  enableCompression: boolean
  compressionLevel: 'gzip' | 'brotli' | 'zstd'
  lazyLoadThreshold: number
  preloadCriticalComponents: boolean
  enableServiceWorker: boolean
  cacheStrategy: 'network-first' | 'cache-first' | 'stale-while-revalidate'
}

export interface WebVitals {
  fcp: number | null
  lcp: number | null
  fid: number | null
  cls: number | null
  ttfb: number | null
  fmp: number | null
}

// ============================================================================
// Component Registry
// ============================================================================

const componentRegistry: ComponentRegistry = {}

export function registerComponent(
  name: string,
  loader: () => Promise<any>,
  options?: {
    priority?: 'critical' | 'high' | 'medium' | 'low'
    preload?: boolean
    prefetch?: boolean
  }
): void {
  componentRegistry[name] = {
    loader,
    priority: options?.priority || 'medium',
    preload: options?.preload || false,
    prefetch: options?.prefetch || false,
  }
}

export function getComponentLoader(name: string): (() => Promise<any>) | null {
  return componentRegistry[name]?.loader || null
}

export function getComponentsByPriority(
  priority: 'critical' | 'high' | 'medium' | 'low'
): string[] {
  return Object.keys(componentRegistry).filter(
    name => componentRegistry[name].priority === priority
  )
}

// ============================================================================
// Network Detection
// ============================================================================

export function detectNetwork(): NetworkInfo | null {
  if (typeof window === 'undefined' || !('connection' in navigator)) {
    return null
  }

  const connection =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection

  if (!connection) {
    return null
  }

  return {
    effectiveType: connection.effectiveType || '4g',
    downlink: connection.downlink || 10,
    rtt: connection.rtt || 50,
    saveData: connection.saveData || false,
  }
}

export function isSlowNetwork(threshold: number = 2): boolean {
  const network = detectNetwork()
  if (!network) return false

  return (
    network.downlink < threshold ||
    network.effectiveType === 'slow-2g' ||
    network.effectiveType === '2g' ||
    network.saveData
  )
}

// ============================================================================
// Progressive Loading Strategies
// ============================================================================

export function setupProgressiveImageLoading(
  selector: string = 'img[data-src]',
  threshold: number = 0.1
): IntersectionObserver | null {
  if (typeof window === 'undefined') return null

  const imageObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement
          const dataSrc = img.getAttribute('data-src')

          if (dataSrc) {
            img.src = dataSrc
            img.removeAttribute('data-src')
            imageObserver.unobserve(img)
          }
        }
      })
    },
    { threshold, rootMargin: '50px' }
  )

  document.querySelectorAll(selector).forEach(img => {
    imageObserver.observe(img)
  })

  return imageObserver
}

export async function loadComponentWhenVisible(
  componentName: string,
  container: HTMLElement,
  threshold: number = 0.1
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window not available'))
      return
    }

    const observer = new IntersectionObserver(
      async entries => {
        entries.forEach(async entry => {
          if (entry.isIntersecting) {
            observer.disconnect()

            try {
              const loader = getComponentLoader(componentName)
              if (!loader) {
                throw new Error(`Component ${componentName} not registered`)
              }

              const component = await loader()
              resolve(component.default || component)
            } catch (error) {
              reject(error)
            }
          }
        })
      },
      { threshold, rootMargin: '100px' }
    )

    observer.observe(container)
  })
}

export function preloadResource(
  href: string,
  as: 'script' | 'style' | 'image' | 'font' | 'fetch',
  crossorigin?: boolean
): void {
  if (typeof document === 'undefined') return

  const link = document.createElement('link')
  link.rel = 'preload'
  link.href = href
  link.as = as

  if (crossorigin) {
    link.setAttribute('crossorigin', 'anonymous')
  }

  document.head.appendChild(link)
}

export function prefetchResource(href: string): void {
  if (typeof document === 'undefined') return

  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = href
  document.head.appendChild(link)
}

// ============================================================================
// China-Specific Optimizations
// ============================================================================

export function getChinaCDNUrl(path: string): string {
  const chinaCDN = process.env.NEXT_PUBLIC_CHINA_CDN_URL

  if (chinaCDN && typeof window !== 'undefined') {
    const isChina = navigator.language === 'zh-CN' || navigator.language.startsWith('zh')

    if (isChina) {
      return `${chinaCDN}${path}`
    }
  }

  return path
}

export function optimizeImageForChina(
  src: string,
  options?: {
    width?: number
    quality?: number
    format?: 'webp' | 'avif' | 'jpeg'
  }
): string {
  const { width, quality = 80, format = 'webp' } = options || {}

  if (src.startsWith('/')) {
    const params = new URLSearchParams()
    if (width) params.set('w', width.toString())
    params.set('q', quality.toString())

    if (format === 'webp') {
      params.set('format', 'webp')
    }

    return `${src}?${params.toString()}`
  }

  return src
}

export async function compressData(
  data: string,
  algorithm: 'gzip' | 'brotli' | 'zstd' = 'gzip'
): Promise<Blob> {
  if (typeof window === 'undefined') {
    throw new Error('Compression only available in browser')
  }

  if ('CompressionStream' in window) {
    const stream = new (window as any).CompressionStream(algorithm)
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    writer.write(new TextEncoder().encode(data))
    writer.close()

    const chunks: Uint8Array[] = []
    let done = false

    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) chunks.push(value)
    }

    return new Blob(chunks)
  }

  return new Blob([data])
}

// ============================================================================
// Web Vitals Monitoring
// ============================================================================

const webVitals: WebVitals = {
  fcp: null,
  lcp: null,
  fid: null,
  cls: null,
  ttfb: null,
  fmp: null,
}

export function measureWebVitals(
  onMetric?: (metric: { name: string; value: number; delta: number }) => void
): void {
  if (typeof window === 'undefined') return

  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            webVitals.fcp = entry.startTime
            onMetric?.({
              name: 'FCP',
              value: entry.startTime,
              delta: entry.startTime,
            })
          }
        }
      })
      observer.observe({ entryTypes: ['paint'] })
    } catch (e) {
      console.warn('Web Vitals measurement failed:', e)
    }

    try {
      const lcpObserver = new PerformanceObserver(list => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1] as any
        webVitals.lcp = lastEntry.renderTime || lastEntry.loadTime
        onMetric?.({
          name: 'LCP',
          value: webVitals.lcp,
          delta: webVitals.lcp,
        })
      })
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
    } catch (e) {
      console.warn('LCP measurement failed:', e)
    }

    try {
      let clsValue = 0
      const clsObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value
          }
        }
        webVitals.cls = clsValue
        onMetric?.({
          name: 'CLS',
          value: clsValue,
          delta: clsValue,
        })
      })
      clsObserver.observe({ entryTypes: ['layout-shift'] })
    } catch (e) {
      console.warn('CLS measurement failed:', e)
    }
  }
}

export function getWebVitals(): WebVitals {
  return { ...webVitals }
}

// ============================================================================
// Bundle Optimizer Class
// ============================================================================

export class BundleOptimizer {
  private config: OptimizationConfig
  private metrics: BundleMetrics
  private networkInfo: NetworkInfo | null = null

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = {
      slowNetworkThreshold: 2,
      mediumNetworkThreshold: 5,
      enableProgressiveLoading: true,
      enablePrefetching: true,
      enablePreloading: true,
      useChinaCDN: true,
      enableCompression: true,
      compressionLevel: 'gzip',
      lazyLoadThreshold: 100,
      preloadCriticalComponents: true,
      enableServiceWorker: false,
      cacheStrategy: 'stale-while-revalidate',
      ...config,
    }

    this.metrics = {
      totalSize: 0,
      loadedChunks: 0,
      loadTime: 0,
      cacheHitRate: 0,
      compressionRatio: 1,
    }
  }

  async initialize(): Promise<void> {
    if (typeof window === 'undefined') return

    this.networkInfo = detectNetwork()

    measureWebVitals(metric => {
      this.reportMetric(metric.name, metric.value)
    })

    if (this.config.enableProgressiveLoading) {
      setupProgressiveImageLoading()
    }

    if (this.config.preloadCriticalComponents) {
      await this.preloadCriticalComponents()
    }

    if (this.config.enableServiceWorker && 'serviceWorker' in navigator) {
      await this.registerServiceWorker()
    }
  }

  private async preloadCriticalComponents(): Promise<void> {
    const critical = getComponentsByPriority('critical')
    const high = getComponentsByPriority('high')

    for (const name of [...critical, ...high]) {
      const component = componentRegistry[name]
      if (component.preload) {
        try {
          await component.loader()
        } catch (error) {
          console.warn(`Failed to preload component ${name}:`, error)
        }
      }
    }
  }

  private async registerServiceWorker(): Promise<void> {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      console.log('Service Worker registered:', registration)
    } catch (error) {
      console.warn('Service Worker registration failed:', error)
    }
  }

  private reportMetric(name: string, value: number): void {
    if (typeof fetch !== 'undefined') {
      fetch('/api/performance/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, value, timestamp: Date.now() }),
      }).catch(err => {
        console.warn('Failed to report metric:', err)
      })
    }
  }

  getRecommendations(): string[] {
    const recommendations: string[] = []

    if (this.networkInfo) {
      if (isSlowNetwork(this.config.slowNetworkThreshold)) {
        recommendations.push('启用数据压缩')
        recommendations.push('延迟加载非关键组件')
        recommendations.push('使用低质量图片')
      }

      if (this.networkInfo.saveData) {
        recommendations.push('启用省流量模式')
        recommendations.push('禁用自动播放视频')
      }
    }

    const vitals = getWebVitals()
    if (vitals.lcp && vitals.lcp > 2500) {
      recommendations.push('优化最大内容绘制时间')
    }
    if (vitals.cls && vitals.cls > 0.1) {
      recommendations.push('减少布局偏移')
    }

    return recommendations
  }

  getMetrics(): BundleMetrics {
    return { ...this.metrics }
  }

  getNetworkInfo(): NetworkInfo | null {
    return this.networkInfo
  }
}

export default BundleOptimizer

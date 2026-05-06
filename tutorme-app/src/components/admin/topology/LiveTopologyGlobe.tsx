'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Sphere, Html } from '@react-three/drei'
import * as THREE from 'three'
import { useBatchGeolocation, type GeolocationResult } from '@/lib/admin/hooks/useGeolocation'
import {
  latLonToVector3,
  type GeoCoordinates,
  type OnlineUser,
  type LiveSession,
} from '@/lib/geo/ipGeolocation'
import { Loader2, MapPin, Wifi, WifiOff } from 'lucide-react'

// Constants
const GLOBE_RADIUS = 2.2
const TUTOR_COLOR = '#1D4ED8' // Solocorn Blue
const STUDENT_COLOR = '#3A7CFF' // Deep Intelligence Blue
const ARC_COLOR_ACTIVE = '#60a5fa'
const ARC_COLOR_INACTIVE = '#38bdf8'
const CLUSTER_COLORS = ['#1D4ED8', '#3A7CFF', '#8b5cf6', '#f59e0b', '#10b981']

interface Props {
  users: OnlineUser[]
  sessions: LiveSession[]
  className?: string
  autoRotate?: boolean
  onAutoRotateChange?: (value: boolean) => void
}

interface UserWithPosition extends OnlineUser {
  position: THREE.Vector3
  coordinates: GeoCoordinates
}

interface SessionWithPositions extends LiveSession {
  tutorPos: THREE.Vector3
  studentPos: THREE.Vector3
}

interface Cluster {
  id: string
  position: THREE.Vector3
  users: UserWithPosition[]
  centerLat: number
  centerLon: number
}

// Generate arc points with quadratic bezier curve
function buildArcPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  active: boolean
): THREE.Vector3[] {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const lift = active ? 1.45 : 1.28
  mid.normalize().multiplyScalar(GLOBE_RADIUS * lift)
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  return curve.getPoints(50)
}

// Day/Night Cycle Component - Shows which parts of Earth are in daylight
function DayNightCycle() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!meshRef.current) return
    // Rotate based on current UTC time
    const now = new Date()
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
    const rotation = (utcHours / 24) * Math.PI * 2
    meshRef.current.rotation.y = rotation
  })

  // Create a gradient texture for day/night
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createLinearGradient(0, 0, 256, 0)
    gradient.addColorStop(0, 'rgba(0,0,0,0.6)')
    gradient.addColorStop(0.3, 'rgba(0,0,0,0.3)')
    gradient.addColorStop(0.5, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.7, 'rgba(0,0,0,0.3)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.6)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 256, 1)
    const tex = new THREE.CanvasTexture(canvas)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
  }, [])

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[GLOBE_RADIUS + 0.02, 64, 64]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.4}
        blending={THREE.MultiplyBlending}
      />
    </mesh>
  )
}

// Cluster Marker Component - Shows grouped users when zoomed out
function ClusterMarker({
  cluster,
  onClick,
  cameraDistance,
}: {
  cluster: Cluster
  onClick: () => void
  cameraDistance: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const count = cluster.users.length
  const color = CLUSTER_COLORS[cluster.id.charCodeAt(0) % CLUSTER_COLORS.length]

  // Scale based on count and camera distance
  const baseScale = Math.min(0.15, 0.08 + count * 0.01)
  const scale = baseScale * Math.min(1, cameraDistance / 6)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const pulse = (Math.sin(clock.getElapsedTime() * 2) + 1) / 2
      meshRef.current.scale.setScalar(scale * (1 + pulse * 0.1))
    }
  })

  return (
    <group position={cluster.position}>
      <mesh ref={meshRef} onClick={onClick}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
      <Html distanceFactor={10}>
        <div className="pointer-events-none flex flex-col items-center">
          <div
            className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {count}
          </div>
          <span className="mt-0.5 text-[10px] text-white/70">
            {cluster.users.filter(u => u.role === 'TUTOR').length}T ·{' '}
            {cluster.users.filter(u => u.role === 'STUDENT').length}S
          </span>
        </div>
      </Html>
    </group>
  )
}

// Enhanced User Marker with mock data indicator
function UserMarker({
  user,
  onHover,
  onLeave,
  cameraDistance,
}: {
  user: UserWithPosition
  onHover: (user: UserWithPosition, x: number, y: number) => void
  onLeave: () => void
  cameraDistance: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  const color = user.role === 'TUTOR' ? TUTOR_COLOR : STUDENT_COLOR
  const scale = (user.role === 'TUTOR' ? 0.08 : 0.062) * Math.min(1, cameraDistance / 6)

  useFrame(({ clock }) => {
    if (glowRef.current && user.isActive) {
      const pulse = (Math.sin(clock.getElapsedTime() * 3) + 1) / 2
      glowRef.current.scale.setScalar(1 + pulse * 0.3)
      const material = glowRef.current.material as THREE.MeshBasicMaterial
      if (material && typeof material.opacity === 'number') {
        material.opacity = 0.14 + pulse * 0.22
      }
    }
  })

  return (
    <group position={user.position}>
      {/* Main marker sphere */}
      <mesh
        ref={meshRef}
        scale={[scale, scale, scale]}
        onPointerOver={e => {
          e.stopPropagation()
          onHover(user, e.clientX, e.clientY)
        }}
        onPointerMove={e => {
          onHover(user, e.clientX, e.clientY)
        }}
        onPointerOut={onLeave}
      >
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={user.isActive ? 1.12 : 0.55}
        />
      </mesh>

      {/* Glow effect */}
      {user.isActive && (
        <mesh ref={glowRef} scale={[scale * 2.4, scale * 2.4, scale * 2.4]}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} />
        </mesh>
      )}

      {/* HTML Label for active users */}
      {user.isActive && (
        <Html distanceFactor={10}>
          <div
            className="pointer-events-none whitespace-nowrap rounded px-2 py-1 text-xs font-semibold"
            style={{
              backgroundColor: `${color}40`,
              color: color,
              border: `1px solid ${color}80`,
              transform: 'translate(-50%, -150%)',
            }}
          >
            {user.name}
          </div>
        </Html>
      )}
    </group>
  )
}

// Optimized Arc Component with LOD (Level of Detail)
function AnimatedArc({
  session,
  pulse,
  cameraDistance,
  isVisible,
}: {
  session: SessionWithPositions
  pulse: number
  cameraDistance: number
  isVisible: boolean
}) {
  const lineRef = useRef<any>(null)
  const particlesRef = useRef<THREE.Points>(null)

  // Skip expensive calculations if not visible
  const points = useMemo(() => {
    if (!isVisible) return []
    return buildArcPoints(session.tutorPos, session.studentPos, session.isActive)
  }, [session, isVisible])

  const curve = useMemo(() => {
    if (!isVisible || points.length === 0) return null
    return new THREE.CatmullRomCurve3(points)
  }, [points, isVisible])

  // Reduce animation frequency when camera is far
  useFrame(({ clock }) => {
    if (!particlesRef.current || !session.isActive || !curve || !isVisible) return

    // Skip frames based on camera distance
    const frameSkip = cameraDistance > 7 ? 2 : 1
    if (Math.floor(clock.elapsedTime * 60) % frameSkip !== 0) return

    const time = clock.getElapsedTime()
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array

    for (let i = 0; i < 5; i++) {
      const t = (time * 0.5 + i * 0.2) % 1
      const point = curve.getPoint(t)
      positions[i * 3] = point.x
      positions[i * 3 + 1] = point.y
      positions[i * 3 + 2] = point.z
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true
  })

  const particleGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(5 * 3)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geometry
  }, [])

  // Don't render if too far or not visible
  if (!isVisible || cameraDistance > 8) {
    return (
      <Line
        points={[session.tutorPos, session.studentPos]}
        color={session.isActive ? ARC_COLOR_ACTIVE : ARC_COLOR_INACTIVE}
        transparent
        opacity={0.1}
        lineWidth={0.5}
      />
    )
  }

  const activeOpacity = 0.45 + pulse * 0.45
  const focusBoost = session.isActive

  return (
    <group>
      <Line
        ref={lineRef}
        points={points}
        color={session.isActive ? ARC_COLOR_ACTIVE : ARC_COLOR_INACTIVE}
        transparent
        opacity={session.isActive ? activeOpacity : focusBoost ? 0.35 : 0.2}
        lineWidth={session.isActive ? (focusBoost ? 3.0 : 2.4) : focusBoost ? 1.5 : 0.95}
      />

      {session.isActive && cameraDistance < 7 && (
        <Line
          points={points}
          color="#86efac"
          transparent
          opacity={0.2 + pulse * 0.25}
          lineWidth={focusBoost ? 4.4 : 4.0}
        />
      )}

      {session.isActive && cameraDistance < 6 && (
        <points ref={particlesRef} geometry={particleGeometry}>
          <pointsMaterial color="#ffffff" size={0.05} transparent opacity={0.8} sizeAttenuation />
        </points>
      )}
    </group>
  )
}

// Background components
function Stars() {
  const points = useMemo(() => {
    const cloud: number[] = []
    for (let i = 0; i < 2600; i += 1) {
      const radius = 18 + Math.random() * 18
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      cloud.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      )
    }
    return new Float32Array(cloud)
  }, [])

  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    return geom
  }, [points])

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#dbeafe" size={0.085} sizeAttenuation transparent opacity={0.95} />
    </points>
  )
}

function NebulaClouds() {
  return (
    <group>
      <Sphere args={[6.8, 32, 32]} position={[-10, 2, -25]}>
        <meshBasicMaterial color="#2563eb" transparent opacity={0.08} />
      </Sphere>
      <Sphere args={[5.6, 32, 32]} position={[12, -3, -22]}>
        <meshBasicMaterial color="#8b5cf6" transparent opacity={0.08} />
      </Sphere>
      <Sphere args={[4.2, 32, 32]} position={[0, 10, -21]}>
        <meshBasicMaterial color="#0891b2" transparent opacity={0.08} />
      </Sphere>
    </group>
  )
}

// Cluster users based on geographic proximity
function clusterUsers(users: UserWithPosition[], threshold: number = 15): Cluster[] {
  const clusters: Cluster[] = []
  const visited = new Set<string>()

  for (const user of users) {
    if (visited.has(user.id)) continue

    const cluster: UserWithPosition[] = [user]
    visited.add(user.id)

    for (const other of users) {
      if (visited.has(other.id)) continue

      const latDiff = Math.abs(user.coordinates.lat - other.coordinates.lat)
      const lonDiff = Math.abs(user.coordinates.lon - other.coordinates.lon)

      if (latDiff < threshold && lonDiff < threshold) {
        cluster.push(other)
        visited.add(other.id)
      }
    }

    // Calculate cluster center
    const centerLat = cluster.reduce((sum, u) => sum + u.coordinates.lat, 0) / cluster.length
    const centerLon = cluster.reduce((sum, u) => sum + u.coordinates.lon, 0) / cluster.length
    const pos = latLonToVector3(centerLat, centerLon, GLOBE_RADIUS + 0.05)

    clusters.push({
      id: `cluster-${user.id}`,
      position: new THREE.Vector3(pos.x, pos.y, pos.z),
      users: cluster,
      centerLat,
      centerLon,
    })
  }

  return clusters
}

// Main Scene Component
function Scene({
  users,
  sessions,
  autoRotate,
  onAutoRotateChange,
  onStatsUpdate,
  onUserHover,
}: {
  users: OnlineUser[]
  sessions: LiveSession[]
  autoRotate: boolean
  onAutoRotateChange: (value: boolean) => void
  onStatsUpdate?: (stats: { mockCount: number; realCount: number }) => void
  onUserHover?: (user: { user: UserWithPosition; x: number; y: number } | null) => void
}) {
  const [pulse, setPulse] = useState(0)
  const [userPositions, setUserPositions] = useState<UserWithPosition[]>([])
  const [sessionPositions, setSessionPositions] = useState<SessionWithPositions[]>([])
  const [hoveredUser, setHoveredUser] = useState<{
    user: UserWithPosition
    x: number
    y: number
  } | null>(null)
  const [showClusters, setShowClusters] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)

  // Persist last known good data to prevent flickering during loading
  const lastGeoDataRef = useRef<GeolocationResult[] | null>(null)
  const lastUserPositionsRef = useRef<UserWithPosition[]>([])
  const lastSessionPositionsRef = useRef<SessionWithPositions[]>([])

  const { camera } = useThree()
  const [cameraDistance, setCameraDistance] = useState(6.3)

  // Hysteresis for clustering to prevent flickering at threshold
  const CLUSTER_OUT_THRESHOLD = 7.5 // Zoom out to enable clustering
  const CLUSTER_IN_THRESHOLD = 6.5 // Zoom in more to disable clustering

  // Track camera distance for LOD with hysteresis
  useFrame(() => {
    const dist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0))
    setCameraDistance(dist)

    // Hysteresis: different thresholds for enabling vs disabling clustering
    setShowClusters(prev => {
      if (!prev && dist > CLUSTER_OUT_THRESHOLD) return true // Enable when zoomed out far
      if (prev && dist < CLUSTER_IN_THRESHOLD) return false // Disable when zoomed in close
      return prev // Maintain current state between thresholds
    })
  })

  // Use React Query for geolocation with caching
  const { data: geoData, isLoading: isGeoLoading } = useBatchGeolocation(users)

  // Process geolocation results - preserve old data during loading
  useEffect(() => {
    // Use cached data if available, or last known good data
    const effectiveGeoData = geoData || lastGeoDataRef.current
    if (!effectiveGeoData) return

    // Update cache when we have fresh data
    if (geoData) {
      lastGeoDataRef.current = geoData
    }

    const positions: UserWithPosition[] = []
    let realCount = 0

    for (const result of effectiveGeoData) {
      const user = users.find(u => u.id === result.userId)
      if (!user || !result.coordinates) continue

      const pos = latLonToVector3(
        result.coordinates.lat,
        result.coordinates.lon,
        GLOBE_RADIUS + 0.03
      )
      positions.push({
        ...user,
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        coordinates: result.coordinates,
      })

      realCount++
    }

    setUserPositions(positions)
    lastUserPositionsRef.current = positions
    onStatsUpdate?.({ mockCount: 0, realCount })

    // Update clusters
    const newClusters = clusterUsers(positions)
    setClusters(newClusters)
  }, [geoData, users, onStatsUpdate])

  // Build session positions with stable updates
  useEffect(() => {
    // Use last known positions if current ones are empty (loading state)
    const effectiveUserPositions =
      userPositions.length > 0 ? userPositions : lastUserPositionsRef.current

    const sessionsWithPos: SessionWithPositions[] = []

    for (const session of sessions) {
      const tutor = effectiveUserPositions.find(u => u.id === session.tutorId)
      const student = effectiveUserPositions.find(u => u.id === session.studentId)

      if (tutor && student) {
        sessionsWithPos.push({
          ...session,
          tutorPos: tutor.position,
          studentPos: student.position,
        })
      }
    }

    // Merge with existing sessions to prevent flickering - only update changed positions
    setSessionPositions(prev => {
      const newMap = new Map(sessionsWithPos.map(s => [s.id, s]))
      const prevMap = new Map(prev.map(s => [s.id, s]))

      // Keep all current sessions, update positions if changed
      const merged: SessionWithPositions[] = []
      const allIds = new Set([...prevMap.keys(), ...newMap.keys()])

      for (const id of allIds) {
        const newSession = newMap.get(id)
        const prevSession = prevMap.get(id)

        if (newSession) {
          // Session exists in new data - use it
          merged.push(newSession)
        } else if (prevSession) {
          // Session no longer exists but we have old data - keep it briefly to prevent flicker
          // This prevents arcs from disappearing during data refresh
          merged.push(prevSession)
        }
      }

      return merged
    })

    lastSessionPositionsRef.current = sessionsWithPos
  }, [sessions, userPositions])

  // Pulse animation
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    setPulse((Math.sin(t * 3.1) + 1) / 2)
  })

  const handleHover = useCallback(
    (user: UserWithPosition, x: number, y: number) => {
      setHoveredUser({ user, x, y })
      onUserHover?.({ user, x, y })
    },
    [onUserHover]
  )

  const handleLeave = useCallback(() => {
    setHoveredUser(null)
    onUserHover?.(null)
  }, [onUserHover])

  // Filter visible arcs with stable priority - prioritize active sessions and sort by ID for consistency
  const visibleSessions = useMemo(() => {
    // Sort: active sessions first, then by ID for stable ordering
    const sorted = [...sessionPositions].sort((a, b) => {
      // Active sessions have higher priority
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      // Stable sort by ID to prevent random reordering
      return a.id.localeCompare(b.id)
    })

    // Limit based on camera distance - show more when zoomed out, fewer when zoomed in
    const maxArcs = cameraDistance > 8 ? 30 : cameraDistance > 6 ? 50 : 75
    return sorted.slice(0, maxArcs)
  }, [sessionPositions, cameraDistance])

  // Users to display (either clustered or individual)
  const displayedUsers = useMemo(() => {
    if (showClusters && !selectedCluster) {
      return [] // Show clusters instead
    }
    if (selectedCluster) {
      return selectedCluster.users
    }
    return userPositions
  }, [showClusters, selectedCluster, userPositions])

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[6, 4, 8]} intensity={1.3} color="#8be9ff" />
      <pointLight position={[-8, -4, -6]} intensity={0.55} color="#60a5fa" />

      <Stars />
      <NebulaClouds />
      <DayNightCycle />

      {/* Globe */}
      <Sphere args={[GLOBE_RADIUS + 0.04, 96, 96]}>
        <meshBasicMaterial color="#67e8f9" wireframe transparent opacity={0.22} />
      </Sphere>

      <Sphere args={[GLOBE_RADIUS + 0.08, 64, 64]}>
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.11} />
      </Sphere>

      <Sphere args={[GLOBE_RADIUS, 96, 96]}>
        <meshStandardMaterial
          color="#0c2a43"
          emissive="#0b3b5e"
          emissiveIntensity={0.36}
          metalness={0.2}
          roughness={0.52}
        />
      </Sphere>

      {/* Session arcs */}
      {visibleSessions.map(session => (
        <AnimatedArc
          key={session.id}
          session={session}
          pulse={pulse}
          cameraDistance={cameraDistance}
          isVisible={!showClusters}
        />
      ))}

      {/* Cluster markers */}
      {showClusters &&
        !selectedCluster &&
        clusters.map(cluster => (
          <ClusterMarker
            key={cluster.id}
            cluster={cluster}
            onClick={() => setSelectedCluster(cluster)}
            cameraDistance={cameraDistance}
          />
        ))}

      {/* User markers */}
      {(!showClusters || selectedCluster) &&
        displayedUsers.map(user => (
          <UserMarker
            key={user.id}
            user={user}
            onHover={handleHover}
            onLeave={handleLeave}
            cameraDistance={cameraDistance}
          />
        ))}

      <OrbitControls
        enablePan={false}
        minDistance={4.2}
        maxDistance={9}
        autoRotate={autoRotate}
        autoRotateSpeed={0.45}
        onChange={() => setSelectedCluster(null)} // Clear selection on camera move
        onStart={() => onAutoRotateChange(false)} // Pause rotation on user interaction
      />
    </>
  )
}

// Stats Panel Component
function GeoStatsPanel({
  mockCount,
  realCount,
  isLoading,
}: {
  mockCount: number
  realCount: number
  isLoading: boolean
}) {
  const total = mockCount + realCount
  const realPercent = total > 0 ? Math.round((realCount / total) * 100) : 0

  return (
    <div className="absolute left-4 top-4 z-50 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-xs">
        {isLoading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            <span className="text-slate-300">Locating users...</span>
          </>
        ) : (
          <>
            {realCount > 0 ? (
              <Wifi className="h-3 w-3 text-green-400" />
            ) : (
              <WifiOff className="h-3 w-3 text-amber-400" />
            )}
            <span className="text-slate-300">{realPercent}% real location</span>
            {mockCount > 0 && (
              <span className="text-[10px] text-amber-400/70">({mockCount} estimated)</span>
            )}
          </>
        )}
      </div>
      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-700">
        <div
          className="h-full bg-gradient-to-r from-green-400 to-blue-400 transition-all duration-500"
          style={{ width: `${realPercent}%` }}
        />
      </div>
    </div>
  )
}

// User Tooltip Component
function UserTooltip({
  user,
  x,
  y,
  sessions,
}: {
  user: UserWithPosition
  x: number
  y: number
  sessions: LiveSession[]
}) {
  const color = user.role === 'TUTOR' ? TUTOR_COLOR : STUDENT_COLOR
  const activeSessions = sessions.filter(
    s => (user.role === 'TUTOR' ? s.tutorId : s.studentId) === user.id && s.isActive
  )

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: x + 15,
        top: y - 15,
      }}
    >
      <div
        className="min-w-[200px] rounded-lg border bg-slate-900/95 px-4 py-3 shadow-2xl backdrop-blur-md"
        style={{ borderColor: `${color}50` }}
      >
        <div className="mb-2 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-white">{user.name}</span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{
              backgroundColor: `${color}30`,
              color: color,
            }}
          >
            {user.role}
          </span>
        </div>

        <div className="space-y-1 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            <span>
              {user.coordinates.city !== 'Unknown'
                ? `${user.coordinates.city}, ${user.coordinates.country}`
                : user.coordinates.country}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Lat:</span>
            <span>{user.coordinates.lat.toFixed(2)}°</span>
            <span className="ml-2 text-slate-500">Lon:</span>
            <span>{user.coordinates.lon.toFixed(2)}°</span>
          </div>

          {activeSessions.length > 0 && (
            <div className="mt-2 border-t border-slate-700 pt-2">
              <span className="text-green-400">●</span>
              <span className="ml-1.5">
                {activeSessions.length} active session{activeSessions.length > 1 ? 's' : ''}
              </span>
              {activeSessions.map(s => (
                <div key={s.id} className="ml-4 text-slate-500">
                  {s.subject}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Main Component
export default function LiveTopologyGlobe({
  users,
  sessions,
  className,
  autoRotate = true,
  onAutoRotateChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [geoStats, setGeoStats] = useState({ mockCount: 0, realCount: 0 })
  const [isGeoLoading, setIsGeoLoading] = useState(true)
  const [hoveredUser, setHoveredUser] = useState<{
    user: UserWithPosition
    x: number
    y: number
  } | null>(null)

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_22%_18%,#14235f_0%,#05081d_42%,#020617_86%)] ${className}`}
    >
      <GeoStatsPanel
        mockCount={geoStats.mockCount}
        realCount={geoStats.realCount}
        isLoading={isGeoLoading}
      />

      {hoveredUser && (
        <UserTooltip
          user={hoveredUser.user}
          x={hoveredUser.x}
          y={hoveredUser.y}
          sessions={sessions}
        />
      )}

      <Canvas
        camera={{ position: [0, 0, 6.3], fov: 46 }}
        dpr={[1, 1.8]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#020617']} />
        <Scene
          users={users}
          sessions={sessions}
          autoRotate={autoRotate}
          onAutoRotateChange={onAutoRotateChange || (() => {})}
          onStatsUpdate={stats => {
            setGeoStats(stats)
            setIsGeoLoading(false)
          }}
          onUserHover={setHoveredUser}
        />
      </Canvas>
    </div>
  )
}

export type { OnlineUser, LiveSession }

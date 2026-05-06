'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line, OrbitControls, Sphere } from '@react-three/drei'
import * as THREE from 'three'

interface TopologyNode {
  id: string
  role: 'TUTOR' | 'STUDENT'
  name: string
  email: string
  avatarUrl: string | null
  timezone: string
  lat: number
  lon: number
  activeSessions: number
  totalConnections: number
}

interface TopologyEdge {
  id: string
  sessionId: string
  tutorId: string
  studentId: string
  subject: string
  status: 'ACTIVE' | 'RECENT'
  isActive: boolean
  startedAt: string | null
}

interface Props {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  focusedTutorId?: string | null
  onTutorFocus?: (tutorId: string) => void
  className?: string
}

interface HoveredNode {
  node: TopologyNode
  x: number
  y: number
  activeLinks: number
  totalLinks: number
}

const GLOBE_RADIUS = 2.2

const CONTINENT_OUTLINES: Array<Array<[number, number]>> = [
  [
    [72, -165],
    [60, -150],
    [50, -135],
    [42, -124],
    [33, -118],
    [25, -105],
    [18, -95],
    [25, -84],
    [30, -97],
    [40, -110],
    [52, -125],
    [62, -140],
    [72, -165],
  ], // N. America
  [
    [13, -81],
    [7, -79],
    [-5, -76],
    [-15, -70],
    [-27, -63],
    [-40, -60],
    [-53, -68],
    [-47, -75],
    [-30, -73],
    [-16, -65],
    [-6, -58],
    [3, -52],
    [9, -60],
    [13, -70],
    [13, -81],
  ], // S. America
  [
    [70, -10],
    [64, 8],
    [58, 25],
    [50, 32],
    [43, 25],
    [38, 10],
    [35, -2],
    [38, -10],
    [46, -8],
    [55, -4],
    [64, -6],
    [70, -10],
  ], // Europe
  [
    [35, -17],
    [22, -15],
    [10, -10],
    [0, 7],
    [-10, 20],
    [-20, 30],
    [-30, 30],
    [-34, 18],
    [-30, 8],
    [-20, -2],
    [-5, -10],
    [10, -16],
    [22, -18],
    [35, -17],
  ], // Africa
  [
    [70, 40],
    [63, 60],
    [55, 85],
    [50, 110],
    [45, 125],
    [35, 135],
    [25, 123],
    [18, 110],
    [10, 95],
    [8, 75],
    [20, 58],
    [33, 45],
    [47, 38],
    [60, 35],
    [70, 40],
  ], // Asia
  [
    [-10, 112],
    [-20, 118],
    [-27, 132],
    [-35, 146],
    [-37, 155],
    [-28, 153],
    [-19, 144],
    [-14, 130],
    [-10, 120],
    [-10, 112],
  ], // Australia
]

const COUNTRY_HINT_OUTLINES: Array<Array<[number, number]>> = [
  [
    [49, -125],
    [49, -95],
    [31, -95],
    [25, -106],
    [32, -117],
    [41, -124],
    [49, -125],
  ], // USA rough
  [
    [53, 73],
    [50, 95],
    [45, 112],
    [35, 121],
    [23, 117],
    [20, 102],
    [29, 87],
    [40, 78],
    [53, 73],
  ], // China rough
  [
    [35, 68],
    [30, 76],
    [24, 83],
    [20, 78],
    [9, 76],
    [8, 72],
    [16, 69],
    [25, 70],
    [35, 68],
  ], // India rough
  [
    [5, -75],
    [-8, -71],
    [-16, -60],
    [-24, -54],
    [-31, -56],
    [-28, -62],
    [-18, -67],
    [-5, -70],
    [5, -75],
  ], // Brazil rough
]

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)

  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)

  return new THREE.Vector3(x, y, z)
}

function buildArcPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  active: boolean
): THREE.Vector3[] {
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
  const lift = active ? 1.45 : 1.28
  mid.normalize().multiplyScalar(GLOBE_RADIUS * lift)

  return [start, mid, end]
}

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

function Constellations() {
  const groups = useMemo(
    () => [
      [
        new THREE.Vector3(-8, 7, -12),
        new THREE.Vector3(-7.2, 6.5, -12.4),
        new THREE.Vector3(-6.7, 7.1, -12.8),
        new THREE.Vector3(-6.1, 6.4, -13.3),
      ],
      [
        new THREE.Vector3(8, 6, -13),
        new THREE.Vector3(7.2, 6.7, -13.6),
        new THREE.Vector3(6.6, 6.0, -14.2),
        new THREE.Vector3(6.0, 5.2, -14.8),
      ],
      [
        new THREE.Vector3(10, -2, -15),
        new THREE.Vector3(9.2, -1.2, -15.4),
        new THREE.Vector3(8.5, -1.9, -15.9),
        new THREE.Vector3(7.9, -2.8, -16.5),
      ],
    ],
    []
  )

  return (
    <group>
      {groups.map((points, idx) => (
        <Line
          key={`constellation-${idx}`}
          points={points}
          color="#a5b4fc"
          transparent
          opacity={0.55}
          lineWidth={1.6}
        />
      ))}
    </group>
  )
}

function CosmicBodies() {
  return (
    <group>
      <Sphere args={[1.1, 28, 28]} position={[13, 8, -18]}>
        <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={1.35} />
      </Sphere>
      <Sphere args={[0.6, 24, 24]} position={[-14, -7, -17]}>
        <meshStandardMaterial color="#93c5fd" emissive="#3b82f6" emissiveIntensity={0.8} />
      </Sphere>
      <Sphere args={[0.42, 24, 24]} position={[15, -8, -20]}>
        <meshStandardMaterial color="#f9a8d4" emissive="#db2777" emissiveIntensity={0.55} />
      </Sphere>
      <Sphere args={[0.32, 24, 24]} position={[-10, 9, -19]}>
        <meshStandardMaterial color="#86efac" emissive="#10b981" emissiveIntensity={0.5} />
      </Sphere>
      <Sphere args={[0.24, 24, 24]} position={[4, -11, -16]}>
        <meshStandardMaterial color="#fca5a5" emissive="#ef4444" emissiveIntensity={0.45} />
      </Sphere>
    </group>
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

function initials(name: string): string {
  const tokens = name.split(/\s+/).filter(Boolean).slice(0, 2)
  if (tokens.length === 0) return '?'
  return tokens.map(t => t[0]?.toUpperCase() || '').join('')
}

export default function TopologyGlobeCanvas({
  nodes,
  edges,
  focusedTutorId,
  onTutorFocus,
  className,
}: Props) {
  const [pulse, setPulse] = useState(0)
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      const t = performance.now() / 1000
      setPulse((Math.sin(t * 3.1) + 1) / 2)
    }, 80)
    return () => window.clearInterval(timer)
  }, [])

  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    for (const node of nodes) {
      map.set(node.id, latLonToVector3(node.lat, node.lon, GLOBE_RADIUS + 0.03))
    }
    return map
  }, [nodes])

  const continentLines = useMemo(
    () =>
      CONTINENT_OUTLINES.map(outline =>
        outline.map(([lat, lon]) => latLonToVector3(lat, lon, GLOBE_RADIUS + 0.055))
      ),
    []
  )

  const countryLines = useMemo(
    () =>
      COUNTRY_HINT_OUTLINES.map(outline =>
        outline.map(([lat, lon]) => latLonToVector3(lat, lon, GLOBE_RADIUS + 0.06))
      ),
    []
  )

  const renderedEdges = useMemo(() => {
    return edges
      .map(edge => {
        const tutorPos = nodePositions.get(edge.tutorId)
        const studentPos = nodePositions.get(edge.studentId)
        if (!tutorPos || !studentPos) return null

        return {
          ...edge,
          points: buildArcPoints(tutorPos, studentPos, edge.isActive),
        }
      })
      .filter((edge): edge is TopologyEdge & { points: THREE.Vector3[] } => Boolean(edge))
  }, [edges, nodePositions])

  const edgeCountsByNode = useMemo(() => {
    const counts = new Map<string, { total: number; active: number }>()
    edges.forEach(edge => {
      const tutor = counts.get(edge.tutorId) || { total: 0, active: 0 }
      tutor.total += 1
      tutor.active += edge.isActive ? 1 : 0
      counts.set(edge.tutorId, tutor)

      const student = counts.get(edge.studentId) || { total: 0, active: 0 }
      student.total += 1
      student.active += edge.isActive ? 1 : 0
      counts.set(edge.studentId, student)
    })
    return counts
  }, [edges])

  const setHoveredAtPointer = (node: TopologyNode, clientX: number, clientY: number) => {
    const bounds = containerRef.current?.getBoundingClientRect()
    const counts = edgeCountsByNode.get(node.id) || { total: 0, active: 0 }
    setHoveredNode({
      node,
      x: bounds ? clientX - bounds.left : clientX,
      y: bounds ? clientY - bounds.top : clientY,
      activeLinks: counts.active,
      totalLinks: counts.total,
    })
  }

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_22%_18%,#14235f_0%,#05081d_42%,#020617_86%)] ${className}`}
    >
      <Canvas
        camera={{ position: [0, 0, 6.3], fov: 46 }}
        dpr={[1, 1.8]}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#020617']} />

        <ambientLight intensity={0.45} />
        <pointLight position={[6, 4, 8]} intensity={1.3} color="#8be9ff" />
        <pointLight position={[-8, -4, -6]} intensity={0.55} color="#60a5fa" />

        <Stars />
        <NebulaClouds />
        <CosmicBodies />
        <Constellations />

        <Sphere args={[GLOBE_RADIUS, 96, 96]}>
          <meshStandardMaterial
            color="#0c2a43"
            emissive="#0b3b5e"
            emissiveIntensity={0.36}
            metalness={0.2}
            roughness={0.52}
          />
        </Sphere>

        <Sphere args={[GLOBE_RADIUS + 0.04, 96, 96]}>
          <meshBasicMaterial color="#67e8f9" wireframe transparent opacity={0.22} />
        </Sphere>

        <Sphere args={[GLOBE_RADIUS + 0.08, 64, 64]}>
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.11} />
        </Sphere>

        {continentLines.map((line, idx) => (
          <Line
            key={`continent-${idx}`}
            points={line}
            color="#7dd3fc"
            transparent
            opacity={0.28}
            lineWidth={1.5}
          />
        ))}

        {countryLines.map((line, idx) => (
          <Line
            key={`country-${idx}`}
            points={line}
            color="#93c5fd"
            transparent
            opacity={0.2}
            lineWidth={1.1}
          />
        ))}

        {renderedEdges.map(edge => {
          const activeOpacity = 0.45 + pulse * 0.45
          const focusBoost = focusedTutorId && edge.tutorId === focusedTutorId
          return (
            <group key={edge.id}>
              <Line
                points={edge.points}
                color={edge.isActive ? '#60a5fa' : '#38bdf8'}
                transparent
                opacity={edge.isActive ? activeOpacity : focusBoost ? 0.35 : 0.2}
                lineWidth={edge.isActive ? (focusBoost ? 3.0 : 2.4) : focusBoost ? 1.5 : 0.95}
              />
              {edge.isActive ? (
                <Line
                  points={edge.points}
                  color="#86efac"
                  transparent
                  opacity={0.2 + pulse * 0.25}
                  lineWidth={focusBoost ? 4.4 : 4.0}
                />
              ) : null}
            </group>
          )
        })}

        {nodes.map(node => {
          const point = nodePositions.get(node.id)
          if (!point) return null

          const nodeScale = node.role === 'TUTOR' ? 0.08 : 0.062
          const activeBoost = node.activeSessions > 0 ? 1 + pulse * 0.35 : 1
          const isFocusedTutor =
            focusedTutorId && node.role === 'TUTOR' && node.id === focusedTutorId

          return (
            <group key={node.id} position={[point.x, point.y, point.z]}>
              <Sphere
                args={[nodeScale * activeBoost, 16, 16]}
                onPointerOver={event => {
                  event.stopPropagation()
                  setHoveredAtPointer(node, event.clientX, event.clientY)
                }}
                onPointerMove={event => {
                  setHoveredAtPointer(node, event.clientX, event.clientY)
                }}
                onPointerOut={() => setHoveredNode(null)}
                onClick={event => {
                  event.stopPropagation()
                  if (node.role === 'TUTOR') onTutorFocus?.(node.id)
                }}
              >
                <meshStandardMaterial
                  color={node.role === 'TUTOR' ? '#3b82f6' : '#a5b4fc'}
                  emissive={node.role === 'TUTOR' ? '#2563eb' : '#6366f1'}
                  emissiveIntensity={node.activeSessions > 0 || isFocusedTutor ? 1.12 : 0.55}
                />
              </Sphere>
              {node.activeSessions > 0 || isFocusedTutor ? (
                <Sphere args={[nodeScale * 2.4 * activeBoost, 12, 12]}>
                  <meshBasicMaterial
                    color={isFocusedTutor ? '#f0abfc' : '#86efac'}
                    transparent
                    opacity={0.14 + pulse * 0.22}
                  />
                </Sphere>
              ) : null}
            </group>
          )
        })}

        <OrbitControls
          enablePan={false}
          minDistance={4.2}
          maxDistance={9}
          autoRotate
          autoRotateSpeed={0.45}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/70 via-slate-950/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />

      {hoveredNode ? (
        <div
          className="pointer-events-none absolute z-30 w-72 -translate-y-2 rounded-xl border border-slate-500/60 bg-slate-950/95 p-3 text-slate-100 shadow-[0_0_24px_rgba(59,130,246,0.2)]"
          style={{
            left: Math.max(
              8,
              Math.min(hoveredNode.x + 12, 8 + (containerRef.current?.clientWidth || 0) - 304)
            ),
            top: Math.max(16, hoveredNode.y - 24),
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-500 bg-slate-800 text-xs font-semibold"
              style={
                hoveredNode.node.avatarUrl
                  ? {
                      backgroundImage: `url(${hoveredNode.node.avatarUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              {hoveredNode.node.avatarUrl ? '' : initials(hoveredNode.node.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{hoveredNode.node.name}</p>
              <p className="truncate text-xs text-slate-300">{hoveredNode.node.email}</p>
            </div>
            <span
              className={`rounded px-2 py-1 text-[10px] font-semibold ${hoveredNode.node.role === 'TUTOR' ? 'bg-blue-500/20 text-blue-200' : 'bg-indigo-500/20 text-indigo-200'}`}
            >
              {hoveredNode.node.role}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <div className="rounded border border-slate-700 px-2 py-1">
              TZ: {hoveredNode.node.timezone}
            </div>
            <div className="rounded border border-slate-700 px-2 py-1">
              Active links: {hoveredNode.activeLinks}
            </div>
            <div className="rounded border border-slate-700 px-2 py-1">
              Total links: {hoveredNode.totalLinks}
            </div>
            <div className="rounded border border-slate-700 px-2 py-1">
              Sessions: {hoveredNode.node.activeSessions}
            </div>
          </div>
          {hoveredNode.node.role === 'TUTOR' ? (
            <p className="mt-2 text-[11px] text-slate-400">
              Click tutor node to focus and isolate tutor-student network.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

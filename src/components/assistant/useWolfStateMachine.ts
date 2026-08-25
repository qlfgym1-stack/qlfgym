import { useState, useEffect, useRef, useCallback } from "react"
import { useLocation } from "react-router-dom"
import { useAuth } from "@/stores/auth"
import { useNetworkStatus } from "@/hooks/useNetworkStatus"
import { useAiChat } from "@/stores/ai-chat"
import type { WolfPhase, WolfExercise, WolfStateMachine, WolfPos } from "./types"
import { WOLF_CONSTANTS } from "./types"

function clampPos(p: WolfPos, size: number): WolfPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, vw - size)),
    y: Math.min(Math.max(0, p.y), Math.max(0, vh - size)),
  }
}

function fitClampPos(p: WolfPos, size: number, scale: number, margin: number): WolfPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const half = Math.round((size * (scale - 1)) / 2)
  const minX = margin + half
  const minY = margin + half
  const maxX = Math.max(minX, vw - margin - half - size)
  const maxY = Math.max(minY, vh - margin - half - size)
  return { x: Math.min(Math.max(minX, p.x), maxX), y: Math.min(Math.max(minY, p.y), maxY) }
}

function defaultPos(size: number): WolfPos {
  return {
    x: Math.max(0, window.innerWidth - size - 24),
    y: Math.max(0, window.innerHeight - size - 24),
  }
}

function loadPos(size: number): WolfPos {
  try {
    const raw = localStorage.getItem(WOLF_CONSTANTS.STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as WolfPos
      if (typeof p?.x === "number" && typeof p?.y === "number") return clampPos(p, size)
    }
  } catch { /* */ }
  return defaultPos(size)
}

export function useWolfStateMachine() {
  const { isAuthenticated } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { panelOpen: open } = useAiChat()
  const location = useLocation()

  // Core state
  const [pos, setPos] = useState<WolfPos>(() => loadPos(WOLF_CONSTANTS.SIZE))
  const [dragging, setDragging] = useState(false)
  const [wolfActive, setWolfActive] = useState(false)
  const [wolfEx, setWolfEx] = useState<WolfExercise>("none")
  const [wolfBubble, setWolfBubble] = useState<string | null>(null)
  const [eyeScale, setEyeScale] = useState(1)
  const [headOffset, setHeadOffset] = useState({ x: 0, y: 0 })
  const [curlReps, setCurlReps] = useState(0)

  // Refs for stable callbacks
  const wolfPhase = useRef<WolfPhase>("normal")
  const wolfActiveRef = useRef(false)
  const openRef = useRef(open)
  const draggingRef = useRef(dragging)
  const onlineRef = useRef(isOnline)
  const reducedMotion = useRef(false)
  const posRef = useRef<WolfPos>(pos)
  const idleTimer = useRef<number | null>(null)
  const phaseTimer = useRef<number | null>(null)
  const cycleTimer = useRef<number | null>(null)
  const roamRaf = useRef<number | null>(null)
  const roamTarget = useRef<WolfPos | null>(null)
  const homePos = useRef<WolfPos | null>(null)
  const blinkTimer = useRef<number | null>(null)
  const headRaf = useRef<number | null>(null)
  const headTarget = useRef({ x: 0, y: 0 })
  const headCurrent = useRef({ x: 0, y: 0 })
  const wanderTarget = useRef<WolfPos | null>(null)
  const wanderRaf = useRef<number | null>(null)
  const wanderTimer = useRef<number | null>(null)
  const lastInteraction = useRef<"mouse" | "wander">("mouse")
  const mouseActive = useRef(false)
  const mouseActiveTimer = useRef<number | null>(null)

  const currentModule = location.pathname.split("/")[1] || "dashboard"

  // Sync refs
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { onlineRef.current = isOnline }, [isOnline])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { wolfActiveRef.current = wolfActive }, [wolfActive])

  // Eye blink — occasional double-blink
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 4000
      blinkTimer.current = window.setTimeout(() => {
        const isDouble = Math.random() < 0.25
        setEyeScale(0.05)
        setTimeout(() => {
          setEyeScale(1)
          if (isDouble) {
            setTimeout(() => {
              setEyeScale(0.05)
              setTimeout(() => setEyeScale(1), 100 + Math.random() * 60)
            }, 150 + Math.random() * 80)
          }
        }, 100 + Math.random() * 70)
        scheduleBlink()
      }, delay) as unknown as number
    }
    scheduleBlink()
    return () => { if (blinkTimer.current != null) clearTimeout(blinkTimer.current) }
  }, [])

  // Head follow mouse
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (draggingRef.current) return
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const isFit = wolfActiveRef.current
      headTarget.current = {
        x: ((e.clientX - cx) / cx) * (isFit ? 2 : 4),
        y: ((e.clientY - cy) / cy) * (isFit ? 1.5 : 3),
      }
    }
    const animate = () => {
      const t = headTarget.current
      const c = headCurrent.current
      const lerp = wolfActiveRef.current ? 0.02 : 0.04
      c.x += (t.x - c.x) * lerp
      c.y += (t.y - c.y) * lerp
      setHeadOffset({ x: c.x, y: c.y })
      headRaf.current = requestAnimationFrame(animate)
    }
    headRaf.current = requestAnimationFrame(animate)
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      if (headRaf.current != null) cancelAnimationFrame(headRaf.current)
    }
  }, [])

  // Status bubbles
  useEffect(() => {
    if (wolfPhase.current === "normal" && !wolfActive) {
      setWolfBubble("Salut 👋")
    }
  }, [wolfActive])

  useEffect(() => {
    if (wolfEx === "curl" || wolfEx === "bar") {
      setWolfBubble("MODE ENTRAÎNEMENT 💪")
    } else if (wolfEx === "water") {
      setWolfBubble("HYDRATATION 💧")
    } else if (wolfEx === "rest") {
      setWolfBubble("PETITE PAUSE 😎")
    }
  }, [wolfEx])

  // Fitness state machine
  const clearFitTimers = useCallback(() => {
    if (phaseTimer.current != null) { clearTimeout(phaseTimer.current); phaseTimer.current = null }
    if (cycleTimer.current != null) { clearTimeout(cycleTimer.current); cycleTimer.current = null }
    if (roamRaf.current != null) { cancelAnimationFrame(roamRaf.current); roamRaf.current = null }
    roamTarget.current = null
  }, [])

  const startRoam = useCallback(() => {
    const pick = () => {
      roamTarget.current = fitClampPos(
        { x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight },
        WOLF_CONSTANTS.SIZE, WOLF_CONSTANTS.SCALE, WOLF_CONSTANTS.MARGIN,
      )
    }
    pick()
    const animate = () => {
      const target = roamTarget.current
      if (!target) { roamRaf.current = null; return }
      setPos((prev) => {
        const dx = target.x - prev.x
        const dy = target.y - prev.y
        const dist = Math.hypot(dx, dy)
        if (dist < 2) { roamTarget.current = null; return prev }
        return { x: prev.x + (dx / dist) * 2.2, y: prev.y + (dy / dist) * 2.2 }
      })
      roamRaf.current = requestAnimationFrame(animate)
    }
    roamRaf.current = requestAnimationFrame(animate)
  }, [])

  const runExerciseCycle = useCallback(() => {
    if (wolfPhase.current !== "training") return
    setWolfEx((ex) => (ex === "curl" ? "bar" : "curl"))
    setCurlReps((r) => r + 1)
    cycleTimer.current = window.setTimeout(() => {
      setWolfEx("rest")
      cycleTimer.current = window.setTimeout(runExerciseCycle, WOLF_CONSTANTS.REST_DURATION) as unknown as number
    }, WOLF_CONSTANTS.CURL_DURATION) as unknown as number
  }, [])

  const rearmIdle = useCallback(() => {
    if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null }
    idleTimer.current = window.setTimeout(enterFitness, WOLF_CONSTANTS.INACTIVITY_MS) as unknown as number
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startReturn = useCallback(() => {
    if (wolfPhase.current === "normal" || wolfPhase.current === "drinking" || wolfPhase.current === "resting") return
    clearFitTimers()
    wolfPhase.current = "drinking"
    setWolfEx("water")
    phaseTimer.current = window.setTimeout(() => {
      wolfPhase.current = "resting"
      setWolfEx("rest")
      phaseTimer.current = window.setTimeout(() => {
        wolfPhase.current = "normal"
        setWolfActive(false)
        setWolfEx("none")
        setWolfBubble(null)
        setCurlReps(0)
        rearmIdle()
        const home = homePos.current
        const animate = () => {
          if (!home) { roamRaf.current = null; return }
          setPos((prev) => {
            const dx = home.x - prev.x
            const dy = home.y - prev.y
            const dist = Math.hypot(dx, dy)
            if (dist < 2) { roamRaf.current = null; return home }
            return { x: prev.x + (dx / dist) * 3, y: prev.y + (dy / dist) * 3 }
          })
          if (roamRaf.current != null) roamRaf.current = requestAnimationFrame(animate)
        }
        roamRaf.current = requestAnimationFrame(animate)
      }, WOLF_CONSTANTS.REST_MS)
    }, WOLF_CONSTANTS.DRINK_MS)
  }, [clearFitTimers, rearmIdle])

  function enterFitness() {
    if (wolfActiveRef.current) return
    if (openRef.current || draggingRef.current || !onlineRef.current || document.hidden) return
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    if (reducedMotion.current) return
    if (roamRaf.current != null) { cancelAnimationFrame(roamRaf.current); roamRaf.current = null }
    homePos.current = { ...posRef.current }
    wolfPhase.current = "growing"
    setWolfActive(true)
    setWolfEx("none")
    phaseTimer.current = window.setTimeout(() => {
      wolfPhase.current = "training"
      runExerciseCycle()
      startRoam()
    }, WOLF_CONSTANTS.GROW_MS)
  }

  // Interaction + visibility
  useEffect(() => {
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    const clearIdle = () => { if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null } }
    const canFit = () => !openRef.current && !draggingRef.current && onlineRef.current && !reducedMotion.current && !document.hidden
    const onInteraction = () => {
      if (wolfPhase.current !== "normal") { startReturn(); return }
      if (canFit()) rearmIdle()
    }
    const onVisibility = () => {
      if (document.hidden) clearIdle()
      else if (wolfPhase.current !== "normal") startReturn()
      else if (canFit()) rearmIdle()
    }
    if (!canFit()) { clearIdle(); if (wolfPhase.current !== "normal" && (openRef.current || !onlineRef.current)) startReturn() }
    else if (wolfPhase.current === "normal") rearmIdle()
    window.addEventListener("pointermove", onInteraction, { passive: true })
    window.addEventListener("pointerdown", onInteraction, { passive: true })
    window.addEventListener("keydown", onInteraction, { passive: true })
    window.addEventListener("wheel", onInteraction, { passive: true })
    window.addEventListener("touchstart", onInteraction, { passive: true })
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearIdle()
      window.removeEventListener("pointermove", onInteraction)
      window.removeEventListener("pointerdown", onInteraction)
      window.removeEventListener("keydown", onInteraction)
      window.removeEventListener("wheel", onInteraction)
      window.removeEventListener("touchstart", onInteraction)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [open, dragging, isOnline, startReturn, rearmIdle])

  // Cleanup
  useEffect(() => {
    return () => { if (idleTimer.current != null) clearTimeout(idleTimer.current); clearFitTimers() }
  }, [clearFitTimers])

  // Wander
  useEffect(() => {
    if (dragging || open || !isOnline || wolfActive) {
      if (wanderRaf.current != null) { cancelAnimationFrame(wanderRaf.current); wanderRaf.current = null }
      if (wanderTimer.current != null) { clearTimeout(wanderTimer.current); wanderTimer.current = null }
      return
    }
    const pickTarget = () => {
      const margin = WOLF_CONSTANTS.SIZE + 20
      wanderTarget.current = {
        x: margin + Math.random() * (window.innerWidth - margin * 2),
        y: margin + Math.random() * (window.innerHeight - margin * 2),
      }
      lastInteraction.current = "wander"
      scheduleNext()
    }
    const animate = () => {
      const target = wanderTarget.current
      if (!target) { wanderRaf.current = null; return }
      setPos((prev) => {
        const dx = target.x - prev.x
        const dy = target.y - prev.y
        const dist = Math.hypot(dx, dy)
        if (dist < 2) { wanderTarget.current = null; return target }
        return { x: prev.x + (dx / dist) * 1.2, y: prev.y + (dy / dist) * 1.2 }
      })
      wanderRaf.current = requestAnimationFrame(animate)
    }
    const scheduleNext = () => {
      if (wanderTimer.current != null) clearTimeout(wanderTimer.current)
      wanderTimer.current = window.setTimeout(pickTarget, 4000 + Math.random() * 4000) as unknown as number
    }
    scheduleNext()
    return () => {
      if (wanderRaf.current != null) { cancelAnimationFrame(wanderRaf.current); wanderRaf.current = null }
      if (wanderTimer.current != null) { clearTimeout(wanderTimer.current); wanderTimer.current = null }
    }
  }, [dragging, open, isOnline, wolfActive])

  // Save wander pos
  useEffect(() => {
    if (lastInteraction.current !== "wander") return
    const id = setInterval(() => {
      try { localStorage.setItem(WOLF_CONSTANTS.STORAGE_KEY, JSON.stringify(pos)) } catch { /* */ }
    }, 1000)
    return () => clearInterval(id)
  }, [pos])

  // Mouse activity tracker
  useEffect(() => {
    const onPointerMove = () => {
      mouseActive.current = true
      lastInteraction.current = "mouse"
      if (mouseActiveTimer.current) clearTimeout(mouseActiveTimer.current)
      mouseActiveTimer.current = window.setTimeout(() => { mouseActive.current = false }, 2000)
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      if (mouseActiveTimer.current) window.clearTimeout(mouseActiveTimer.current)
    }
  }, [])

  // Resize
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p, WOLF_CONSTANTS.SIZE))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return {
    isAuthenticated,
    isOnline,
    pos,
    setPos,
    dragging,
    setDragging,
    wolfActive,
    wolfEx,
    wolfBubble,
    eyeScale,
    headOffset,
    curlReps,
    wolfPhase,
    open,
    currentModule,
    clearFitTimers,
    posRef,
    openRef,
    draggingRef,
    onlineRef,
    reducedMotion,
    homePos,
    roamRaf,
    startReturn,
    rearmIdle,
  }
}

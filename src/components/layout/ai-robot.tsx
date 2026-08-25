import { useState, useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useAiChat } from "@/stores/ai-chat"
import { useNetworkStatus } from "@/hooks/useNetworkStatus"
import { ChatSection } from "@/pages/ai-assistant/components/chat-section"
import { useAssistantData } from "@/pages/ai-assistant/hooks/useAssistantData"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { X, Maximize2 } from "lucide-react"

const ROBOT_SIZE = 56
const DRAG_THRESHOLD = 5
const STORAGE_KEY = "fitmanager-ai-robot-pos"

const FITNESS_IDLE_MS = 15000
const FITNESS_SCALE = 3
const FITNESS_MARGIN = 60
const GROW_MS = 1150
const DRINK_MS = 2400
const REST_MS = 1600

type FitPhase = "normal" | "growing" | "fitness" | "water" | "resting"
type FitExercise = "none" | "curl" | "bar" | "rest" | "water"

interface RobotPos { x: number; y: number }

function clampPos(p: RobotPos): RobotPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, vw - ROBOT_SIZE)),
    y: Math.min(Math.max(0, p.y), Math.max(0, vh - ROBOT_SIZE)),
  }
}

function fitClampPos(p: RobotPos): RobotPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const half = Math.round((ROBOT_SIZE * (FITNESS_SCALE - 1)) / 2)
  const minX = FITNESS_MARGIN + half
  const minY = FITNESS_MARGIN + half
  const maxX = Math.max(minX, vw - FITNESS_MARGIN - half - ROBOT_SIZE)
  const maxY = Math.max(minY, vh - FITNESS_MARGIN - half - ROBOT_SIZE)
  return { x: Math.min(Math.max(minX, p.x), maxX), y: Math.min(Math.max(minY, p.y), maxY) }
}

function defaultPos(): RobotPos {
  return {
    x: Math.max(0, window.innerWidth - ROBOT_SIZE - 24),
    y: Math.max(0, window.innerHeight - ROBOT_SIZE - 24),
  }
}

function loadPos(): RobotPos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as RobotPos
      if (typeof p?.x === "number" && typeof p?.y === "number") return clampPos(p)
    }
  } catch { /* */ }
  return defaultPos()
}

export function AiFloatingRobot() {
  const t = useT()
  const { isAuthenticated } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { loading, panelOpen: open, togglePanel, closePanel } = useAiChat()
  const [pos, setPos] = useState<RobotPos>(loadPos)
  const [blinking, setBlinking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false })
  const armedRef = useRef(false)
  const latestPos = useRef<RobotPos>({ x: 0, y: 0 })
  const gazeTarget = useRef({ x: 0, y: 0 })
  const gazeRaf = useRef<number | null>(null)
  const gazeReturnTimer = useRef<number | null>(null)
  const canHover = useRef(false)
  const location = useLocation()
  const navigate = useNavigate()

  const wanderTarget = useRef<RobotPos | null>(null)
  const wanderRaf = useRef<number | null>(null)
  const wanderTimer = useRef<number | null>(null)
  const lastInteraction = useRef<"mouse" | "wander">("mouse")
  const mouseActive = useRef(false)
  const mouseActiveTimer = useRef<number | null>(null)

  const [fitActive, setFitActive] = useState(false)
  const [fitEx, setFitEx] = useState<FitExercise>("none")
  const fitPhase = useRef<FitPhase>("normal")
  const fitActiveRef = useRef(false)
  const openRef = useRef(open)
  const draggingRef = useRef(dragging)
  const onlineRef = useRef(isOnline)
  const reducedMotion = useRef(false)
  const posRef = useRef<RobotPos>(pos)
  const idleTimer = useRef<number | null>(null)
  const fitPhaseTimer = useRef<number | null>(null)
  const fitCycleTimer = useRef<number | null>(null)
  const fitRaf = useRef<number | null>(null)
  const fitTarget = useRef<RobotPos | null>(null)
  const fitHomePos = useRef<RobotPos | null>(null)

  const currentModule = location.pathname.split("/")[1] || "dashboard"

  useEffect(() => { closePanel() }, [currentModule, closePanel])

  useEffect(() => {
    canHover.current = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false
  }, [])

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { onlineRef.current = isOnline }, [isOnline])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { fitActiveRef.current = fitActive }, [fitActive])

  const clearFitTimers = () => {
    if (fitPhaseTimer.current != null) { clearTimeout(fitPhaseTimer.current); fitPhaseTimer.current = null }
    if (fitCycleTimer.current != null) { clearTimeout(fitCycleTimer.current); fitCycleTimer.current = null }
    if (fitRaf.current != null) { cancelAnimationFrame(fitRaf.current); fitRaf.current = null }
    fitTarget.current = null
  }

  const startRoam = () => {
    const pick = () => {
      fitTarget.current = fitClampPos({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight })
    }
    pick()
    const animate = () => {
      const target = fitTarget.current
      if (!target) { fitRaf.current = null; return }
      setPos((prev) => {
        const dx = target.x - prev.x
        const dy = target.y - prev.y
        const dist = Math.hypot(dx, dy)
        if (dist < 2) { fitTarget.current = null; return prev }
        return { x: prev.x + (dx / dist) * 2.2, y: prev.y + (dy / dist) * 2.2 }
      })
      fitRaf.current = requestAnimationFrame(animate)
    }
    fitRaf.current = requestAnimationFrame(animate)
  }

  const runExerciseCycle = () => {
    if (fitPhase.current !== "fitness") return
    setFitEx((ex) => (ex === "curl" ? "bar" : "curl"))
    fitCycleTimer.current = window.setTimeout(() => {
      setFitEx("rest")
      fitCycleTimer.current = window.setTimeout(runExerciseCycle, 650) as unknown as number
    }, 2400) as unknown as number
  }

  const rearmIdle = () => {
    if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null }
    idleTimer.current = window.setTimeout(enterFitness, FITNESS_IDLE_MS) as unknown as number
  }

  const startReturn = () => {
    if (fitPhase.current === "normal" || fitPhase.current === "water" || fitPhase.current === "resting") return
    clearFitTimers()
    fitPhase.current = "water"
    setFitEx("water")
    fitPhaseTimer.current = window.setTimeout(() => {
      fitPhase.current = "resting"
      setFitEx("rest")
      fitPhaseTimer.current = window.setTimeout(() => {
        fitPhase.current = "normal"
        setFitActive(false)
        setFitEx("none")
        rearmIdle()
        const home = fitHomePos.current
        const animate = () => {
          if (!home) { fitRaf.current = null; return }
          setPos((prev) => {
            const dx = home.x - prev.x
            const dy = home.y - prev.y
            const dist = Math.hypot(dx, dy)
            if (dist < 2) { fitRaf.current = null; return home }
            return { x: prev.x + (dx / dist) * 3, y: prev.y + (dy / dist) * 3 }
          })
          if (fitRaf.current != null) fitRaf.current = requestAnimationFrame(animate)
        }
        fitRaf.current = requestAnimationFrame(animate)
      }, REST_MS)
    }, DRINK_MS)
  }

  const enterFitness = () => {
    if (fitActiveRef.current) return
    if (openRef.current || draggingRef.current || !onlineRef.current || document.hidden) return
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    if (reducedMotion.current) return
    if (fitRaf.current != null) { cancelAnimationFrame(fitRaf.current); fitRaf.current = null }
    fitHomePos.current = { ...posRef.current }
    fitPhase.current = "growing"
    setFitActive(true)
    setFitEx("none")
    fitPhaseTimer.current = window.setTimeout(() => {
      fitPhase.current = "fitness"
      runExerciseCycle()
      startRoam()
    }, GROW_MS)
  }

  useEffect(() => {
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    const clearIdle = () => { if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null } }
    const canFit = () => !openRef.current && !draggingRef.current && onlineRef.current && !reducedMotion.current && !document.hidden
    const onInteraction = () => {
      if (fitPhase.current !== "normal") { startReturn(); return }
      if (canFit()) rearmIdle()
    }
    const onVisibility = () => {
      if (document.hidden) clearIdle()
      else if (fitPhase.current !== "normal") startReturn()
      else if (canFit()) rearmIdle()
    }
    if (!canFit()) { clearIdle(); if (fitPhase.current !== "normal" && (openRef.current || !onlineRef.current)) startReturn() }
    else if (fitPhase.current === "normal") rearmIdle()
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
  }, [open, dragging, isOnline]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (idleTimer.current != null) clearTimeout(idleTimer.current); clearFitTimers() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (dragging || open || !isOnline || fitActive) {
      if (wanderRaf.current != null) { cancelAnimationFrame(wanderRaf.current); wanderRaf.current = null }
      if (wanderTimer.current != null) { clearTimeout(wanderTimer.current); wanderTimer.current = null }
      return
    }
    const pickTarget = () => {
      const margin = ROBOT_SIZE + 20
      const target = {
        x: margin + Math.random() * (window.innerWidth - margin * 2),
        y: margin + Math.random() * (window.innerHeight - margin * 2),
      }
      wanderTarget.current = target
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
  }, [dragging, open, isOnline, fitActive])

  useEffect(() => {
    if (lastInteraction.current !== "wander") return
    const id = setInterval(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch { /* */ }
    }, 1000)
    return () => clearInterval(id)
  }, [pos])

  useEffect(() => {
    if (!canHover.current) return
    const applyGaze = () => {
      const el = buttonRef.current
      if (el) {
        el.style.setProperty("--eye-x", gazeTarget.current.x.toFixed(2))
        el.style.setProperty("--eye-y", gazeTarget.current.y.toFixed(2))
      }
      gazeRaf.current = null
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!canHover.current) return
      mouseActive.current = true
      lastInteraction.current = "mouse"
      if (mouseActiveTimer.current) clearTimeout(mouseActiveTimer.current)
      mouseActiveTimer.current = window.setTimeout(() => { mouseActive.current = false }, 2000)
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      gazeTarget.current = { x: nx * 16, y: ny * 12 }
      if (gazeReturnTimer.current) { window.clearTimeout(gazeReturnTimer.current); gazeReturnTimer.current = null }
      buttonRef.current?.classList.remove("gaze-return")
      if (gazeRaf.current == null) gazeRaf.current = requestAnimationFrame(applyGaze)
    }
    let prevPos: RobotPos | null = null
    const checkWanderGaze = () => {
      if (!mouseActive.current && lastInteraction.current === "wander") {
        const btn = buttonRef.current
        if (btn && prevPos) {
          const curPos = { x: parseFloat(btn.style.left) || 0, y: parseFloat(btn.style.top) || 0 }
          const dx = curPos.x - prevPos.x
          const dy = curPos.y - prevPos.y
          const dist = Math.hypot(dx, dy)
          if (dist > 0.5) {
            const nx = Math.min(Math.max((dx / dist) * 8, -8), 8)
            const ny = Math.min(Math.max((dy / dist) * 6, -6), 6)
            gazeTarget.current = { x: nx, y: ny }
            buttonRef.current?.classList.remove("gaze-return")
            if (gazeRaf.current == null) gazeRaf.current = requestAnimationFrame(applyGaze)
          }
          prevPos = curPos
        } else if (btn) {
          prevPos = { x: parseFloat(btn.style.left) || 0, y: parseFloat(btn.style.top) || 0 }
        }
      } else {
        prevPos = null
      }
    }
    const wanderGazeInterval = window.setInterval(checkWanderGaze, 100)
    const onLeave = () => {
      if (!canHover.current) return
      buttonRef.current?.classList.add("gaze-return")
      gazeTarget.current = { x: 0, y: 0 }
      applyGaze()
      if (gazeReturnTimer.current) window.clearTimeout(gazeReturnTimer.current)
      gazeReturnTimer.current = window.setTimeout(() => {
        buttonRef.current?.classList.remove("gaze-return")
      }, 400)
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      window.clearInterval(wanderGazeInterval)
      if (gazeRaf.current != null) cancelAnimationFrame(gazeRaf.current)
      if (gazeReturnTimer.current) window.clearTimeout(gazeReturnTimer.current)
      if (mouseActiveTimer.current) window.clearTimeout(mouseActiveTimer.current)
    }
  }, [])

  useEffect(() => {
    let blinkTimeout: number | undefined
    let closeTimeout: number | undefined
    const schedule = () => {
      blinkTimeout = window.setTimeout(() => {
        setBlinking(true)
        closeTimeout = window.setTimeout(() => {
          setBlinking(false)
          schedule()
        }, 120 + Math.random() * 100)
      }, 3000 + Math.random() * 4000)
    }
    schedule()
    return () => { if (blinkTimeout) window.clearTimeout(blinkTimeout); if (closeTimeout) window.clearTimeout(closeTimeout) }
  }, [])

  useEffect(() => {
    const el = buttonRef.current
    if (el) el.style.setProperty("--eye-blink", blinking ? "0.1" : "1")
  }, [blinking])

  if (!isAuthenticated) return null

  const orbState: "idle" | "thinking" | "responding" | "offline" = !isOnline ? "offline" : loading ? "thinking" : "idle"

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    armedRef.current = true
    mouseActive.current = true
    lastInteraction.current = "mouse"
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!armedRef.current || e.buttons === 0) return
    const d = dragRef.current
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true
    if (d.moved) {
      const next = clampPos({ x: d.startPosX + e.clientX - d.startX, y: d.startPosY + e.clientY - d.startY })
      latestPos.current = next
      setDragging(true)
      setPos(next)
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (d.moved) {
      const final = clampPos({ x: d.startPosX + e.clientX - d.startX, y: d.startPosY + e.clientY - d.startY })
      latestPos.current = final
      setPos(final)
      closePanel()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(final)) } catch { /* */ }
    } else if (armedRef.current) {
      togglePanel()
    }
    armedRef.current = false
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.moved) {
      closePanel()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPos.current)) } catch { /* */ }
    }
    armedRef.current = false
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onClick = () => { return }

  const stateClass = orbState === "offline" ? " is-offline" : orbState === "thinking" ? " is-thinking" : ""

  return (
    <>
      {open && <AiFloatingPanel onClose={closePanel} onExpand={() => navigate("/ai-assistant")} />}
      <button
        ref={buttonRef}
        type="button"
        className={`fitmanager-ai-floating-button${stateClass}${dragging ? " is-dragging" : ""}${fitActive ? " is-fitness-mode" : ""}`}
        style={{ left: pos.x, top: pos.y }}
        aria-label={t("aiAssistant.openAssistant")}
        title={t("aiAssistant.openAssistant")}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <span className="fitmanager-ai-robot-scope" style={{ transform: fitActive ? `scale(${FITNESS_SCALE})` : "scale(1)" }}>
          <AiRobotSvg state={orbState} fitMode={fitActive} fitEx={fitEx} />
        </span>
      </button>
    </>
  )
}

function AiFloatingPanel({ onClose, onExpand }: { onClose: () => void; onExpand: () => void }) {
  const t = useT()
  const { organization } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { loading } = useAiChat()
  const { data, isLoading } = useLazyAssistantData()

  const orbState: "idle" | "thinking" | "responding" | "offline" = !isOnline ? "offline" : loading ? "thinking" : "idle"

  return (
    <div className="fitmanager-ai-panel">
      <Card className="fitmanager-ai-panel__card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="fitmanager-ai-panel__orb-mini">
              <AiRobotSvg state={orbState} small />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">{t("aiAssistant.chatTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("aiAssistant.chatSubtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("aiAssistant.title")} onClick={onExpand}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t("common.close")} onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isLoading || !organization ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            {t("common.loading")}
          </div>
        ) : (
          <ChatSection data={data} t={t} embedded />
        )}
      </Card>
    </div>
  )
}

function useLazyAssistantData() {
  const { organization } = useAuth()
  const orgId = organization?.id
  const [filters] = useState(() => {
    const today = new Date()
    const past = new Date()
    past.setDate(past.getDate() - 30)
    return { period: "monthly" as const, dateFrom: past.toISOString().slice(0, 10), dateTo: today.toISOString().slice(0, 10) }
  })
  const data = useAssistantData(orgId, filters)
  return { data, isLoading: data.isLoading }
}

function AiRobotSvg({
  state,
  small,
  fitMode,
  fitEx,
}: {
  state: "idle" | "thinking" | "responding" | "offline"
  small?: boolean
  fitMode?: boolean
  fitEx?: FitExercise
}) {
  const uid = small ? "fitm-ai-s" : "fitm-ai"
  const offline = state === "offline"
  const thinking = state === "thinking"
  const responding = state === "responding"
  const active = thinking || responding
  const fitClass = fitMode ? " fitmanager-ai-robot__body is-fitness" : ""
  const exClass =
    fitEx === "curl" ? " is-curl" : fitEx === "bar" ? " is-bar" : fitEx === "water" ? " is-drinking" : fitEx === "rest" ? " is-resting" : ""
  return (
    <svg className="fitmanager-ai-robot" viewBox="0 0 120 132" width="120" height="132" role="img" aria-hidden="true">
      <defs>
        <radialGradient id={`${uid}-head`} cx="0.45" cy="0.35" r="0.65">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="60%" stopColor="#111111" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>
        <linearGradient id={`${uid}-glass`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="rgba(180,210,255,0.22)" />
          <stop offset="50%" stopColor="rgba(100,160,240,0.10)" />
          <stop offset="100%" stopColor="rgba(60,100,180,0.18)" />
        </linearGradient>
        <linearGradient id={`${uid}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <radialGradient id={`${uid}-eyeGlow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#93c5fd" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-hoverRed`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-hoverBlue`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-shine`} x1="0.3" y1="0" x2="0.7" y2="0.5">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      <g className={`${offline ? "fitmanager-ai-robot--offline" : ""}${fitClass}${exClass}`}>
        <ellipse cx="60" cy="122" rx="28" ry="5" fill={`url(#${uid}-hoverRed)`} className="fitmanager-ai-robot__base-ring" />
        <ellipse cx="60" cy="122" rx="22" ry="3.5" fill="none" stroke="#ef4444" strokeWidth="1.2" opacity="0.7" className="fitmanager-ai-robot__base-ring" />
        <ellipse cx="60" cy="120" rx="18" ry="3" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.6" className="fitmanager-ai-robot__base-ring" />
        <rect x="56" y="113" width="8" height="10" rx="4" fill="rgba(30,30,30,0.7)" stroke="rgba(96,165,250,0.2)" strokeWidth="0.8" />
        <path d="M40 82 Q38 78 42 74 L78 74 Q82 78 80 82 L78 112 Q76 116 60 117 Q44 116 42 112 Z" fill={`url(#${uid}-glass)`} stroke="rgba(147,197,253,0.35)" strokeWidth="1.2" />
        <path d="M44 78 L46 110" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" />
        <path d="M74 78 L76 108" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" strokeLinecap="round" />
        <circle cx="60" cy="93" r="14" fill="#111" stroke={`url(#${uid}-ring)`} strokeWidth="2" />
        <circle cx="60" cy="93" r="11" fill="none" stroke="rgba(239,68,68,0.3)" strokeWidth="0.6" />
        <text x="60" y="91" textAnchor="middle" fill="#3b82f6" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">QF</text>
        <text x="60" y="99" textAnchor="middle" fill="#ef4444" fontSize="5" fontWeight="bold" fontFamily="Arial, sans-serif">GYM</text>
        <line x1="42" y1="22" x2="34" y2="6" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="34" cy="5" r="2.8" fill={active ? "#ef4444" : "#7f1d1d"} className="fitmanager-ai-robot__antenna" />
        <circle cx="34" cy="5" r="4" fill="none" stroke="#ef4444" strokeWidth="0.6" opacity={active ? "0.8" : "0.3"} />
        <line x1="78" y1="22" x2="86" y2="6" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="86" cy="5" r="2.8" fill={active ? "#3b82f6" : "#1e3a5f"} className="fitmanager-ai-robot__antenna" />
        <circle cx="86" cy="5" r="4" fill="none" stroke="#3b82f6" strokeWidth="0.6" opacity={active ? "0.8" : "0.3"} />
        <ellipse cx="60" cy="42" rx="32" ry="28" fill={`url(#${uid}-head)`} stroke="rgba(96,165,250,0.3)" strokeWidth="1" />
        <ellipse cx="52" cy="30" rx="18" ry="10" fill={`url(#${uid}-shine)`} />
        <path d="M36 30 Q60 22 84 30" fill="none" stroke="#3b82f6" strokeWidth="1.2" opacity="0.5" />
        <path d="M38 32 Q60 25 82 32" fill="none" stroke="#ef4444" strokeWidth="0.8" opacity="0.4" />
        <circle cx="28" cy="42" r="7" fill="#1a1a1a" stroke="rgba(239,68,68,0.5)" strokeWidth="1.2" />
        <circle cx="28" cy="42" r="4.5" fill="none" stroke="#ef4444" strokeWidth="0.8" opacity="0.6" />
        <circle cx="28" cy="42" r="2" fill="#ef4444" opacity={active ? "0.9" : "0.4"} />
        <circle cx="92" cy="42" r="7" fill="#1a1a1a" stroke="rgba(59,130,246,0.5)" strokeWidth="1.2" />
        <circle cx="92" cy="42" r="4.5" fill="none" stroke="#3b82f6" strokeWidth="0.8" opacity="0.6" />
        <circle cx="92" cy="42" r="2" fill="#3b82f6" opacity={active ? "0.9" : "0.4"} />
        <rect x="38" y="33" width="44" height="22" rx="11" fill="rgba(0,0,0,0.6)" stroke="rgba(147,197,253,0.2)" strokeWidth="0.8" />
        <g className="fitmanager-ai-eyes">
          <circle cx="50" cy="44" r="8" fill={`url(#${uid}-eyeGlow)`} className="fitmanager-ai-robot__eye-glow" />
          <circle cx="70" cy="44" r="8" fill={`url(#${uid}-eyeGlow)`} className="fitmanager-ai-robot__eye-glow" />
          <path d="M43 44 Q50 37 57 44" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" className="fitmanager-ai-robot__eye" />
          <path d="M63 44 Q70 37 77 44" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" className="fitmanager-ai-robot__eye" />
          <circle cx="50" cy="41" r="1.2" fill="#ffffff" className="fitmanager-ai-robot__eye-hl" />
          <circle cx="70" cy="41" r="1.2" fill="#ffffff" className="fitmanager-ai-robot__eye-hl" />
        </g>
        <path d="M55 50 Q60 54 65 50" fill="none" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        <g className="fitmanager-ai-robot__arm-l" transform="translate(18, 78)">
          <rect x="0" y="4" width="10" height="12" rx="3" fill="rgba(30,30,30,0.8)" stroke="rgba(96,165,250,0.25)" strokeWidth="0.8" />
          <rect x="2" y="-2" width="4" height="8" rx="2" fill="rgba(30,30,30,0.9)" stroke="rgba(96,165,250,0.3)" strokeWidth="0.6" transform="rotate(-15 4 4)" />
          <rect x="0" y="14" width="3" height="6" rx="1.5" fill="rgba(30,30,30,0.7)" />
          <rect x="3.5" y="14" width="3" height="6" rx="1.5" fill="rgba(30,30,30,0.7)" />
          <rect x="7" y="14" width="3" height="5" rx="1.5" fill="rgba(30,30,30,0.7)" />
          {fitMode && fitEx === "curl" && (
            <g className="fitmanager-ai-robot__dumbbell">
              <line x1="4" y1="20" x2="4" y2="34" stroke="#cbd5e1" strokeWidth="2.2" />
              <rect x="0.5" y="34" width="7" height="6" rx="1.5" fill="#3b82f6" opacity="0.95" />
              <rect x="0.5" y="18" width="7" height="6" rx="1.5" fill="#2563eb" opacity="0.95" />
              <rect x="0.5" y="34" width="3" height="6" rx="1" fill="#60a5fa" opacity="0.6" />
            </g>
          )}
        </g>
        <g className="fitmanager-ai-robot__arm-r" transform="translate(88, 76)">
          <rect x="-2" y="6" width="6" height="10" rx="3" fill="rgba(30,30,30,0.7)" stroke="rgba(96,165,250,0.2)" strokeWidth="0.6" />
          <circle cx="4" cy="0" r="7" fill="rgba(0,0,0,0.5)" stroke="rgba(239,68,68,0.4)" strokeWidth="0.8" />
          <path d="M1 -2 Q0 -4 2 -4 Q4 -4 3 -2" fill="none" stroke="#ef4444" strokeWidth="0.7" opacity="0.8" />
          <path d="M5 -2 Q4 -4 6 -4 Q8 -4 7 -2" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.8" />
          <line x1="4" y1="-4" x2="4" y2="2" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
          {fitMode && fitEx === "curl" && (
            <g className="fitmanager-ai-robot__dumbbell">
              <line x1="3" y1="16" x2="3" y2="30" stroke="#cbd5e1" strokeWidth="2.2" />
              <rect x="-0.5" y="30" width="7" height="6" rx="1.5" fill="#ef4444" opacity="0.95" />
              <rect x="-0.5" y="14" width="7" height="6" rx="1.5" fill="#dc2626" opacity="0.95" />
              <rect x="-0.5" y="30" width="3" height="6" rx="1" fill="#fca5a5" opacity="0.6" />
            </g>
          )}
        </g>
        {fitMode && fitEx === "bar" && (
          <g className="fitmanager-ai-robot__bar">
            <line x1="16" y1="72" x2="104" y2="72" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
            <rect x="14" y="66" width="6" height="12" rx="1.5" fill="#ef4444" />
            <rect x="14" y="66" width="3" height="12" rx="1" fill="#fca5a5" opacity="0.6" />
            <rect x="100" y="66" width="6" height="12" rx="1.5" fill="#3b82f6" />
            <rect x="100" y="66" width="3" height="12" rx="1" fill="#93c5fd" opacity="0.6" />
          </g>
        )}
        {fitMode && fitEx === "water" && (
          <g className="fitmanager-ai-robot__bottle" transform="translate(66, 40)">
            <rect x="-4" y="-2" width="10" height="14" rx="3" fill="rgba(147,197,253,0.55)" stroke="rgba(147,197,253,0.8)" strokeWidth="0.8" transform="rotate(16)" />
            <rect x="-4" y="-2" width="4" height="14" rx="2" fill="rgba(255,255,255,0.25)" transform="rotate(16)" />
            <rect x="0" y="-6" width="3" height="4" rx="1" fill="#60a5fa" transform="rotate(16)" />
          </g>
        )}
      </g>
    </svg>
  )
}

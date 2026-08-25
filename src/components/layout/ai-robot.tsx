import { useState, useEffect, useRef, Suspense } from "react"
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
import { useWolfMode, type Wolf3DAdapter } from "@/components/assistant"

const WOLF_SIZE = 56
const DRAG_THRESHOLD = 5
const STORAGE_KEY = "fitmanager-ai-wolf-pos"

const INACTIVITY_MS = 15000
const WOLF_SCALE = 3
const WOLF_MARGIN = 60
const GROW_MS = 1150
const DRINK_MS = 2400
const REST_MS = 1600

type WolfPhase = "normal" | "growing" | "training" | "drinking" | "resting"
type WolfExercise = "none" | "curl" | "bar" | "rest" | "water"

interface Pos { x: number; y: number }

function clampPos(p: Pos): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, vw - WOLF_SIZE)),
    y: Math.min(Math.max(0, p.y), Math.max(0, vh - WOLF_SIZE)),
  }
}

function fitClampPos(p: Pos): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const half = Math.round((WOLF_SIZE * (WOLF_SCALE - 1)) / 2)
  const minX = WOLF_MARGIN + half
  const minY = WOLF_MARGIN + half
  const maxX = Math.max(minX, vw - WOLF_MARGIN - half - WOLF_SIZE)
  const maxY = Math.max(minY, vh - WOLF_MARGIN - half - WOLF_SIZE)
  return { x: Math.min(Math.max(minX, p.x), maxX), y: Math.min(Math.max(minY, p.y), maxY) }
}

function defaultPos(): Pos {
  return {
    x: Math.max(0, window.innerWidth - WOLF_SIZE - 24),
    y: Math.max(0, window.innerHeight - WOLF_SIZE - 24),
  }
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Pos
      if (typeof p?.x === "number" && typeof p?.y === "number") return clampPos(p)
    }
  } catch { /* */ }
  return defaultPos()
}

export function AiFloatingWolf() {
  const t = useT()
  const { isAuthenticated } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { loading, panelOpen: open, togglePanel, closePanel } = useAiChat()
  const [pos, setPos] = useState<Pos>(loadPos)
  const [dragging, setDragging] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false })
  const armedRef = useRef(false)
  const latestPos = useRef<Pos>({ x: 0, y: 0 })
  const location = useLocation()
  const navigate = useNavigate()

  // Wander
  const wanderTarget = useRef<Pos | null>(null)
  const wanderRaf = useRef<number | null>(null)
  const wanderTimer = useRef<number | null>(null)
  const lastInteraction = useRef<"mouse" | "wander">("mouse")
  const mouseActive = useRef(false)
  const mouseActiveTimer = useRef<number | null>(null)

  // Wolf state machine
  const [wolfActive, setWolfActive] = useState(false)
  const [wolfEx, setWolfEx] = useState<WolfExercise>("none")
  const [wolfBubble, setWolfBubble] = useState<string | null>(null)
  const [eyeScale, setEyeScale] = useState(1)
  const [headOffset, setHeadOffset] = useState({ x: 0, y: 0 })
  const [curlReps, setCurlReps] = useState(0)
  const wolfPhase = useRef<WolfPhase>("normal")
  const wolfActiveRef = useRef(false)
  const openRef = useRef(open)
  const draggingRef = useRef(dragging)
  const onlineRef = useRef(isOnline)
  const reducedMotion = useRef(false)
  const posRef = useRef<Pos>(pos)
  const idleTimer = useRef<number | null>(null)
  const phaseTimer = useRef<number | null>(null)
  const cycleTimer = useRef<number | null>(null)
  const roamRaf = useRef<number | null>(null)
  const roamTarget = useRef<Pos | null>(null)
  const homePos = useRef<Pos | null>(null)
  const blinkTimer = useRef<number | null>(null)
  const headRaf = useRef<number | null>(null)
  const headTarget = useRef({ x: 0, y: 0 })
  const headCurrent = useRef({ x: 0, y: 0 })

  // Wolf mode detection (PNG vs 3D)
  const wolfMode = useWolfMode()
  const wolf3dRef = useRef<Wolf3DAdapter | null>(null)
  const [Wolf3DComponent, setWolf3DComponent] = useState<React.ComponentType<any> | null>(null)

  // Lazy-load 3D component when wolf.glb detected
  useEffect(() => {
    if (wolfMode === "3d" && !Wolf3DComponent) {
      import("@/components/assistant/Wolf3D").then((m) => {
        setWolf3DComponent(() => m.Wolf3DRenderer)
      })
    }
  }, [wolfMode, Wolf3DComponent])

  // Drive 3D animations when in 3D mode
  useEffect(() => {
    if (wolfMode !== "3d" || !wolf3dRef.current) return
    const adapter = wolf3dRef.current
    if (wolfEx === "curl" || wolfEx === "bar") {
      adapter.playAnimation("BicepCurl", 1.6)
    } else if (wolfEx === "water") {
      adapter.playAnimation("Drink", 2.4)
    } else if (wolfEx === "rest") {
      adapter.playAnimation("Rest", 1.6)
    } else {
      adapter.playAnimation("Idle")
    }
  }, [wolfMode, wolfEx])

  // Drive 3D lookAt from head offset
  useEffect(() => {
    if (wolfMode !== "3d" || !wolf3dRef.current) return
    wolf3dRef.current.setLookAt(headOffset.x, headOffset.y)
  }, [wolfMode, headOffset])

  // Drive 3D scale
  useEffect(() => {
    if (wolfMode !== "3d" || !wolf3dRef.current) return
    wolf3dRef.current.setScale(wolfActive ? WOLF_SCALE : 1)
  }, [wolfMode, wolfActive])

  const currentModule = location.pathname.split("/")[1] || "dashboard"

  useEffect(() => { closePanel() }, [currentModule, closePanel])

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { onlineRef.current = isOnline }, [isOnline])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { wolfActiveRef.current = wolfActive }, [wolfActive])

  // ===== Eye blink — occasional double-blink =====
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

  // ===== Head follow mouse =====
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

  // ===== Status bubbles =====
  useEffect(() => {
    if (wolfPhase.current === "normal" && !wolfActive) {
      setWolfBubble(t("aiAssistant.wolfBubbleIdle") || "Salut 👋")
    }
  }, [wolfActive, t])

  useEffect(() => {
    if (wolfEx === "curl" || wolfEx === "bar") {
      setWolfBubble(t("aiAssistant.wolfBubbleTraining") || "MODE ENTRAÎNEMENT 💪")
    } else if (wolfEx === "water") {
      setWolfBubble(t("aiAssistant.wolfBubbleDrinking") || "HYDRATATION 💧")
    } else if (wolfEx === "rest") {
      setWolfBubble(t("aiAssistant.wolfBubbleResting") || "PETITE PAUSE 😎")
    }
  }, [wolfEx, t])

  // ===== Fitness state machine =====
  const clearFitTimers = () => {
    if (phaseTimer.current != null) { clearTimeout(phaseTimer.current); phaseTimer.current = null }
    if (cycleTimer.current != null) { clearTimeout(cycleTimer.current); cycleTimer.current = null }
    if (roamRaf.current != null) { cancelAnimationFrame(roamRaf.current); roamRaf.current = null }
    roamTarget.current = null
  }

  const startRoam = () => {
    const pick = () => {
      roamTarget.current = fitClampPos({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight })
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
  }

  const runExerciseCycle = () => {
    if (wolfPhase.current !== "training") return
    setWolfEx((ex) => (ex === "curl" ? "bar" : "curl"))
    setCurlReps((r) => r + 1)
    cycleTimer.current = window.setTimeout(() => {
      setWolfEx("rest")
      cycleTimer.current = window.setTimeout(runExerciseCycle, 800) as unknown as number
    }, 1600) as unknown as number
  }

  const startReturn = () => {
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
      }, REST_MS)
    }, DRINK_MS)
  }

  const enterFitness = () => {
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
    }, GROW_MS)
  }

  const rearmIdle = () => {
    if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null }
    idleTimer.current = window.setTimeout(enterFitness, INACTIVITY_MS) as unknown as number
  }

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
  }, [open, dragging, isOnline])

  useEffect(() => {
    return () => { if (idleTimer.current != null) clearTimeout(idleTimer.current); clearFitTimers() }
  }, [])

  // Wander
  useEffect(() => {
    if (dragging || open || !isOnline || wolfActive) {
      if (wanderRaf.current != null) { cancelAnimationFrame(wanderRaf.current); wanderRaf.current = null }
      if (wanderTimer.current != null) { clearTimeout(wanderTimer.current); wanderTimer.current = null }
      return
    }
    const pickTarget = () => {
      const margin = WOLF_SIZE + 20
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

  useEffect(() => {
    if (lastInteraction.current !== "wander") return
    const id = setInterval(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch { /* */ }
    }, 1000)
    return () => clearInterval(id)
  }, [pos])

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
  const isTraining = wolfEx === "curl" || wolfEx === "bar"
  const isDrinking = wolfEx === "water"
  const isResting = wolfEx === "rest"
  const breathingClass = !wolfActive ? " is-breathing" : ""

  return (
    <>
      {open && <AiFloatingPanel onClose={closePanel} onExpand={() => navigate("/ai-assistant")} />}

      <button
        ref={buttonRef}
        type="button"
        className={`fitmanager-ai-floating-button${stateClass}${dragging ? " is-dragging" : ""}${wolfActive ? " is-wolf-active" : ""}`}
        style={{ left: pos.x, top: pos.y }}
        aria-label={t("aiAssistant.openAssistant")}
        title={t("aiAssistant.openAssistant")}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <span
          className="fitmanager-ai-wolf-scope"
          style={{ transform: wolfActive ? `scale(${WOLF_SCALE})` : "scale(1)" }}
        >
          {/* Wolf body — PNG (current) or 3D (when wolf.glb available) */}
          <span
            className={`fitmanager-ai-wolf-body${breathingClass}${isTraining ? " is-training" : ""}${isDrinking ? " is-drinking" : ""}${isResting ? " is-resting" : ""}`}
            style={{
              transform: `translate(${headOffset.x}px, ${headOffset.y}px)`,
            }}
          >
            {wolfMode === "3d" && Wolf3DComponent ? (
              <Suspense fallback={null}>
                <Wolf3DComponent ref={wolf3dRef} state={{ phase: wolfActive ? "training" : "normal", exercise: wolfEx, active: wolfActive, bubble: wolfBubble, eyeScale, headOffset, curlReps }} scale={wolfActive ? WOLF_SCALE : 1} size={WOLF_SIZE} />
              </Suspense>
            ) : (
              <img
                src="/assistant/wolf.png"
                alt="Wolf QLF GYM"
                className={`fitmanager-ai-wolf-img${wolfActive ? " is-exercising" : ""}`}
                draggable={false}
              />
            )}
            {/* Eyes overlay — blink via scaleY (PNG only) */}
            {wolfMode !== "3d" && (
              <span
                className="fitmanager-ai-wolf-eyes"
                style={{ transform: `scaleY(${eyeScale}) translate(${headOffset.x * 0.5}px, ${headOffset.y * 0.3}px)` }}
              />
            )}
          </span>

          {/* Dumbbells — visible during training (PNG mode only) */}
          {wolfMode !== "3d" && isTraining && (
            <>
              <span className="fitmanager-ai-wolf-dumbbell fitmanager-ai-wolf-dumbbell--left">
                <span className="fitmanager-ai-db-plate fitmanager-ai-db-plate--dark" />
                <span className="fitmanager-ai-db-shaft" />
                <span className="fitmanager-ai-db-plate fitmanager-ai-db-plate--blue" />
              </span>
              <span className="fitmanager-ai-wolf-dumbbell fitmanager-ai-wolf-dumbbell--right">
                <span className="fitmanager-ai-db-plate fitmanager-ai-db-plate--blue" />
                <span className="fitmanager-ai-db-shaft" />
                <span className="fitmanager-ai-db-plate fitmanager-ai-db-plate--dark" />
              </span>
            </>
          )}

          {/* Shaker — visible during drinking (PNG mode only) */}
          {wolfMode !== "3d" && isDrinking && (
            <span className="fitmanager-ai-wolf-shaker">
              <span className="fitmanager-ai-shaker-lid" />
              <span className="fitmanager-ai-shaker-body" />
            </span>
          )}
        </span>

        {/* Status bubble */}
        {wolfBubble && (
          <span className={`fitmanager-ai-wolf-bubble${wolfActive ? " is-visible" : ""}`}>
            {wolfBubble}
          </span>
        )}
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
              <img src="/assistant/wolf.png" alt="" className="fitmanager-ai-wolf-mini" draggable={false} />
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
    return {
      period: "monthly" as const,
      dateFrom: past.toISOString().slice(0, 10),
      dateTo: today.toISOString().slice(0, 10),
    }
  })
  const data = useAssistantData(orgId, filters)
  return { data, isLoading: data.isLoading }
}

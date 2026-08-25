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

// ===== Mode FITNESS : après 15s d'inactivité le coach s'entraîne (1x → 3x) =====
const FITNESS_IDLE_MS = 15000
const FITNESS_SCALE = 3
const FITNESS_MARGIN = 60
const GROW_MS = 1150
const DRINK_MS = 2400
const REST_MS = 1600

type FitPhase = "normal" | "growing" | "fitness" | "water" | "resting"
type FitExercise = "none" | "curl" | "bar" | "rest" | "water"

interface RobotPos {
  x: number
  y: number
}

function clampPos(p: RobotPos): RobotPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, vw - ROBOT_SIZE)),
    y: Math.min(Math.max(0, p.y), Math.max(0, vh - ROBOT_SIZE)),
  }
}

// En mode fitness le robot est agrandi à 3x (origine centre) : on garde le
// visuel entier dans le viewport pour ne jamais cacher d'éléments d'interface.
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
  } catch {
    /* localStorage indisponible : position par défaut */
  }
  return defaultPos()
}

export function AiFloatingRobot() {
  const t = useT()
  const { isAuthenticated } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { loading, panelOpen: open, togglePanel, closePanel } = useAiChat()
  const [pos, setPos] = useState<RobotPos>(loadPos)
  const [dragging, setDragging] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false })
  const armedRef = useRef(false)
  const latestPos = useRef<RobotPos>({ x: 0, y: 0 })
  const location = useLocation()
  const navigate = useNavigate()

  // Wander (mouvement auto)
  const wanderTarget = useRef<RobotPos | null>(null)
  const wanderRaf = useRef<number | null>(null)
  const wanderTimer = useRef<number | null>(null)
  const lastInteraction = useRef<"mouse" | "wander">("mouse")
  const mouseActive = useRef(false)
  const mouseActiveTimer = useRef<number | null>(null)

  // ===== Mode FITNESS (15s d'inactivité → 3x + exercices) =====
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

  // Ferme le panneau lors d'un changement de module (le robot reste visible)
  useEffect(() => {
    closePanel()
  }, [currentModule, closePanel])

  // Recalcule la position si la fenêtre change (le robot ne sort jamais de l'écran)
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Miroirs de state pour les callbacks fitness (stable, sans re-création)
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { onlineRef.current = isOnline }, [isOnline])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { fitActiveRef.current = fitActive }, [fitActive])

  // ===== Mode FITNESS : machine à états (aucune API, aucun timer global) =====
  const clearFitTimers = () => {
    if (fitPhaseTimer.current != null) { clearTimeout(fitPhaseTimer.current); fitPhaseTimer.current = null }
    if (fitCycleTimer.current != null) { clearTimeout(fitCycleTimer.current); fitCycleTimer.current = null }
    if (fitRaf.current != null) { cancelAnimationFrame(fitRaf.current); fitRaf.current = null }
    fitTarget.current = null
  }

  // Le robot rove dans le viewport (bornes fitness) pendant l'entraînement
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
        const speed = 2.2
        return { x: prev.x + (dx / dist) * speed, y: prev.y + (dy / dist) * speed }
      })
      fitRaf.current = requestAnimationFrame(animate)
    }
    fitRaf.current = requestAnimationFrame(animate)
  }

  // Cycle d'exercices : curl ↔ bar avec une courte pause entre chaque
  const runExerciseCycle = () => {
    if (fitPhase.current !== "fitness") return
    setFitEx((ex) => (ex === "curl" ? "bar" : "curl"))
    fitCycleTimer.current = window.setTimeout(() => {
      setFitEx("rest")
      fitCycleTimer.current = window.setTimeout(runExerciseCycle, 650) as unknown as number
    }, 2400) as unknown as number
  }

  // Retour progressif : eau (2.4s) → repos (1.6s) → taille 1x + retour à la position de départ
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
            const speed = 3
            return { x: prev.x + (dx / dist) * speed, y: prev.y + (dy / dist) * speed }
          })
          if (fitRaf.current != null) fitRaf.current = requestAnimationFrame(animate)
        }
        fitRaf.current = requestAnimationFrame(animate)
      }, REST_MS)
    }, DRINK_MS)
  }

  // Démarre l'entraînement après 15s d'inactivité (gardes en lecture via refs)
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

  // Réarme le minuteur d'inactivité (un seul timer, reset à chaque interaction)
  const rearmIdle = () => {
    if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null }
    idleTimer.current = window.setTimeout(enterFitness, FITNESS_IDLE_MS) as unknown as number
  }

  // Timer d'inactivité + détection d'interaction pour ramener le robot
  useEffect(() => {
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    const clearIdle = () => {
      if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null }
    }
    const canFit = () =>
      !openRef.current && !draggingRef.current && onlineRef.current && !reducedMotion.current && !document.hidden

    const onInteraction = () => {
      if (fitPhase.current !== "normal") { startReturn(); return }
      if (canFit()) rearmIdle()
    }
    const onVisibility = () => {
      if (document.hidden) {
        clearIdle()
      } else {
        if (fitPhase.current !== "normal") startReturn()
        else if (canFit()) rearmIdle()
      }
    }

    if (!canFit()) {
      clearIdle()
      if (fitPhase.current !== "normal" && (openRef.current || !onlineRef.current)) startReturn()
    } else if (fitPhase.current === "normal") {
      rearmIdle()
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dragging, isOnline])

  // Nettoyage complet au démontage
  useEffect(() => {
    return () => {
      if (idleTimer.current != null) clearTimeout(idleTimer.current)
      clearFitTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wander : mouvement auto quand pas de drag, pas de panneau ouvert, en ligne
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
        if (dist < 2) {
          wanderTarget.current = null
          return target
        }
        const speed = 1.2
        const nx = prev.x + (dx / dist) * speed
        const ny = prev.y + (dy / dist) * speed
        return { x: nx, y: ny }
      })
      wanderRaf.current = requestAnimationFrame(animate)
    }

    const scheduleNext = () => {
      if (wanderTimer.current != null) clearTimeout(wanderTimer.current)
      wanderTimer.current = window.setTimeout(pickTarget, 4000 + Math.random() * 4000) as unknown as number
    }

    // Démarrer après un délai
    scheduleNext()

    return () => {
      if (wanderRaf.current != null) { cancelAnimationFrame(wanderRaf.current); wanderRaf.current = null }
      if (wanderTimer.current != null) { clearTimeout(wanderTimer.current); wanderTimer.current = null }
    }
  }, [dragging, open, isOnline, fitActive])

  // Sauvegarde la position pendant le wander
  useEffect(() => {
    if (lastInteraction.current !== "wander") return
    const id = setInterval(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)) } catch { /* */ }
    }, 1000)
    return () => clearInterval(id)
  }, [pos])

  // Suivi souris pour le timer d'inactivité (plus de SVG eyes)
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
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

  const orbState: "idle" | "thinking" | "responding" | "offline" = !isOnline
    ? "offline"
    : loading
      ? "thinking"
      : "idle"

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
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(final))
      } catch {
        /* ignore */
      }
    } else if (armedRef.current) {
      togglePanel()
    }
    armedRef.current = false
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (d.moved) {
      closePanel()
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPos.current))
      } catch {
        /* ignore */
      }
    }
    armedRef.current = false
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const onClick = () => {
    return
  }

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
          <img
            src="/Coach QLF AI.png"
            alt="Coach QLF AI"
            className={`fitmanager-ai-coach-img${fitActive ? " is-exercising" : ""}`}
            draggable={false}
          />
        </span>
      </button>
    </>
  )
}

// Le panneau (lourd : 9 requêtes) n'est monté que lorsqu'il est ouvert.
function AiFloatingPanel({ onClose, onExpand }: { onClose: () => void; onExpand: () => void }) {
  const t = useT()
  const { organization } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { loading } = useAiChat()
  const { data, isLoading } = useLazyAssistantData()

  const orbState: "idle" | "thinking" | "responding" | "offline" = !isOnline
    ? "offline"
    : loading
      ? "thinking"
      : "idle"

  return (
    <div className="fitmanager-ai-panel">
      <Card className="fitmanager-ai-panel__card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="fitmanager-ai-panel__orb-mini">
              <img src="/Coach QLF AI.png" alt="" className="fitmanager-ai-coach-mini" draggable={false} />
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

// Les données assistant (9 queries) ne sont chargées que pour ce panneau.
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

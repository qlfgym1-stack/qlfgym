import { useState, useEffect, useRef, useCallback } from "react"
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

// Machine à états : IDLE → OBSERVE → GRANDIT → TRAINING ; retour : EAU → REPOS → RETOUR
const IDLE_MS = 15000
const OBSERVE_MS = 950
const GROW_MS = 1150
const DRINK_MS = 2400
const REST_MS = 1600
const FITNESS_SCALE = 3
const FITNESS_MARGIN = 60

type RobotPhase = "normal" | "observe" | "growing" | "training" | "water" | "resting" | "shrink"

interface RobotPos { x: number; y: number }

function clampPos(p: RobotPos): RobotPos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, vw - ROBOT_SIZE)),
    y: Math.min(Math.max(0, p.y), Math.max(0, vh - ROBOT_SIZE)),
  }
}

// En mode training le robot est à 3× (origine centre) : on garde le visuel entier
// dans le viewport pour ne jamais cacher d'éléments d'interface.
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
  } catch { /* localStorage indisponible : position par défaut */ }
  return defaultPos()
}

export function AiFloatingRobot() {
  const t = useT()
  const { isAuthenticated } = useAuth()
  const { isOnline } = useNetworkStatus()
  const { loading, panelOpen: open, togglePanel, closePanel } = useAiChat()
  const [pos, setPos] = useState<RobotPos>(loadPos)
  const [dragging, setDragging] = useState(false)
  const [fitActive, setFitActive] = useState(false)
  const [phase, setPhase] = useState<RobotPhase>("normal")
  const buttonRef = useRef<HTMLButtonElement>(null)
  const spinRef = useRef<HTMLSpanElement>(null)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, moved: false })
  const armedRef = useRef(false)
  const latestPos = useRef<RobotPos>({ x: 0, y: 0 })
  const location = useLocation()
  const navigate = useNavigate()

  // Refs de survie aux callbacks (état lisible hors re-render)
  const phaseRef = useRef<RobotPhase>("normal")
  const fitActiveRef = useRef(false)
  const openRef = useRef(open)
  const draggingRef = useRef(dragging)
  const onlineRef = useRef(isOnline)
  const reducedMotion = useRef(false)
  const posRef = useRef<RobotPos>(pos)
  const idleTimer = useRef<number | null>(null)
  const phaseTimer = useRef<number | null>(null)
  const trainRaf = useRef<number | null>(null)
  const homePos = useRef<RobotPos | null>(null)
  const blinkTimer = useRef<number | null>(null)
  const blinkClose = useRef<number | null>(null)
  const canHover = useRef(false)
  const mouseActive = useRef(false)
  const mouseActiveTimer = useRef<number | null>(null)
  const gazeTarget = useRef({ x: 0, y: 0 })
  const gazeRaf = useRef<number | null>(null)
  const suppressClick = useRef(false)

  // État de training : déplacement + rotation (rAF, zéro re-render)
  const trainState = useRef({ target: null as RobotPos | null, rot: 0, rotVel: 0 })

  const currentModule = location.pathname.split("/")[1] || "dashboard"

  // Ferme le panneau lors d'un changement de module (le robot reste visible)
  useEffect(() => { closePanel() }, [currentModule, closePanel])

  // Détection souris fine (désactivée sur mobile / tactile)
  useEffect(() => {
    canHover.current = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false
  }, [])

  // Recalcule la position si la fenêtre change (ne sort jamais de l'écran)
  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Miroirs de state pour les callbacks stable
  useEffect(() => { openRef.current = open }, [open])
  useEffect(() => { draggingRef.current = dragging }, [dragging])
  useEffect(() => { onlineRef.current = isOnline }, [isOnline])
  useEffect(() => { posRef.current = pos }, [pos])
  useEffect(() => { fitActiveRef.current = fitActive }, [fitActive])
  useEffect(() => { phaseRef.current = phase }, [phase])

  // ===== Clignements naturels aléatoires (via CSS var, pas de re-render de pos) =====
  useEffect(() => {
    const schedule = () => {
      blinkTimer.current = window.setTimeout(() => {
        const el = buttonRef.current
        if (el) el.style.setProperty("--eye-blink", "0.1")
        const close = 100 + Math.random() * 120
        blinkClose.current = window.setTimeout(() => {
          if (buttonRef.current) buttonRef.current.style.setProperty("--eye-blink", "1")
          // Double clignement occasionnel pour un rendu vivant
          if (Math.random() < 0.25) {
            blinkTimer.current = window.setTimeout(() => {
              if (buttonRef.current) buttonRef.current.style.setProperty("--eye-blink", "0.1")
              blinkClose.current = window.setTimeout(() => {
                if (buttonRef.current) buttonRef.current.style.setProperty("--eye-blink", "1")
                schedule()
              }, 90)
            }, 160)
          } else {
            schedule()
          }
        }, close)
      }, 3000 + Math.random() * 4000)
    }
    schedule()
    return () => {
      if (blinkTimer.current) window.clearTimeout(blinkTimer.current)
      if (blinkClose.current) window.clearTimeout(blinkClose.current)
    }
  }, [])

  // ===== Yeux qui suivent la souris (CSS vars + transition, fluide) =====
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
    const onMove = (e: PointerEvent) => {
      if (!canHover.current) return
      mouseActive.current = true
      if (mouseActiveTimer.current) window.clearTimeout(mouseActiveTimer.current)
      mouseActiveTimer.current = window.setTimeout(() => { mouseActive.current = false }, 2000)
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      gazeTarget.current = { x: nx * 16, y: ny * 12 }
      buttonRef.current?.classList.remove("gaze-return")
      if (gazeRaf.current == null) gazeRaf.current = requestAnimationFrame(applyGaze)
    }
    const onLeave = () => {
      if (!canHover.current) return
      buttonRef.current?.classList.add("gaze-return")
      gazeTarget.current = { x: 0, y: 0 }
      applyGaze()
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("mouseleave", onLeave)
    return () => {
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("mouseleave", onLeave)
      if (gazeRaf.current != null) cancelAnimationFrame(gazeRaf.current)
      if (mouseActiveTimer.current) window.clearTimeout(mouseActiveTimer.current)
    }
  }, [])

  // ===== Boucle de déplacement + rotation du training (rAF, DOM direct) =====
  function startTrainingMove() {
    if (trainRaf.current != null) cancelAnimationFrame(trainRaf.current)
    const s = trainState.current
    s.target = fitClampPos({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight })
    s.rot = 0
    s.rotVel = 0
    const btn = buttonRef.current
    const startT = performance.now()

    const frame = (now: number) => {
      if (phaseRef.current !== "training") { trainRaf.current = null; return }
      const elapsed = (now - startT) / 1000
      if (!btn) { trainRaf.current = null; return }

      const target = s.target
      if (!target) { trainRaf.current = null; return }

      // Accélération / décélération naturelle (onde lente) + micro-bruit aléatoire
      const baseSpeed = 1.6 + Math.sin(elapsed * 0.45) * 0.8 + Math.sin(elapsed * 1.9) * 0.25
      const px = posRef.current.x
      const py = posRef.current.y
      const dx = target.x - px
      const dy = target.y - py
      const dist = Math.hypot(dx, dy)

      if (dist < 2.5) {
        // Nouvelle cible → changement de direction, rotation qui repart
        s.target = fitClampPos({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight })
        s.rotVel = (Math.random() - 0.5) * 5
      } else {
        const nx = px + (dx / dist) * Math.min(baseSpeed, dist)
        const ny = py + (dy / dist) * Math.min(baseSpeed, dist)
        posRef.current = { x: nx, y: ny }
        btn.style.left = `${nx}px`
        btn.style.top = `${ny}px`
      }

      // Rotation continue (vitesse variable → accélérations/décélérations), jamais répétitive
      s.rotVel += (Math.sin(elapsed * 0.7) * 0.02 - s.rotVel) * 0.02
      s.rot += s.rotVel
      if (spinRef.current) spinRef.current.style.transform = `rotate(${s.rot}deg)`

      trainRaf.current = requestAnimationFrame(frame)
    }
    trainRaf.current = requestAnimationFrame(frame)
  }

  function stopTrainingMove() {
    if (trainRaf.current != null) { cancelAnimationFrame(trainRaf.current); trainRaf.current = null }
    trainState.current.target = null
  }

  // ===== Machine à états =====
  const clearPhaseTimers = useCallback(() => {
    if (phaseTimer.current != null) { clearTimeout(phaseTimer.current); phaseTimer.current = null }
    stopTrainingMove()
  }, [])

  const rearmIdle = useCallback(() => {
    if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null }
    if (phaseRef.current !== "normal") return
    idleTimer.current = window.setTimeout(enterIdleSequence, IDLE_MS) as unknown as number
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // IDLE → OBSERVE → GRANDIT → TRAINING
  function enterIdleSequence() {
    if (fitActiveRef.current) return
    if (openRef.current || draggingRef.current || !onlineRef.current || document.hidden) return
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    if (reducedMotion.current) return
    homePos.current = { ...posRef.current }
    fitPhase("observe")
    phaseTimer.current = window.setTimeout(() => {
      fitPhase("growing")
      setFitActive(true)
      phaseTimer.current = window.setTimeout(() => {
        fitPhase("training")
        startTrainingMove()
      }, GROW_MS)
    }, OBSERVE_MS)
  }

  function fitPhase(p: RobotPhase) {
    phaseRef.current = p
    setPhase(p)
  }

  // Retour utilisateur : stop → bouteille → boit → repose → taille normale → rehome
  const startReturn = useCallback(() => {
    const ph = phaseRef.current
    if (ph !== "training" && ph !== "growing" && ph !== "observe" && ph !== "shrink") return
    clearPhaseTimers()
    stopTrainingMove()
    fitPhase("water")
    phaseTimer.current = window.setTimeout(() => {
      fitPhase("resting")
      phaseTimer.current = window.setTimeout(() => {
        fitPhase("shrink")
        setFitActive(false)
        phaseTimer.current = window.setTimeout(() => {
          fitPhase("normal")
          rearmIdle()
        }, 120)
      }, REST_MS)
    }, DRINK_MS)
  }, [clearPhaseTimers, rearmIdle])

  // À la fin du shrink, ramener vers la position d'origine
  useEffect(() => {
    if (phase !== "shrink") return
    const home = homePos.current
    // Petit glissement fluide vers la position d'origine (CSS transition du bouton)
    setPos((prev) => {
      if (!home) return clampPos(prev)
      return clampPos({ x: home.x, y: home.y })
    })
  }, [phase])

  // Listeners globaux interaction (souris, clic, clavier, touch, scroll)
  useEffect(() => {
    reducedMotion.current = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    const clearIdle = () => { if (idleTimer.current != null) { clearTimeout(idleTimer.current); idleTimer.current = null } }
    const canFit = () => !openRef.current && !draggingRef.current && onlineRef.current && !reducedMotion.current && !document.hidden
    const onInteraction = (e: Event) => {
      const t = e.target as Element | null
      if (t && typeof t.closest === "function" && t.closest(".fitmanager-ai-floating-button")) return
      if (phaseRef.current !== "normal") { startReturn(); return }
      if (canFit()) rearmIdle()
    }
    const onVisibility = () => {
      if (document.hidden) clearIdle()
      else if (phaseRef.current !== "normal") startReturn()
      else if (canFit()) rearmIdle()
    }
    if (!canFit()) { clearIdle(); if (phaseRef.current !== "normal" && (openRef.current || !onlineRef.current)) startReturn() }
    else if (phaseRef.current === "normal") rearmIdle()
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
  }, [startReturn, rearmIdle])

  // Nettoyage complet au démontage
  useEffect(() => {
    return () => {
      if (idleTimer.current != null) clearTimeout(idleTimer.current)
      clearPhaseTimers()
      stopTrainingMove()
    }
  }, [clearPhaseTimers])

  if (!isAuthenticated) return null

  const orbState: "idle" | "thinking" | "responding" | "offline" = !isOnline ? "offline" : loading ? "thinking" : "idle"

  // Drag + toggle via Pointer Events (click ≠ drag)
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    armedRef.current = true
    mouseActive.current = true
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
      posRef.current = next
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (d.moved) {
      suppressClick.current = true
      const final = clampPos({ x: d.startPosX + e.clientX - d.startX, y: d.startPosY + e.clientY - d.startY })
      latestPos.current = final
      setPos(final)
      posRef.current = final
      closePanel()
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(final)) } catch { /* */ }
    } else if (armedRef.current) {
      // Clic pointer : laisser le click synthétique faire le toggle (évite le double appel)
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

  const onClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return }
    togglePanel()
  }

  const phaseClass =
    phase === "observe" ? " is-observing"
    : phase === "growing" ? " is-growing"
    : phase === "training" ? " is-training"
    : phase === "water" ? " is-drinking"
    : phase === "resting" ? " is-resting"
    : phase === "shrink" ? " is-shrinking" : ""
  const stateClass = orbState === "offline" ? " is-offline" : orbState === "thinking" ? " is-thinking" : ""

  return (
    <>
      {open && <AiFloatingPanel onClose={closePanel} onExpand={() => navigate("/ai-assistant")} />}
      <button
        ref={buttonRef}
        type="button"
        className={`fitmanager-ai-floating-button${stateClass}${dragging ? " is-dragging" : ""}${fitActive ? " is-large" : ""}${phaseClass}`}
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
          className="fitmanager-ai-robot-scope"
          style={{ transform: fitActive ? `scale(${FITNESS_SCALE})` : "scale(1)" }}
        >
          <span ref={spinRef} className="fitmanager-ai-robot-spin">
            <AiRobotSvg state={orbState} phase={phase} small={false} />
          </span>
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

  const orbState: "idle" | "thinking" | "responding" | "offline" = !isOnline ? "offline" : loading ? "thinking" : "idle"

  return (
    <div className="fitmanager-ai-panel">
      <Card className="fitmanager-ai-panel__card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="fitmanager-ai-panel__orb-mini">
              <AiRobotSvg state={orbState} phase="normal" small />
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
    return { period: "monthly" as const, dateFrom: past.toISOString().slice(0, 10), dateTo: today.toISOString().slice(0, 10) }
  })
  const data = useAssistantData(orgId, filters)
  return { data, isLoading: data.isLoading }
}

// ===== Robot premium rouge+bleu, fond transparent, SVG natif =====
function AiRobotSvg({ state, phase, small }: { state: "idle" | "thinking" | "responding" | "offline"; phase: RobotPhase; small?: boolean }) {
  const uid = small ? "fitm-ai-s" : "fitm-ai"
  const offline = state === "offline"
  const thinking = state === "thinking"
  const responding = state === "responding"
  const active = thinking || responding
  const training = phase === "training" || phase === "growing"

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
      <g className={`${offline ? "fitmanager-ai-robot--offline" : ""}${training ? " fitmanager-ai-robot__body is-training" : ""}`}>
        {/* Base de vol */}
        <ellipse cx="60" cy="122" rx="28" ry="5" fill={`url(#${uid}-hoverRed)`} className="fitmanager-ai-robot__base-ring" />
        <ellipse cx="60" cy="122" rx="22" ry="3.5" fill="none" stroke="#ef4444" strokeWidth="1.2" opacity="0.7" className="fitmanager-ai-robot__base-ring" />
        <ellipse cx="60" cy="120" rx="18" ry="3" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.6" className="fitmanager-ai-robot__base-ring" />
        <rect x="56" y="113" width="8" height="10" rx="4" fill="rgba(30,30,30,0.7)" stroke="rgba(96,165,250,0.2)" strokeWidth="0.8" />

        {/* Corps glass */}
        <path d="M40 82 Q38 78 42 74 L78 74 Q82 78 80 82 L78 112 Q76 116 60 117 Q44 116 42 112 Z" fill={`url(#${uid}-glass)`} stroke="rgba(147,197,253,0.35)" strokeWidth="1.2" />
        <path d="M44 78 L46 110" stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeLinecap="round" />
        <path d="M74 78 L76 108" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" strokeLinecap="round" />

        {/* Poitrail logo QF GYM */}
        <circle cx="60" cy="93" r="14" fill="#111" stroke={`url(#${uid}-ring)`} strokeWidth="2" />
        <circle cx="60" cy="93" r="11" fill="none" stroke="rgba(239,68,68,0.3)" strokeWidth="0.6" />
        <text x="60" y="91" textAnchor="middle" fill="#3b82f6" fontSize="7" fontWeight="bold" fontFamily="Arial, sans-serif">QF</text>
        <text x="60" y="99" textAnchor="middle" fill="#ef4444" fontSize="5" fontWeight="bold" fontFamily="Arial, sans-serif">GYM</text>

        {/* Antennes */}
        <line x1="42" y1="22" x2="34" y2="6" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="34" cy="5" r="2.8" fill={active ? "#ef4444" : "#7f1d1d"} className="fitmanager-ai-robot__antenna" />
        <circle cx="34" cy="5" r="4" fill="none" stroke="#ef4444" strokeWidth="0.6" opacity={active ? "0.8" : "0.3"} />
        <line x1="78" y1="22" x2="86" y2="6" stroke="#1a1a1a" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="86" cy="5" r="2.8" fill={active ? "#3b82f6" : "#1e3a5f"} className="fitmanager-ai-robot__antenna" />
        <circle cx="86" cy="5" r="4" fill="none" stroke="#3b82f6" strokeWidth="0.6" opacity={active ? "0.8" : "0.3"} />

        {/* Tête glossy */}
        <ellipse cx="60" cy="42" rx="32" ry="28" fill={`url(#${uid}-head)`} stroke="rgba(96,165,250,0.3)" strokeWidth="1" />
        <ellipse cx="52" cy="30" rx="18" ry="10" fill={`url(#${uid}-shine)`} />
        {/* Bandeau néon */}
        <path d="M36 30 Q60 22 84 30" fill="none" stroke="#3b82f6" strokeWidth="1.2" opacity="0.5" />
        <path d="M38 32 Q60 25 82 32" fill="none" stroke="#ef4444" strokeWidth="0.8" opacity="0.4" />

        {/* Oreilles / écouteurs */}
        <circle cx="28" cy="42" r="7" fill="#1a1a1a" stroke="rgba(239,68,68,0.5)" strokeWidth="1.2" />
        <circle cx="28" cy="42" r="4.5" fill="none" stroke="#ef4444" strokeWidth="0.8" opacity="0.6" />
        <circle cx="28" cy="42" r="2" fill="#ef4444" opacity={active ? "0.9" : "0.4"} />
        <circle cx="92" cy="42" r="7" fill="#1a1a1a" stroke="rgba(59,130,246,0.5)" strokeWidth="1.2" />
        <circle cx="92" cy="42" r="4.5" fill="none" stroke="#3b82f6" strokeWidth="0.8" opacity="0.6" />
        <circle cx="92" cy="42" r="2" fill="#3b82f6" opacity={active ? "0.9" : "0.4"} />

        {/* Visière */}
        <rect x="38" y="33" width="44" height="22" rx="11" fill="rgba(0,0,0,0.6)" stroke="rgba(147,197,253,0.2)" strokeWidth="0.8" />

        {/* Yeux : suivent la souris via --eye-x/--eye-y, clignent via --eye-blink */}
        <g className="fitmanager-ai-eyes">
          <circle cx="50" cy="44" r="8" fill={`url(#${uid}-eyeGlow)`} className="fitmanager-ai-robot__eye-glow" />
          <circle cx="70" cy="44" r="8" fill={`url(#${uid}-eyeGlow)`} className="fitmanager-ai-robot__eye-glow" />
          <path d="M43 44 Q50 37 57 44" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" className="fitmanager-ai-robot__eye" />
          <path d="M63 44 Q70 37 77 44" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" className="fitmanager-ai-robot__eye" />
          <circle cx="50" cy="41" r="1.2" fill="#ffffff" className="fitmanager-ai-robot__eye-hl" />
          <circle cx="70" cy="41" r="1.2" fill="#ffffff" className="fitmanager-ai-robot__eye-hl" />
        </g>

        {/* Petit sourire */}
        <path d="M55 50 Q60 54 65 50" fill="none" stroke="#60a5fa" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />

        {/* Main gauche (bras) */}
        <g transform="translate(18, 78)">
          <g className="fitmanager-ai-robot__arm-swing-l">
            <rect x="0" y="4" width="10" height="12" rx="3" fill="rgba(30,30,30,0.8)" stroke="rgba(96,165,250,0.25)" strokeWidth="0.8" />
            <rect x="2" y="-2" width="4" height="8" rx="2" fill="rgba(30,30,30,0.9)" stroke="rgba(96,165,250,0.3)" strokeWidth="0.6" transform="rotate(-15 4 4)" />
            <rect x="0" y="14" width="3" height="6" rx="1.5" fill="rgba(30,30,30,0.7)" />
            <rect x="3.5" y="14" width="3" height="6" rx="1.5" fill="rgba(30,30,30,0.7)" />
            <rect x="7" y="14" width="3" height="5" rx="1.5" fill="rgba(30,30,30,0.7)" />
          </g>
        </g>

        {/* Main droite (bulle) */}
        <g transform="translate(88, 76)">
          <g className="fitmanager-ai-robot__arm-swing-r">
            <rect x="-2" y="6" width="6" height="10" rx="3" fill="rgba(30,30,30,0.7)" stroke="rgba(96,165,250,0.2)" strokeWidth="0.6" />
            <circle cx="4" cy="0" r="7" fill="rgba(0,0,0,0.5)" stroke="rgba(239,68,68,0.4)" strokeWidth="0.8" />
            <path d="M1 -2 Q0 -4 2 -4 Q4 -4 3 -2" fill="none" stroke="#ef4444" strokeWidth="0.7" opacity="0.8" />
            <path d="M5 -2 Q4 -4 6 -4 Q8 -4 7 -2" fill="none" stroke="#3b82f6" strokeWidth="0.7" opacity="0.8" />
            <line x1="4" y1="-4" x2="4" y2="2" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
          </g>
        </g>

        {/* Bouteille d'eau pendant la phase "boire" */}
        {phase === "water" && (
          <g transform="translate(70, 44)">
            <g className="fitmanager-ai-robot__bottle">
              <rect x="-4" y="-2" width="10" height="14" rx="3" fill="rgba(147,197,253,0.55)" stroke="rgba(147,197,253,0.8)" strokeWidth="0.8" transform="rotate(16)" />
              <rect x="-4" y="-2" width="4" height="14" rx="2" fill="rgba(255,255,255,0.25)" transform="rotate(16)" />
              <rect x="0" y="-6" width="3" height="4" rx="1" fill="#60a5fa" transform="rotate(16)" />
            </g>
          </g>
        )}
      </g>
    </svg>
  )
}
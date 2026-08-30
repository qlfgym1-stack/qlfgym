import { useMemo, useEffect, useRef, useState, useCallback } from "react"
import { useAuth } from "@/stores/auth"
import { useT } from "@/i18n"
import { useAiChat } from "@/stores/ai-chat"
import { ChatSection } from "@/pages/ai-assistant/components/chat-section"
import { useAssistantData } from "@/pages/ai-assistant/hooks/useAssistantData"
import { Sparkles, X, RotateCcw } from "lucide-react"
import { format, subDays } from "date-fns"
import type { AssistantFilters } from "@/pages/ai-assistant/hooks/types"

const ROBOT_SIZE = 64
const STORAGE_KEY = "qlf-robot-pos"
const DRAG_THRESHOLD = 5
const EYE_MAX = 4
const PANEL_W = 352
const PANEL_H = 460

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function loadHome(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      if (typeof p?.x === "number" && typeof p?.y === "number") return { x: p.x, y: p.y }
    }
  } catch {
    /* ignore */
  }
  return { x: Math.max(0, window.innerWidth - ROBOT_SIZE - 24), y: Math.max(0, window.innerHeight - ROBOT_SIZE - 40) }
}

/** Fenêtre IA flottante — réutilise le moteur existant (AiChatStore + ChatSection) */
function RobotChatWindow({
  left,
  top,
  onClose,
}: {
  left: number
  top: number
  onClose: () => void
}) {
  const t = useT()
  const { organization } = useAuth()
  const orgId = organization?.id
  const { reset } = useAiChat()

  const filters = useMemo<AssistantFilters>(
    () => ({
      period: "monthly",
      dateFrom: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      dateTo: format(new Date(), "yyyy-MM-dd"),
    }),
    []
  )

  const data = useAssistantData(orgId, filters)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="qlf-panel"
      style={{ left, top }}
      role="dialog"
      aria-label="Assistant IA QLF"
    >
      <header className="qlf-panel-head">
        <div className="qlf-panel-title">
          <Sparkles className="h-4 w-4" />
          <span>{t("aiAssistant.chatTitle")}</span>
        </div>
        <div className="qlf-panel-actions">
          <button className="qlf-panel-btn" onClick={reset} title={t("aiAssistant.chatReset")} aria-label={t("aiAssistant.chatReset")}>
            <RotateCcw className="h-4 w-4" />
          </button>
          <button className="qlf-panel-btn" onClick={onClose} title={t("aiAssistant.chatClose")} aria-label={t("aiAssistant.chatClose")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="qlf-panel-body">
        {data.isLoading ? (
          <div className="qlf-panel-loading">
            <span className="qlf-panel-dot" />
            <span className="qlf-panel-dot" />
            <span className="qlf-panel-dot" />
          </div>
        ) : (
          <ChatSection data={data} t={t} embedded />
        )}
      </div>
    </div>
  )
}

export function AiFloatingRobot() {
  const wrapRef = useRef<HTMLDivElement>(null)

  const [chatOpen, setChatOpen] = useState(false)
  const [panelPos, setPanelPos] = useState({ left: 0, top: 0 })

  const homeRef = useRef(loadHome())
  const pos = useRef({ x: homeRef.current.x, y: homeRef.current.y })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const didDrag = useRef(false)

  /** Empêche le clignotement/le suivi pendant que la fenêtre IA est ouverte */
  const chatOpenRef = useRef(false)

  const eyeTarget = useRef({ x: 0, y: 0 })
  const eyeCurL = useRef({ x: 0, y: 0 })
  const eyeCurR = useRef({ x: 0, y: 0 })

  const timers = useRef<number[]>([])
  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id)
      fn()
    }, ms)
    timers.current.push(id)
  }, [])

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  const setPos = useCallback((x: number, y: number) => {
    const el = wrapRef.current
    if (el) {
      pos.current.x = x
      pos.current.y = y
      el.style.setProperty("--qx", `${Math.round(x)}px`)
      el.style.setProperty("--qy", `${Math.round(y)}px`)
    }
  }, [])

  /** Clic → fenêtre IA flottante (pas de navigation) */
  const openAssistant = useCallback(() => {
    const px = clamp(pos.current.x, 0, Math.max(0, window.innerWidth - ROBOT_SIZE))
    const py = clamp(pos.current.y, 0, Math.max(0, window.innerHeight - ROBOT_SIZE))
    let left = px - PANEL_W - 14
    if (left < 8) left = px + ROBOT_SIZE + 14
    let top = py - PANEL_H + 120
    top = clamp(top, 8, Math.max(8, window.innerHeight - PANEL_H - 8))
    setPanelPos({ left: clamp(left, 8, Math.max(8, window.innerWidth - PANEL_W - 8)), top })
    setChatOpen((o) => !o)
  }, [])

  /** Boucle unique : yeux (suivi + inertie + micro) + clignement */
  useEffect(() => {
    let raf = 0
    let blinkAt = Date.now() + rand(2600, 6200)

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const el = wrapRef.current
      if (!el) return

      // Yeux : convergence vers la souris + micro-saccades douces
      const lookL = { x: eyeTarget.current.x, y: eyeTarget.current.y }
      const lookR = { x: eyeTarget.current.x, y: eyeTarget.current.y }
      lookL.x += Math.sin(now / 4700 + 0.6) * 0.6
      lookL.y += Math.cos(now / 6100 + 1.1) * 0.5
      lookR.x += Math.sin(now / 5300 + 1.8) * 0.6
      lookR.y += Math.cos(now / 5900 + 2.4) * 0.5

      const elL = eyeCurL.current
      const elR = eyeCurR.current
      elL.x += (lookL.x - elL.x) * 0.14
      elL.y += (lookL.y - elL.y) * 0.14
      elR.x += (lookR.x - elR.x) * 0.14
      elR.y += (lookR.y - elR.y) * 0.14
      el.style.setProperty("--eye-lx", `${clamp(elL.x, -EYE_MAX, EYE_MAX).toFixed(2)}px`)
      el.style.setProperty("--eye-ly", `${clamp(elL.y, -EYE_MAX, EYE_MAX).toFixed(2)}px`)
      el.style.setProperty("--eye-rx", `${clamp(elR.x, -EYE_MAX, EYE_MAX).toFixed(2)}px`)
      el.style.setProperty("--eye-ry", `${clamp(elR.y, -EYE_MAX, EYE_MAX).toFixed(2)}px`)

      // Clignement occasionnel
      if (now >= blinkAt) {
        blinkAt = now + rand(3200, 7200)
        el.classList.remove("qlf-blink")
        void el.offsetWidth
        el.classList.add("qlf-blink")
        later(() => el.classList.remove("qlf-blink"), 160)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - (pos.current.x + ROBOT_SIZE / 2)
      const dy = e.clientY - (pos.current.y + ROBOT_SIZE / 2)
      const dist = Math.hypot(dx, dy) || 1
      const maxDist = Math.hypot(window.innerWidth, window.innerHeight) / 2
      const norm = Math.min(1, dist / maxDist)
      eyeTarget.current.x = (dx / dist) * norm * EYE_MAX
      eyeTarget.current.y = (dy / dist) * norm * EYE_MAX
    }

    window.addEventListener("pointermove", onPointerMove)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onPointerMove)
    }
  }, [later])

  /** Drag souris + tactile + position persistée + clic = fenêtre IA */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const onPointerDown = (e: PointerEvent) => {
      dragging.current = true
      didDrag.current = false
      dragStart.current = { x: e.clientX, y: e.clientY }
      el.setPointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      if (!didDrag.current && Math.hypot(dx, dy) >= DRAG_THRESHOLD) didDrag.current = true
      if (didDrag.current) {
        setPos(
          clamp(pos.current.x + dx, 0, window.innerWidth - ROBOT_SIZE),
          clamp(pos.current.y + dy, 0, window.innerHeight - ROBOT_SIZE)
        )
        dragStart.current = { x: e.clientX, y: e.clientY }
      }
    }
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging.current) return
      dragging.current = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (!didDrag.current) {
        openAssistant()
      } else {
        homeRef.current = { ...pos.current }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(homeRef.current))
        } catch {
          /* ignore */
        }
      }
    }

    el.addEventListener("pointerdown", onPointerDown)
    el.addEventListener("pointermove", onPointerMove)
    el.addEventListener("pointerup", onPointerUp)
    el.addEventListener("pointercancel", onPointerUp)
    return () => {
      el.removeEventListener("pointerdown", onPointerDown)
      el.removeEventListener("pointermove", onPointerMove)
      el.removeEventListener("pointerup", onPointerUp)
      el.removeEventListener("pointercancel", onPointerUp)
    }
  }, [openAssistant, setPos])

  /** Rendu de la fenêtre IA flottante dans le layout global (persistante à la navigation) */
  const chatWindow = chatOpen ? <RobotChatWindow left={panelPos.left} top={panelPos.top} onClose={() => setChatOpen(false)} /> : null

  useEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        openAssistant()
      }
    },
    [openAssistant]
  )

  const robotClass = `qlf-robot${chatOpen ? " is-chatting" : ""}`

  return (
    <>
      <div
        ref={wrapRef}
        role="button"
        tabIndex={0}
        aria-label="Assistant IA QLF"
        title="Assistant IA QLF"
        onKeyDown={handleKey}
        className={robotClass}
        style={
          {
            "--qx": `${pos.current.x}px`,
            "--qy": `${pos.current.y}px`,
            "--eye-lx": "0px",
            "--eye-ly": "0px",
            "--eye-rx": "0px",
            "--eye-ry": "0px",
          } as React.CSSProperties
        }
      >
        <div className="qlf-scope">
          <div className="qlf-breathe">
            <svg className="qlf-svg" viewBox="0 0 116 156" fill="none" aria-hidden="true">
              <defs>
                {/* ===== MATÉRIAUX : acier bleu nuit + bleu électrique ===== */}
                <linearGradient id="qlfArmor" x1="58" y1="0" x2="58" y2="156" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#3b6ef0" />
                  <stop offset="18%" stopColor="#2a55cc" />
                  <stop offset="50%" stopColor="#1c3d9e" />
                  <stop offset="82%" stopColor="#122b73" />
                  <stop offset="100%" stopColor="#0b1c4d" />
                </linearGradient>
                <linearGradient id="qlfArmorDark" x1="58" y1="0" x2="58" y2="156" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#193a8c" />
                  <stop offset="50%" stopColor="#102552" />
                  <stop offset="100%" stopColor="#08153a" />
                </linearGradient>
                <linearGradient id="qlfMetal" x1="0" y1="0" x2="116" y2="156" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#eaf2ff" />
                  <stop offset="45%" stopColor="#9db8ef" />
                  <stop offset="100%" stopColor="#58709f" />
                </linearGradient>
                <linearGradient id="qlfHighlight" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                  <stop offset="55%" stopColor="#ffffff" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="qlfCore" cx="0.42" cy="0.34" r="0.85">
                  <stop offset="0%" stopColor="#f4fbff" />
                  <stop offset="40%" stopColor="#9fd4ff" />
                  <stop offset="75%" stopColor="#3a86ff" />
                  <stop offset="100%" stopColor="#1745b8" />
                </radialGradient>
                <radialGradient id="qlfCoreHalo" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor="#7cc0ff" stopOpacity="0.85" />
                  <stop offset="55%" stopColor="#3a86ff" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0f2a6e" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="qlfEye" cx="0.38" cy="0.3" r="0.85">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#d6f2ff" />
                  <stop offset="100%" stopColor="#2596ea" />
                </radialGradient>
                <linearGradient id="qlfVisor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06112b" />
                  <stop offset="100%" stopColor="#0b1c3d" />
                </linearGradient>
                <linearGradient id="qlfLogo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="100%" stopColor="#bcd9ff" />
                </linearGradient>
                <radialGradient id="qlfFire" cx="0.5" cy="0.6" r="0.6">
                  <stop offset="0%" stopColor="#e8fbff" />
                  <stop offset="35%" stopColor="#7ae0ff" />
                  <stop offset="70%" stopColor="#2f8ef2" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#1d5fc9" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="qlfShadow" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0%" stopColor="#020a20" stopOpacity="0.5" />
                  <stop offset="70%" stopColor="#020a20" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#020a20" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* ===== OMNI / SOL : ombre douce + lueur cyan statique ===== */}
              <ellipse className="qlf-shadow" cx="58" cy="151" rx="30" ry="6" fill="url(#qlfShadow)" />
              <ellipse className="qlf-fire-glow" cx="58" cy="150" rx="26" ry="8" fill="url(#qlfFire)" />

              {/* ===== JAMBES ===== */}
              {/* Hanche */}
              <rect x="44" y="99" width="28" height="11" rx="5.5" fill="url(#qlfArmorDark)" stroke="#2b55c0" strokeOpacity="0.6" strokeWidth="0.8" />
              <line x1="51" y1="101" x2="51" y2="108" stroke="#4ad0ff" strokeOpacity="0.6" strokeWidth="1" />
              <line x1="65" y1="101" x2="65" y2="108" stroke="#4ad0ff" strokeOpacity="0.6" strokeWidth="1" />
              {/* L cuisse */}
              <rect x="49" y="105" width="11" height="17" rx="5" fill="url(#qlfArmor)" />
              <rect x="49" y="105" width="11" height="9" rx="4" fill="url(#qlfHighlight)" />
              {/* L genou */}
              <circle cx="54.5" cy="122" r="5" fill="url(#qlfMetal)" />
              <circle cx="52.8" cy="120.2" r="1.4" fill="#ffffff" opacity="0.7" />
              {/* L mollet */}
              <rect x="50" y="123" width="10" height="16" rx="4" fill="url(#qlfArmorDark)" />
              <rect x="50" y="123" width="10" height="7" rx="3.5" fill="url(#qlfHighlight)" opacity="0.5" />
              {/* L botte */}
              <path d="M48 138 h15 v6 a3 3 0 0 1 -3 3 h-9 a3 3 0 0 1 -3 -3 z" fill="url(#qlfArmor)" />
              <line x1="49" y1="146" x2="62" y2="146" stroke="#0a1738" strokeWidth="1" />
              <line x1="49" y1="146" x2="62" y2="146" stroke="#59e0ff" strokeOpacity="0.55" strokeWidth="0.6" />

              {/* R cuisse */}
              <rect x="66" y="105" width="11" height="17" rx="5" fill="url(#qlfArmor)" />
              <rect x="66" y="105" width="11" height="9" rx="4" fill="url(#qlfHighlight)" />
              {/* R genou */}
              <circle cx="71.5" cy="122" r="5" fill="url(#qlfMetal)" />
              <circle cx="69.8" cy="120.2" r="1.4" fill="#ffffff" opacity="0.7" />
              {/* R mollet */}
              <rect x="66" y="123" width="10" height="16" rx="4" fill="url(#qlfArmorDark)" />
              <rect x="66" y="123" width="10" height="7" rx="3.5" fill="url(#qlfHighlight)" opacity="0.5" />
              {/* R botte */}
              <path d="M63 138 h15 v6 a3 3 0 0 1 -3 3 h-9 a3 3 0 0 1 -3 -3 z" fill="url(#qlfArmor)" />
              <line x1="64" y1="146" x2="77" y2="146" stroke="#0a1738" strokeWidth="1" />

              {/* ===== BRAS ===== */}
              {/* L épaule + bras */}
              <circle cx="34" cy="75" r="8.5" fill="url(#qlfMetal)" />
              <circle cx="34" cy="75" r="6" fill="url(#qlfArmorDark)" />
              <rect x="27" y="80" width="12" height="20" rx="5" fill="url(#qlfArmor)" />
              <rect x="27" y="80" width="12" height="10" rx="4" fill="url(#qlfHighlight)" />
              <circle cx="33" cy="101" r="4.5" fill="url(#qlfMetal)" />
              <rect x="26" y="100" width="13" height="21" rx="5" fill="url(#qlfArmorDark)" />
              <rect x="26" y="100" width="13" height="9" rx="4" fill="url(#qlfHighlight)" opacity="0.45" />
              <rect x="28" y="119" width="9" height="9" rx="3" fill="url(#qlfArmor)" />
              {/* R épaule + bras */}
              <circle cx="82" cy="75" r="8.5" fill="url(#qlfMetal)" />
              <circle cx="82" cy="75" r="6" fill="url(#qlfArmorDark)" />
              <rect x="77" y="80" width="12" height="20" rx="5" fill="url(#qlfArmor)" />
              <rect x="77" y="80" width="12" height="10" rx="4" fill="url(#qlfHighlight)" />
              <circle cx="83" cy="101" r="4.5" fill="url(#qlfMetal)" />
              <rect x="77" y="100" width="13" height="21" rx="5" fill="url(#qlfArmorDark)" />
              <rect x="77" y="100" width="13" height="9" rx="4" fill="url(#qlfHighlight)" opacity="0.45" />
              <rect x="79" y="119" width="9" height="9" rx="3" fill="url(#qlfArmor)" />

              {/* ===== TORSE ===== */}
              {/* Épaulières inclinées */}
              <path d="M33 66 Q38 60 46 62 L45 77 Q36 80 31 73 Z" fill="url(#qlfArmorDark)" stroke="#3a63d0" strokeOpacity="0.7" strokeWidth="0.8" />
              <path d="M83 66 Q78 60 70 62 L71 77 Q80 80 85 73 Z" fill="url(#qlfArmorDark)" stroke="#3a63d0" strokeOpacity="0.7" strokeWidth="0.8" />
              <line x1="36" y1="66" x2="35" y2="75" stroke="#57d8ff" strokeOpacity="0.6" strokeWidth="1" />
              <line x1="80" y1="66" x2="81" y2="75" stroke="#57d8ff" strokeOpacity="0.6" strokeWidth="1" />
              {/* Plastron */}
              <rect x="39.5" y="62" width="37" height="42" rx="17" fill="url(#qlfArmor)" />
              {/* reflet premium */}
              <path d="M45.5 70 Q55 61 68 62 Q76 63 78 72 L77 76 Q58 66 46 78 Z" fill="url(#qlfHighlight)" />
              <rect x="39.5" y="62" width="37" height="42" rx="17" stroke="#6b8ff2" strokeOpacity="0.45" strokeWidth="0.9" />
              {/* Ceinture / ventre */}
              <rect x="42" y="96" width="32" height="8" rx="4" fill="url(#qlfArmorDark)" />
              <line x1="46" y1="98" x2="46" y2="102" stroke="#4ad0ff" strokeOpacity="0.5" strokeWidth="0.8" />
              <line x1="70" y1="98" x2="70" y2="102" stroke="#4ad0ff" strokeOpacity="0.5" strokeWidth="0.8" />
              {/* ouïes latérales L */}
              <rect x="40" y="73" width="4" height="13" rx="2" fill="url(#qlfArmorDark)" />
              <line x1="42" y1="75" x2="42" y2="84" stroke="#3fd0f5" strokeOpacity="0.65" strokeWidth="0.8" />
              <rect x="72" y="73" width="4" height="13" rx="2" fill="url(#qlfArmorDark)" />
              <line x1="74" y1="75" x2="74" y2="84" stroke="#3fd0f5" strokeOpacity="0.65" strokeWidth="0.8" />

              {/* ===== CŒUR / LOGO QLF ===== */}
              <circle className="qlf-glow" cx="58" cy="80" r="20" fill="url(#qlfCoreHalo)" />
              <circle className="qlf-rim" cx="58" cy="80" r="12.5" fill="url(#qlfArmorDark)" stroke="url(#qlfMetal)" strokeWidth="1.3" />
              <circle className="qlf-core" cx="58" cy="80" r="9.6" fill="url(#qlfCore)" />
              <text
                x="58"
                y="83.8"
                textAnchor="middle"
                fontFamily="'Segoe UI', system-ui, sans-serif"
                fontWeight="800"
                fontSize="7.6"
                fill="url(#qlfLogo)"
                letterSpacing="0.4"
              >
                QLF
              </text>

              {/* ===== COU ===== */}
              <rect x="53" y="60" width="10" height="7" rx="3" fill="url(#qlfArmorDark)" />
              <line x1="53" y1="62.5" x2="63" y2="62.5" stroke="#3a63d0" strokeOpacity="0.7" strokeWidth="0.8" />

              {/* ===== TÊTE ===== */}
              <g className="qlf-head">
                {/* Crâne */}
                <rect x="37" y="15" width="42" height="47" rx="18" fill="url(#qlfArmor)" />
                <rect x="37" y="15" width="42" height="47" rx="18" stroke="#6b8ff2" strokeOpacity="0.5" strokeWidth="0.9" />
                {/* reflet crâne */}
                <path d="M43 25 Q53 15 66 16 Q74 17 77 26 L76 30 Q60 21 44 30 Z" fill="url(#qlfHighlight)" />
                {/* aileron crête */}
                <path d="M53 17 L58 4 L63 17 Z" fill="url(#qlfArmorDark)" stroke="#3a63d0" strokeOpacity="0.7" strokeWidth="0.8" />
                <circle className="qlf-antenna" cx="58" cy="4" r="2.6" fill="#9fe7ff" />
                {/* pods latéraux */}
                <rect x="31" y="30" width="6" height="17" rx="3" fill="url(#qlfArmorDark)" />
                <line x1="34" y1="33" x2="34" y2="44" stroke="#4ad0ff" strokeOpacity="0.7" strokeWidth="1" />
                <rect x="79" y="30" width="6" height="17" rx="3" fill="url(#qlfArmorDark)" />
                <line x1="82" y1="33" x2="82" y2="44" stroke="#4ad0ff" strokeOpacity="0.7" strokeWidth="1" />

                {/* Visière */}
                <rect className="qlf-visor" x="40" y="25" width="36" height="14" rx="7" fill="url(#qlfVisor)" />
                <path d="M43 27.5 Q 58 24 73 27.5 L 74 30 Q 58 26.5 42 31 Z" fill="#a8e4ff" opacity="0.25" />

                {/* Yeux : pupilles indépendantes avec inertie (suivi souris) */}
                <g className="qlf-eye-l">
                  <circle cx="50" cy="32" r="4.4" fill="#0a1a3d" />
                  <circle className="qlf-iris qlf-iris-l" cx="50" cy="32" r="3.4" fill="url(#qlfEye)" />
                  <circle cx="48.7" cy="30.7" r="1.1" fill="#ffffff" opacity="0.9" />
                </g>
                <g className="qlf-eye-r">
                  <circle cx="66" cy="32" r="4.4" fill="#0a1a3d" />
                  <circle className="qlf-iris qlf-iris-r" cx="66" cy="32" r="3.4" fill="url(#qlfEye)" />
                  <circle cx="64.7" cy="30.7" r="1.1" fill="#ffffff" opacity="0.9" />
                </g>
                {/* sourcil lumineux */}
                <path d="M45 22 Q50 20 55 21" stroke="#7ad8ff" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
                <path d="M61 21 Q66 20 71 22" stroke="#7ad8ff" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
                {/* menton / bouche lueur discrète */}
                <path d="M52 47 Q58 50 64 47" stroke="#3fd0f5" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                {/* mâchoire */}
                <rect x="46" y="49" width="24" height="6" rx="3" fill="url(#qlfArmorDark)" opacity="0.7" />
              </g>

              {/* ===== FLAMME PROCHE : lueur statique élégante sous les bottes ===== */}
              <g className="qlf-fire">
                <ellipse className="qlf-fan" cx="54.5" cy="148" rx="4.5" ry="5" fill="#7ae0ff" opacity="0.5" />
                <ellipse className="qlf-fan" cx="71.5" cy="148" rx="4.5" ry="5" fill="#7ae0ff" opacity="0.5" />
                <circle className="qlf-spark" cx="49" cy="143" r="1.1" fill="#c9f4ff" />
                <circle className="qlf-spark" cx="68" cy="141" r="0.9" fill="#c9f4ff" />
                <circle className="qlf-spark" cx="76" cy="144" r="1.1" fill="#d9f7ff" />
                <circle className="qlf-spark" cx="57" cy="145" r="0.9" fill="#bff0ff" />
              </g>
            </svg>
          </div>
        </div>
      </div>
      {chatWindow}
    </>
  )
}
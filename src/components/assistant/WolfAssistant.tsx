import { useState, useEffect, lazy, Suspense } from "react"
import type { Wolf3DAdapter, WolfMode } from "./types"
import { WOLF_CONSTANTS } from "./types"

// Lazy-load 3D only if wolf.glb exists
const Wolf3DRenderer = lazy(() =>
  import("./Wolf3D").then((m) => ({ default: m.Wolf3DRenderer }))
)

// Check if wolf.glb is available (cached)
let glbAvailable: boolean | null = null
async function checkGlb(): Promise<boolean> {
  if (glbAvailable !== null) return glbAvailable
  try {
    const resp = await fetch(WOLF_CONSTANTS.GLB_PATH, { method: "HEAD" })
    glbAvailable = resp.ok
  } catch {
    glbAvailable = false
  }
  return glbAvailable
}

export function useWolfMode() {
  const [mode, setMode] = useState<WolfMode>("png")

  useEffect(() => {
    checkGlb().then((hasGlb) => {
      if (hasGlb) setMode("3d")
    })
  }, [])

  return mode
}

// Placeholder: when wolf.glb is dropped into /public/assistant/, the system auto-switches
// To force PNG mode: setWolfMode("png") or remove wolf.glb
export function WolfModeIndicator({ mode }: { mode: WolfMode }) {
  if (mode === "png") return null
  return (
    <span
      style={{
        position: "absolute",
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#22c55e",
        border: "1.5px solid #fff",
        zIndex: 10,
        pointerEvents: "none",
      }}
      title="Mode 3D actif"
    />
  )
}

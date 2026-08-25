// Shared types for Wolf Assistant — PNG and 3D

export type WolfPhase = "normal" | "growing" | "training" | "drinking" | "resting"
export type WolfExercise = "none" | "curl" | "bar" | "rest" | "water"
export type WolfMode = "png" | "3d"

export interface WolfPos { x: number; y: number }

export interface WolfStateMachine {
  phase: WolfPhase
  exercise: WolfExercise
  active: boolean
  bubble: string | null
  eyeScale: number
  headOffset: { x: number; y: number }
  curlReps: number
}

// What the wolf renderer (PNG or 3D) receives
export interface WolfRendererProps {
  state: WolfStateMachine
  scale: number
  size: number
}

// 3D adapter interface — implemented by Wolf3D
export interface Wolf3DAdapter {
  loadWolf: () => Promise<void>
  playAnimation: (name: string, duration?: number) => void
  stopAnimation: (name: string) => void
  crossFadeAnimation: (from: string, to: string, duration: number) => void
  setLookAt: (x: number, y: number) => void
  setScale: (scale: number) => void
  setPosition: (x: number, y: number, z: number) => void
  dispose: () => void
}

// Animation clip names expected in wolf.glb
export const WOLF_3D_ANIMATIONS = {
  IDLE: "Idle",
  BLINK: "Blink",
  LOOK: "Look",
  BREATHING: "Breathing",
  BICEP_CURL: "BicepCurl",
  DRINK: "Drink",
  REST: "Rest",
} as const

// Bone names expected in wolf.glb skeleton
export const WOLF_3D_BONES = {
  HEAD: "head",
  SPINE: "spine",
  UPPER_ARM_L: "upperArm.L",
  FOREARM_L: "forearm.L",
  HAND_L: "hand.L",
  UPPER_ARM_R: "upperArm.R",
  FOREARM_R: "forearm.R",
  HAND_R: "hand.R",
} as const

// Constants shared between PNG and 3D
export const WOLF_CONSTANTS = {
  SIZE: 56,
  SCALE: 3,
  MARGIN: 60,
  INACTIVITY_MS: 15000,
  GROW_MS: 1150,
  DRINK_MS: 2400,
  REST_MS: 1600,
  CURL_DURATION: 1600,
  REST_DURATION: 800,
  STORAGE_KEY: "fitmanager-ai-wolf-pos",
  GLB_PATH: "/assistant/wolf.glb",
} as const

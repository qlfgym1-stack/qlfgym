import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react"
import type { Wolf3DAdapter, WolfStateMachine } from "./types"
import { WOLF_3D_ANIMATIONS, WOLF_CONSTANTS } from "./types"

// Dynamic import — three.js only loads when wolf.glb exists
let THREEModule: typeof import("three") | null = null
let GLTFLoaderModule: typeof import("three/addons/loaders/GLTFLoader.js") | null = null

async function loadThreeDeps() {
  if (!THREEModule) {
    THREEModule = await import("three")
    GLTFLoaderModule = await import("three/addons/loaders/GLTFLoader.js")
  }
  return { THREE: THREEModule, GLTFLoader: GLTFLoaderModule!.GLTFLoader }
}

interface Wolf3DRendererProps {
  state: WolfStateMachine
  scale: number
  size: number
}

export const Wolf3DRenderer = forwardRef<Wolf3DAdapter, Wolf3DRendererProps>(
  function Wolf3DRenderer(_props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const sceneRef = useRef<any>(null)
    const mixerRef = useRef<any>(null)
    const cameraRef = useRef<any>(null)
    const rendererRef = useRef<any>(null)
    const modelRef = useRef<any>(null)
    const animationsRef = useRef<Map<string, any>>(new Map())
    const rafRef = useRef<number | null>(null)
    const lastTimeRef = useRef(0)

    const animate = useCallback((time: number) => {
      if (!mixerRef.current) { rafRef.current = requestAnimationFrame(animate); return }
      const delta = (time - lastTimeRef.current) / 1000
      lastTimeRef.current = time
      mixerRef.current.update(delta)
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
      rafRef.current = requestAnimationFrame(animate)
    }, [])

    const loadWolf = useCallback(async () => {
      const { THREE, GLTFLoader } = await loadThreeDeps()
      if (!canvasRef.current) return

      // Scene
      const scene = new THREE.Scene()
      sceneRef.current = scene

      // Camera
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
      camera.position.set(0, 1.2, 3)
      camera.lookAt(0, 0.8, 0)
      cameraRef.current = camera

      // Renderer
      const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(WOLF_CONSTANTS.SIZE, WOLF_CONSTANTS.SIZE)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      rendererRef.current = renderer

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
      scene.add(ambientLight)
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
      dirLight.position.set(2, 3, 2)
      scene.add(dirLight)

      // Load model
      const loader = new GLTFLoader()
      try {
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(WOLF_CONSTANTS.GLB_PATH, resolve, undefined, reject)
        })
        const model = gltf.scene
        model.scale.set(1, 1, 1)
        scene.add(model)
        modelRef.current = model

        // Animation mixer
        const mixer = new THREE.AnimationMixer(model)
        mixerRef.current = mixer

        // Store animation clips by name
        if (gltf.animations) {
          for (const clip of gltf.animations) {
            animationsRef.current.set(clip.name, clip)
          }
        }

        // Start render loop
        lastTimeRef.current = performance.now()
        rafRef.current = requestAnimationFrame(animate)
      } catch {
        // wolf.glb not available — modelRef stays null, fallback triggers
        console.info("[Wolf3D] wolf.glb not found, will fallback to PNG")
      }
    }, [animate])

    // Adapter interface
    const playAnimation = useCallback((name: string, duration?: number) => {
      if (!mixerRef.current || !animationsRef.current.has(name)) return
      const clip = animationsRef.current.get(name)
      const action = mixerRef.current.clipAction(clip)
      if (duration !== undefined) action.setDuration(duration)
      action.reset().play()
    }, [])

    const stopAnimation = useCallback((name: string) => {
      if (!mixerRef.current || !animationsRef.current.has(name)) return
      const clip = animationsRef.current.get(name)
      const action = mixerRef.current.existingAction(clip)
      if (action) action.stop()
    }, [])

    const crossFadeAnimation = useCallback((from: string, to: string, duration: number) => {
      if (!mixerRef.current) return
      const fromClip = animationsRef.current.get(from)
      const toClip = animationsRef.current.get(to)
      if (!fromClip || !toClip) return
      const fromAction = mixerRef.current.existingAction(fromClip)
      const toAction = mixerRef.current.clipAction(toClip)
      if (fromAction) {
        toAction.reset().play()
        fromAction.crossFadeTo(toAction, duration, true)
      } else {
        toAction.reset().play()
      }
    }, [])

    const setLookAt = useCallback((x: number, y: number) => {
      if (!modelRef.current) return
      // Find head bone and apply subtle rotation
      const headBone = modelRef.current.getObjectByName(WOLF_3D_ANIMATIONS.LOOK)
      if (headBone) {
        headBone.rotation.y = x * 0.05
        headBone.rotation.x = y * 0.03
      }
    }, [])

    const setScale = useCallback((scale: number) => {
      if (!modelRef.current) return
      modelRef.current.scale.setScalar(scale)
    }, [])

    const setPosition = useCallback((x: number, y: number, z: number) => {
      if (!modelRef.current) return
      modelRef.current.position.set(x, y, z)
    }, [])

    const dispose = useCallback(() => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (rendererRef.current) rendererRef.current.dispose()
      if (mixerRef.current) mixerRef.current.stopAllAction()
      sceneRef.current = null
      mixerRef.current = null
      rendererRef.current = null
      modelRef.current = null
      animationsRef.current.clear()
    }, [])

    // Expose adapter
    useImperativeHandle(ref, () => ({
      loadWolf,
      playAnimation,
      stopAnimation,
      crossFadeAnimation,
      setLookAt,
      setScale,
      setPosition,
      dispose,
    }), [loadWolf, playAnimation, stopAnimation, crossFadeAnimation, setLookAt, setScale, setPosition, dispose])

    // Cleanup on unmount
    useEffect(() => {
      return () => dispose()
    }, [dispose])

    return (
      <canvas
        ref={canvasRef}
        width={WOLF_CONSTANTS.SIZE}
        height={WOLF_CONSTANTS.SIZE}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
    )
  }
)

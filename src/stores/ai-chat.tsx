import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from "react"
import { useSupabase } from "@/hooks/useSupabase"
import { useT } from "@/i18n"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

interface AiChatContextValue {
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  send: (question: string, context: string) => Promise<void>
  reset: () => void
  input: string
  setInput: (v: string) => void
}

const AiChatContext = createContext<AiChatContextValue | null>(null)

// Nombre maximal de messages d'historique envoyés au LLM (mémoire multi-tours
// sans exploser le payload). On garde les N derniers + le message courant.
const HISTORY_LIMIT = 12

// Store UNIQUE du chat : une seule session, un seul historique par module.
export function AiChatProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const db = useSupabase()
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: t("aiAssistant.chatWelcome") },
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInputState] = useState("")
  const requestSeq = useRef(0)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const send = useCallback(async (question: string, context: string) => {
    const trimmed = question.trim()
    if (!trimmed) return
    const seq = ++requestSeq.current
    setError(null)
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])
    setLoading(true)
    try {
      const history = messagesRef.current
        .filter((m) => m.content !== t("aiAssistant.chatWelcome"))
        .slice(-HISTORY_LIMIT)
      const { data: res, error: invokeError } = await db.functions.invoke<{ content: string }>("ai-chat", {
        body: {
          messages: [...history, { role: "user", content: trimmed }],
          context,
        },
      })
      if (invokeError) {
        // FunctionsHttpError expose context = { status, data } ; le message
        // générique supabase-js masque le vrai code → on le récupère pour un
        // diagnostic précis (500 config EF, 502 provider, 401 session...).
        const ctx = (invokeError as any)?.context as { status?: number; data?: any } | undefined
        const status = ctx?.status
        const detail = typeof ctx?.data === "object" && ctx.data !== null ? JSON.stringify(ctx.data) : ctx?.data
        const err = new Error(
          status
            ? `Assistant indisponible (${status})${detail ? ` : ${detail}` : ""}`
            : invokeError.message || "Erreur lors de l'appel à l'assistant"
        )
        ;(err as any).status = status
        throw err
      }
      if (!res?.content) throw new Error("Réponse vide de l'assistant")
      // Ignore la réponse si une requête plus récente a été lancée entre-temps
      if (seq !== requestSeq.current) return
      setMessages((prev) => [...prev, { role: "assistant", content: res.content }])
    } catch (err: any) {
      if (seq !== requestSeq.current) return
      setError(err?.message || "Erreur lors de l'appel à l'assistant")
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [db, t])

  const reset = useCallback(() => {
    setMessages([{ role: "assistant", content: t("aiAssistant.chatWelcome") }])
    setError(null)
    setLoading(false)
  }, [t])

  const setInput = useCallback((v: string) => {
    setInputState(v)
  }, [])

  const value = useMemo<AiChatContextValue>(
    () => ({ messages, loading, error, send, reset, input, setInput }),
    [messages, loading, error, send, reset, input, setInput]
  )

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>
}

export function useAiChat(): AiChatContextValue {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error("useAiChat must be used within AiChatProvider")
  return ctx
}

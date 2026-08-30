import { useEffect, useRef } from "react"
import { useSupabase } from "@/hooks/useSupabase"
import { useQueryClient } from "@/hooks/useQuery"
import { useNetworkStatus } from "@/hooks/useNetworkStatus"
import type { RealtimeChannel } from "@supabase/supabase-js"

interface UseRealtimeOptions {
  table: string
  queryKey: string[]
  filter?: string
  event?: "*" | "INSERT" | "UPDATE" | "DELETE"
  /** Regroupe plusieurs événements realtime en un seul invalidation (ms). Défaut : 0 = immédiat. */
  debounceMs?: number
}

export function useRealtime({ table, queryKey, filter, event = "*", debounceMs = 0 }: UseRealtimeOptions) {
  const supabase = useSupabase()
  const queryClient = useQueryClient()
  const { isOnline } = useNetworkStatus()
  const queryKeyRef = useRef(queryKey)
  queryKeyRef.current = queryKey

  useEffect(() => {
    if (!isOnline) return

    let timer: number | undefined

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeyRef.current })
    }

    const onEvent = () => {
      if (debounceMs > 0) {
        if (timer) window.clearTimeout(timer)
        timer = window.setTimeout(invalidate, debounceMs)
      } else {
        invalidate()
      }
    }

    const channel: RealtimeChannel = supabase
      .channel(`realtime-${table}`)
      .on(
        "postgres_changes",
        { event, schema: "public", table, filter },
        onEvent
      )
      .subscribe()

    return () => {
      if (timer) window.clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [table, event, filter, isOnline, queryClient, supabase, debounceMs])

  return null
}

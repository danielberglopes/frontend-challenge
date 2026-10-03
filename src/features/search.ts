import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"

/**
 * Rascunho da busca sincronizado com `?q=` da home.
 * Digitação é aplicada na URL com debounce (300 ms) e sempre reinicia a paginação.
 */
export function useSearchDraft({ live = true }: { live?: boolean } = {}) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const urlQuery = useRouterState({
    select: (state) => (state.location.pathname === "/" ? new URLSearchParams(state.location.searchStr).get("q") ?? "" : ""),
  })
  const [draft, setDraft] = useState(urlQuery)
  const typed = useRef(false)

  useEffect(() => {
    typed.current = false
    setDraft(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    if (!live || !typed.current || pathname !== "/") return
    if (draft.trim() === urlQuery) return
    const handle = window.setTimeout(() => {
      void navigate({
        to: "/",
        search: (current: Record<string, unknown>) => ({ ...current, q: draft.trim() || undefined, page: undefined }),
      })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [draft, live, navigate, pathname, urlQuery])

  return {
    draft,
    setDraft(value: string) {
      typed.current = true
      setDraft(value)
    },
    submit() {
      void navigate({
        to: "/",
        search: (current: Record<string, unknown>) => ({
          ...(pathname === "/" ? current : {}),
          q: draft.trim() || undefined,
          page: undefined,
        }),
        hash: "catalogo",
      })
    },
  }
}

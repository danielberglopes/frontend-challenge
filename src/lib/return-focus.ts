// Último elemento focado fora de qualquer diálogo (o "abridor"), para devolver o foco ao fechar.
let lastOutside: HTMLElement | null = null
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (event) => {
    const target = event.target
    if (target instanceof HTMLElement && !target.closest("[role=dialog]")) lastOutside = target
  })
}

/**
 * Handler de onCloseAutoFocus que devolve o foco ao elemento que abriu o diálogo/drawer —
 * inclusive quando ele foi aberto por evento (sem Trigger), como a busca e o aviso de fora de escopo.
 */
export function returnFocus(onCloseAutoFocus?: (event: Event) => void) {
  return (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return
    const target = lastOutside
    if (target && target !== document.body && document.contains(target)) {
      event.preventDefault()
      target.focus()
    }
  }
}

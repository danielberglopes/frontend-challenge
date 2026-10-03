export function announce(message: string) {
  window.dispatchEvent(new CustomEvent("kurio:announce", { detail: message }))
}

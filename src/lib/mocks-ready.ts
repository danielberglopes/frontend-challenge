/**
 * Sinaliza quando a camada MSW está ativa. A interface renderiza imediatamente
 * (melhor LCP) e apenas o transporte — Axios e Socket.IO — aguarda este sinal.
 */
let resolveReady: () => void = () => {}

export const mocksReady = new Promise<void>((resolve) => {
  resolveReady = resolve
})

export function markMocksReady() {
  resolveReady()
}

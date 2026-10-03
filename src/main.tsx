import "@fontsource/roboto-mono/latin-400.css"
import "@fontsource/roboto-mono/latin-500.css"
import "@fontsource/roboto-mono/latin-700.css"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { markMocksReady } from "@/lib/mocks-ready.ts"
import { queryClient } from "@/lib/query.ts"
import { ensureGuestId } from "@/lib/utils.ts"
import { router } from "@/router.tsx"
import "@/index.css"

async function startMocks() {
  if (import.meta.env.VITE_ENABLE_MSW === "false") return
  const { worker } = await import("@/mocks/browser.ts")
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: import.meta.env.PROD,
    serviceWorker: { url: "/mockServiceWorker.js" },
  })
}

ensureGuestId()
// Renderiza já; o transporte (Axios/Socket.IO) espera os mocks ficarem prontos.
void startMocks().finally(markMocksReady)
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)

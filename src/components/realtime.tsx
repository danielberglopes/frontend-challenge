import type { Cart, Nft, NftList, NftUpdatedPayload, Order, RealtimeEvent } from "@/contracts/api.ts"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import type { Socket } from "socket.io-client"
import { announce } from "@/lib/announce.ts"
import { mocksReady } from "@/lib/mocks-ready.ts"
import { mulQty } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { readToken } from "@/lib/utils.ts"
import { useSession } from "@/features/session.ts"

const seen = new Set<string>()
const versions = new Map<string, number>()

function accept(event: RealtimeEvent<unknown>, current: number) {
  if (seen.has(event.id)) return false
  seen.add(event.id)
  if (seen.size > 400) {
    const first = seen.values().next().value
    if (first) seen.delete(first)
  }
  const key = `${event.type}:${event.resourceId}`
  const known = Math.max(versions.get(key) ?? 0, current)
  if (event.version <= known) {
    versions.set(key, known)
    return false
  }
  versions.set(key, event.version)
  return true
}

export function RealtimeBridge() {
  const queryClient = useQueryClient()
  const session = useSession()
  const userId = session.data?.user?.id ?? null

  useEffect(() => {
    let socket: Socket | null = null
    let opened = false
    let disposed = false

    const onConnect = () => {
      socket?.emit("session", readToken())
      if (opened) {
        void queryClient.invalidateQueries()
        announce("Conexão restabelecida. Os dados ativos foram reconciliados.")
      }
      opened = true
    }

    const onDisconnect = () => {
      if (!disposed) announce("Conexão em tempo real interrompida.")
    }

    const onNft = (event: RealtimeEvent<NftUpdatedPayload>) => {
      const current = currentVersion(queryClient, event.resourceId)
      if (!accept(event, current)) return
      const payload = event.payload
      queryClient.setQueriesData<NftList>({ queryKey: ["nfts"] }, (list) => {
        if (!list) return list
        return { ...list, items: list.items.map((item) => (item.id === payload.id ? { ...item, price: payload.price, editions: payload.editions, version: payload.version } : item)) }
      })
      queryClient.setQueryData<Nft>(queryKeys.nft(payload.id), (nft) =>
        nft ? { ...nft, price: payload.price, editions: payload.editions, version: payload.version } : nft,
      )
      let touched = false
      queryClient.setQueriesData<Cart>({ queryKey: ["cart"] }, (cart) => {
        if (!cart) return cart
        return {
          ...cart,
          items: cart.items.map((item) => {
            if (item.nftId !== payload.id) return item
            touched = true
            const edition = payload.editions.find((entry) => entry.id === item.editionId)
            const maxQuantity = edition?.remaining ?? 0
            return {
              ...item,
              unitPrice: payload.price,
              version: payload.version,
              maxQuantity,
              available: Boolean(edition && edition.status === "open" && maxQuantity >= item.quantity),
              lineTotal: mulQty(payload.price, item.quantity),
            }
          }),
        }
      })
      void queryClient.invalidateQueries({ queryKey: ["quote"] })
      if (touched) announce("Preço ou disponibilidade atualizados no carrinho. A cotação precisa ser confirmada de novo.")
    }

    const onOrder = (event: RealtimeEvent<{ order: Order }>) => {
      if (event.userId && event.userId !== userId) return
      const current = queryClient.getQueryData<Order>(queryKeys.order(event.resourceId))?.version ?? 0
      if (!accept(event, current)) return
      queryClient.setQueryData(queryKeys.order(event.resourceId), event.payload.order)
      if (event.payload.order.status !== "pending") void queryClient.invalidateQueries({ queryKey: ["cart"] })
      const label = event.payload.order.status === "confirmed" ? "Pedido confirmado." : event.payload.order.status === "declined" ? "Pagamento recusado." : "Pedido atualizado."
      announce(label)
    }

    // Import tardio: o engine.io-client captura o construtor WebSocket ao ser avaliado,
    // então ele precisa carregar depois que o MSW aplicou o interceptor de WebSocket.
    // A conexão abre quando o navegador fica ocioso: não disputa CPU com a primeira renderização.
    const idle = () =>
      new Promise<void>((resolve) =>
        typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(() => resolve(), { timeout: 1500 }) : window.setTimeout(resolve, 200),
      )
    void mocksReady.then(idle).then(() => import("socket.io-client")).then(({ io }) => {
      if (disposed) return
      const created = io(window.location.origin, {
        path: "/socket.io",
        transports: ["websocket"],
        reconnection: true,
      })
      socket = created
      window.__kurioSocket = created
      created.on("connect", onConnect)
      created.on("disconnect", onDisconnect)
      created.on("nft.updated", onNft)
      created.on("order.updated", onOrder)
    })

    return () => {
      disposed = true
      if (!socket) return
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("nft.updated", onNft)
      socket.off("order.updated", onOrder)
      socket.disconnect()
      if (window.__kurioSocket === socket) delete window.__kurioSocket
    }
  }, [queryClient, userId])

  return null
}

function currentVersion(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  const detail = queryClient.getQueryData<Nft>(queryKeys.nft(id))
  if (detail) return detail.version
  const lists = queryClient.getQueriesData<NftList>({ queryKey: ["nfts"] })
  for (const [, data] of lists) {
    const found = data?.items.find((item) => item.id === id)
    if (found) return found.version
  }
  return 0
}

import type { NftUpdatedPayload, Order, RealtimeEvent } from "@/contracts/api.ts"
import { toSocketIo } from "@mswjs/socket.io-binding"
import { ws } from "msw"
import { findUserByToken, loadDb } from "@/mocks/store.ts"

type Entry = {
  userId: string | null
  emit: (name: string, payload: unknown) => void
  close: () => void
  ping: number
}

const entries = new Set<Entry>()

export function broadcast<T>(event: RealtimeEvent<T>) {
  for (const entry of entries) {
    if (event.userId && entry.userId !== event.userId) continue
    entry.emit(event.type, event)
  }
}

export function dropSockets() {
  for (const entry of [...entries]) entry.close()
}

export function nftEvent(payload: NftUpdatedPayload, eventId: string = crypto.randomUUID()): RealtimeEvent<NftUpdatedPayload> {
  return {
    id: eventId,
    type: "nft.updated",
    resourceId: payload.id,
    version: payload.version,
    userId: null,
    occurredAt: new Date().toISOString(),
    payload,
  }
}

export function orderEvent(order: Order, userId: string): RealtimeEvent<{ order: Order }> {
  return {
    id: crypto.randomUUID(),
    type: "order.updated",
    resourceId: order.id,
    version: order.version,
    userId,
    occurredAt: new Date().toISOString(),
    payload: { order },
  }
}

export function socketHandlers() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws"
  // O MSW remove o prefixo "/socket.io/" do caminho antes de comparar: o link fica na raiz do host.
  const link = ws.link(`${protocol}://${window.location.host}`)
  return [
    link.addEventListener("connection", (connection) => {
      const io = toSocketIo(connection)
      const entry: Entry = {
        userId: null,
        emit: (name, payload) => io.client.emit(name, payload),
        close: () => connection.client.close(),
        ping: window.setInterval(() => {
          try {
            connection.client.send("2")
          } catch {
            window.clearInterval(entry.ping)
          }
        }, 20_000),
      }
      entries.add(entry)
      io.client.on("session", (_message, token: string | null) => {
        entry.userId = token ? findUserByToken(loadDb(), token)?.id ?? null : null
      })
      const cleanup = () => {
        window.clearInterval(entry.ping)
        entries.delete(entry)
      }
      connection.client.addEventListener("close", cleanup)
    }),
  ]
}

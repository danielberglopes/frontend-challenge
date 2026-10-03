import type { Socket } from "socket.io-client"

declare global {
  interface Window {
    __kurioSocket?: Socket
  }
}

export {}

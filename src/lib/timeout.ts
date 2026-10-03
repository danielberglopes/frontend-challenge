import { timeoutStorageKey } from "@/lib/utils.ts"

const fallback = 8000

export function readTimeout() {
  const fromStorage = Number(localStorage.getItem(timeoutStorageKey()))
  if (Number.isFinite(fromStorage) && fromStorage >= 200) return fromStorage
  const fromEnv = Number(import.meta.env.VITE_HTTP_TIMEOUT)
  if (Number.isFinite(fromEnv) && fromEnv >= 200) return fromEnv
  return fallback
}

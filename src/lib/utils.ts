import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isSafeRedirect(value: string | undefined): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\"))
}

export function guestStorageKey() {
  return "kurio:guest"
}

export function tokenStorageKey() {
  return "kurio:token"
}

export function scenarioStorageKey() {
  return "kurio:scenario"
}

export function timeoutStorageKey() {
  return "kurio:http-timeout"
}

export function ensureGuestId() {
  const current = localStorage.getItem(guestStorageKey())
  if (current) return current
  const next = crypto.randomUUID()
  localStorage.setItem(guestStorageKey(), next)
  return next
}

export function readToken() {
  return localStorage.getItem(tokenStorageKey())
}

export function writeToken(token: string | null) {
  if (token) localStorage.setItem(tokenStorageKey(), token)
  else localStorage.removeItem(tokenStorageKey())
}

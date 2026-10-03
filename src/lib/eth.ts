const SCALE = 8n
const BASE = 10n ** SCALE

export function parseEth(value: string): bigint {
  const trimmed = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Valor ETH inválido: ${value}`)
  }
  const negative = trimmed.startsWith("-")
  const raw = negative ? trimmed.slice(1) : trimmed
  const [whole = "0", fraction = ""] = raw.split(".")
  const padded = `${fraction}00000000`.slice(0, 8)
  const amount = BigInt(whole) * BASE + BigInt(padded)
  return negative ? -amount : amount
}

export function formatEth(value: bigint | string): string {
  const amount = typeof value === "string" ? parseEth(value) : value
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const whole = absolute / BASE
  const fraction = (absolute % BASE).toString().padStart(8, "0").replace(/0+$/, "")
  const shown = fraction.length < 2 ? fraction.padEnd(2, "0") : fraction
  return `${negative ? "-" : ""}${whole.toString()}.${shown}`
}

export function addEth(values: string[]): string {
  const total = values.reduce((sum, value) => sum + parseEth(value), 0n)
  return formatEth(total)
}

export function subEth(left: string, right: string): string {
  return formatEth(parseEth(left) - parseEth(right))
}

export function mulQty(price: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantidade inválida")
  }
  return formatEth(parseEth(price) * BigInt(quantity))
}

export function percentEth(price: string, percent: number): string {
  return formatEth((parseEth(price) * BigInt(percent)) / 100n)
}

export function cmpEth(left: string, right: string): number {
  const delta = parseEth(left) - parseEth(right)
  if (delta === 0n) return 0
  return delta > 0n ? 1 : -1
}

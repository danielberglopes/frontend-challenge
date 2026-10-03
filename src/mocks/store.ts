import type { CartLine, Network, Nft, Order, Quote } from "@/contracts/api.ts"
import { expiredCoupon, networkFee, validCoupon } from "@/contracts/api.ts"
import { addEth, cmpEth, formatEth, mulQty, percentEth, subEth } from "@/lib/eth.ts"
import { scenarioStorageKey } from "@/lib/utils.ts"
import { createDatabase, type Database, type StoredCart, type StoredOrder, type StoredUser } from "@/mocks/fixtures.ts"

export type { Database, StoredOrder, StoredUser }

const dbKey = "kurio:db:v2"

export function loadDb(): Database {
  const raw = localStorage.getItem(dbKey)
  if (!raw) {
    const seeded = createDatabase()
    localStorage.setItem(dbKey, JSON.stringify(seeded))
    return seeded
  }
  return JSON.parse(raw) as Database
}

export function saveDb(db: Database) {
  localStorage.setItem(dbKey, JSON.stringify(db))
}

export function resetDb() {
  localStorage.removeItem(dbKey)
  return loadDb()
}

export function readScenario() {
  return localStorage.getItem(scenarioStorageKey()) ?? "default"
}

export function writeScenario(name: string) {
  localStorage.setItem(scenarioStorageKey(), name)
}

export async function hashPassword(password: string) {
  const encoded = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest("SHA-256", encoded)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function publicUser(user: StoredUser) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    ensName: user.ensName,
    walletNickname: user.walletNickname,
    avatarDataUrl: user.avatarDataUrl,
  }
}

export function findUserByToken(db: Database, token: string | null) {
  if (!token || readScenario() === "session-expired") return null
  const session = db.sessions.find((item) => item.token === token && item.expiresAt > Date.now())
  if (!session) return null
  return db.users.find((user) => user.id === session.userId) ?? null
}

export function cartFor(db: Database, ownerId: string) {
  let cart = db.carts.find((item) => item.ownerId === ownerId)
  if (!cart) {
    cart = { ownerId, couponCode: null, items: [] }
    db.carts.push(cart)
  }
  return cart
}

export function lineFrom(db: Database, cartItem: StoredCart["items"][number]): CartLine | null {
  const nft = db.nfts.find((item) => item.id === cartItem.nftId)
  if (!nft) return null
  const edition = nft.editions.find((item) => item.id === cartItem.editionId)
  if (!edition) return null
  const maxQuantity = edition.remaining
  const available = edition.status === "open" && maxQuantity >= cartItem.quantity && cartItem.quantity > 0
  return {
    id: cartItem.id,
    nftId: nft.id,
    editionId: edition.id,
    name: nft.name,
    tokenId: nft.tokenId,
    editionLabel: edition.label,
    art: nft.art,
    quantity: cartItem.quantity,
    maxQuantity,
    unitPrice: nft.price,
    lineTotal: mulQty(nft.price, cartItem.quantity),
    available,
    version: nft.version,
  }
}

export function presentCart(db: Database, cart: StoredCart) {
  return {
    ownerId: cart.ownerId,
    couponCode: cart.couponCode,
    items: cart.items.map((item) => lineFrom(db, item)).filter((item): item is CartLine => item !== null),
  }
}

function couponState(code: string | null): Quote["coupon"] {
  if (!code) return null
  const normalized = code.trim().toUpperCase()
  if (normalized === expiredCoupon) return { code: normalized, valid: false, reason: "expired" }
  if (normalized === validCoupon) return { code: normalized, valid: true }
  return { code: normalized, valid: false, reason: "invalid" }
}

export function buildQuote(db: Database, cart: StoredCart, network: Network): Quote {
  const items = cart.items.map((item) => lineFrom(db, item)).filter((item): item is CartLine => item !== null)
  const subtotal = addEth(items.map((item) => item.lineTotal))
  const coupon = couponState(cart.couponCode)
  const discount = coupon?.valid ? percentEth(subtotal, 10) : "0.00"
  const fee = networkFee[network]
  const total = addEth([subEth(subtotal, discount), fee])
  const fingerprint = [
    network,
    subtotal,
    discount,
    fee,
    total,
    coupon?.code ?? "",
    items.map((item) => `${item.nftId}:${item.editionId}:${item.quantity}:${item.unitPrice}:${item.version}:${item.available}`).join("|"),
  ].join("#")
  return {
    id: `quote-${cart.ownerId}-${fingerprint.length}-${fingerprint.slice(0, 12)}`,
    fingerprint,
    currency: "ETH",
    network,
    items,
    subtotal: formatEth(subtotal),
    discount: formatEth(discount),
    networkFee: formatEth(fee),
    total: formatEth(total),
    coupon,
    stale: false,
  }
}

export function quoteChanged(current: Quote, fingerprint: string) {
  return current.fingerprint !== fingerprint || current.items.some((item) => !item.available)
}

export function toPublicOrder(order: StoredOrder): Order {
  return {
    id: order.id,
    status: order.status,
    version: order.version,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    snapshot: order.snapshot,
    txHash: order.txHash,
    explorerPath: order.explorerPath,
    walletLabel: order.walletLabel,
    walletType: order.walletType,
    network: order.network,
    declineReason: order.declineReason,
    idempotencyKey: order.idempotencyKey,
  }
}

export function canonicalOrderBody(body: {
  fingerprint: string
  walletId: string
  network: string
  collectorName: string
  collectorEmail: string
}) {
  return JSON.stringify({
    fingerprint: body.fingerprint,
    walletId: body.walletId,
    network: body.network,
    collectorName: body.collectorName.trim(),
    collectorEmail: body.collectorEmail.trim().toLowerCase(),
  })
}

export function mergeGuestCart(db: Database, userId: string, guestId: string | null) {
  if (!guestId) return
  const guest = db.carts.find((cart) => cart.ownerId === `guest:${guestId}`)
  if (!guest || guest.items.length === 0) return
  const userCart = cartFor(db, userId)
  for (const item of guest.items) {
    const nft = db.nfts.find((entry) => entry.id === item.nftId)
    const edition = nft?.editions.find((entry) => entry.id === item.editionId)
    if (!nft || !edition) continue
    const existing = userCart.items.find((entry) => entry.nftId === item.nftId && entry.editionId === item.editionId)
    const max = edition.remaining
    if (max <= 0) continue
    if (existing) existing.quantity = Math.min(max, existing.quantity + item.quantity)
    else userCart.items.push({ ...item, id: crypto.randomUUID(), quantity: Math.min(max, item.quantity) })
  }
  if (!userCart.couponCode && guest.couponCode) userCart.couponCode = guest.couponCode
  guest.items = []
  guest.couponCode = null
}

export function withinPrice(price: string, min?: string, max?: string) {
  if (min && cmpEth(price, min) < 0) return false
  if (max && cmpEth(price, max) > 0) return false
  return true
}

export function cloneNft(nft: Nft): Nft {
  return structuredClone(nft)
}

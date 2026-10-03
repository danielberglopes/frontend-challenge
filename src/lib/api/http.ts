import type {
  Cart,
  CatalogSearch,
  CreateOrderBody,
  Network,
  Nft,
  NftList,
  Order,
  ProfileInput,
  PublicUser,
  Quote,
  SessionResponse,
  Wallet,
  WalletInput,
} from "@/contracts/api.ts"
import { pageSize } from "@/contracts/api.ts"
import { http } from "@/lib/api/client.ts"

function signalOf(signal?: AbortSignal) {
  return { signal }
}

export async function getSession(signal?: AbortSignal): Promise<SessionResponse> {
  const token = localStorage.getItem("kurio:token")
  if (!token) return { user: null }
  try {
    const { data } = await http.get<SessionResponse>("/api/auth/session", signalOf(signal))
    return data
  } catch {
    return { user: null }
  }
}

export async function login(email: string, password: string) {
  const { data } = await http.post<{ token: string; user: PublicUser }>("/api/auth/login", { email, password })
  return data
}

export async function register(input: { name: string; email: string; password: string }) {
  const { data } = await http.post<{ token: string; user: PublicUser }>("/api/auth/register", input)
  return data
}

export async function logout() {
  await http.post("/api/auth/logout")
}

export async function listNfts(search: CatalogSearch, signal?: AbortSignal) {
  const { data } = await http.get<NftList>("/api/nfts", {
    ...signalOf(signal),
    params: {
      q: search.q,
      collections: search.collections,
      networks: search.networks,
      min: search.min,
      max: search.max,
      sort: search.sort ?? "recent",
      page: search.page ?? 1,
      tab: search.tab ?? "all",
      pageSize,
    },
  })
  return data
}

export async function getNft(id: string, signal?: AbortSignal) {
  const { data } = await http.get<Nft>(`/api/nfts/${id}`, signalOf(signal))
  return data
}

export async function listFavorites(signal?: AbortSignal) {
  const { data } = await http.get<{ nftIds: string[] }>("/api/favorites", signalOf(signal))
  return data.nftIds
}

export async function addFavorite(nftId: string) {
  await http.post("/api/favorites", { nftId })
}

export async function removeFavorite(nftId: string) {
  await http.delete(`/api/favorites/${nftId}`)
}

export async function getCart(signal?: AbortSignal) {
  const { data } = await http.get<Cart>("/api/cart", signalOf(signal))
  return data
}

export async function addCartItem(input: { nftId: string; editionId: string; quantity: number }) {
  const { data } = await http.post<Cart>("/api/cart/items", input)
  return data
}

export async function updateCartItem(itemId: string, quantity: number) {
  const { data } = await http.patch<Cart>(`/api/cart/items/${itemId}`, { quantity })
  return data
}

export async function removeCartItem(itemId: string) {
  const { data } = await http.delete<Cart>(`/api/cart/items/${itemId}`)
  return data
}

export async function applyCoupon(code: string) {
  const { data } = await http.post<Cart>("/api/cart/coupon", { code })
  return data
}

export async function removeCoupon() {
  const { data } = await http.delete<Cart>("/api/cart/coupon")
  return data
}

export async function getQuote(network: Network, signal?: AbortSignal) {
  const { data } = await http.get<Quote>("/api/quotes", { ...signalOf(signal), params: { network } })
  return data
}

export async function createOrder(body: CreateOrderBody, idempotencyKey: string) {
  const { data } = await http.post<Order>("/api/orders", body, {
    headers: { "Idempotency-Key": idempotencyKey },
  })
  return data
}

export async function getOrder(id: string, signal?: AbortSignal) {
  const { data } = await http.get<Order>(`/api/orders/${id}`, signalOf(signal))
  return data
}

export async function getOrderByKey(key: string) {
  const { data } = await http.get<Order>(`/api/orders/by-key/${key}`)
  return data
}

export async function getProfile(signal?: AbortSignal) {
  const { data } = await http.get<PublicUser>("/api/profile", signalOf(signal))
  return data
}

export async function updateProfile(input: ProfileInput) {
  const { data } = await http.patch<PublicUser>("/api/profile", input)
  return data
}

export async function changePassword(input: { currentPassword: string; nextPassword: string }) {
  await http.post("/api/profile/password", input)
}

export async function listWallets(signal?: AbortSignal) {
  const { data } = await http.get<{ wallets: Wallet[] }>("/api/wallets", signalOf(signal))
  return data.wallets
}

export async function createWallet(input: WalletInput) {
  const { data } = await http.post<Wallet>("/api/wallets", input)
  return data
}

export async function updateWallet(id: string, input: WalletInput) {
  const { data } = await http.patch<Wallet>(`/api/wallets/${id}`, input)
  return data
}

export async function setWalletConnection(
  id: string,
  action: "connect" | "refuse" | "disconnect",
  network?: Network,
) {
  const { data } = await http.post<Wallet>(`/api/wallets/${id}/connection`, { action, network })
  return data
}

export async function setScenario(scenario: string) {
  await http.post("/api/dev/scenario", { scenario })
}

export async function resetSimulation() {
  await http.post("/api/dev/reset")
}

export async function runSimulation(action: Record<string, unknown>) {
  const { data } = await http.post("/api/dev/actions", action)
  return data
}

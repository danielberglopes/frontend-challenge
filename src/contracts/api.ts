export const networks = ["ethereum", "polygon", "solana"] as const
export type Network = (typeof networks)[number]

export const collections = [
  "Arte digital",
  "Fotografia",
  "Música",
  "Arte 3D",
  "Colecionáveis",
  "Generativa",
  "Jogos",
  "Assinaturas",
  "Utilidade",
] as const
export type CollectionName = (typeof collections)[number]

export const sorts = ["recent", "price-asc", "price-desc", "trending"] as const
export type SortKey = (typeof sorts)[number]

export const tabs = ["all", "new", "trending"] as const
export type CatalogTab = (typeof tabs)[number]

/** Ilustrações originais do Figma (public/nfts/<key>-<size>.webp). */
export const artKeys = ["emerald", "sage", "ivory", "golden"] as const
export type ArtKey = (typeof artKeys)[number]

export const scenarios = [
  "default",
  "empty",
  "slow",
  "variable-latency",
  "offline",
  "http-500",
  "session-expired",
  "register-conflict",
  "favorite-fail",
  "order-timeout",
  "payment-declined",
  "payment-hold",
] as const
export type ScenarioName = (typeof scenarios)[number]

export const networkFee: Record<Network, string> = {
  ethereum: "0.016",
  polygon: "0.0012",
  solana: "0.0008",
}

export const networkLabel: Record<Network, string> = {
  ethereum: "Ethereum",
  polygon: "Polygon",
  solana: "Solana",
}

export const walletTypes = ["metamask", "walletconnect", "coinbase"] as const
export type WalletType = (typeof walletTypes)[number]

export const walletTypeLabel: Record<WalletType, string> = {
  metamask: "MetaMask",
  walletconnect: "WalletConnect",
  coinbase: "Coinbase Wallet",
}

export type ApiErrorBody = {
  code: string
  message: string
  fields?: Record<string, string>
}

export type Edition = {
  id: string
  label: string
  status: "open" | "soldout"
  supply: number
  remaining: number
}

export type Nft = {
  id: string
  tokenId: string
  name: string
  description: string
  collection: CollectionName
  network: Network
  rarity: "comum" | "raro" | "lendario"
  price: string
  /** Preço anterior exibido riscado no card, quando houver remarcação. */
  compareAtPrice: string | null
  version: number
  rating: string
  reviews: number
  attributes: string[]
  art: ArtKey
  featured: boolean
  isNew: boolean
  trendScore: number
  createdAt: string
  editions: Edition[]
}

export type NftList = {
  items: Nft[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  facets: {
    collections: { name: CollectionName; count: number }[]
    networks: { name: Network; count: number }[]
    priceRange: { min: string; max: string }
  }
}

export type CatalogSearch = {
  q?: string
  collections?: string
  networks?: string
  min?: string
  max?: string
  sort?: SortKey
  page?: number
  tab?: CatalogTab
}

export type PublicUser = {
  id: string
  /** Nome de exibição */
  name: string
  username: string
  email: string
  ensName: string
  walletNickname: string
  avatarDataUrl: string | null
}

export type ProfileInput = {
  name: string
  username: string
  email: string
  ensName: string
  walletNickname: string
  avatarDataUrl?: string | null
}

export type SessionResponse = {
  user: PublicUser | null
}

export type Wallet = {
  id: string
  role: "primary" | "secondary"
  /** Apelido da carteira */
  label: string
  displayName: string
  profileName: string
  address: string
  ensSecondary: string
  walletType: WalletType
  referralCode: string
  email: string
  ensName: string
  network: Network
  connection: "disconnected" | "connected" | "refused"
}

export type WalletInput = Omit<Wallet, "id" | "connection">

export type CartLine = {
  id: string
  nftId: string
  editionId: string
  name: string
  tokenId: string
  editionLabel: string
  art: ArtKey
  quantity: number
  maxQuantity: number
  unitPrice: string
  lineTotal: string
  available: boolean
  version: number
}

export type Cart = {
  ownerId: string
  couponCode: string | null
  items: CartLine[]
}

export type Quote = {
  id: string
  fingerprint: string
  currency: "ETH"
  network: Network
  items: CartLine[]
  subtotal: string
  discount: string
  networkFee: string
  total: string
  coupon: null | { code: string; valid: true } | { code: string; valid: false; reason: "invalid" | "expired" }
  stale: boolean
}

export type OrderSnapshot = {
  items: Array<{
    nftId: string
    editionId: string
    name: string
    tokenId: string
    editionLabel: string
    art: ArtKey
    quantity: number
    unitPrice: string
    lineTotal: string
  }>
  subtotal: string
  discount: string
  networkFee: string
  total: string
  couponCode: string | null
  collectorName: string
  collectorEmail: string
  network: Network
}

export type OrderStatus = "pending" | "confirmed" | "declined"

export type Order = {
  id: string
  status: OrderStatus
  version: number
  createdAt: string
  updatedAt: string
  snapshot: OrderSnapshot
  txHash: string | null
  explorerPath: string | null
  walletLabel: string
  walletType: WalletType
  network: Network
  declineReason: string | null
  idempotencyKey: string
}

export type CreateOrderBody = {
  fingerprint: string
  walletId: string
  network: Network
  walletType: WalletType
  collectorName: string
  collectorEmail: string
  collectorUsername: string
  profileName: string
  referralCode: string
  ensName: string
  note?: string
}

export type NftUpdatedPayload = {
  id: string
  price: string
  version: number
  editions: Edition[]
}

export type RealtimeEvent<T> = {
  id: string
  type: "nft.updated" | "order.updated"
  resourceId: string
  version: number
  userId: string | null
  occurredAt: string
  payload: T
}

export type OrderUpdatedPayload = {
  order: Order
}

export const pageSize = 9

export const demoUsers = {
  ana: {
    email: "ana.colecionadora@kurio.test",
    password: "Kurio#2026",
    name: "Ana Colecionadora",
  },
  bruno: {
    email: "bruno.nomad@kurio.test",
    password: "Kurio#2026",
    name: "Bruno Nomad",
  },
} as const

export const validCoupon = "KURIO10"
export const expiredCoupon = "EXPIRADO"

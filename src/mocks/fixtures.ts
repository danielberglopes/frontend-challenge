import type { ArtKey, CollectionName, Edition, Network, Nft, WalletType } from "@/contracts/api.ts"

// SHA-256 de "Kurio#2026" — senhas nunca ficam em claro no armazenamento simulado.
const passwordHash = "0d51448abf3dd93936605848964687ba0cb115f51c743419f2ddba7fa0d2166b"

export type StoredUser = {
  id: string
  name: string
  username: string
  email: string
  ensName: string
  walletNickname: string
  passwordHash: string
  avatarDataUrl: string | null
}

export type StoredWallet = {
  id: string
  userId: string
  role: "primary" | "secondary"
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

export type StoredCartItem = {
  id: string
  nftId: string
  editionId: string
  quantity: number
}

export type StoredCart = {
  ownerId: string
  couponCode: string | null
  items: StoredCartItem[]
}

export type StoredFavorite = { userId: string; nftId: string }

export type StoredSession = { token: string; userId: string; expiresAt: number }

export type StoredOrder = {
  id: string
  userId: string
  idempotencyKey: string
  bodyHash: string
  status: "pending" | "confirmed" | "declined"
  version: number
  createdAt: string
  updatedAt: string
  snapshot: import("@/contracts/api.ts").OrderSnapshot
  txHash: string | null
  explorerPath: string | null
  walletLabel: string
  walletType: WalletType
  network: Network
  declineReason: string | null
}

export type Database = {
  nfts: Nft[]
  users: StoredUser[]
  wallets: StoredWallet[]
  favorites: StoredFavorite[]
  carts: StoredCart[]
  sessions: StoredSession[]
  orders: StoredOrder[]
}

type EditionSeed = [label: string, supply: number, remaining: number]

const standardEditions: EditionSeed[] = [
  ["1/1", 1, 1],
  ["1/10", 10, 10],
  ["1/50", 50, 50],
  ["Aberta", 500, 500],
]

function editions(id: string, seeds: EditionSeed[]): Edition[] {
  return seeds.map(([label, supply, remaining], index) => ({
    id: `${id}-e${index + 1}`,
    label,
    supply,
    remaining,
    status: remaining > 0 ? "open" : "soldout",
  }))
}

type Seed = {
  id: string
  name: string
  art: ArtKey
  price: string
  collection: CollectionName
  network?: Network
  rarity?: Nft["rarity"]
  compareAtPrice?: string
  featured?: boolean
  isNew?: boolean
  trendScore?: number
  attributes: string[]
  description?: string
  rating?: string
  reviews?: number
  editions?: EditionSeed[]
}

// Ordem = mais recentes primeiro. As nove primeiras reproduzem a grade do Figma.
const seeds: Seed[] = [
  {
    id: "emerald-ape-042",
    name: "Emerald Ape #042",
    art: "emerald",
    price: "1.19",
    collection: "Arte digital",
    rarity: "raro",
    featured: true,
    isNew: true,
    trendScore: 96,
    rating: "4.8",
    reviews: 19,
    attributes: ["Óculos", "Esmeralda", "Raro"],
    description:
      "Um colecionável digital 1/50 finalizado à mão da coleção Kurio Editions, verificado na Ethereum, com arte desbloqueável e acesso para colecionadores.",
    editions: [
      ["1/1", 1, 0],
      ["1/10", 10, 0],
      ["1/50", 50, 41],
      ["Aberta", 500, 500],
    ],
  },
  {
    id: "sage-nomad-009",
    name: "Sage Nomad #009",
    art: "sage",
    price: "1.69",
    collection: "Arte digital",
    trendScore: 72,
    attributes: ["Chapéu", "Moletom", "Violeta"],
    editions: [
      ["1/10", 10, 10],
      ["1/50", 50, 50],
    ],
  },
  {
    id: "neon-vessel-552",
    name: "Neon Vessel #552",
    art: "ivory",
    price: "1.99",
    compareAtPrice: "2.29",
    collection: "Colecionáveis",
    rarity: "raro",
    isNew: true,
    trendScore: 88,
    attributes: ["Blazer", "Gola alta", "Brinco"],
  },
  {
    id: "cosmic-bloom-118",
    name: "Cosmic Bloom #118",
    art: "sage",
    price: "1.29",
    collection: "Fotografia",
    network: "polygon",
    trendScore: 61,
    attributes: ["Chapéu", "Lavanda"],
  },
  {
    id: "violet-nomad-314",
    name: "Violet Nomad #314",
    art: "sage",
    price: "1.39",
    collection: "Música",
    trendScore: 77,
    attributes: ["Chapéu", "Violeta"],
  },
  {
    id: "ivory-baron-088",
    name: "Ivory Baron #088",
    art: "ivory",
    price: "1.79",
    collection: "Arte 3D",
    rarity: "raro",
    trendScore: 69,
    attributes: ["Blazer", "Marfim"],
  },
  {
    id: "golden-beat-207",
    name: "Golden Beat #207",
    art: "golden",
    price: "0.99",
    collection: "Música",
    network: "solana",
    isNew: true,
    trendScore: 84,
    attributes: ["Fone", "Ouro"],
  },
  {
    id: "golden-pulse-233",
    name: "Golden Pulse #233",
    art: "golden",
    price: "0.79",
    collection: "Generativa",
    network: "polygon",
    trendScore: 66,
    attributes: ["Fone", "Pulso"],
  },
  {
    id: "golden-signal-160",
    name: "Golden Signal #160",
    art: "golden",
    price: "0.39",
    collection: "Jogos",
    isNew: true,
    trendScore: 80,
    attributes: ["Fone", "Sinal"],
  },
  {
    id: "verdant-chief-019",
    name: "Verdant Chief #019",
    art: "emerald",
    price: "2.40",
    collection: "Assinaturas",
    rarity: "lendario",
    featured: true,
    trendScore: 91,
    attributes: ["Jaqueta", "Corrente"],
  },
  {
    id: "lavender-drift-071",
    name: "Lavender Drift #071",
    art: "sage",
    price: "0.55",
    collection: "Utilidade",
    network: "solana",
    trendScore: 47,
    attributes: ["Chapéu", "Neblina"],
  },
  {
    id: "onyx-curator-301",
    name: "Onyx Curator #301",
    art: "ivory",
    price: "3.10",
    collection: "Colecionáveis",
    rarity: "lendario",
    trendScore: 93,
    attributes: ["Blazer", "Ônix"],
  },
  {
    id: "amber-frequency-011",
    name: "Amber Frequency #011",
    art: "golden",
    price: "0.89",
    collection: "Música",
    network: "polygon",
    isNew: true,
    trendScore: 82,
    attributes: ["Fone", "Âmbar"],
  },
  {
    id: "jade-varsity-077",
    name: "Jade Varsity #077",
    art: "emerald",
    price: "1.05",
    collection: "Jogos",
    trendScore: 74,
    attributes: ["Jaqueta", "Jade"],
  },
  {
    id: "marble-sprint-008",
    name: "Marble Sprint #008",
    art: "ivory",
    price: "0.73",
    collection: "Arte 3D",
    network: "solana",
    trendScore: 45,
    attributes: ["Mármore", "Pista"],
    editions: [
      ["1/10", 10, 0],
      ["1/20", 20, 0],
    ],
  },
  {
    id: "misty-pilgrim-012",
    name: "Misty Pilgrim #012",
    art: "sage",
    price: "0.64",
    collection: "Fotografia",
    trendScore: 51,
    attributes: ["Chapéu", "Peregrino"],
  },
  {
    id: "sunlit-echo-044",
    name: "Sunlit Echo #044",
    art: "golden",
    price: "0.48",
    collection: "Generativa",
    trendScore: 58,
    attributes: ["Fone", "Eco"],
  },
  {
    id: "royal-gem-003",
    name: "Royal Gem #003",
    art: "emerald",
    price: "4.20",
    collection: "Colecionáveis",
    rarity: "lendario",
    trendScore: 95,
    attributes: ["Esmeralda", "Coroa"],
  },
  {
    id: "noir-mentor-145",
    name: "Noir Mentor #145",
    art: "ivory",
    price: "1.15",
    collection: "Assinaturas",
    network: "polygon",
    trendScore: 63,
    attributes: ["Gola alta", "Mentor"],
  },
  {
    id: "dusk-wanderer-260",
    name: "Dusk Wanderer #260",
    art: "sage",
    price: "0.92",
    collection: "Arte digital",
    network: "polygon",
    trendScore: 55,
    attributes: ["Moletom", "Crepúsculo"],
  },
  {
    id: "honey-tempo-090",
    name: "Honey Tempo #090",
    art: "golden",
    price: "1.42",
    collection: "Música",
    rarity: "raro",
    trendScore: 79,
    attributes: ["Fone", "Mel"],
  },
  {
    id: "forest-scholar-021",
    name: "Forest Scholar #021",
    art: "emerald",
    price: "0.68",
    collection: "Utilidade",
    network: "solana",
    trendScore: 49,
    attributes: ["Óculos", "Floresta"],
  },
  {
    id: "slate-diplomat-402",
    name: "Slate Diplomat #402",
    art: "ivory",
    price: "2.05",
    collection: "Arte 3D",
    trendScore: 71,
    attributes: ["Blazer", "Ardósia"],
  },
  {
    id: "orchid-ranger-118",
    name: "Orchid Ranger #118",
    art: "sage",
    price: "0.31",
    collection: "Jogos",
    network: "solana",
    trendScore: 42,
    attributes: ["Chapéu", "Orquídea"],
  },
  {
    id: "brass-groove-007",
    name: "Brass Groove #007",
    art: "golden",
    price: "12.30",
    collection: "Assinaturas",
    rarity: "lendario",
    trendScore: 98,
    attributes: ["Fone", "Latão"],
    editions: [
      ["1/1", 1, 1],
      ["1/5", 5, 5],
    ],
  },
  {
    id: "pine-collector-055",
    name: "Pine Collector #055",
    art: "emerald",
    price: "0.84",
    collection: "Fotografia",
    network: "polygon",
    trendScore: 53,
    attributes: ["Jaqueta", "Pinho"],
  },
  {
    id: "ink-architect-099",
    name: "Ink Architect #099",
    art: "ivory",
    price: "0.02",
    collection: "Generativa",
    network: "solana",
    trendScore: 40,
    attributes: ["Gola alta", "Nanquim"],
  },
  {
    id: "lilac-rambler-187",
    name: "Lilac Rambler #187",
    art: "sage",
    price: "1.57",
    collection: "Colecionáveis",
    trendScore: 67,
    attributes: ["Moletom", "Lilás"],
  },
  {
    id: "saffron-wave-350",
    name: "Saffron Wave #350",
    art: "golden",
    price: "0.66",
    collection: "Utilidade",
    network: "polygon",
    trendScore: 57,
    attributes: ["Fone", "Açafrão"],
  },
  {
    id: "mint-captain-064",
    name: "Mint Captain #064",
    art: "emerald",
    price: "2.75",
    collection: "Arte digital",
    rarity: "raro",
    trendScore: 86,
    attributes: ["Óculos", "Menta"],
  },
]

function nft(seed: Seed, index: number): Nft {
  const number = seed.name.split("#")[1] ?? String(index)
  const created = new Date(Date.UTC(2026, 6, 30, 12) - index * 86_400_000)
  return {
    id: seed.id,
    tokenId: `#${number.padStart(4, "0")}`,
    name: seed.name,
    collection: seed.collection,
    network: seed.network ?? "ethereum",
    rarity: seed.rarity ?? "comum",
    price: seed.price,
    compareAtPrice: seed.compareAtPrice ?? null,
    version: 1,
    rating: seed.rating ?? "4.7",
    reviews: seed.reviews ?? 12,
    attributes: seed.attributes,
    art: seed.art,
    featured: seed.featured ?? false,
    isNew: seed.isNew ?? false,
    trendScore: seed.trendScore ?? 40,
    createdAt: created.toISOString(),
    description:
      seed.description ??
      `Um colecionável digital finalizado à mão da coleção Kurio Editions, categoria ${seed.collection}, verificado na rede simulada.`,
    editions: editions(seed.id, seed.editions ?? standardEditions),
  }
}

export function createDatabase(): Database {
  const nfts = seeds.map(nft)

  return {
    nfts,
    users: [
      {
        id: "user-ana",
        name: "Ana Colecionadora",
        username: "ana.coleciona",
        email: "ana.colecionadora@kurio.test",
        ensName: "ana",
        walletNickname: "Principal",
        passwordHash,
        avatarDataUrl: null,
      },
      {
        id: "user-bruno",
        name: "Bruno Nomad",
        username: "bruno.nomad",
        email: "bruno.nomad@kurio.test",
        ensName: "bruno",
        walletNickname: "Cofre",
        passwordHash,
        avatarDataUrl: null,
      },
    ],
    wallets: [
      {
        id: "wallet-ana-secondary",
        userId: "user-ana",
        role: "secondary",
        label: "Reserva",
        displayName: "Ana Colecionadora",
        profileName: "ana.reserva",
        address: "0x5E1f0C2b9A3d4E6f7081a2B3c4D5e6F708192a3B",
        ensSecondary: "nova.kurio.eth",
        walletType: "coinbase",
        referralCode: "KURIO-ANA",
        email: "ana.colecionadora@kurio.test",
        ensName: "nova.kurio",
        network: "polygon",
        connection: "disconnected",
      },
      {
        id: "wallet-ana-primary",
        userId: "user-ana",
        role: "primary",
        label: "Principal",
        displayName: "Ana Colecionadora",
        profileName: "ana.kurio",
        address: "0xA91F3c5D7e2B4a6C8d0E1f2A3b4C5d6E7f80E82C",
        ensSecondary: "",
        walletType: "metamask",
        referralCode: "KURIO-ANA",
        email: "ana.colecionadora@kurio.test",
        ensName: "ana",
        network: "ethereum",
        connection: "disconnected",
      },
    ],
    favorites: [
      { userId: "user-ana", nftId: "emerald-ape-042" },
      { userId: "user-bruno", nftId: "golden-signal-160" },
    ],
    carts: [
      {
        ownerId: "user-ana",
        couponCode: null,
        items: [
          { id: "cart-ana-emerald", nftId: "emerald-ape-042", editionId: "emerald-ape-042-e3", quantity: 2 },
          { id: "cart-ana-violet", nftId: "violet-nomad-314", editionId: "violet-nomad-314-e3", quantity: 6 },
          { id: "cart-ana-ivory", nftId: "ivory-baron-088", editionId: "ivory-baron-088-e3", quantity: 9 },
        ],
      },
      { ownerId: "user-bruno", couponCode: null, items: [] },
    ],
    sessions: [],
    orders: [],
  }
}

import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
})

export const queryKeys = {
  session: ["session"] as const,
  nfts: (params: unknown) => ["nfts", params] as const,
  nft: (id: string) => ["nft", id] as const,
  favorites: (userId: string) => ["favorites", userId] as const,
  cart: (ownerId: string) => ["cart", ownerId] as const,
  quote: (ownerId: string, network: string) => ["quote", ownerId, network] as const,
  order: (id: string) => ["order", id] as const,
  profile: (userId: string) => ["profile", userId] as const,
  wallets: (userId: string) => ["wallets", userId] as const,
}

const privatePrefixes = ["session", "favorites", "cart", "quote", "order", "profile", "wallets"]

export function clearPrivateCache() {
  queryClient.removeQueries({
    predicate: (query) => privatePrefixes.includes(String(query.queryKey[0])),
  })
}

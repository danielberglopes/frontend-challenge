import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AccountLayout } from "@/components/account-layout.tsx"
import { NftCard, NftCardSkeleton } from "@/components/nft-card.tsx"
import { EmptyState, ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import { useSession } from "@/features/session.ts"
import { getNft, listFavorites } from "@/lib/api/http.ts"
import { queryKeys } from "@/lib/query.ts"

export function FavoritesPage() {
  const session = useSession()
  const userId = session.data?.user?.id ?? ""
  const favorites = useQuery({
    queryKey: queryKeys.favorites(userId),
    queryFn: ({ signal }) => listFavorites(signal),
    enabled: Boolean(userId),
  })
  const ids = favorites.data ?? []
  const nfts = useQuery({
    queryKey: ["favorite-nfts", userId, ids],
    enabled: favorites.isSuccess,
    queryFn: async ({ signal }) => Promise.all(ids.map((id) => getNft(id, signal))),
    placeholderData: (previous) => previous,
  })
  // Remoção otimista reflete na hora: filtra pelo cache de favoritos atual.
  const visible = (nfts.data ?? []).filter((nft) => ids.includes(nft.id))

  return (
    <AccountLayout title="Lista de interesse">
      <h1 className="text-lg font-bold tracking-wide max-md:sr-only">Lista de interesse</h1>
      <p className="mt-1 text-sm tracking-wide text-muted">NFTs favoritados ficam salvos na sua conta.</p>
      <div className="mt-7">
        {favorites.isPending || (nfts.isPending && ids.length > 0) ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <NftCardSkeleton key={index} />
            ))}
          </div>
        ) : null}
        {favorites.isError || nfts.isError ? (
          <ErrorBlock message={errorMessage(favorites.error ?? nfts.error, "Não foi possível carregar os favoritos.")} onRetry={() => void favorites.refetch()} />
        ) : null}
        {favorites.isSuccess && ids.length === 0 ? (
          <EmptyState
            title="Nenhum favorito ainda"
            text="Toque no coração de um NFT para guardá-lo aqui."
            action={
              <Button asChild>
                <Link to="/">Explorar NFTs</Link>
              </Button>
            }
          />
        ) : null}
        {visible.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-[13px] gap-y-6 sm:grid-cols-3 md:gap-x-[34px] md:gap-y-12">
            {visible.map((nft) => (
              <li key={nft.id}>
                <NftCard nft={nft} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AccountLayout>
  )
}

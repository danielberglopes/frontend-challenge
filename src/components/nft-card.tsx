import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Heart, Search, ShoppingCart } from "lucide-react"
import { NftArt } from "@/components/nft-art.tsx"
import type { Nft } from "@/contracts/api.ts"
import { useOwnerId } from "@/features/cart.ts"
import { useFavoriteToggle } from "@/features/favorites.ts"
import { announce } from "@/lib/announce.ts"
import { ApiRequestError } from "@/lib/api/client.ts"
import { addCartItem } from "@/lib/api/http.ts"
import { formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { cn } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

export function NftCard({ nft, priority = false, className }: { nft: Nft; priority?: boolean; className?: string }) {
  const favorite = useFavoriteToggle(nft.id, nft.name)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const ownerId = useOwnerId()
  const edition = nft.editions.find((item) => item.status === "open" && item.remaining > 0)
  const quickAdd = useMutation({
    mutationFn: () => addCartItem({ nftId: nft.id, editionId: edition!.id, quantity: 1 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart(ownerId) })
      await queryClient.invalidateQueries({ queryKey: ["quote"] })
      announce(`${nft.name}, edição ${edition?.label}, adicionado ao carrinho.`)
    },
    onError: (error) => announce(error instanceof ApiRequestError ? error.message : "Não foi possível adicionar ao carrinho."),
  })
  const rare = nft.rarity !== "comum"

  return (
    <article className={cn("group relative", className)}>
      <div className="relative rounded-[24px] bg-panel p-2 md:flex md:h-[300px] md:items-center md:rounded-none md:p-1">
        <Link to="/nfts/$nftId" params={{ nftId: nft.id }} className="block w-full rounded-[20px] md:rounded-[14px]" aria-label={`${nft.name}, ${formatEth(nft.price)} ETH`}>
          <NftArt
            art={nft.art}
            alt={`Ilustração de ${nft.name}`}
            priority={priority}
            sizes="(min-width: 1024px) 250px, (min-width: 768px) 30vw, 45vw"
            className="w-full rounded-[20px] md:rounded-[14px]"
          />
        </Link>
        {rare ? (
          <span className="pointer-events-none absolute top-8 left-2 bg-fill px-4 py-1.5 text-sm font-medium text-ink md:top-1 md:left-1 md:px-4 md:py-1">
            {nft.rarity === "raro" ? "RARO" : "LENDÁRIO"}
          </span>
        ) : null}
        {/* Mobile: coração no canto superior direito. */}
        <button
          type="button"
          className="absolute top-3 right-3 grid size-[37px] place-items-center rounded-full bg-[#2a1810]/90 text-amber md:hidden"
          aria-pressed={favorite.active}
          aria-label={favorite.active ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`}
          onClick={() => favorite.toggle()}
        >
          <Heart className={cn("size-5", favorite.active && "fill-amber")} />
        </button>
        {/* Desktop: barra de ações ao passar o mouse ou focar. */}
        <div className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 gap-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 md:flex">
          <CardAction
            label={edition ? `Adicionar ${nft.name} ao carrinho` : `${nft.name} esgotado`}
            disabled={!edition || quickAdd.isPending}
            onClick={() => quickAdd.mutate()}
          >
            <ShoppingCart className="size-[18px]" />
          </CardAction>
          <CardAction
            label={favorite.active ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`}
            pressed={favorite.active}
            onClick={() => favorite.toggle()}
          >
            <Heart className={cn("size-[18px]", favorite.active && "fill-cream")} />
          </CardAction>
          <CardAction label={`Ver detalhes de ${nft.name}`} onClick={() => void navigate({ to: "/nfts/$nftId", params: { nftId: nft.id } })}>
            <Search className="size-[18px]" />
          </CardAction>
        </div>
      </div>
      <div className="px-2 pt-3 md:px-0 md:pt-[14px]">
        <h3 className="text-[15px] leading-5 tracking-wide md:text-base">
          <Link to="/nfts/$nftId" params={{ nftId: nft.id }} tabIndex={-1} className="hover:text-amber">
            {nft.name}
          </Link>
        </h3>
        <p className="mt-0.5 text-base font-bold tracking-wide md:mt-1.5">
          <span className="text-amber">{formatEth(nft.price)} ETH</span>
          {nft.compareAtPrice ? (
            <span className="ml-3 font-normal text-faint">
              <span className="sr-only">Preço anterior </span>
              <s>{formatEth(nft.compareAtPrice)} ETH</s>
            </span>
          ) : null}
        </p>
        {!edition ? <p className="mt-1 text-xs text-danger">Esgotado</p> : null}
      </div>
    </article>
  )
}

function CardAction({
  label,
  children,
  onClick,
  disabled,
  pressed,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      className="grid size-[34px] place-items-center rounded-[4px] bg-ink/90 text-cream hover:bg-fill hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function NftCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} aria-hidden="true">
      <Skeleton className="aspect-square rounded-[24px] md:aspect-auto md:h-[300px] md:rounded-none" />
      <Skeleton className="h-4 w-2/3 rounded" />
      <Skeleton className="h-4 w-1/3 rounded" />
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams, useRouter } from "@tanstack/react-router"
import { ChevronLeft, Heart, Mail, Minus, Plus, Search, ShoppingCart, Star } from "lucide-react"
import { useState } from "react"
import { LinkedinIcon, TwitterIcon } from "@/components/brand-icons.tsx"
import { NftArt } from "@/components/nft-art.tsx"
import { RelatedCarousel } from "@/components/related.tsx"
import { EmptyState, ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx"
import type { Edition, Nft } from "@/contracts/api.ts"
import { networkLabel } from "@/contracts/api.ts"
import { useOwnerId } from "@/features/cart.ts"
import { useFavoriteToggle } from "@/features/favorites.ts"
import { announce } from "@/lib/announce.ts"
import { ApiRequestError } from "@/lib/api/client.ts"
import { addCartItem, getNft } from "@/lib/api/http.ts"
import { formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { cn } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

export function NftPage() {
  const { nftId } = useParams({ from: "/nfts/$nftId" })
  const nft = useQuery({
    queryKey: queryKeys.nft(nftId),
    queryFn: ({ signal }) => getNft(nftId, signal),
    retry: (failureCount, error) => (error instanceof ApiRequestError && error.status === 404 ? false : failureCount < 1),
  })

  if (nft.isPending) return <DetailSkeleton />
  if (nft.isError) {
    const missing = nft.error instanceof ApiRequestError && nft.error.status === 404
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-6 lg:px-0">
        {missing ? (
          <EmptyState
            title="NFT não encontrado"
            text={`Não existe um NFT com o identificador “${nftId}” no catálogo.`}
            action={
              <Button asChild>
                <Link to="/">Voltar ao catálogo</Link>
              </Button>
            }
          />
        ) : (
          <ErrorBlock message={errorMessage(nft.error, "Falha ao carregar o NFT.")} onRetry={() => void nft.refetch()} />
        )}
      </div>
    )
  }
  return <NftDetail nft={nft.data} />
}

const views = [
  { label: "Obra completa", className: "" },
  { label: "Detalhe do rosto", className: "scale-[1.6] origin-[50%_38%]" },
  { label: "Detalhe do acessório", className: "scale-[1.8] origin-[60%_70%]" },
  { label: "Detalhe do fundo", className: "scale-[1.35] origin-[20%_20%]" },
]

function defaultEdition(nft: Nft) {
  return nft.editions.find((item) => item.status === "open" && item.remaining > 0) ?? nft.editions[0]
}

function NftDetail({ nft }: { nft: Nft }) {
  const favorite = useFavoriteToggle(nft.id, nft.name)
  const [editionId, setEditionId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [view, setView] = useState(0)
  const [zoom, setZoom] = useState(false)
  const [tab, setTab] = useState<"details" | "reviews">("details")
  const [formError, setFormError] = useState("")
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const ownerId = useOwnerId()

  const edition: Edition | undefined = nft.editions.find((item) => item.id === editionId) ?? defaultEdition(nft)
  const soldOut = !edition || edition.remaining < 1 || edition.status === "soldout"
  const max = soldOut ? 0 : edition.remaining
  const qty = Math.min(Math.max(1, quantity), Math.max(1, max))

  const mutation = useMutation({
    mutationFn: (input: { editionId: string; quantity: number }) => addCartItem({ nftId: nft.id, ...input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.cart(ownerId) })
      await queryClient.invalidateQueries({ queryKey: ["quote"] })
      announce(`${nft.name} adicionado ao carrinho.`)
    },
    onError: (error) => setFormError(errorMessage(error, "Não foi possível adicionar ao carrinho.")),
  })

  async function add(goToCart: boolean) {
    if (!edition || soldOut) return
    setFormError("")
    try {
      await mutation.mutateAsync({ editionId: edition.id, quantity: qty })
      if (goToCart) void navigate({ to: "/cart" })
    } catch {
      /* onError exibe a mensagem */
    }
  }

  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/nfts/${nft.id}`
  const stepper = (
    <div className="flex items-center gap-4" role="group" aria-label="Quantidade">
      <button
        type="button"
        className="grid h-[46px] w-8 place-items-center rounded-full bg-fill text-ink disabled:opacity-40 max-md:h-[34px] max-md:w-[22px]"
        aria-label="Diminuir quantidade"
        disabled={soldOut || qty <= 1}
        onClick={() => setQuantity(qty - 1)}
      >
        <Minus className="size-5" strokeWidth={3} />
      </button>
      <output className="min-w-4 text-center text-lg" aria-live="polite" aria-label={`Quantidade: ${qty}`}>
        {qty}
      </output>
      <button
        type="button"
        className="grid h-[46px] w-8 place-items-center rounded-full bg-fill text-ink disabled:opacity-40 max-md:h-[34px] max-md:w-[22px]"
        aria-label="Aumentar quantidade"
        disabled={soldOut || qty >= max}
        onClick={() => setQuantity(qty + 1)}
      >
        <Plus className="size-5" strokeWidth={3} />
      </button>
    </div>
  )

  const editionPicker = (
    <fieldset className="mt-4 md:mt-2">
      <legend className="text-base font-bold tracking-wide md:text-[15px]">Edição:</legend>
      <div className="mt-2 flex flex-wrap gap-2 md:gap-1.5">
        {nft.editions.map((item) => {
          const unavailable = item.status === "soldout" || item.remaining < 1
          const active = item.id === edition?.id
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              disabled={unavailable}
              title={unavailable ? `Edição ${item.label} esgotada` : `${item.remaining} disponíveis`}
              className={cn(
                "h-[42px] rounded-full border px-3 text-base tracking-wide uppercase md:h-[26px] md:px-2 md:text-[13px]",
                active ? "border-2 border-fill font-bold text-amber" : "border-[#3b271c] text-muted hover:border-fill",
                unavailable && "cursor-not-allowed line-through opacity-50",
              )}
              onClick={() => {
                setEditionId(item.id)
                setQuantity(1)
                setFormError("")
              }}
            >
              {item.label}
              <span className="sr-only">{unavailable ? " (esgotada)" : ` (${item.remaining} disponíveis)`}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-faint" role="status">
        {soldOut
          ? "Esta edição está esgotada. Escolha outra edição disponível."
          : qty >= max
            ? `Limite atingido: ${max} disponível${max === 1 ? "" : "is"} nesta edição.`
            : `${edition?.remaining} disponíveis nesta edição.`}
      </p>
    </fieldset>
  )

  const meta = (
    <dl className="grid gap-2 text-base tracking-wide text-faint md:gap-2 md:text-[15px]">
      <div className="flex gap-2">
        <dt>ID do token:</dt>
        <dd>{nft.tokenId}</dd>
      </div>
      <div className="flex gap-2">
        <dt>Coleção:</dt>
        <dd>{nft.collection}</dd>
      </div>
      <div className="flex gap-2">
        <dt>Atributos:</dt>
        <dd>{nft.attributes.join(", ")}</dd>
      </div>
    </dl>
  )

  return (
    <div className="mx-auto max-w-[1200px] md:px-6 lg:px-0">
      {/* ===== Mobile ===== */}
      <div className="pb-[200px] md:hidden">
        <div className="relative px-7 pt-6">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => (window.history.length > 1 ? router.history.back() : void navigate({ to: "/" }))}
              className="grid size-[35px] place-items-center rounded-full border border-[#3b271c] bg-panel text-cream"
              aria-label="Voltar"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => favorite.toggle()}
              aria-pressed={favorite.active}
              aria-label={favorite.active ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`}
              className="grid size-[35px] place-items-center rounded-full border border-[#3b271c] bg-panel text-amber"
            >
              <Heart className={cn("size-5", favorite.active && "fill-amber")} />
            </button>
          </div>
          <div className="overflow-hidden rounded-t-[24px]">
            <NftArt art={nft.art} alt={`Ilustração de ${nft.name}`} priority sizes="100vw" className="w-full" />
          </div>
        </div>
        <section className="-mt-1 rounded-t-[40px] bg-panel px-6 pt-9 pb-10">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold tracking-wide">{nft.name}</h1>
            <p className="flex shrink-0 items-center gap-1 rounded-full border border-fill px-2 py-0.5 text-base">
              <Star className="size-4 fill-fill text-fill" aria-hidden="true" />
              <span className="sr-only">Avaliação </span>
              {nft.rating}
              <span className="text-muted">({nft.reviews})</span>
            </p>
          </div>
          <p className="mt-4 text-base leading-6 tracking-wide text-muted">{nft.description}</p>
          {editionPicker}
          <div className="mt-4">{meta}</div>
          {formError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
        </section>
        <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-[32px] bg-panel-2 px-6 pt-7 pb-[max(24px,env(safe-area-inset-bottom))] shadow-[0_-16px_32px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-base font-bold tracking-wide">Qtd.</span>
              {stepper}
            </div>
            <p className="text-[22px] font-bold tracking-wide text-amber">{formatEth(nft.price)} ETH</p>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="pill" size="xl" className="flex-1" disabled={soldOut || mutation.isPending} onClick={() => void add(true)}>
              Comprar NFT
            </Button>
            <button
              type="button"
              onClick={() => void add(false)}
              disabled={soldOut || mutation.isPending}
              aria-label="Adicionar ao carrinho"
              className="grid size-[60px] place-items-center rounded-full bg-panel text-amber disabled:opacity-40"
            >
              <ShoppingCart className="size-6 fill-amber" />
            </button>
          </div>
        </div>
      </div>

      {/* ===== Desktop / tablet ===== */}
      <div className="hidden md:block">
        <nav aria-label="Trilha" className="pt-8 text-[15px] font-bold tracking-wide">
          <Link to="/" className="hover:text-amber">
            Início
          </Link>
          <span aria-hidden="true"> / </span>
          <Link to="/" hash="catalogo" className="hover:text-amber">
            Mercado
          </Link>
        </nav>
        <article className="mt-2 grid gap-8 lg:grid-cols-[572px_minmax(0,1fr)]">
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-7">
            <ul className="grid content-start gap-4" aria-label="Galeria">
              {views.map((item, index) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => setView(index)}
                    aria-pressed={view === index}
                    aria-label={item.label}
                    className={cn("block overflow-hidden rounded-[8px] border-2", view === index ? "border-fill" : "border-transparent")}
                  >
                    <NftArt art={nft.art} alt="" sizes="100px" eager className={cn("w-full", item.className)} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="relative h-fit bg-panel p-5">
              <div className="overflow-hidden rounded-[20px]">
                <NftArt
                  art={nft.art}
                  alt={`Ilustração de ${nft.name} — ${views[view].label.toLowerCase()}`}
                  priority
                  sizes="(min-width: 1024px) 404px, 60vw"
                  className={cn("w-full transition-transform", views[view].className)}
                />
              </div>
              <button
                type="button"
                onClick={() => setZoom(true)}
                className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-ink/90 text-cream"
                aria-label="Ampliar imagem"
              >
                <Search className="size-[18px]" />
              </button>
            </div>
          </div>

          <div className="lg:pl-1">
            <h1 className="text-[28px] font-bold tracking-wide">{nft.name}</h1>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
              <p className="text-[22px] font-bold tracking-wide text-amber">{formatEth(nft.price)} ETH</p>
              <p className="flex items-center gap-1.5 text-[15px] tracking-wide">
                <span className="flex" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star key={index} className="size-[14px] fill-fill text-fill" />
                  ))}
                </span>
                <span className="sr-only">Nota {nft.rating} de 5, </span>
                {nft.reviews} avaliações de colecionadores
              </p>
            </div>
            <h2 className="mt-4 text-[15px] font-bold tracking-wide">Sobre este NFT:</h2>
            <p className="mt-2 text-sm leading-6 tracking-wide text-muted">{nft.description}</p>
            {editionPicker}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              {stepper}
              <div className="flex gap-2">
                <Button className="h-10 w-[130px]" disabled={soldOut || mutation.isPending} onClick={() => void add(true)}>
                  {mutation.isPending ? "ADICIONANDO" : "COMPRAR"}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 w-[130px] font-medium"
                  aria-pressed={favorite.active}
                  aria-label={favorite.active ? `Remover ${nft.name} dos favoritos` : `Favoritar ${nft.name}`}
                  onClick={() => favorite.toggle()}
                >
                  <Heart className={cn("size-5", favorite.active && "fill-fill text-fill")} aria-hidden="true" />
                  {favorite.active ? "Favorito" : "Favoritar"}
                </Button>
              </div>
            </div>
            {formError ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="mt-6">{meta}</div>
            <div className="mt-3 flex items-center gap-3 text-[15px] font-bold tracking-wide">
              <span>Compartilhar este NFT:</span>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Compartilhar no LinkedIn (abre em nova aba)"
                className="hover:text-amber"
              >
                <LinkedinIcon className="size-5" />
              </a>
              <a href={`mailto:?subject=${encodeURIComponent(nft.name)}&body=${encodeURIComponent(shareUrl)}`} aria-label="Compartilhar por e-mail" className="hover:text-amber">
                <Mail className="size-5" />
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(nft.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Compartilhar no Twitter (abre em nova aba)"
                className="hover:text-amber"
              >
                <TwitterIcon className="size-5" />
              </a>
            </div>
          </div>
        </article>

        <section className="mt-20 md:mt-[100px]">
          <div role="tablist" aria-label="Informações do NFT" className="flex gap-8 border-b border-line">
            {(
              [
                ["details", "Detalhes do NFT"],
                ["reviews", `Avaliações de colecionadores (${nft.reviews})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                id={`tab-${key}`}
                role="tab"
                type="button"
                aria-selected={tab === key}
                aria-controls={`panel-${key}`}
                onClick={() => setTab(key)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                    const next = key === "details" ? "reviews" : "details"
                    setTab(next)
                    document.getElementById(`tab-${next}`)?.focus()
                  }
                }}
                tabIndex={tab === key ? 0 : -1}
                className={cn(
                  "-mb-px border-b-[3px] pb-2 text-lg tracking-wide",
                  tab === key ? "border-fill font-bold text-amber" : "border-transparent text-cream hover:text-amber",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "details" ? (
            <div id="panel-details" role="tabpanel" aria-labelledby="tab-details" className="mt-5 grid gap-3 text-sm leading-6 tracking-wide text-muted">
              <p>
                {nft.name} é uma obra digital {defaultEdition(nft)?.label ?? ""} finalizada à mão da coleção Kurio Editions. Cada atributo fica armazenado
                nos metadados do token e verificado na {networkLabel[nft.network]}. A obra explora identidade, movimento e luz em um mundo digital sem
                fronteiras.
              </p>
              <p className="mt-3">
                A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro permanente de procedência
                registrada na rede. O criador recebe 5% de direitos autorais nas vendas secundárias, apoiando novos trabalhos e lançamentos da
                comunidade.
              </p>
              <h3 className="mt-1 font-bold text-cream">Rede:</h3>
              <p className="-mt-3">Cunhado na {networkLabel[nft.network]} com procedência imutável e metadados armazenados no IPFS.</p>
              <h3 className="font-bold text-cream">Contrato:</h3>
              <p className="-mt-3">Direitos autorais do criador: 5% nas vendas secundárias, pagos automaticamente pelos mercados compatíveis.</p>
              <h3 className="font-bold text-cream">Direitos autorais:</h3>
              <p className="-mt-3">0x7A42...19E8 · Contrato inteligente ERC-721 verificado (referência simulada).</p>
            </div>
          ) : (
            <div id="panel-reviews" role="tabpanel" aria-labelledby="tab-reviews" className="mt-5 text-sm leading-6 tracking-wide text-muted">
              <p>
                Nota média <strong className="text-cream">{nft.rating} de 5</strong> em {nft.reviews} avaliações de colecionadores.
              </p>
              <p className="mt-2">A leitura e o envio de avaliações individuais não fazem parte desta entrega.</p>
            </div>
          )}
        </section>

        <RelatedCarousel title="Mais desta coleção" params={{ collections: nft.collection, sort: "trending" }} excludeId={nft.id} />
      </div>

      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="w-[min(100%-2rem,760px)] p-4 md:p-6" accentBar={false}>
          <DialogTitle className="pr-10 text-lg font-bold">{nft.name}</DialogTitle>
          <DialogDescription className="sr-only">Imagem ampliada da obra.</DialogDescription>
          <img src={`/nfts/${nft.art}-1080.webp`} alt={`Ilustração de ${nft.name} ampliada`} width={1080} height={1080} className="mt-4 w-full rounded-[12px]" />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Dimensões próximas às do conteúdo final (trilha, galeria, abas e carrossel) para evitar CLS.
function DetailSkeleton() {
  return (
    <div className="mx-auto min-h-[1400px] max-w-[1200px] px-6 pt-8 md:min-h-[1900px] md:px-6 lg:px-0" data-testid="detail-skeleton" aria-hidden="true">
      <Skeleton className="mb-2 hidden h-[22px] w-40 rounded md:block" />
      <div className="grid gap-8 lg:grid-cols-[572px_minmax(0,1fr)]">
        <div className="grid gap-7 md:grid-cols-[100px_minmax(0,1fr)]">
          <div className="hidden gap-4 md:grid">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="size-[100px] rounded-[8px]" />
            ))}
          </div>
          <Skeleton className="aspect-square rounded-[24px] md:rounded-none" />
        </div>
        <div className="grid content-start gap-4">
          <Skeleton className="h-9 w-2/3 rounded" />
          <Skeleton className="h-7 w-1/3 rounded" />
          <Skeleton className="h-24 w-full rounded" />
          <Skeleton className="h-7 w-1/2 rounded" />
          <Skeleton className="h-12 w-full rounded" />
        </div>
      </div>
    </div>
  )
}

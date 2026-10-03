import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { Minus, Plus, Trash2, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { NftArt } from "@/components/nft-art.tsx"
import { RelatedCarousel } from "@/components/related.tsx"
import { MobileHeader } from "@/components/shell.tsx"
import { EmptyState, ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import type { CartLine, Quote } from "@/contracts/api.ts"
import { useCart } from "@/features/cart.ts"
import { useSession } from "@/features/session.ts"
import { announce } from "@/lib/announce.ts"
import { applyCoupon, getQuote, removeCartItem, removeCoupon, updateCartItem } from "@/lib/api/http.ts"
import { cmpEth, formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { cn } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

type Change = { id: string; name: string; text: string }

/** Detecta mudanças de preço/disponibilidade recebidas enquanto o carrinho está aberto. */
function useLineChanges(items: CartLine[] | undefined) {
  const seen = useRef(new Map<string, { price: string; available: boolean; max: number }>())
  const [changes, setChanges] = useState<Change[]>([])
  useEffect(() => {
    if (!items) return
    const next: Change[] = []
    for (const item of items) {
      const before = seen.current.get(item.id)
      if (before) {
        if (cmpEth(before.price, item.unitPrice) !== 0) {
          next.push({ id: `${item.id}:price:${item.unitPrice}`, name: item.name, text: `preço alterado de ${formatEth(before.price)} para ${formatEth(item.unitPrice)} ETH` })
        }
        if (before.available && !item.available) {
          next.push({ id: `${item.id}:availability:${item.maxQuantity}`, name: item.name, text: item.maxQuantity === 0 ? "edição esgotada" : `apenas ${item.maxQuantity} disponível(is)` })
        }
      }
      seen.current.set(item.id, { price: item.unitPrice, available: item.available, max: item.maxQuantity })
    }
    if (next.length) setChanges((current) => [...current.filter((entry) => !next.some((item) => item.id === entry.id)), ...next])
  }, [items])
  return { changes, dismiss: () => setChanges([]) }
}

export function CartPage() {
  const session = useSession()
  const navigate = useNavigate()
  const { ownerId, cart } = useCart()
  const queryClient = useQueryClient()
  const quote = useQuery({
    queryKey: queryKeys.quote(ownerId, "ethereum"),
    queryFn: ({ signal }) => getQuote("ethereum", signal),
    enabled: Boolean(cart.data),
  })
  const { changes, dismiss } = useLineChanges(cart.data?.items)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.cart(ownerId) })
    await queryClient.invalidateQueries({ queryKey: ["quote"] })
  }
  const update = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => updateCartItem(id, quantity),
    onSuccess: () => void refresh(),
    onError: (error) => announce(errorMessage(error, "Não foi possível atualizar a quantidade.")),
  })
  const remove = useMutation({
    mutationFn: (line: CartLine) => removeCartItem(line.id),
    onSuccess: (_data, line) => {
      announce(`${line.name} removido do carrinho.`)
      void refresh()
    },
    onError: (error) => announce(errorMessage(error, "Não foi possível remover o item.")),
  })

  const items = cart.data?.items ?? []
  const hasItems = items.length > 0
  const blocked = items.some((item) => !item.available)
  const checkoutTarget = session.data?.user ? { to: "/checkout" as const } : { to: "/login" as const, search: { redirect: "/checkout" } }

  const lineProps = {
    pending: update.isPending || remove.isPending,
    onQuantity: (line: CartLine, quantity: number) => update.mutate({ id: line.id, quantity }),
    onRemove: (line: CartLine) => remove.mutate(line),
  }

  const notice =
    changes.length > 0 ? (
      <div className="flex items-start gap-3 border border-fill/60 bg-band/60 p-4 text-sm leading-6" role="status">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-bold">O carrinho foi atualizado enquanto você navegava:</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {changes.map((change) => (
              <li key={change.id}>
                {change.name}: {change.text}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-muted">O resumo abaixo já reflete a nova cotação.</p>
        </div>
        <button type="button" className="text-xs font-bold text-amber underline" onClick={dismiss}>
          Ok
        </button>
      </div>
    ) : null

  return (
    <div className="mx-auto max-w-[1200px] max-md:flex max-md:min-h-dvh max-md:flex-col md:px-6 lg:px-0">
      <MobileHeader title="Carrinho de NFTs" />
      <nav aria-label="Trilha" className="hidden pt-8 text-[15px] font-bold tracking-wide md:block">
        <Link to="/" className="hover:text-amber">
          Início
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to="/" hash="catalogo" className="hover:text-amber">
          Mercado
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Carrinho</span>
      </nav>
      <h1 className="sr-only max-md:hidden">Carrinho de NFTs</h1>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 max-md:flex max-md:flex-1 max-md:flex-col max-md:items-stretch md:mt-1 lg:grid-cols-[782px_minmax(0,332px)] lg:justify-between">
        <section aria-labelledby="itens-titulo" className="px-6 md:px-0">
          <h2 id="itens-titulo" className="sr-only">
            Itens do carrinho
          </h2>
          {notice ? <div className="mb-4">{notice}</div> : null}
          <div className="hidden grid-cols-[minmax(0,1fr)_100px_100px_120px_40px] gap-x-3 border-b border-line pb-3 text-[15px] font-bold tracking-wide md:grid lg:grid-cols-[minmax(0,1fr)_138px_136px_150px_48px] lg:gap-x-0" aria-hidden="true">
            <span>NFTs</span>
            <span>Preço</span>
            <span>Edições</span>
            <span>Total</span>
            <span />
          </div>
          {cart.isPending ? <CartSkeleton /> : null}
          {cart.isError ? <ErrorBlock className="mt-4" message={errorMessage(cart.error, "Não foi possível carregar o carrinho.")} onRetry={() => void cart.refetch()} /> : null}
          {cart.data && !hasItems ? (
            <EmptyState
              className="mt-4"
              title="Seu carrinho está vazio"
              text="Explore o catálogo e escolha uma edição para começar sua coleção."
              action={
                <Button asChild>
                  <Link to="/">Explorar NFTs</Link>
                </Button>
              }
            />
          ) : null}
          {hasItems ? (
            <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-6 md:mt-3 md:gap-3">
              {items.map((line) => (
                <li key={line.id}>
                  <CartRow line={line} {...lineProps} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <aside aria-labelledby="resumo-titulo" className="rounded-t-[40px] bg-panel px-6 pt-7 pb-[max(2.5rem,env(safe-area-inset-bottom))] max-md:mt-auto md:rounded-none md:bg-transparent md:p-0">
          <h2 id="resumo-titulo" className="hidden border-b border-line pb-3 text-lg font-bold tracking-wide md:block">
            Resumo da carteira
          </h2>
          <CouponForm ownerId={ownerId} couponCode={cart.data?.couponCode ?? null} quote={quote.data} onChanged={refresh} />
          {quote.isPending && cart.data ? <QuoteSkeleton /> : null}
          {quote.isError ? <ErrorBlock className="mt-4" message={errorMessage(quote.error, "Não foi possível calcular o resumo.")} onRetry={() => void quote.refetch()} /> : null}
          {quote.data ? <QuoteSummary quote={quote.data} /> : null}
          {quote.isFetching && !quote.isPending ? (
            <p className="mt-2 text-xs text-faint" role="status">
              Atualizando resumo…
            </p>
          ) : null}
          {blocked ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              Ajuste os itens indisponíveis antes de finalizar.
            </p>
          ) : null}
          <Button
            type="button"
            variant="default"
            className="mt-8 h-10 w-full max-md:h-[60px] max-md:rounded-full max-md:bg-fill-gradient max-md:text-lg"
            disabled={!hasItems || blocked}
            onClick={() => void navigate(checkoutTarget)}
          >
            Conectar e finalizar
          </Button>
          <Link to="/" hash="catalogo" className="mt-4 hidden text-center text-[15px] tracking-wide text-amber hover:underline md:block">
            Continuar explorando
          </Link>
        </aside>
      </div>

      <div className="hidden md:block">
        <RelatedCarousel title="Colecionadores também viram" params={{ sort: "trending" }} />
      </div>
    </div>
  )
}

function CartRow({
  line,
  pending,
  onQuantity,
  onRemove,
}: {
  line: CartLine
  pending: boolean
  onQuantity: (line: CartLine, quantity: number) => void
  onRemove: (line: CartLine) => void
}) {
  const atMax = line.quantity >= line.maxQuantity
  const status = !line.available ? (
    <p className="text-xs text-danger" role="status">
      {line.maxQuantity === 0 ? "Edição esgotada — remova o item." : `Disponível: ${line.maxQuantity}. Reduza a quantidade.`}
    </p>
  ) : null
  const stepper = (size: "sm" | "lg") => (
    <div className="flex items-center gap-1.5 min-[380px]:gap-2.5" role="group" aria-label={`Quantidade de ${line.name}`}>
      <button
        type="button"
        aria-label={`Diminuir ${line.name}`}
        disabled={pending || line.quantity <= 1}
        onClick={() => onQuantity(line, line.quantity - 1)}
        className={cn(
          "grid place-items-center rounded-full disabled:opacity-40",
          size === "sm" ? "h-[26px] w-[18px] bg-fill text-ink" : "size-[28px] bg-[#2e1a10] text-cream min-[380px]:size-[31px]",
        )}
      >
        <Minus className={size === "sm" ? "size-3" : "size-4"} strokeWidth={3} />
      </button>
      <output className={cn("min-w-4 text-center", size === "sm" ? "text-base" : "text-lg")} aria-label={`${line.quantity} unidades`}>
        {line.quantity}
      </output>
      <button
        type="button"
        aria-label={`Aumentar ${line.name}`}
        disabled={pending || atMax}
        title={atMax ? `Limite da edição: ${line.maxQuantity}` : undefined}
        onClick={() => onQuantity(line, line.quantity + 1)}
        className={cn(
          "grid place-items-center rounded-full disabled:opacity-40",
          size === "sm" ? "h-[26px] w-[18px] bg-fill text-ink" : "size-[28px] bg-[#2e1a10] text-cream min-[380px]:size-[31px]",
        )}
      >
        <Plus className={size === "sm" ? "size-3" : "size-4"} strokeWidth={3} />
      </button>
    </div>
  )
  const removeButton = (
    <button
      type="button"
      onClick={() => onRemove(line)}
      disabled={pending}
      aria-label={`Remover ${line.name} do carrinho`}
      className="grid size-9 place-items-center rounded-full text-cream hover:text-amber"
    >
      <Trash2 className="size-5" />
    </button>
  )

  return (
    <article className={cn(!line.available && "outline outline-1 outline-danger/60")}>
      {/* Desktop */}
      <div className="hidden min-h-[70px] grid-cols-[minmax(0,1fr)_100px_100px_120px_40px] items-center gap-x-3 bg-panel md:grid lg:grid-cols-[minmax(0,1fr)_138px_136px_150px_48px] lg:gap-x-0">
        <div className="flex items-center gap-4">
          <NftArt art={line.art} alt="" sizes="70px" className="size-[70px] rounded-[4px]" />
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-wide">
              <Link to="/nfts/$nftId" params={{ nftId: line.nftId }} className="hover:text-amber">
                {line.name}
              </Link>
            </h3>
            <p className="text-sm tracking-wide text-faint">
              ID do token: {line.tokenId}
              <span className="sr-only">, edição {line.editionLabel}</span>
            </p>
            {status}
          </div>
        </div>
        <p className="text-base font-bold tracking-wide text-muted">{formatEth(line.unitPrice)} ETH</p>
        {stepper("sm")}
        <p className="text-base font-bold tracking-wide text-amber">{formatEth(line.lineTotal)} ETH</p>
        {removeButton}
      </div>
      {/* Mobile */}
      <div className="flex rounded-[16px] bg-panel md:hidden">
        <NftArt art={line.art} alt="" sizes="100px" className="size-[84px] shrink-0 rounded-[12px] min-[380px]:size-[100px]" />
        <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 pl-2.5">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] leading-5 font-bold tracking-wide min-[380px]:text-base">
              <Link to="/nfts/$nftId" params={{ nftId: line.nftId }}>
                {line.name}
              </Link>
            </h3>
            <p className="text-sm tracking-wide whitespace-nowrap text-muted">Edição: {line.editionLabel}</p>
            <p className="mt-2 text-base font-bold tracking-wide whitespace-nowrap text-amber min-[380px]:text-lg">{formatEth(line.lineTotal)} ETH</p>
            {status}
          </div>
          <div className="flex flex-col items-end gap-1">
            {stepper("lg")}
            {removeButton}
          </div>
        </div>
      </div>
    </article>
  )
}

export function CouponForm({
  ownerId,
  couponCode,
  quote,
  onChanged,
}: {
  ownerId: string
  couponCode: string | null
  quote?: Quote
  onChanged: () => Promise<void>
}) {
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const apply = useMutation({
    mutationFn: () => applyCoupon(code),
    onSuccess: async () => {
      setError("")
      setCode("")
      announce("Cupom aplicado.")
      await onChanged()
    },
    onError: (caught) => setError(errorMessage(caught, "Cupom inválido.")),
  })
  const clear = useMutation({
    mutationFn: () => removeCoupon(),
    onSuccess: async () => {
      setError("")
      announce("Cupom removido.")
      await onChanged()
    },
  })
  const inactive = quote?.coupon && !quote.coupon.valid

  return (
    <form
      className="md:mt-6"
      data-owner={ownerId}
      onSubmit={(event) => {
        event.preventDefault()
        if (!code.trim()) {
          setError("Informe o código promocional.")
          return
        }
        apply.mutate()
      }}
      noValidate
    >
      <label htmlFor="cupom" className="hidden text-sm font-bold tracking-wide md:block">
        Código promocional
      </label>
      <label htmlFor="cupom" className="sr-only md:hidden">
        Código promocional
      </label>
      <div className="mt-2 flex h-[50px] rounded-full border border-[#4a2c1a] md:h-10 md:rounded-none md:border-0">
        <input
          id="cupom"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Digite o código promocional..."
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "cupom-erro" : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-l-full bg-transparent px-5 text-base tracking-wide text-cream outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-fill md:rounded-none md:border md:border-fill md:px-2 md:text-xs"
        />
        <button
          type="submit"
          disabled={apply.isPending}
          className="rounded-full bg-fill-gradient px-6 text-lg font-bold text-cream md:rounded-none md:bg-fill md:bg-none md:px-5 md:text-[15px] md:text-ink"
        >
          {apply.isPending ? "…" : "Aplicar"}
        </button>
      </div>
      {error ? (
        <p id="cupom-erro" className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {couponCode ? (
        <p className="mt-2 flex items-center justify-between gap-2 text-sm" role="status">
          <span className={inactive ? "text-danger" : "text-ok"}>
            Cupom {couponCode} {inactive ? (quote?.coupon && !quote.coupon.valid && quote.coupon.reason === "expired" ? "expirado" : "inválido") : "aplicado"}
          </span>
          <button type="button" className="text-amber underline" onClick={() => clear.mutate()} disabled={clear.isPending}>
            Remover cupom
          </button>
        </p>
      ) : null}
    </form>
  )
}

export function QuoteSummary({ quote, compact = false }: { quote: Pick<Quote, "subtotal" | "discount" | "networkFee" | "total">; compact?: boolean }) {
  const hasDiscount = cmpEth(quote.discount, "0") > 0
  return (
    <dl className={cn("grid gap-3 text-[15px] tracking-wide min-[380px]:text-[17px] min-[410px]:text-lg md:gap-2 md:text-[15px]", compact ? "mt-3" : "mt-5")} data-testid="quote-summary">
      <div className="flex justify-between gap-4">
        <dt>Subtotal</dt>
        <dd className="shrink-0 text-sm whitespace-nowrap min-[380px]:text-base md:text-lg">{formatEth(quote.subtotal)} ETH</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="min-w-0">Desconto do lançamento</dt>
        <dd className={cn("shrink-0 text-sm whitespace-nowrap min-[380px]:text-base", hasDiscount && "text-ok")}>{hasDiscount ? `(-) ${formatEth(quote.discount)} ETH` : "(-) 00.00"}</dd>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-4">
        <dt>Taxa de rede</dt>
        <dd className="text-right text-sm whitespace-nowrap min-[380px]:text-base md:text-lg">{formatEth(quote.networkFee)} ETH</dd>
        <dd className="col-span-2 text-right text-sm text-amber md:text-xs">Taxa estimada</dd>
      </div>
      <div className="mt-2 flex justify-between gap-4 text-lg font-bold min-[380px]:text-xl md:text-[15px]">
        <dt>Total</dt>
        <dd className="whitespace-nowrap text-amber md:text-lg">{formatEth(quote.total)} ETH</dd>
      </div>
    </dl>
  )
}

function CartSkeleton() {
  return (
    <div className="mt-3 grid gap-3" data-testid="cart-skeleton" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-[100px] rounded-[16px] md:h-[70px] md:rounded-none" />
      ))}
    </div>
  )
}

function QuoteSkeleton() {
  return (
    <div className="mt-5 grid gap-3" data-testid="quote-skeleton" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-6 rounded" />
      ))}
    </div>
  )
}

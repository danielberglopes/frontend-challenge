import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { LoaderCircle, TriangleAlert, X } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { ThankYouIcon } from "@/components/brand-icons.tsx"
import { NftArt } from "@/components/nft-art.tsx"
import { ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import type { Order } from "@/contracts/api.ts"
import { networkLabel, walletTypeLabel } from "@/contracts/api.ts"
import { pendingOrderStorage } from "@/pages/checkout.tsx"
import { getOrder } from "@/lib/api/http.ts"
import { formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function shortDate(iso: string) {
  const date = new Date(iso)
  return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`
}

function shortHash(hash: string) {
  return `0x${hash.slice(2, 6).toUpperCase()}…${hash.slice(-4).toUpperCase()}`
}

export function OrderPage() {
  const { orderId } = useParams({ from: "/orders/$orderId" })
  const order = useQuery({
    queryKey: queryKeys.order(orderId),
    queryFn: ({ signal }) => getOrder(orderId, signal),
    // Rede de segurança caso o evento order.updated se perca; o socket é a via principal.
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 4000 : false),
  })

  useEffect(() => {
    if (order.data && order.data.status !== "pending" && sessionStorage.getItem(pendingOrderStorage) === order.data.id) {
      sessionStorage.removeItem(pendingOrderStorage)
    }
  }, [order.data])

  if (order.isPending) {
    return (
      <Receipt>
        <div className="grid justify-items-center gap-4 py-16" role="status">
          <LoaderCircle className="size-10 animate-spin text-amber motion-reduce:animate-none" aria-hidden="true" />
          <p>Carregando pedido…</p>
        </div>
      </Receipt>
    )
  }
  if (order.isError) {
    return (
      <Receipt>
        <div className="p-6 md:p-10">
          <h1 className="text-xl font-bold">Pedido indisponível</h1>
          <ErrorBlock className="mt-4" message={errorMessage(order.error, "Não foi possível carregar o pedido.")} onRetry={() => void order.refetch()} />
          <Button asChild className="mt-6">
            <Link to="/cart">Voltar ao carrinho</Link>
          </Button>
        </div>
      </Receipt>
    )
  }

  const current = order.data
  if (current.status === "pending") return <PendingOrder order={current} />
  if (current.status === "declined") return <DeclinedOrder order={current} />
  return <ConfirmedOrder order={current} />
}

/** Moldura do frame "Confirmação de Pedido": cartão centralizado sobre fundo escuro, com barra laranja. */
function Receipt({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-screen place-items-center bg-ink-deep px-4 py-10 md:py-[166px]">
      <div className="relative w-full max-w-[578px] border-b-[10px] border-fill bg-panel">
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="absolute top-4 right-4 z-10 grid size-8 place-items-center rounded-full text-amber hover:bg-white/5"
          aria-label="Fechar e voltar ao início"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>
  )
}

function PendingOrder({ order }: { order: Order }) {
  return (
    <Receipt>
      <section className="grid justify-items-center gap-4 px-6 py-14 text-center md:px-12" role="status" aria-live="polite">
        <LoaderCircle className="size-12 animate-spin text-amber motion-reduce:animate-none" aria-hidden="true" />
        <h1 className="text-lg font-bold tracking-wide text-amber">Pedido pendente</h1>
        <p className="max-w-sm text-sm leading-6 text-muted">
          A rede simulada ainda está confirmando a transação. Você pode recarregar a página ou aguardar a reconexão — nenhuma nova compra será criada.
        </p>
        <p className="text-xs text-faint">Pedido {order.id}</p>
        <p className="text-sm">
          Total reservado: <strong className="text-amber">{formatEth(order.snapshot.total)} ETH</strong>
        </p>
      </section>
    </Receipt>
  )
}

function DeclinedOrder({ order }: { order: Order }) {
  return (
    <Receipt>
      <section className="grid justify-items-center gap-4 px-6 py-14 text-center md:px-12" role="alert">
        <TriangleAlert className="size-12 text-danger" aria-hidden="true" />
        <h1 className="text-lg font-bold tracking-wide">Pagamento recusado</h1>
        <p className="max-w-sm text-sm leading-6 text-muted">{order.declineReason}</p>
        <p className="text-sm text-muted">Os itens continuam no seu carrinho. Nenhum valor foi cobrado.</p>
        <p className="text-xs text-faint">Pedido {order.id}</p>
        <Button asChild className="mt-2">
          <Link to="/cart">Revisar carrinho</Link>
        </Button>
      </section>
    </Receipt>
  )
}

function ConfirmedOrder({ order }: { order: Order }) {
  const snapshot = order.snapshot
  const hasDiscount = Number(snapshot.discount) > 0
  return (
    <Receipt>
      <article aria-labelledby="recibo-titulo">
        <header className="grid justify-items-center gap-4 px-6 pt-5 pb-5 text-center">
          <ThankYouIcon className="h-[82px] w-[68px] text-amber" />
          <h1 id="recibo-titulo" className="text-base font-bold tracking-wide text-amber">
            Seus NFTs agora estão na sua carteira
          </h1>
        </header>
        <dl className="grid grid-cols-2 gap-y-3 border-y border-fill px-6 py-4 text-sm tracking-wide sm:grid-cols-4 sm:px-9">
          <InfoCell label="ID da transação" first>
            <span title={order.txHash ?? undefined}>{order.txHash ? shortHash(order.txHash) : "—"}</span>
          </InfoCell>
          <InfoCell label="Data">{shortDate(order.updatedAt)}</InfoCell>
          <InfoCell label="Total">{formatEth(snapshot.total)} ETH</InfoCell>
          <InfoCell label="Carteira">{walletTypeLabel[order.walletType]}</InfoCell>
        </dl>
        <div className="px-6 pt-6 pb-10 sm:px-11">
          <h2 className="text-[15px] font-bold tracking-wide">Detalhes da transação</h2>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_80px_110px] border-b border-line pb-2 text-base font-bold tracking-wide" aria-hidden="true">
            <span>NFTs</span>
            <span className="text-center">Edições</span>
            <span className="text-right">Subtotal</span>
          </div>
          <ul className="mt-3 grid gap-3">
            {snapshot.items.map((item) => (
              <li key={`${item.nftId}-${item.editionId}`} className="grid grid-cols-[minmax(0,1fr)_80px_110px] items-center">
                <div className="flex min-w-0 items-center gap-3">
                  <NftArt art={item.art} alt="" sizes="70px" className="size-[70px] shrink-0 rounded-[6px]" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold tracking-wide">{item.name}</p>
                    <p className="text-sm tracking-wide text-faint">ID do token: {item.tokenId}</p>
                    <p className="text-xs text-faint">Edição {item.editionLabel}</p>
                  </div>
                </div>
                <span className="text-center text-sm text-muted">(x {item.quantity})</span>
                <span className="text-right text-lg font-bold tracking-wide text-amber">{formatEth(item.lineTotal)} ETH</span>
              </li>
            ))}
          </ul>
          <dl className="mt-5 ml-auto grid max-w-[330px] gap-1 text-[15px] tracking-wide">
            {hasDiscount ? (
              <div className="flex justify-between">
                <dt>Desconto {snapshot.couponCode ? `(${snapshot.couponCode})` : ""}</dt>
                <dd className="text-ok">(-) {formatEth(snapshot.discount)} ETH</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Taxa de rede</dt>
              <dd className="text-lg">{formatEth(snapshot.networkFee)} ETH</dd>
            </div>
            <div className="flex justify-between border-b border-fill pb-2 font-bold">
              <dt>Total</dt>
              <dd className="text-lg text-amber">{formatEth(snapshot.total)} ETH</dd>
            </div>
          </dl>
          <p className="mt-4 text-center text-sm leading-[22px] tracking-wide text-muted">
            Transação confirmada na {networkLabel[order.network]}. A propriedade foi transferida para sua carteira conectada e registrada na rede.
          </p>
          <div className="mt-5 flex justify-center">
            {order.txHash ? (
              <Button asChild className="h-12 px-4 text-base">
                <Link to="/explorer/$txHash" params={{ txHash: order.txHash }}>
                  Ver no Etherscan<span className="sr-only"> (explorador simulado)</span>
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    </Receipt>
  )
}

function InfoCell({ label, children, first }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={first ? "" : "sm:border-l sm:border-fill sm:pl-4"}>
      <dt className={first ? "font-bold" : "text-muted"}>{label}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  )
}

export function ExplorerPage() {
  const { txHash } = useParams({ from: "/explorer/$txHash" })
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-16 md:px-6 lg:px-0">
      <h1 className="text-2xl font-bold tracking-wide">Explorador simulado</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
        Esta referência não consulta uma blockchain real. Ela apenas reproduz o identificador de transação gerado pela simulação.
      </p>
      <p className="mt-6 bg-panel p-4 font-mono text-sm break-all">{txHash}</p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </section>
  )
}

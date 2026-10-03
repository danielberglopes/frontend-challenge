import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { EllipsisVertical, TriangleAlert, Wallet as WalletIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Field, fieldA11y } from "@/components/field.tsx"
import { NftArt } from "@/components/nft-art.tsx"
import { MobileHeader, WalletBadge } from "@/components/shell.tsx"
import { EmptyState, ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import type { CreateOrderBody, Network, Order, Quote, Wallet, WalletType } from "@/contracts/api.ts"
import { networkLabel, networks, walletTypeLabel, walletTypes } from "@/contracts/api.ts"
import { useMediaQuery } from "@/features/media.ts"
import { useSession } from "@/features/session.ts"
import { CouponForm, QuoteSummary } from "@/pages/cart.tsx"
import { announce } from "@/lib/announce.ts"
import { ApiRequestError } from "@/lib/api/client.ts"
import { createOrder, getCart, getOrder, getOrderByKey, getQuote, listWallets, setWalletConnection } from "@/lib/api/http.ts"
import { formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { cn } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

const attemptStorage = "kurio:checkout-attempt"
// Ordem das opções no frame "Desktop / Pagamento".
const providerOrder: WalletType[] = ["walletconnect", "metamask", "coinbase"]
export const pendingOrderStorage = "kurio:pending-order"

type Attempt = { signature: string; key: string }

/**
 * Chave de idempotência por tentativa: o mesmo conteúdo (cotação + dados) reutiliza a chave,
 * inclusive após timeout ou refresh; conteúdo diferente gera nova chave.
 */
function keyFor(signature: string) {
  const raw = sessionStorage.getItem(attemptStorage)
  if (raw) {
    const saved = JSON.parse(raw) as Attempt
    if (saved.signature === signature) return saved.key
  }
  const key = crypto.randomUUID()
  sessionStorage.setItem(attemptStorage, JSON.stringify({ signature, key } satisfies Attempt))
  return key
}

type Form = {
  displayName: string
  username: string
  network: Network | ""
  profileName: string
  address: string
  ensSecondary: string
  walletType: WalletType | ""
  referralCode: string
  email: string
  ensName: string
  note: string
}

const emptyForm: Form = {
  displayName: "",
  username: "",
  network: "",
  profileName: "",
  address: "",
  ensSecondary: "",
  walletType: "",
  referralCode: "",
  email: "",
  ensName: "",
  note: "",
}

function validate(form: Form) {
  const errors: Record<string, string> = {}
  if (form.displayName.trim().length < 2) errors.displayName = "Informe o nome de exibição."
  if (form.username.trim().length < 3) errors.username = "Informe o nome de usuário."
  if (!form.network) errors.network = "Selecione uma rede."
  if (form.profileName.trim().length < 2) errors.profileName = "Informe o nome do perfil."
  if (!/^0x[a-fA-F0-9]{40}$/.test(form.address.trim())) errors.address = "Selecione uma carteira cadastrada com endereço 0x válido."
  if (!form.walletType) errors.walletType = "Selecione o tipo de carteira."
  if (form.referralCode.trim().length < 3) errors.referralCode = "Informe o código de indicação."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Informe um e-mail válido."
  if (!/^[a-z0-9][a-z0-9.-]{1,30}$/.test(form.ensName.trim())) errors.ensName = "Use letras minúsculas, números, ponto ou hífen."
  return errors
}

export function CheckoutPage() {
  const session = useSession()
  const user = session.data?.user
  const userId = user?.id ?? "anonymous"
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [walletId, setWalletId] = useState("")
  const [form, setForm] = useState<Form>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState("")
  const [promoOpen, setPromoOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [accepted, setAccepted] = useState("")
  const filledFor = useRef("")
  // Trava síncrona contra cliques repetidos no mesmo tick (isPending só atualiza no próximo render).
  const submitting = useRef(false)
  const desktop = useMediaQuery("(min-width: 768px)")

  const wallets = useQuery({
    queryKey: queryKeys.wallets(userId),
    queryFn: ({ signal }) => listWallets(signal),
    enabled: Boolean(user),
  })
  const cart = useQuery({
    queryKey: queryKeys.cart(userId),
    queryFn: ({ signal }) => getCart(signal),
    enabled: Boolean(user),
  })
  const network: Network = form.network || "ethereum"
  const quote = useQuery({
    queryKey: queryKeys.quote(userId, network),
    queryFn: ({ signal }) => getQuote(network, signal),
    enabled: Boolean(user),
  })

  const ordered = useMemo(
    () => [...(wallets.data ?? [])].sort((a, b) => (a.role === b.role ? 0 : a.role === "primary" ? -1 : 1)),
    [wallets.data],
  )
  const selected = ordered.find((wallet) => wallet.id === walletId) ?? ordered[0]
  const secondary = ordered.find((wallet) => wallet.role === "secondary")

  // Preenche o formulário a partir da carteira escolhida e do perfil (uma vez por carteira).
  useEffect(() => {
    if (!selected || !user || filledFor.current === selected.id) return
    filledFor.current = selected.id
    setForm((current) => ({
      ...current,
      displayName: selected.displayName || user.name,
      username: user.username,
      network: selected.network,
      profileName: selected.profileName,
      address: selected.address,
      ensSecondary: selected.ensSecondary,
      walletType: selected.walletType,
      referralCode: selected.referralCode,
      email: selected.email || user.email,
      ensName: user.ensName,
    }))
  }, [selected, user])

  // Pedido pendente de uma tentativa anterior (refresh / reconexão) — retoma sem criar outro.
  const pendingId = typeof window === "undefined" ? null : sessionStorage.getItem(pendingOrderStorage)
  const pending = useQuery({
    queryKey: queryKeys.order(pendingId ?? "none"),
    queryFn: ({ signal }) => getOrder(pendingId!, signal),
    enabled: Boolean(pendingId && user),
    retry: false,
  })
  const hasPending = pending.data?.status === "pending"

  const drifted = Boolean(
    quote.data &&
      cart.data?.items.some((line) => {
        const quoted = quote.data?.items.find((item) => item.id === line.id)
        return !quoted || quoted.unitPrice !== line.unitPrice || quoted.version !== line.version || quoted.available !== line.available
      }),
  )
  const unavailable = quote.data?.items.some((item) => !item.available) ?? false
  const couponInvalid = Boolean(quote.data?.coupon && !quote.data.coupon.valid)
  const quoteChanged = accepted !== "" && quote.data !== undefined && accepted !== quote.data.fingerprint

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }))
  }

  function chooseWallet(wallet: Wallet) {
    setWalletId(wallet.id)
    filledFor.current = ""
    setAccepted("")
  }

  const connection = useMutation({
    mutationFn: (action: "connect" | "refuse" | "disconnect") => setWalletConnection(selected!.id, action, network),
    onSuccess: async (wallet) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.wallets(userId) })
      if (wallet.connection === "connected") {
        announce(`${walletTypeLabel[form.walletType || wallet.walletType]} conectada na simulação.`)
        setConnectOpen(false)
        setReviewOpen(true)
      } else if (wallet.connection === "refused") {
        setFormError("A conexão com a carteira foi recusada. Tente conectar novamente para continuar.")
        announce("A conexão da carteira foi recusada.")
        setConnectOpen(false)
      } else {
        announce("Carteira desconectada.")
      }
    },
    onError: (error) => setFormError(errorMessage(error, "Falha ao simular a conexão da carteira.")),
  })

  const order = useMutation({
    mutationFn: async (): Promise<Order> => {
      if (!quote.data || !selected || !form.walletType || !form.network) throw new ApiRequestError(422, "VALIDATION", "Revise o pagamento.")
      const body: CreateOrderBody = {
        fingerprint: quote.data.fingerprint,
        walletId: selected.id,
        network: form.network,
        walletType: form.walletType,
        collectorName: form.displayName.trim(),
        collectorEmail: form.email.trim(),
        collectorUsername: form.username.trim(),
        profileName: form.profileName.trim(),
        referralCode: form.referralCode.trim(),
        ensName: form.ensName.trim(),
        note: form.note.trim() || undefined,
      }
      const key = keyFor(JSON.stringify(body))
      try {
        return await createOrder(body, key)
      } catch (error) {
        // Timeout após o envio: a operação pode ter sido registrada — recupera pelo mesmo Idempotency-Key.
        if (error instanceof ApiRequestError && (error.code === "TIMEOUT" || error.code === "NETWORK")) return getOrderByKey(key)
        throw error
      }
    },
    onSuccess: async (created) => {
      sessionStorage.removeItem(attemptStorage)
      if (created.status === "pending") sessionStorage.setItem(pendingOrderStorage, created.id)
      queryClient.setQueryData(queryKeys.order(created.id), created)
      await queryClient.invalidateQueries({ queryKey: ["cart"] })
      setReviewOpen(false)
      void navigate({ to: "/orders/$orderId", params: { orderId: created.id } })
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === "QUOTE_STALE") {
        setAccepted("")
        setFormError("A cotação mudou. Revise os novos valores e confirme novamente.")
        void queryClient.invalidateQueries({ queryKey: ["quote"] })
        void queryClient.invalidateQueries({ queryKey: ["cart"] })
        return
      }
      if (error instanceof ApiRequestError && error.code === "WALLET_NOT_CONNECTED") {
        setReviewOpen(false)
        setConnectOpen(true)
        return
      }
      setReviewOpen(false)
      setFormError(errorMessage(error, "Não foi possível enviar o pedido."))
      if (error instanceof ApiRequestError && error.fields) setErrors(error.fields)
    },
  })

  function startCheckout() {
    setFormError("")
    const nextErrors = validate(form)
    setErrors(nextErrors)
    const first = Object.keys(nextErrors)[0]
    if (first) {
      setFormError("Revise os campos destacados.")
      document.getElementById(`co-${first}`)?.focus()
      return
    }
    if (!quote.data || unavailable) {
      setFormError("Há itens indisponíveis no pedido. Volte ao carrinho para ajustar.")
      return
    }
    if (couponInvalid) {
      setFormError("O cupom aplicado não é válido. Remova-o para continuar.")
      return
    }
    if (selected?.connection !== "connected") {
      setConnectOpen(true)
      return
    }
    setReviewOpen(true)
  }

  if (wallets.isSuccess && ordered.length === 0) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-6 lg:px-0">
        <EmptyState
          title="Cadastre uma carteira para pagar"
          text="O pagamento usa as carteiras cadastradas na sua conta. Cadastre a carteira principal e volte para finalizar."
          action={
            <Button asChild>
              <Link to="/wallets" search={{ redirect: "/checkout" }}>
                Cadastrar carteira
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (cart.isSuccess && cart.data.items.length === 0 && !order.isPending) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-16 md:px-6 lg:px-0">
        <MobileHeader title="Pagamento com carteira" back="/cart" />
        <EmptyState
          title="Nenhum item para pagar"
          text="Seu carrinho está vazio. Adicione NFTs antes de seguir para o pagamento."
          action={
            <Button asChild>
              <Link to="/">Explorar NFTs</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const collectorFields = (
    <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
      <Field id="co-displayName" label="Nome de exibição" required error={errors.displayName}>
        <Input {...fieldA11y("co-displayName", errors.displayName)} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} autoComplete="name" />
      </Field>
      <Field id="co-username" label="Nome de usuário" required error={errors.username}>
        <Input {...fieldA11y("co-username", errors.username)} value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="username" />
      </Field>
      <Field id="co-network" label="Rede" required error={errors.network}>
        <NativeSelect
          {...fieldA11y("co-network", errors.network)}
          value={form.network}
          required
          onChange={(e) => {
            set("network", e.target.value as Network)
            setAccepted("")
          }}
        >
          <NativeSelectOption value="" disabled>
            Selecione uma rede
          </NativeSelectOption>
          {networks.map((item) => (
            <NativeSelectOption key={item} value={item}>
              {networkLabel[item]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field id="co-profileName" label="Nome do perfil" required error={errors.profileName}>
        <Input {...fieldA11y("co-profileName", errors.profileName)} value={form.profileName} onChange={(e) => set("profileName", e.target.value)} />
      </Field>
      <Field id="co-address" label="Endereço da carteira" required error={errors.address}>
        <Input
          {...fieldA11y("co-address", errors.address)}
          value={form.address}
          readOnly
          placeholder="Endereço 0x da carteira"
          className="text-muted"
          title="Endereço da carteira cadastrada selecionada"
        />
      </Field>
      <Field id="co-ensSecondary" label="ENS ou carteira secundária (opcional)" hideLabel className="sm:self-end">
        <Input id="co-ensSecondary" value={form.ensSecondary} readOnly placeholder="ENS ou carteira secundária (opcional)" className="text-muted" />
      </Field>
      <Field id="co-walletType" label="Tipo de carteira" required error={errors.walletType}>
        <NativeSelect {...fieldA11y("co-walletType", errors.walletType)} value={form.walletType} required onChange={(e) => set("walletType", e.target.value as WalletType)}>
          <NativeSelectOption value="" disabled>
            Selecione uma carteira
          </NativeSelectOption>
          {walletTypes.map((item) => (
            <NativeSelectOption key={item} value={item}>
              {walletTypeLabel[item]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field id="co-referralCode" label="Código de indicação" required error={errors.referralCode}>
        <Input {...fieldA11y("co-referralCode", errors.referralCode)} value={form.referralCode} onChange={(e) => set("referralCode", e.target.value)} />
      </Field>
      <Field id="co-email" label="E-mail" required error={errors.email}>
        <Input {...fieldA11y("co-email", errors.email)} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
      </Field>
      <Field id="co-ensName" label="Nome ENS" required error={errors.ensName}>
        <div className="flex gap-2">
          <Input {...fieldA11y("co-ensName", errors.ensName)} value={form.ensName} onChange={(e) => set("ensName", e.target.value.toLowerCase())} className="flex-1" />
          <span className="inline-flex h-10 items-center gap-1 rounded-[2px] border border-[#3b271c] px-3 text-base" aria-hidden="true">
            .eth
          </span>
        </div>
      </Field>
    </div>
  )

  const otherWallet = secondary ? (
    <label className="flex w-fit items-center gap-2 text-[15px] tracking-wide">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={selected?.id === secondary.id}
        onChange={(event) => chooseWallet(event.target.checked ? secondary : ordered[0])}
      />
      <span className="grid size-4 place-items-center rounded-full border-2 border-fill peer-checked:[&>span]:block peer-focus-visible:outline-2 peer-focus-visible:outline-amber">
        <span className="hidden size-1.5 rounded-full bg-fill" />
      </span>
      Usar outra carteira? <span className="text-faint">({secondary.label})</span>
    </label>
  ) : null

  const providers = (
    <fieldset>
      <legend className="w-full text-center text-lg font-bold tracking-wide max-md:text-left">Carteira e rede</legend>
      <div className="mt-4 grid gap-4">
        {providerOrder.map((type) => {
          const active = form.walletType === type
          return (
            <label
              key={type}
              className={cn(
                "flex h-[65px] cursor-pointer items-center gap-4 border px-5 transition-colors max-md:rounded-[24px] max-md:border-0 max-md:bg-panel md:h-[45px] md:px-4",
                active ? "border-cream md:border-cream" : "border-[#3b271c] hover:border-fill",
              )}
            >
              <input type="radio" name="provider" value={type} checked={active} onChange={() => set("walletType", type)} className="peer sr-only" />
              <span className="hidden size-[50px] shrink-0 place-items-center rounded-full bg-[#2e1a10] text-lg font-bold text-amber max-md:grid">
                {type === "coinbase" ? <WalletIcon className="size-6" /> : type === "metamask" ? "M" : "W"}
              </span>
              <span className="grid size-4 shrink-0 place-items-center rounded-full border-2 border-fill peer-checked:[&>span]:block peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber max-md:order-last max-md:ml-auto max-md:size-6">
                <span className="hidden size-2 rounded-full bg-fill max-md:size-3" />
              </span>
              {type === "walletconnect" ? (
                <>
                  <WalletBadge className="max-md:hidden" />
                  <span className="text-[15px] tracking-wide md:sr-only">WalletConnect</span>
                </>
              ) : (
                <span className="text-[15px] tracking-wide">{walletTypeLabel[type]}</span>
              )}
            </label>
          )
        })}
      </div>
      {selected ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 text-xs text-faint" role="status">
          Conexão simulada:{" "}
          <span className={selected.connection === "connected" ? "text-ok" : selected.connection === "refused" ? "text-danger" : ""}>
            {selected.connection === "connected" ? "conectada" : selected.connection === "refused" ? "recusada" : "desconectada"}
          </span>
          {selected.connection === "connected" ? (
            <button type="button" className="text-amber underline" onClick={() => connection.mutate("disconnect")} disabled={connection.isPending}>
              Desconectar
            </button>
          ) : null}
        </p>
      ) : null}
    </fieldset>
  )

  const alerts = (
    <>
      {hasPending && pending.data ? (
        <div className="flex items-start gap-3 border border-fill/60 bg-band/60 p-4 text-sm" role="status">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden="true" />
          <p>
            Você tem um pedido pendente desta sessão.{" "}
            <Link to="/orders/$orderId" params={{ orderId: pending.data.id }} className="font-bold text-amber underline">
              Acompanhar pedido
            </Link>{" "}
            antes de iniciar outra compra.
          </p>
        </div>
      ) : null}
      {drifted || quoteChanged ? (
        <div className="flex items-start gap-3 border border-fill/60 bg-band/60 p-4 text-sm" role="status">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber" aria-hidden="true" />
          <p>O preço ou a disponibilidade mudou durante a navegação. O resumo foi atualizado e a compra exigirá nova confirmação.</p>
        </div>
      ) : null}
      {formError ? (
        <p className="text-sm text-danger" role="alert">
          {formError}
        </p>
      ) : null}
    </>
  )

  const confirmButton = (className?: string) => (
    <Button
      type="button"
      className={className}
      disabled={!quote.data || order.isPending || connection.isPending || hasPending || unavailable}
      onClick={startCheckout}
    >
      {order.isPending ? "Enviando pedido…" : "Confirmar compra"}
    </Button>
  )

  return (
    <div className="mx-auto max-w-[1200px] md:px-6 lg:px-0">
      <MobileHeader title="Pagamento com carteira" back="/cart" />
      <nav aria-label="Trilha" className="hidden pt-8 text-[15px] font-bold tracking-wide md:block">
        <Link to="/" className="hover:text-amber">
          Início
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to="/" hash="catalogo" className="hover:text-amber">
          Mercado
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Pagamento</span>
      </nav>
      <h1 className="sr-only max-md:hidden">Pagamento</h1>

      {/* ===== Mobile ===== */}
      {desktop ? null : (
      <div className="grid gap-8 px-6 pb-10 md:hidden">
        <section aria-labelledby="m-carteira">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 id="m-carteira" className="text-base font-bold whitespace-nowrap min-[410px]:text-lg">
              Carteira conectada
            </h2>
            <Link to="/wallets" search={{ redirect: "/checkout" }} className="text-base font-bold whitespace-nowrap text-amber min-[410px]:text-lg">
              Trocar carteira
            </Link>
          </div>
          {wallets.isPending ? <Skeleton className="mt-6 h-[93px] rounded-[24px]" /> : null}
          <div className="mt-6 grid gap-5" role="radiogroup" aria-labelledby="m-carteira">
            {[...ordered].reverse().map((wallet) => {
              const active = wallet.id === selected?.id
              return (
                <label key={wallet.id} className="flex cursor-pointer items-center gap-5 rounded-[24px] bg-panel py-4 pr-4 pl-5">
                  <input type="radio" name="m-wallet" checked={active} onChange={() => chooseWallet(wallet)} className="peer sr-only" />
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-fill peer-checked:[&>span]:block peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber">
                    <span className="hidden size-3 rounded-full bg-fill" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold tracking-wide">{wallet.label}</span>
                    <span className="block truncate text-base tracking-wide text-muted">
                      {wallet.ensSecondary || `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`}
                    </span>
                    <span className="block text-base tracking-wide text-muted">
                      {wallet.network === "ethereum" ? "Rede principal Ethereum" : `Rede ${networkLabel[wallet.network]}`}
                    </span>
                  </span>
                  <EllipsisVertical className="size-5 text-muted" aria-hidden="true" />
                </label>
              )
            })}
          </div>
        </section>
        {providers}
        <details className="group" open={Object.values(errors).some(Boolean) || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold tracking-wide">
            Perfil do colecionador
            <span className="text-sm font-normal whitespace-nowrap text-amber group-open:hidden">Revisar dados</span>
          </summary>
          <div className="mt-5 grid gap-5">
            {collectorFields}
            <Field id="co-note" label="Observação do colecionador (opcional)">
              <Textarea id="co-note" value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={280} />
            </Field>
          </div>
        </details>
        {alerts}
        <p className="flex items-baseline justify-end gap-8 text-xl font-bold tracking-wide">
          Total: <span className="text-[26px] text-amber">{quote.data ? `${formatEth(quote.data.total)} ETH` : "—"}</span>
        </p>
        {confirmButton("h-[60px] w-full rounded-full bg-fill-gradient text-lg")}
      </div>
      )}

      {/* ===== Desktop ===== */}
      {desktop ? (
      <div className="mt-6 hidden grid-cols-[minmax(0,1fr)] items-start gap-8 md:grid lg:grid-cols-[763px_minmax(0,405px)] lg:justify-between">
        <section aria-labelledby="perfil-titulo" className="grid gap-5">
          <h2 id="perfil-titulo" className="text-lg font-bold tracking-wide">
            Perfil do colecionador
          </h2>
          {collectorFields}
          {otherWallet}
          <Field id="co-note" label="Observação do colecionador (opcional)" className="max-w-[350px]">
            <Textarea id="co-note" value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={280} />
          </Field>
        </section>

        <aside aria-labelledby="seus-nfts" className="grid gap-4">
          <h2 id="seus-nfts" className="text-lg font-bold tracking-wide">
            Seus NFTs
          </h2>
          <div className="flex justify-between border-b border-line pb-2 text-base font-bold tracking-wide" aria-hidden="true">
            <span>NFTs</span>
            <span>Subtotal</span>
          </div>
          {quote.isPending ? (
            <div className="grid gap-3" aria-hidden="true" data-testid="quote-skeleton">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-[70px] rounded-none" />
              ))}
            </div>
          ) : null}
          {quote.isError ? <ErrorBlock message={errorMessage(quote.error, "Não foi possível carregar a cotação.")} onRetry={() => void quote.refetch()} /> : null}
          <ul className="grid gap-3">
            {quote.data?.items.map((item) => (
              <li key={item.id} className={cn("flex min-h-[70px] items-center gap-2 bg-panel pr-4", !item.available && "outline outline-1 outline-danger/60")}>
                <NftArt art={item.art} alt="" sizes="66px" className="size-[66px] rounded-[8px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-5 font-bold tracking-wide">{item.name}</p>
                  <p className="text-[13px] tracking-wide whitespace-nowrap text-faint">ID do token: {item.tokenId}</p>
                  {!item.available ? <p className="text-xs text-danger">Indisponível</p> : null}
                </div>
                <span className="text-sm whitespace-nowrap text-muted">(x {item.quantity})</span>
                <span className="text-right text-lg font-bold tracking-wide whitespace-nowrap text-amber">{formatEth(item.lineTotal)} ETH</span>
              </li>
            ))}
          </ul>
          <div className="text-center">
            {promoOpen ? (
              <CouponForm
                ownerId={userId}
                couponCode={cart.data?.couponCode ?? null}
                quote={quote.data}
                onChanged={async () => {
                  setAccepted("")
                  await queryClient.invalidateQueries({ queryKey: ["quote"] })
                  await queryClient.invalidateQueries({ queryKey: ["cart"] })
                }}
              />
            ) : (
              <button type="button" className="text-[15px] tracking-wide hover:text-amber" onClick={() => setPromoOpen(true)} aria-expanded={promoOpen}>
                Tem um código promocional? <span className="underline-offset-4 hover:underline">Aplique aqui</span>
              </button>
            )}
          </div>
          {quote.data ? (
            <div className="border-b border-line pb-4">
              <QuoteSummary quote={quote.data} compact />
            </div>
          ) : null}
          {providers}
          {alerts}
          {confirmButton("mt-2 h-[45px] w-full text-[15px]")}
        </aside>
      </div>
      ) : null}

      <ConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        walletLabel={selected?.label ?? ""}
        provider={form.walletType ? walletTypeLabel[form.walletType] : "carteira"}
        network={networkLabel[network]}
        pending={connection.isPending}
        onApprove={() => connection.mutate("connect")}
        onRefuse={() => connection.mutate("refuse")}
      />
      {quote.data ? (
        <ReviewDialog
          open={reviewOpen}
          onOpenChange={(open) => {
            if (!order.isPending) setReviewOpen(open)
          }}
          quote={quote.data}
          drifted={drifted || quoteChanged}
          accepted={accepted === quote.data.fingerprint && !drifted}
          onAccept={() => setAccepted(quote.data!.fingerprint)}
          wallet={selected}
          provider={form.walletType ? walletTypeLabel[form.walletType] : ""}
          pending={order.isPending}
          error={formError}
          onSubmit={() => {
            if (!quote.data || accepted !== quote.data.fingerprint || drifted || order.isPending || submitting.current) return
            submitting.current = true
            order.mutate(undefined, { onSettled: () => (submitting.current = false) })
          }}
        />
      ) : null}
    </div>
  )
}

function ConnectDialog({
  open,
  onOpenChange,
  walletLabel,
  provider,
  network,
  pending,
  onApprove,
  onRefuse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  walletLabel: string
  provider: string
  network: string
  pending: boolean
  onApprove: () => void
  onRefuse: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="pr-8 text-lg font-bold">Conectar {provider}</DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-muted">
          Simulação de conexão: a carteira “{walletLabel}” pede autorização para conectar na rede {network}. Nenhuma extensão real é usada.
        </DialogDescription>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={onApprove} disabled={pending}>
            {pending ? "Conectando…" : "Aprovar conexão"}
          </Button>
          <Button type="button" variant="outline" onClick={onRefuse} disabled={pending}>
            Recusar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReviewDialog({
  open,
  onOpenChange,
  quote,
  drifted,
  accepted,
  onAccept,
  wallet,
  provider,
  pending,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  quote: Quote
  drifted: boolean
  accepted: boolean
  onAccept: () => void
  wallet?: Wallet
  provider: string
  pending: boolean
  error: string
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%-2rem,560px)]">
        <DialogTitle className="pr-8 text-lg font-bold">Revisar pedido</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted">
          Confira os valores da cotação atual antes de enviar. Pagamento via {provider} · {wallet?.label} · rede {networkLabel[quote.network]}.
        </DialogDescription>
        {drifted ? (
          <p className="mt-4 flex gap-2 border border-fill/60 bg-band/60 p-3 text-sm" role="alert">
            <TriangleAlert className="size-5 shrink-0 text-amber" aria-hidden="true" />
            Os valores mudaram desde a última confirmação. Revise e aceite os novos valores.
          </p>
        ) : null}
        <ul className="mt-4 grid gap-2 text-sm">
          {quote.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.name} · {item.editionLabel} <span className="text-faint">(x {item.quantity})</span>
              </span>
              <span className="font-bold text-amber">{formatEth(item.lineTotal)} ETH</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-line pt-2">
          <QuoteSummary quote={quote} compact />
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#d28a4c]" checked={accepted} onChange={(event) => event.target.checked && onAccept()} />
          Confirmo os valores desta cotação ({formatEth(quote.total)} ETH).
        </label>
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="button" className="mt-5 w-full" disabled={!accepted || pending} onClick={onSubmit}>
          {pending ? "Enviando pedido…" : "Confirmar e enviar pedido"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useRouter, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { AccountLayout } from "@/components/account-layout.tsx"
import { Field, fieldA11y } from "@/components/field.tsx"
import { ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input, NoAutofillInput } from "@/components/ui/input.tsx"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select.tsx"
import type { Network, Wallet, WalletInput, WalletType } from "@/contracts/api.ts"
import { networkLabel, networks, walletTypeLabel, walletTypes } from "@/contracts/api.ts"
import { useSession } from "@/features/session.ts"
import { ApiRequestError } from "@/lib/api/client.ts"
import { createWallet, listWallets, updateWallet } from "@/lib/api/http.ts"
import { announce } from "@/lib/announce.ts"
import { queryKeys } from "@/lib/query.ts"
import { isSafeRedirect } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

type Draft = Omit<WalletInput, "network" | "walletType"> & { network: Network | ""; walletType: WalletType | "" }

function draftFrom(wallet: Wallet | undefined, role: Wallet["role"], email: string): Draft {
  return {
    role,
    label: wallet?.label ?? "",
    displayName: wallet?.displayName ?? "",
    profileName: wallet?.profileName ?? "",
    address: wallet?.address ?? "",
    ensSecondary: wallet?.ensSecondary ?? "",
    walletType: wallet?.walletType ?? "",
    referralCode: wallet?.referralCode ?? "",
    email: wallet?.email ?? email,
    ensName: wallet?.ensName ?? "",
    network: wallet?.network ?? "",
  }
}

/** Endereço 0x fictício para a simulação (não corresponde a nenhuma carteira real). */
function randomAddress() {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

/** ENS: minúsculas, sem acentos; espaços viram hífen. */
function normalizeEns(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
}

function validate(draft: Draft) {
  const errors: Record<string, string> = {}
  if (draft.displayName.trim().length < 2) errors.displayName = "Informe o nome de exibição."
  if (draft.label.trim().length < 2) errors.label = "Informe o apelido da carteira."
  if (!draft.network) errors.network = "Selecione uma rede."
  if (draft.profileName.trim().length < 2) errors.profileName = "Informe o nome do perfil."
  if (!/^0x[a-fA-F0-9]{40}$/.test(draft.address.trim())) errors.address = "Informe um endereço 0x com 40 caracteres hexadecimais."
  const ens = draft.ensSecondary.trim()
  if (ens && !/^0x[a-fA-F0-9]{40}$/.test(ens) && !/^[a-z0-9.-]+\.eth$/.test(ens)) errors.ensSecondary = "Use um nome .eth ou um endereço 0x."
  if (!draft.walletType) errors.walletType = "Selecione o tipo de carteira."
  if (draft.referralCode.trim().length < 3) errors.referralCode = "Informe o código de indicação."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = "Informe um e-mail válido."
  if (!/^[a-z0-9][a-z0-9.-]{1,30}$/.test(draft.ensName.trim().replace(/\.eth$/, ""))) errors.ensName = "Use letras minúsculas, números, ponto ou hífen."
  return errors
}

export function WalletsPage() {
  const session = useSession()
  const { redirect } = useSearch({ from: "/wallets" })
  const router = useRouter()
  const user = session.data?.user
  const userId = user?.id ?? ""
  const wallets = useQuery({
    queryKey: queryKeys.wallets(userId),
    queryFn: ({ signal }) => listWallets(signal),
    enabled: Boolean(userId),
  })
  const primary = wallets.data?.find((wallet) => wallet.role === "primary")
  const secondary = wallets.data?.find((wallet) => wallet.role === "secondary")
  const [secondaryOpen, setSecondaryOpen] = useState(false)
  const [sameAsPrimary, setSameAsPrimary] = useState(false)

  return (
    <AccountLayout title="Carteiras">
      <h1 className="sr-only">Carteiras</h1>
      {wallets.isPending ? <WalletsSkeleton /> : null}
      {wallets.isError ? <ErrorBlock message={errorMessage(wallets.error, "Não foi possível carregar as carteiras.")} onRetry={() => void wallets.refetch()} /> : null}
      {wallets.data ? (
        <>
          <section aria-labelledby="carteira-principal">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="carteira-principal" className="text-lg font-bold tracking-wide">
                  Carteira principal
                </h2>
                <p className="text-sm tracking-wide text-muted">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
              </div>
              {!primary ? (
                <button type="button" className="shrink-0 text-lg font-bold tracking-wide text-amber hover:underline" onClick={() => document.getElementById("primary-displayName")?.focus()}>
                  Adicionar
                </button>
              ) : null}
            </div>
            <WalletForm
              key="primary"
              role="primary"
              wallet={primary}
              userId={userId}
              initial={draftFrom(primary, "primary", user?.email ?? "")}
              onSaved={() => {
                if (isSafeRedirect(redirect)) router.history.push(redirect)
              }}
            />
            {isSafeRedirect(redirect) && primary ? (
              <p className="mt-4 text-sm text-muted">
                Carteira pronta.{" "}
                <Link to="/checkout" className="font-bold text-amber underline">
                  Voltar ao pagamento
                </Link>
              </p>
            ) : null}
          </section>

          <section aria-labelledby="carteira-secundaria" className="mt-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="carteira-secundaria" className="text-lg font-bold tracking-wide">
                  Carteira secundária
                </h2>
                {!secondary && !secondaryOpen ? (
                  <p className="mt-1 text-sm tracking-wide text-muted">Você ainda não adicionou uma carteira secundária.</p>
                ) : null}
              </div>
              {!secondary ? (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-[15px] tracking-wide">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={sameAsPrimary}
                      disabled={!primary}
                      onChange={(event) => {
                        setSameAsPrimary(event.target.checked)
                        if (event.target.checked) setSecondaryOpen(true)
                      }}
                    />
                    <span className="grid size-4 place-items-center rounded-full border-2 border-fill peer-checked:[&>span]:block peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber peer-disabled:opacity-40">
                      <span className="hidden size-1.5 rounded-full bg-fill" />
                    </span>
                    Igual à carteira principal
                  </label>
                  <button
                    type="button"
                    className="text-lg font-bold tracking-wide text-amber hover:underline"
                    aria-expanded={secondaryOpen}
                    aria-controls="secondary-form"
                    onClick={() => setSecondaryOpen((current) => !current)}
                  >
                    {secondaryOpen ? "Cancelar" : "Adicionar"}
                  </button>
                </div>
              ) : null}
            </div>
            {secondary || secondaryOpen ? (
              <div id="secondary-form">
                <WalletForm
                  key={secondary ? "secondary" : `new-secondary-${sameAsPrimary}`}
                  role="secondary"
                  wallet={secondary}
                  userId={userId}
                  initial={
                    secondary
                      ? draftFrom(secondary, "secondary", user?.email ?? "")
                      : sameAsPrimary && primary
                        ? { ...draftFrom(primary, "secondary", user?.email ?? ""), label: "", address: "" }
                        : draftFrom(undefined, "secondary", user?.email ?? "")
                  }
                  onSaved={() => setSecondaryOpen(false)}
                />
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </AccountLayout>
  )
}

function WalletForm({
  role,
  wallet,
  userId,
  initial,
  onSaved,
}: {
  role: Wallet["role"]
  wallet?: Wallet
  userId: string
  initial: Draft
  onSaved?: () => void
}) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>(initial)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const title = role === "primary" ? "Carteira principal" : "Carteira secundária"
  const id = (name: string) => `${role}-${name}`

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setFields((current) => ({ ...current, [key]: "" }))
    setSaved("")
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input: WalletInput = { ...draft, network: draft.network as Network, walletType: draft.walletType as WalletType }
      return wallet ? updateWallet(wallet.id, input) : createWallet(input)
    },
    onSuccess: async () => {
      setError("")
      setFields({})
      setSaved(`${title} salva.`)
      await queryClient.invalidateQueries({ queryKey: queryKeys.wallets(userId) })
      announce(`${title} salva.`)
      onSaved?.()
    },
    onError: (caught) => {
      setSaved("")
      setError(errorMessage(caught, "Não foi possível salvar a carteira."))
      if (caught instanceof ApiRequestError) setFields(caught.fields ?? {})
    },
  })

  return (
    <form
      className="mt-6"
      noValidate
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault()
        const local = validate(draft)
        setFields(local)
        const first = Object.keys(local)[0]
        if (first) {
          setError("Revise os campos destacados.")
          document.getElementById(id(first))?.focus()
          return
        }
        mutation.mutate()
      }}
    >
      <div className="grid gap-x-7 gap-y-5 md:grid-cols-2">
        <Field id={id("displayName")} label="Nome de exibição" required error={fields.displayName}>
          <Input {...fieldA11y(id("displayName"), fields.displayName)} value={draft.displayName} onChange={(e) => set("displayName", e.target.value)} />
        </Field>
        <Field id={id("label")} label="Apelido da carteira" required error={fields.label}>
          <Input {...fieldA11y(id("label"), fields.label)} value={draft.label} onChange={(e) => set("label", e.target.value)} />
        </Field>
        <Field id={id("network")} label="Rede" required error={fields.network}>
          <NativeSelect {...fieldA11y(id("network"), fields.network)} required value={draft.network} onChange={(e) => set("network", e.target.value as Network)}>
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
        <Field id={id("profileName")} label="Nome do perfil" required error={fields.profileName}>
          <Input {...fieldA11y(id("profileName"), fields.profileName)} value={draft.profileName} onChange={(e) => set("profileName", e.target.value)} />
        </Field>
        <Field
          id={id("address")}
          label="Endereço da carteira"
          required
          error={fields.address}
          hint={
            <>
              "0x" + 40 caracteres (0–9, a–f). Endereço simulado:{" "}
              <button
                type="button"
                className="font-bold text-amber underline underline-offset-2 hover:text-cream"
                onClick={() => set("address", randomAddress())}
              >
                Gerar endereço de teste
              </button>
            </>
          }
        >
          <NoAutofillInput {...fieldA11y(id("address"), fields.address, true)} name="wallet-hex" value={draft.address} onChange={(e) => set("address", e.target.value.trim())} placeholder="0x…" spellCheck={false} maxLength={42} />
        </Field>
        <Field id={id("ensSecondary")} label="ENS ou carteira secundária (opcional)" hideLabel error={fields.ensSecondary} className="md:pt-7">
          <NoAutofillInput {...fieldA11y(id("ensSecondary"), fields.ensSecondary)} name="wallet-ens-secondary" value={draft.ensSecondary} onChange={(e) => set("ensSecondary", e.target.value.trim())} placeholder="ENS ou carteira secundária (opcional)" spellCheck={false} />
        </Field>
        <Field id={id("walletType")} label="Tipo de carteira" required error={fields.walletType}>
          <NativeSelect {...fieldA11y(id("walletType"), fields.walletType)} required value={draft.walletType} onChange={(e) => set("walletType", e.target.value as WalletType)}>
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
        <Field id={id("referralCode")} label="Código de indicação" required error={fields.referralCode} hint="Qualquer código com 3 ou mais caracteres.">
          <NoAutofillInput {...fieldA11y(id("referralCode"), fields.referralCode, true)} name="wallet-referral" value={draft.referralCode} onChange={(e) => set("referralCode", e.target.value)} placeholder="Ex.: KURIO-01" />
        </Field>
        <Field id={id("email")} label="E-mail" required error={fields.email}>
          <Input {...fieldA11y(id("email"), fields.email)} type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field id={id("ensName")} label="Nome ENS" required error={fields.ensName} hint="Minúsculas, números, ponto ou hífen (ex.: daniel-ferreira).">
          <div className="flex gap-2.5">
            <span className="inline-flex h-10 w-[78px] shrink-0 items-center justify-center rounded-[2px] border border-[#3b271c] text-base" aria-hidden="true">
              .eth
            </span>
            <Input {...fieldA11y(id("ensName"), fields.ensName, true)} value={draft.ensName} onChange={(e) => set("ensName", normalizeEns(e.target.value))} placeholder="seu-nome" className="flex-1" />
          </div>
        </Field>
      </div>
      {error ? (
        <p className="mt-5 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-5 text-sm text-ok" role="status">
          {saved}
        </p>
      ) : null}
      <Button type="submit" className="mt-8 h-10 px-0.5 text-[15px]" disabled={mutation.isPending}>
        {mutation.isPending ? "Salvando…" : "Salvar carteira"}
      </Button>
    </form>
  )
}

function WalletsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-10 rounded" />
        </div>
      ))}
    </div>
  )
}

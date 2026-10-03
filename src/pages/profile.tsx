import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, ImagePlus } from "lucide-react"
import { useRef, useState } from "react"
import { AccountLayout } from "@/components/account-layout.tsx"
import { Field, fieldA11y } from "@/components/field.tsx"
import { ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import type { PublicUser } from "@/contracts/api.ts"
import { useSession } from "@/features/session.ts"
import { ApiRequestError } from "@/lib/api/client.ts"
import { changePassword, getProfile, updateProfile } from "@/lib/api/http.ts"
import { announce } from "@/lib/announce.ts"
import { queryKeys } from "@/lib/query.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

export function ProfilePage() {
  const session = useSession()
  const userId = session.data?.user?.id ?? ""
  const profile = useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: ({ signal }) => getProfile(signal),
    enabled: Boolean(userId),
  })
  return (
    <AccountLayout title="Perfil do colecionador">
      <h1 className="text-lg font-bold tracking-wide max-md:sr-only">Perfil do colecionador</h1>
      {profile.isPending ? <ProfileSkeleton /> : null}
      {profile.isError ? <ErrorBlock className="mt-6" message={errorMessage(profile.error, "Não foi possível carregar o perfil.")} onRetry={() => void profile.refetch()} /> : null}
      {profile.data ? <ProfileForm key={profile.data.id} initial={profile.data} userId={userId} /> : null}
    </AccountLayout>
  )
}

type Draft = { name: string; username: string; email: string; ensName: string; walletNickname: string }

function ProfileForm({ initial, userId }: { initial: PublicUser; userId: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft>({
    name: initial.name,
    username: initial.username,
    email: initial.email,
    ensName: initial.ensName,
    walletNickname: initial.walletNickname,
  })
  const [avatar, setAvatar] = useState(initial.avatarDataUrl)
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setFields((current) => ({ ...current, [key]: "" }))
    setSaved("")
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const wantsPassword = Boolean(passwords.current || passwords.next || passwords.confirm)
      await updateProfile({ ...draft, ensName: draft.ensName.replace(/\.eth$/, ""), avatarDataUrl: avatar })
      if (wantsPassword) {
        try {
          await changePassword({ currentPassword: passwords.current, nextPassword: passwords.next })
        } catch (caught) {
          // Perfil já foi salvo — sinaliza apenas a falha de senha.
          if (caught instanceof ApiRequestError) caught.message = `Perfil salvo, mas a senha não foi alterada: ${caught.message}`
          throw caught
        }
      }
      return wantsPassword
    },
    onSuccess: async (changedPassword) => {
      setError("")
      setFields({})
      setPasswords({ current: "", next: "", confirm: "" })
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.session })
      const message = changedPassword ? "Perfil e senha atualizados." : "Perfil atualizado."
      setSaved(message)
      announce(message)
    },
    onError: async (caught) => {
      setSaved("")
      setError(errorMessage(caught, "Não foi possível salvar o perfil."))
      if (caught instanceof ApiRequestError) setFields(caught.fields ?? {})
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) })
    },
  })

  function submit() {
    const local: Record<string, string> = {}
    if (draft.name.trim().length < 2) local.name = "Informe o nome de exibição."
    if (!/^[a-z0-9._]{3,24}$/.test(draft.username.trim())) local.username = "Use de 3 a 24 letras minúsculas, números, ponto ou _."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) local.email = "Informe um e-mail válido."
    if (!/^[a-z0-9][a-z0-9.-]{1,30}$/.test(draft.ensName.trim().replace(/\.eth$/, ""))) local.ensName = "Use letras minúsculas, números, ponto ou hífen."
    if (draft.walletNickname.trim().length < 2) local.walletNickname = "Informe o apelido da carteira."
    if (passwords.current || passwords.next || passwords.confirm) {
      if (!passwords.current) local.currentPassword = "Informe a senha atual."
      if (passwords.next.length < 8) local.nextPassword = "A nova senha precisa ter ao menos 8 caracteres."
      if (passwords.next !== passwords.confirm) local.confirmPassword = "As senhas não conferem."
    }
    setFields(local)
    const first = Object.keys(local)[0]
    if (first) {
      setError("Revise os campos destacados.")
      document.getElementById(`pf-${first}`)?.focus()
      return
    }
    setError("")
    mutation.mutate()
  }

  return (
    <form
      className="mt-6 md:mt-7"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-x-7 gap-y-6 md:grid-cols-2">
        <Field id="pf-name" label="Nome de exibição" required error={fields.name}>
          <Input {...fieldA11y("pf-name", fields.name)} value={draft.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
        </Field>
        <Field id="pf-username" label="Nome de usuário" required error={fields.username}>
          <Input {...fieldA11y("pf-username", fields.username)} value={draft.username} onChange={(e) => set("username", e.target.value.toLowerCase())} autoComplete="username" />
        </Field>
        <Field id="pf-email" label="E-mail" required error={fields.email}>
          <Input {...fieldA11y("pf-email", fields.email)} type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field id="pf-ensName" label="Nome ENS" required error={fields.ensName}>
          <div className="flex gap-2.5">
            <span className="inline-flex h-10 w-[78px] shrink-0 items-center justify-center rounded-[2px] border border-[#3b271c] text-base" aria-hidden="true">
              .eth
            </span>
            <Input {...fieldA11y("pf-ensName", fields.ensName)} value={draft.ensName} onChange={(e) => set("ensName", e.target.value.toLowerCase())} className="flex-1" />
          </div>
        </Field>
        <Field id="pf-walletNickname" label="Apelido da carteira" required error={fields.walletNickname}>
          <Input {...fieldA11y("pf-walletNickname", fields.walletNickname)} value={draft.walletNickname} onChange={(e) => set("walletNickname", e.target.value)} />
        </Field>
        <div className="grid content-start gap-2">
          <span className="text-sm font-medium tracking-wide" id="pf-avatar-label">
            Avatar
          </span>
          <div className="flex items-center gap-6" role="group" aria-labelledby="pf-avatar-label">
            {avatar ? (
              <img src={avatar} alt="Avatar atual" className="size-[50px] rounded-full object-cover" />
            ) : (
              <span className="grid size-[50px] place-items-center rounded-full bg-[#2e1a10] text-amber" aria-label="Sem avatar">
                <ImagePlus className="size-6" aria-hidden="true" />
              </span>
            )}
            <Button type="button" className="h-10 w-[98px] text-[15px]" onClick={() => fileRef.current?.click()}>
              Alterar
            </Button>
            <button
              type="button"
              className="text-[15px] tracking-wide hover:text-amber disabled:opacity-40"
              disabled={!avatar}
              onClick={() => {
                setAvatar(null)
                setSaved("")
                announce("Avatar removido. Salve para confirmar.")
              }}
            >
              Remover
            </button>
            <input
              ref={fileRef}
              id="pf-avatar"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label="Escolher arquivo de avatar"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                if (!file.type.startsWith("image/")) {
                  setFields((current) => ({ ...current, avatar: "Envie uma imagem PNG, JPG ou WebP." }))
                  return
                }
                if (file.size > 250_000) {
                  setFields((current) => ({ ...current, avatar: "Use uma imagem de até 250 KB." }))
                  return
                }
                const reader = new FileReader()
                reader.onload = () => {
                  setAvatar(typeof reader.result === "string" ? reader.result : null)
                  setFields((current) => ({ ...current, avatar: "" }))
                  announce("Avatar selecionado. Salve para confirmar.")
                }
                reader.readAsDataURL(file)
              }}
            />
          </div>
          {fields.avatar ? (
            <p className="text-xs text-danger" role="alert">
              {fields.avatar}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset className="mt-10 grid max-w-[417px] gap-5">
        <legend className="text-lg font-bold tracking-wide">Alterar senha</legend>
        <PasswordField id="pf-currentPassword" label="Senha atual" value={passwords.current} error={fields.currentPassword} autoComplete="current-password" onChange={(value) => setPasswords((current) => ({ ...current, current: value }))} />
        <PasswordField id="pf-nextPassword" label="Nova senha" value={passwords.next} error={fields.nextPassword} autoComplete="new-password" onChange={(value) => setPasswords((current) => ({ ...current, next: value }))} />
        <PasswordField id="pf-confirmPassword" label="Confirmar nova senha" value={passwords.confirm} error={fields.confirmPassword} autoComplete="new-password" onChange={(value) => setPasswords((current) => ({ ...current, confirm: value }))} />
      </fieldset>

      {error ? (
        <p className="mt-6 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-6 text-sm text-ok" role="status">
          {saved}
        </p>
      ) : null}
      <Button type="submit" className="mt-8 h-10 w-[131px] text-[15px]" disabled={mutation.isPending}>
        {mutation.isPending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  )
}

function PasswordField({
  id,
  label,
  value,
  error,
  autoComplete,
  onChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  autoComplete: string
  onChange: (value: string) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <Input {...fieldA11y(id, error)} type={show ? "text" : "password"} value={value} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className="pr-12" />
        <button
          type="button"
          className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center text-[#7d5636] hover:text-amber"
          onClick={() => setShow((current) => !current)}
          aria-label={show ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={show}
        >
          {show ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </button>
      </div>
    </Field>
  )
}

function ProfileSkeleton() {
  return (
    <div className="mt-7 grid gap-6 md:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-10 rounded" />
        </div>
      ))}
    </div>
  )
}

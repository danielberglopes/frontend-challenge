import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router"
import { Eye, EyeOff } from "lucide-react"
import { useId, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { FacebookIcon, GoogleIcon } from "@/components/brand-icons.tsx"
import { openOutOfScope } from "@/components/shell.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx"
import { useMediaQuery } from "@/features/media.ts"
import { HomePage } from "@/pages/home.tsx"
import { ApiRequestError } from "@/lib/api/client.ts"
import { getSession, login, register } from "@/lib/api/http.ts"
import { announce } from "@/lib/announce.ts"
import { clearPrivateCache, queryClient, queryKeys } from "@/lib/query.ts"
import { cn, isSafeRedirect, writeToken } from "@/lib/utils.ts"

async function enter(token: string) {
  writeToken(token)
  // Troca de usuário: descarta dados privados da sessão anterior antes de carregar a nova.
  clearPrivateCache()
  await queryClient.fetchQuery({ queryKey: queryKeys.session, queryFn: ({ signal }) => getSession(signal) })
  await queryClient.invalidateQueries({ queryKey: ["cart"] })
}

type Mode = "login" | "register"

export function LoginPage() {
  return <AuthScreen mode="login" />
}

export function RegisterPage() {
  return <AuthScreen mode="register" />
}

function AuthScreen({ mode }: { mode: Mode }) {
  const desktop = useMediaQuery("(min-width: 768px)")
  const search = useSearch({ strict: false }) as { redirect?: string; expired?: number }
  const router = useRouter()
  const navigate = useNavigate()

  function leave() {
    if (isSafeRedirect(search.redirect)) router.history.push(search.redirect)
    else void navigate({ to: "/" })
  }

  const form = mode === "login" ? <LoginForm onDone={leave} variant={desktop ? "dialog" : "page"} /> : <RegisterForm onDone={leave} variant={desktop ? "dialog" : "page"} />

  if (!desktop) {
    return (
      <div className="mx-auto min-h-screen max-w-[480px] px-7 pt-[120px] pb-12">
        <Link to="/" className="block text-center text-[40px] leading-none font-bold tracking-[0.12em]" aria-label="Kurio, página inicial">
          KURIO
        </Link>
        <h1 className="mt-[100px] text-center text-xl font-bold tracking-wide">{mode === "login" ? "Entrar" : "Criar perfil de colecionador"}</h1>
        <div className="mt-10">{form}</div>
      </div>
    )
  }

  return (
    <>
      <HomePage />
      <Dialog open onOpenChange={(open) => !open && leave()}>
        <DialogContent className="top-[160px] translate-y-0 px-0 pt-12 pb-16 md:px-0 md:pt-12" overlayClassName="bg-black/40">
          <div className="flex items-center justify-center gap-0 text-xl tracking-wide">
            <AuthTab to="/login" active={mode === "login"} redirect={search.redirect}>
              Entrar
            </AuthTab>
            <span className="mx-1.5 h-6 w-0.5 bg-fill" aria-hidden="true" />
            <AuthTab to="/register" active={mode === "register"} redirect={search.redirect}>
              Criar conta
            </AuthTab>
          </div>
          <DialogTitle className="sr-only">{mode === "login" ? "Entrar" : "Criar conta"}</DialogTitle>
          <DialogDescription className="mx-auto mt-12 max-w-[400px] px-6 text-center text-[13px] leading-4 tracking-wide">
            {mode === "login" ? "Entre para gerenciar sua carteira, coleção e perfil de criador." : "Crie seu perfil de colecionador e conecte uma carteira quando quiser."}
          </DialogDescription>
          <div className="mt-6">{form}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AuthTab({ to, active, redirect, children }: { to: "/login" | "/register"; active: boolean; redirect?: string; children: ReactNode }) {
  return (
    <Link to={to} search={{ redirect }} replace aria-current={active ? "page" : undefined} className={active ? "text-amber" : "text-cream hover:text-amber"}>
      {children}
    </Link>
  )
}

function ExpiredNotice() {
  const search = useSearch({ strict: false }) as { expired?: number }
  if (search.expired !== 1) return null
  return (
    <p className="mb-4 border border-fill/60 bg-band/60 p-3 text-sm" role="status">
      Sua sessão expirou. Entre novamente para continuar de onde parou.
    </p>
  )
}

function LoginForm({ onDone, variant }: { onDone: () => void; variant: "dialog" | "page" }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const local: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) local.email = "Informe um e-mail válido."
    if (!password) local.password = "Informe a senha."
    setFields(local)
    setError("")
    if (Object.keys(local).length) return
    setPending(true)
    try {
      const result = await login(email, password)
      await enter(result.token)
      announce("Sessão iniciada.")
      onDone()
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message)
        setFields(caught.fields ?? {})
      } else setError("Não foi possível entrar.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className={cn(variant === "dialog" ? "mx-auto max-w-[340px] px-0" : "")}>
      <ExpiredNotice />
      <div className="grid gap-[13px] md:gap-3">
        <AuthInput label="E-mail" type="email" autoComplete="email" placeholder="contato@email.com" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} variant={variant} />
        <PasswordInput label="Senha" autoComplete="current-password" value={password} onChange={setPassword} error={fields.password} variant={variant} />
      </div>
      <div className="mt-3 flex justify-end md:mt-2.5">
        <button type="button" className="text-lg tracking-wide text-amber hover:underline md:text-[13px]" onClick={() => openOutOfScope("Recuperação de senha")}>
          Esqueceu a senha?
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <SubmitButton pending={pending} variant={variant}>
        {pending ? "Entrando…" : "Entrar"}
      </SubmitButton>
      <SocialRow variant={variant} />
      {variant === "page" ? (
        <p className="mt-12 text-center text-lg tracking-wide text-muted">
          Novo na Kurio?{" "}
          <Link to="/register" search={(current: Record<string, unknown>) => ({ redirect: current.redirect as string | undefined })} className="text-muted underline-offset-4 hover:text-amber hover:underline">
            Crie uma conta
          </Link>
        </p>
      ) : null}
    </form>
  )
}

function RegisterForm({ onDone, variant }: { onDone: () => void; variant: "dialog" | "page" }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")
    const local: Record<string, string> = {}
    if (name.trim().length < 2) local.name = "Informe o nome de usuário."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) local.email = "Informe um e-mail válido."
    if (password.length < 8) local.password = "A senha precisa ter ao menos 8 caracteres."
    if (password !== confirm) local.confirm = "As senhas não conferem."
    setFields(local)
    if (Object.keys(local).length) return
    setPending(true)
    try {
      const result = await register({ name, email, password })
      await enter(result.token)
      announce("Conta criada.")
      onDone()
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setError(caught.message)
        setFields(caught.fields ?? (caught.code === "EMAIL_TAKEN" ? { email: "Este e-mail já está em uso." } : {}))
      } else setError("Não foi possível criar a conta.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className={cn(variant === "dialog" ? "mx-auto max-w-[340px]" : "")}>
      <div className="grid gap-[13px] md:gap-3">
        <AuthInput label="Nome de usuário" autoComplete="nickname" placeholder="Nome de usuário" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} variant={variant} center={variant === "page"} />
        <AuthInput label="E-mail" type="email" autoComplete="email" placeholder="Digite seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} variant={variant} />
        <PasswordInput label="Senha" autoComplete="new-password" value={password} onChange={setPassword} error={fields.password} variant={variant} placeholder="Senha" />
        <PasswordInput label="Confirmar senha" autoComplete="new-password" value={confirm} onChange={setConfirm} error={fields.confirm} variant={variant} placeholder="Confirmar senha" />
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <SubmitButton pending={pending} variant={variant}>
        {pending ? "Criando…" : variant === "page" ? "Criar perfil" : "Criar conta"}
      </SubmitButton>
      <SocialRow variant={variant} />
      {variant === "page" ? (
        <p className="mt-12 text-center text-lg tracking-wide text-muted">
          Já tem uma conta?{" "}
          <Link to="/login" search={(current: Record<string, unknown>) => ({ redirect: current.redirect as string | undefined })} className="text-muted underline-offset-4 hover:text-amber hover:underline">
            Entre
          </Link>
        </p>
      ) : null}
    </form>
  )
}

function AuthInput({
  label,
  error,
  variant,
  center,
  className,
  trailing,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; variant: "dialog" | "page"; center?: boolean; trailing?: ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "w-full border bg-transparent tracking-wide text-cream outline-none placeholder:text-faint focus:border-fill aria-[invalid=true]:border-danger",
            variant === "page" ? "h-[50px] rounded-[8px] border-[#3d241a] px-4 text-lg" : "h-10 rounded-[2px] border-[#3b271c] px-4 text-[13px]",
            center && "text-center",
            trailing ? "pr-12" : "",
            className,
          )}
          {...props}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  error,
  variant,
  autoComplete,
  placeholder = "Senha",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  variant: "dialog" | "page"
  autoComplete: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <AuthInput
      label={label}
      type={show ? "text" : "password"}
      autoComplete={autoComplete}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      variant={variant}
      trailing={
        <button
          type="button"
          onClick={() => setShow((current) => !current)}
          className="absolute top-1/2 right-3 grid size-8 -translate-y-1/2 place-items-center text-[#7d5636] hover:text-amber"
          aria-label={show ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={show}
        >
          {show ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
        </button>
      }
    />
  )
}

function SubmitButton({ children, pending, variant }: { children: ReactNode; pending: boolean; variant: "dialog" | "page" }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cn("w-full", variant === "page" ? "mt-10 h-[60px] rounded-[8px] text-lg" : "mt-6 h-[45px] text-base")}
    >
      {children}
    </Button>
  )
}

function SocialRow({ variant }: { variant: "dialog" | "page" }) {
  return (
    <div className={variant === "page" ? "mt-12" : "mt-7"}>
      <p className={cn("flex items-center gap-4 text-center tracking-wide", variant === "page" ? "text-base" : "text-[13px] md:-mx-[80px]")}>
        <span className="h-px flex-1 bg-[#3d241a]" aria-hidden="true" />
        Ou continue com
        <span className="h-px flex-1 bg-[#3d241a]" aria-hidden="true" />
      </p>
      <div className={cn("grid", variant === "page" ? "mt-5 gap-4" : "mt-3 gap-3")}>
        {(
          [
            ["Google", GoogleIcon, ""],
            ["Facebook", FacebookIcon, "text-[#3b5998]"],
          ] as const
        ).map(([label, Icon, color]) => (
          <button
            key={label}
            type="button"
            onClick={() => openOutOfScope(`Login com ${label}`)}
            className={cn(
              "flex items-center justify-center gap-3 border tracking-wide hover:border-fill",
              variant === "page" ? "h-10 rounded-[4px] border-[#3d241a] text-base" : "h-10 rounded-[2px] border-[#3b271c] text-[13px]",
            )}
          >
            <Icon className={cn(variant === "page" ? "size-6" : "size-5", color)} />
            Continuar com {label}
          </button>
        ))}
      </div>
    </div>
  )
}

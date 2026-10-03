import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router"
import { Heart, House, LogIn, ScanLine, Search, ShoppingCart, UserRound } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  TwitterIcon,
  YoutubeIcon,
} from "@/components/brand-icons.tsx"
import { RealtimeBridge } from "@/components/realtime.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx"
import { Input } from "@/components/ui/input.tsx"
import { scenarios } from "@/contracts/api.ts"
import { useCart } from "@/features/cart.ts"
import { useSearchDraft } from "@/features/search.ts"
import { useSession } from "@/features/session.ts"
import { announce } from "@/lib/announce.ts"
import { resetSimulation, runSimulation, setScenario } from "@/lib/api/http.ts"
import { clearPrivateCache, queryClient } from "@/lib/query.ts"
import { cn, writeToken } from "@/lib/utils.ts"

/** Ações auxiliares fora do escopo abrem um aviso — nunca simulam sucesso. */
export function openOutOfScope(topic: string) {
  window.dispatchEvent(new CustomEvent("kurio:scope", { detail: topic }))
}

export function openSearch() {
  window.dispatchEvent(new CustomEvent("kurio:search"))
}

const privatePaths = ["/checkout", "/profile", "/wallets", "/favorites", "/orders"]

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [message, setMessage] = useState("")
  const [scope, setScope] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const text = (event as CustomEvent<string>).detail
      setMessage("")
      window.setTimeout(() => setMessage(text), 30)
    }
    const onScope = (event: Event) => setScope((event as CustomEvent<string>).detail)
    const onSearch = () => setSearchOpen(true)
    const onUnauthorized = () => {
      clearPrivateCache()
      const path = `${window.location.pathname}${window.location.search}`
      if (!privatePaths.some((item) => path.startsWith(item))) return
      void router.navigate({ to: "/login", search: { redirect: path, expired: 1 } })
    }
    window.addEventListener("kurio:announce", onAnnounce)
    window.addEventListener("kurio:scope", onScope)
    window.addEventListener("kurio:search", onSearch)
    window.addEventListener("kurio:unauthorized", onUnauthorized)
    return () => {
      window.removeEventListener("kurio:announce", onAnnounce)
      window.removeEventListener("kurio:scope", onScope)
      window.removeEventListener("kurio:search", onSearch)
      window.removeEventListener("kurio:unauthorized", onUnauthorized)
    }
  }, [router])

  // Recibo é apresentado como modal de página inteira, sem cabeçalho (frame "Confirmação de Pedido").
  const chromeless = pathname.startsWith("/orders/")
  const mobileNav = pathname === "/" || pathname === "/favorites" || pathname === "/profile" || pathname === "/wallets"
  const mobileFooter = pathname === "/"

  return (
    <div className="min-h-screen overflow-x-clip bg-ink-deep text-cream md:bg-ink">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-[4px] focus:bg-fill focus:px-4 focus:py-2 focus:font-bold focus:text-ink"
      >
        Ir para o conteúdo
      </a>
      {chromeless ? null : <DesktopHeader />}
      <main id="conteudo" tabIndex={-1} className={cn("outline-none", mobileNav && "pb-32 md:pb-0")}>
        {children}
      </main>
      {chromeless ? null : <Footer className={mobileFooter ? undefined : "hidden md:block"} />}
      {mobileNav ? <MobileNav /> : null}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {message}
      </p>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <Dialog open={scope !== null} onOpenChange={(open) => !open && setScope(null)}>
        <DialogContent>
          <DialogTitle className="pr-8 text-lg font-bold">Fora desta entrega</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-muted">
            “{scope}” não faz parte dos fluxos de descoberta, compra e conta desta versão. Nenhuma ação foi executada.
          </DialogDescription>
          <Button className="mt-6" type="button" onClick={() => setScope(null)}>
            Entendi
          </Button>
        </DialogContent>
      </Dialog>
      <RealtimeBridge />
    </div>
  )
}

function DesktopHeader() {
  const session = useSession()
  const user = session.data?.user
  const { count } = useCart()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const marketActive = pathname.startsWith("/nfts") || pathname === "/cart" || pathname === "/checkout"
  const homeActive = !marketActive

  return (
    <header className="hidden bg-ink md:block">
      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between border-b border-line px-0 md:mx-6 lg:mx-auto">
        <Link to="/" className="text-sm font-bold tracking-[0.12em]" aria-label="Kurio, página inicial">
          KURIO
        </Link>
        <nav aria-label="Principal" className="flex h-full items-stretch gap-6 lg:gap-10">
          <NavItem active={homeActive}>
            <Link to="/" aria-current={homeActive ? "page" : undefined}>
              Início
            </Link>
          </NavItem>
          <NavItem active={marketActive}>
            <Link to="/" hash="catalogo" aria-current={marketActive ? "page" : undefined}>
              Mercado
            </Link>
          </NavItem>
          <NavItem>
            <button type="button" onClick={() => openOutOfScope("Criadores")}>
              Criadores
            </button>
          </NavItem>
          <NavItem>
            <Link to="/" hash="diario">
              Aprenda
            </Link>
          </NavItem>
        </nav>
        <div className="flex items-center gap-5">
          <button type="button" onClick={openSearch} className="grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label="Buscar NFTs">
            <Search className="size-[22px]" strokeWidth={2} />
          </button>
          <Link to="/cart" className="relative grid size-9 place-items-center rounded-full hover:bg-white/5" aria-label={`Carrinho, ${count} ${count === 1 ? "item" : "itens"}`}>
            <ShoppingCart className="size-[22px]" strokeWidth={2} />
            {count > 0 ? (
              <span className="absolute top-0 right-0 grid h-[15px] min-w-[15px] place-items-center rounded-full bg-fill px-0.5 text-[9px] font-bold text-ink" aria-hidden="true">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
          {user ? (
            <Link
              to="/profile"
              className="inline-flex h-[34px] items-center gap-2 rounded-[4px] border border-fill px-3 text-sm font-medium hover:bg-fill/10"
            >
              {user.avatarDataUrl ? (
                <img src={user.avatarDataUrl} alt="" className="size-5 rounded-full object-cover" />
              ) : (
                <UserRound className="size-4" />
              )}
              {user.name.split(" ")[0]}
            </Link>
          ) : (
            <Link
              to="/login"
              search={{ redirect: pathname === "/login" ? undefined : pathname }}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-[4px] bg-fill px-2.5 text-base font-medium text-ink hover:bg-fill-deep"
            >
              <LogIn className="size-[18px]" strokeWidth={2.2} />
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function NavItem({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "relative flex items-start pt-[25px] text-base [&>*]:outline-offset-4",
        active ? "font-bold text-amber after:absolute after:inset-x-0 after:-bottom-px after:h-[3px] after:bg-fill" : "text-cream hover:text-amber",
      )}
    >
      {children}
    </div>
  )
}

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const search = useSearchDraft({ live: false })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-24 translate-y-0" accentBar={false}>
        <DialogTitle className="text-lg font-bold">Buscar NFTs</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">Pesquise por nome, coleção, token ou atributo.</DialogDescription>
        <form
          role="search"
          className="mt-5 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            search.submit()
            onOpenChange(false)
          }}
        >
          <label htmlFor="header-search" className="sr-only">
            Explorar coleções
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
            <Input
              id="header-search"
              type="search"
              autoFocus
              value={search.draft}
              onChange={(event) => search.setDraft(event.target.value)}
              placeholder="Explorar coleções"
              className="h-11 pl-10"
            />
          </div>
          <Button type="submit" className="h-11">
            Buscar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MobileNav() {
  const session = useSession()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const accountTo = session.data?.user ? "/profile" : "/login"
  const items = [
    { to: "/", label: "Início", icon: House, active: pathname === "/" },
    { to: "/favorites", label: "Favoritos", icon: Heart, active: pathname === "/favorites" },
    { to: "/cart", label: "Carrinho", icon: ShoppingCart, active: pathname === "/cart" },
    { to: accountTo, label: "Conta", icon: UserRound, active: pathname === "/profile" || pathname === "/wallets" },
  ] as const
  return (
    <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="relative mx-auto h-[84px] max-w-[480px] rounded-t-[40px] bg-panel shadow-[0_-12px_32px_rgba(0,0,0,0.35)]">
        <div className="grid h-full grid-cols-[1fr_1fr_96px_1fr_1fr] items-center px-4 pb-[env(safe-area-inset-bottom,0px)]">
          {items.slice(0, 2).map((item) => (
            <MobileNavLink key={item.label} {...item} />
          ))}
          <span aria-hidden="true" />
          {items.slice(2).map((item) => (
            <MobileNavLink key={item.label} {...item} />
          ))}
        </div>
        <button
          type="button"
          onClick={openSearch}
          className="absolute -top-8 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-full border-[6px] border-ink-deep bg-fill-gradient text-cream shadow-card"
          aria-label="Explorar coleções"
        >
          <ScanLine className="size-7" strokeWidth={2} />
        </button>
      </div>
    </nav>
  )
}

function MobileNavLink({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: "/" | "/favorites" | "/cart" | "/profile" | "/login"
  label: string
  icon: typeof House
  active: boolean
}) {
  return (
    <Link to={to} className="grid h-14 place-items-center rounded-full" aria-label={label} aria-current={active ? "page" : undefined}>
      <Icon className={cn("size-7", active ? "fill-fill text-fill" : "fill-[#e8c9a5] text-[#e8c9a5]")} strokeWidth={1.6} />
    </Link>
  )
}

const footerFeatures = [
  { letter: "W", title: "Segurança da carteira", text: "Proteja sua carteira e colecione arte digital verificada com confiança." },
  { letter: "C", title: "Criadores em destaque", text: "Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede." },
  { letter: "D", title: "Alertas de lançamentos", text: "Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado." },
]

function Footer({ className }: { className?: string }) {
  const navigate = useNavigate()
  return (
    <footer className={cn("px-4 pt-16 pb-6 md:px-6 md:pt-[72px] lg:px-0", className)}>
      <div className="mx-auto max-w-[1200px] bg-panel">
        <div className="grid gap-8 px-6 py-8 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.25fr] lg:gap-0 lg:px-12">
          {footerFeatures.map((item) => (
            <div key={item.letter} className="lg:border-r lg:border-fill lg:pr-6 lg:[&:not(:first-child)]:pl-4">
              <span className="grid size-[74px] place-items-center rounded-full bg-fill text-2xl font-bold text-ink" aria-hidden="true">
                {item.letter}
              </span>
              <h2 className="mt-4 text-base font-bold">{item.title}</h2>
              <p className="mt-2 max-w-[230px] text-sm leading-[22px] text-muted">{item.text}</p>
            </div>
          ))}
          <form
            className="lg:pl-4"
            onSubmit={(event) => {
              event.preventDefault()
              openOutOfScope("Newsletter de lançamentos")
            }}
          >
            <h2 className="text-base leading-4 font-bold">
              <label htmlFor="newsletter">Antecipe-se ao próximo lançamento</label>
            </h2>
            <div className="mt-4 flex h-10">
              <input
                id="newsletter"
                type="email"
                placeholder="digite seu e-mail..."
                className="min-w-0 flex-1 rounded-l-[4px] bg-[#2e1c12] px-3 text-sm text-cream outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-fill"
              />
              <button type="submit" className="rounded-r-[4px] bg-fill px-4 text-lg font-bold text-ink hover:bg-fill-deep">
                Enviar
              </button>
            </div>
            <p className="mt-4 text-[13px] leading-[22px] text-muted">
              Receba lançamentos selecionados, histórias de criadores e novidades do mercado.
            </p>
          </form>
        </div>
        <div className="grid gap-3 bg-band px-6 py-6 text-sm sm:grid-cols-2 lg:grid-cols-4 lg:items-center lg:px-8">
          <p className="font-bold tracking-[0.12em]">KURIO</p>
          <p className="leading-[22px]">
            Feito para colecionadores,
            <br className="hidden lg:block" /> criadores e cultura
          </p>
          <p>contato@email.com</p>
          <p>+55 11 4002 8922</p>
        </div>
        <div className="grid gap-8 px-6 pt-8 pb-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <FooterColumn title="Meu perfil">
            <FooterLink onClick={() => void navigate({ to: "/profile" })}>Meu perfil</FooterLink>
            <FooterLink onClick={() => openOutOfScope("Minha coleção")}>Minha coleção</FooterLink>
            <FooterLink onClick={() => openOutOfScope("Atividade")}>Atividade</FooterLink>
            <FooterLink onClick={() => openOutOfScope("Estúdio do criador")}>Estúdio do criador</FooterLink>
            <FooterLink onClick={() => void navigate({ to: "/favorites" })}>Lista de interesse</FooterLink>
          </FooterColumn>
          <FooterColumn title="Central de ajuda">
            {["Central de ajuda", "Como comprar NFTs", "Carteira e segurança", "Política do mercado", "Denunciar item"].map((item) => (
              <FooterLink key={item} onClick={() => openOutOfScope(item)}>
                {item}
              </FooterLink>
            ))}
          </FooterColumn>
          <FooterColumn title="Coleções">
            {["Arte digital", "Fotografia", "Música", "Arte 3D", "Utilidade"].map((item) => (
              <FooterLink key={item} onClick={() => void navigate({ to: "/", search: { collections: item }, hash: "catalogo" })}>
                {item}
              </FooterLink>
            ))}
          </FooterColumn>
          <div>
            <h2 className="text-lg font-bold">Redes sociais</h2>
            <ul className="mt-3 flex gap-2">
              {[
                ["Facebook", FacebookIcon],
                ["Instagram", InstagramIcon],
                ["Twitter", TwitterIcon],
                ["LinkedIn", LinkedinIcon],
                ["YouTube", YoutubeIcon],
              ].map(([label, Icon]) => {
                const Glyph = Icon as typeof FacebookIcon
                return (
                  <li key={label as string}>
                    <button
                      type="button"
                      onClick={() => openOutOfScope(`Perfil da Kurio no ${label as string}`)}
                      className="grid size-8 place-items-center rounded-[4px] border border-fill text-fill hover:bg-fill/10"
                      aria-label={`Kurio no ${label as string}`}
                    >
                      <Glyph className="size-[18px]" />
                    </button>
                  </li>
                )
              })}
            </ul>
            <h2 className="mt-6 text-lg font-bold">Carteiras compatíveis</h2>
            <WalletBadge className="mt-2" />
          </div>
        </div>
      </div>
      <div className="mx-auto mt-3 flex max-w-[1200px] flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center text-sm">
        <p>© 2026 Kurio. Propriedade digital para todos.</p>
        <ScenarioTrigger />
      </div>
    </footer>
  )
}

export function WalletBadge({ className }: { className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-[4px] border border-[#5a3418] bg-[#3a2010] px-2.5 py-1.5 text-[9px] font-bold tracking-wide text-amber", className)}>
      <span>METAMASK</span>
      <span aria-hidden="true">·</span>
      <span>WALLETCONNECT</span>
      <span aria-hidden="true">·</span>
      <span>COINBASE</span>
    </p>
  )
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-bold">{title}</h2>
      <ul className="mt-1 grid gap-1.5">{children}</ul>
    </div>
  )
}

function FooterLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="text-left text-[15px] leading-6 text-cream hover:text-amber">
        {children}
      </button>
    </li>
  )
}

function ScenarioTrigger() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="text-xs text-faint underline underline-offset-4 hover:text-amber" onClick={() => setOpen(true)}>
        Ambiente de simulação
      </button>
      <ScenarioDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function ScenarioDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [status, setStatus] = useState("")
  async function apply(scenario: string) {
    await setScenario(scenario)
    await queryClient.invalidateQueries()
    setStatus(`Cenário ativo: ${scenario}.`)
    announce(`Cenário ${scenario} aplicado.`)
  }
  async function reset() {
    await resetSimulation()
    writeToken(null)
    clearPrivateCache()
    window.location.assign("/")
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%-2rem,640px)]">
        <DialogTitle className="pr-8 text-lg font-bold">Ambiente de simulação</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-muted">
          Os cenários alteram a rede simulada pelo MSW. O reset restaura o catálogo, as contas e os carrinhos conhecidos.
        </DialogDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {scenarios.map((scenario) => (
            <Button key={scenario} type="button" size="sm" variant="outline" onClick={() => void apply(scenario)}>
              {scenario}
            </Button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              void runSimulation({ type: "set-price", nftId: "emerald-ape-042", price: "1.49" }).then(() => setStatus("Preço do Emerald Ape alterado para 1.49 ETH."))
            }
          >
            Alterar preço do Emerald Ape
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              void runSimulation({ type: "sell-out", nftId: "emerald-ape-042", editionId: "emerald-ape-042-e3" }).then(() => setStatus("Edição 1/50 do Emerald Ape esgotada."))
            }
          >
            Esgotar edição 1/50
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void runSimulation({ type: "drop-sockets" }).then(() => setStatus("Sockets encerrados."))}>
            Derrubar tempo real
          </Button>
        </div>
        {status ? (
          <p className="mt-4 text-sm text-ok" role="status">
            {status}
          </p>
        ) : null}
        <Button className="mt-6" type="button" variant="outline" onClick={() => void reset()}>
          Resetar cenário
        </Button>
      </DialogContent>
    </Dialog>
  )
}

/** Cabeçalho das telas mobile: botão voltar circular + título centralizado. */
export function MobileHeader({ title, back = "/", right }: { title: string; back?: string; right?: ReactNode }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-3 px-6 pt-8 pb-4 md:hidden">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: back }))}
        className="grid size-[35px] shrink-0 place-items-center rounded-full bg-panel text-amber"
        aria-label="Voltar"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="min-w-0 flex-1 text-center text-[20px] leading-tight font-bold">{title}</h1>
      {right ? <div className="grid size-[35px] shrink-0 place-items-center">{right}</div> : null}
    </div>
  )
}

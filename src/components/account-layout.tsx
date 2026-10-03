import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { Download, Heart, LogOut, MapPin, ShoppingCart, TriangleAlert, UserRound, BadgePercent } from "lucide-react"
import type { ReactNode } from "react"
import { MobileHeader, openOutOfScope } from "@/components/shell.tsx"
import { announce } from "@/lib/announce.ts"
import { logout } from "@/lib/api/http.ts"
import { clearPrivateCache } from "@/lib/query.ts"
import { cn, writeToken } from "@/lib/utils.ts"

export async function signOut() {
  try {
    await logout()
  } finally {
    writeToken(null)
    clearPrivateCache()
    announce("Sessão encerrada.")
  }
}

/** Menu "Meu perfil" (frames Perfil do Colecionador e Carteiras). */
export function AccountLayout({ title, children }: { title: string; children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const navigate = useNavigate()
  const items: { label: string; icon: typeof UserRound; to?: "/profile" | "/wallets" | "/favorites"; scope?: string }[] = [
    { label: "Dados do perfil", icon: UserRound, to: "/profile" as const },
    { label: "Carteiras", icon: MapPin, to: "/wallets" as const },
    { label: "Atividade", icon: ShoppingCart, scope: "Atividade" },
    { label: "Lista de interesse", icon: Heart, to: "/favorites" as const },
    { label: "Ofertas", icon: BadgePercent, scope: "Ofertas" },
    { label: "Arquivos baixados", icon: Download, scope: "Arquivos baixados" },
    { label: "Suporte", icon: TriangleAlert, scope: "Suporte" },
  ]

  return (
    <div className="mx-auto max-w-[1200px] md:px-6 lg:px-0">
      <MobileHeader title={title} />
      <div className="grid items-start gap-7 px-6 pb-12 md:mt-8 md:px-0 lg:grid-cols-[310px_minmax(0,1fr)]">
        <nav aria-label="Meu perfil" className="bg-panel pt-4 max-lg:no-scrollbar max-lg:overflow-x-auto">
          <h2 className="px-2.5 pb-2 text-lg font-bold tracking-wide max-lg:hidden">Meu perfil</h2>
          <ul className="flex lg:block">
            {items.map((item) => {
              const active = item.to === pathname
              const Icon = item.icon
              const classes = cn(
                "flex h-[45px] w-full shrink-0 items-center gap-3 border-l-[5px] px-3 text-[15px] tracking-wide whitespace-nowrap text-amber hover:bg-white/5",
                active ? "border-fill" : "border-transparent",
              )
              return (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to} className={classes} aria-current={active ? "page" : undefined}>
                      <Icon className="size-[18px]" aria-hidden="true" />
                      {item.label}
                    </Link>
                  ) : (
                    <button type="button" className={classes} onClick={() => openOutOfScope(item.scope ?? item.label)}>
                      <Icon className="size-[18px]" aria-hidden="true" />
                      {item.label}
                    </button>
                  )}
                </li>
              )
            })}
            <li className="lg:mt-0 lg:border-t lg:border-line">
              <button
                type="button"
                className="flex h-[45px] shrink-0 items-center gap-3 border-l-[5px] border-transparent px-3 text-[15px] font-bold tracking-wide whitespace-nowrap text-amber hover:bg-white/5"
                onClick={() => void signOut().then(() => navigate({ to: "/" }))}
              >
                <LogOut className="size-[18px]" aria-hidden="true" />
                Sair
              </button>
            </li>
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}

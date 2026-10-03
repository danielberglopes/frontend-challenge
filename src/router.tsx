import { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  HeadContent,
  lazyRouteComponent,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { AppShell } from "@/components/shell.tsx"
import type { CatalogSearch, CatalogTab, SortKey } from "@/contracts/api.ts"
import { sorts, tabs } from "@/contracts/api.ts"
import { getSession } from "@/lib/api/http.ts"
import { queryClient, queryKeys } from "@/lib/query.ts"
import { HomePage } from "@/pages/home.tsx"
import { NotFoundPage } from "@/pages/not-found.tsx"

// Divisão por rota: só a home entra no bundle inicial; as demais telas carregam sob demanda
// (e são pré-carregadas na intenção de navegação via defaultPreload: "intent").
const auth = () => import("@/pages/auth.tsx")
const order = () => import("@/pages/order.tsx")
const LoginPage = lazyRouteComponent(auth, "LoginPage")
const RegisterPage = lazyRouteComponent(auth, "RegisterPage")
const NftPage = lazyRouteComponent(() => import("@/pages/nft.tsx"), "NftPage")
const CartPage = lazyRouteComponent(() => import("@/pages/cart.tsx"), "CartPage")
const CheckoutPage = lazyRouteComponent(() => import("@/pages/checkout.tsx"), "CheckoutPage")
const OrderPage = lazyRouteComponent(order, "OrderPage")
const ExplorerPage = lazyRouteComponent(order, "ExplorerPage")
const ProfilePage = lazyRouteComponent(() => import("@/pages/profile.tsx"), "ProfilePage")
const WalletsPage = lazyRouteComponent(() => import("@/pages/wallets.tsx"), "WalletsPage")
const FavoritesPage = lazyRouteComponent(() => import("@/pages/favorites.tsx"), "FavoritesPage")

type RouterContext = { queryClient: QueryClient }

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

function validateCatalog(search: Record<string, unknown>): CatalogSearch {
  const sort = sorts.includes(search.sort as SortKey) ? (search.sort as SortKey) : undefined
  const tab = tabs.includes(search.tab as CatalogTab) ? (search.tab as CatalogTab) : undefined
  const page = Number(search.page)
  return {
    q: text(search.q),
    collections: text(search.collections),
    networks: text(search.networks),
    min: text(search.min),
    max: text(search.max),
    sort: sort === "recent" ? undefined : sort,
    tab: tab === "all" ? undefined : tab,
    page: Number.isFinite(page) && page > 1 ? page : undefined,
  }
}

// "expired" é numérico para serializar como "expired=1" (strings numéricas viram JSON na URL).
function validateRedirect(search: Record<string, unknown>): { redirect?: string; expired?: number } {
  return {
    redirect: text(search.redirect),
    expired: search.expired === 1 || search.expired === "1" ? 1 : undefined,
  }
}

async function requireUser(context: RouterContext, redirectTo: string) {
  const session = await context.queryClient.ensureQueryData({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => getSession(signal),
  })
  if (!session.user) {
    const expired = sessionStorage.getItem("kurio:expired") === "1"
    sessionStorage.removeItem("kurio:expired")
    throw redirect({ to: "/login", search: { redirect: redirectTo, expired: expired ? 1 : undefined } })
  }
}

function RootLayout() {
  return (
    <>
      <HeadContent />
      <AppShell>
        <Outlet />
      </AppShell>
    </>
  )
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  head: () => ({
    meta: [
      { title: "Kurio — Marketplace de NFTs" },
      {
        name: "description",
        content: "Descubra, favorite e compre NFTs na Kurio com carrinho, carteira simulada e confirmação de pedido.",
      },
    ],
  }),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: validateCatalog,
  component: HomePage,
})

const nftRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/nfts/$nftId",
  component: NftPage,
  head: ({ params }) => ({ meta: [{ title: `${params.nftId} — Kurio` }] }),
})

const cartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cart",
  component: CartPage,
  head: () => ({ meta: [{ title: "Carrinho — Kurio" }] }),
})

const checkoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/checkout",
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Pagamento — Kurio" }] }),
  beforeLoad: ({ context, location }) => requireUser(context, location.pathname),
})

const orderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/orders/$orderId",
  component: OrderPage,
  head: () => ({ meta: [{ title: "Pedido — Kurio" }] }),
  beforeLoad: ({ context, location }) => requireUser(context, `${location.pathname}${location.searchStr}`),
})

const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/explorer/$txHash",
  component: ExplorerPage,
  head: () => ({ meta: [{ title: "Explorador simulado — Kurio" }] }),
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: validateRedirect,
  component: LoginPage,
  head: () => ({ meta: [{ title: "Entrar — Kurio" }] }),
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: text(search.redirect) }),
  component: RegisterPage,
  head: () => ({ meta: [{ title: "Cadastro — Kurio" }] }),
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Perfil — Kurio" }] }),
  beforeLoad: ({ context, location }) => requireUser(context, location.pathname),
})

const walletsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wallets",
  // ?redirect=/checkout: após salvar a carteira principal, volta ao pagamento.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({ redirect: text(search.redirect) }),
  component: WalletsPage,
  head: () => ({ meta: [{ title: "Carteiras — Kurio" }] }),
  beforeLoad: ({ context, location }) => requireUser(context, `${location.pathname}${location.searchStr}`),
})

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/favorites",
  component: FavoritesPage,
  head: () => ({ meta: [{ title: "Favoritos — Kurio" }] }),
  beforeLoad: ({ context, location }) => requireUser(context, location.pathname),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  nftRoute,
  cartRoute,
  checkoutRoute,
  orderRoute,
  explorerRoute,
  loginRoute,
  registerRoute,
  profileRoute,
  walletsRoute,
  favoritesRoute,
])

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

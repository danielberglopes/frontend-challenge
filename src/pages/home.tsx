import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { ArrowRight, ChevronDown, ChevronRight, Search, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { NftArt } from "@/components/nft-art.tsx"
import { NftCard, NftCardSkeleton } from "@/components/nft-card.tsx"
import { openOutOfScope } from "@/components/shell.tsx"
import { EmptyState, ErrorBlock, errorMessage } from "@/components/states.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet.tsx"
import type { ArtKey, CatalogSearch, CatalogTab, NftList, SortKey } from "@/contracts/api.ts"
import { collections, networkLabel, networks, sorts, tabs } from "@/contracts/api.ts"
import { useMediaQuery } from "@/features/media.ts"
import { useSearchDraft } from "@/features/search.ts"
import { listNfts } from "@/lib/api/http.ts"
import { cmpEth, formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { cn } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

const tabLabel: Record<CatalogTab, string> = {
  all: "Todos os NFTs",
  new: "Novos lançamentos",
  trending: "Em alta",
}

const sortLabel: Record<SortKey, string> = {
  recent: "Listados recentemente",
  "price-asc": "Menor preço",
  "price-desc": "Maior preço",
  trending: "Em alta",
}

const heroSlides: { art: ArtKey; alt: string }[] = [
  { art: "emerald", alt: "Macaco ilustrado de óculos redondos e jaqueta college verde" },
  { art: "ivory", alt: "Macaco ilustrado de blazer marfim e gola alta verde" },
  { art: "golden", alt: "Macaco ilustrado dourado com fones de ouvido verdes" },
]

function listed(value?: string) {
  return value?.split(",").filter(Boolean) ?? []
}

function catalogParams(raw: Record<string, unknown>): CatalogSearch {
  return {
    q: raw.q as string | undefined,
    collections: raw.collections as string | undefined,
    networks: raw.networks as string | undefined,
    min: raw.min as string | undefined,
    max: raw.max as string | undefined,
    sort: raw.sort as SortKey | undefined,
    page: raw.page as number | undefined,
    tab: raw.tab as CatalogTab | undefined,
  }
}

/** Ponto decimal → vírgula, como no Figma ("0,02 - 12,30 ETH"). */
function ptBr(value: string) {
  return formatEth(value).replace(".", ",")
}

export function HomePage() {
  const raw = useSearch({ strict: false }) as Record<string, unknown>
  const search = catalogParams(raw)
  const navigate = useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const catalog = useQuery({
    queryKey: queryKeys.nfts(search),
    queryFn: ({ signal }) => listNfts(search, signal),
    placeholderData: (previous) => previous,
  })

  function update(patch: Partial<CatalogSearch>, resetPage = true) {
    void navigate({
      to: "/",
      search: (current: Record<string, unknown>) => ({
        ...catalogParams(current),
        ...patch,
        page: resetPage ? undefined : patch.page,
      }),
    })
  }

  const tab = search.tab ?? "all"
  const wide = useMediaQuery("(min-width: 1024px)")
  // Conteúdo editorial abaixo da dobra só entra depois do catálogo: suas imagens não disputam
  // banda com a imagem do LCP (primeiro card).
  const catalogSettled = Boolean(catalog.data) || catalog.isError
  const activeFilters = listed(search.collections).length + listed(search.networks).length + (search.min || search.max ? 1 : 0)

  return (
    <div className="mx-auto max-w-[1200px] md:px-6 lg:px-0">
      <MobileSearch onOpenFilters={() => setFiltersOpen(true)} activeFilters={activeFilters} />
      <Hero />

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-12 md:mt-16 lg:mt-24 lg:grid-cols-[310px_minmax(0,1fr)]">
        {wide ? (
          <div className="grid gap-6">
            <FilterPanel search={search} facets={catalog.data?.facets} onChange={update} />
            <FeaturedPanel />
          </div>
        ) : null}

        <section id="catalogo" aria-labelledby="catalogo-titulo" aria-busy={catalog.isFetching} className="min-w-0 scroll-mt-6 px-6 md:px-0">
          <h2 id="catalogo-titulo" className="sr-only">
            Catálogo de NFTs
          </h2>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="no-scrollbar -mx-6 flex w-[calc(100%+3rem)] min-w-0 gap-4 overflow-x-auto px-6 md:mx-0 md:w-auto md:gap-5 md:px-0" role="group" aria-label="Recorte do catálogo">
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={tab === item}
                  className={cn(
                    "shrink-0 border-b-[3px] pb-1 text-[15px] tracking-wide whitespace-nowrap md:font-bold",
                    tab === item ? "border-fill text-amber" : "border-transparent text-cream hover:text-amber",
                  )}
                  onClick={() => update({ tab: item === "all" ? undefined : item })}
                >
                  {tabLabel[item]}
                </button>
              ))}
            </div>
            <div className="hidden items-center gap-4 md:flex">
              <Button type="button" variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Filtros{activeFilters ? ` (${activeFilters})` : ""}
              </Button>
              <SortSelect value={search.sort ?? "recent"} onChange={(sort) => update({ sort: sort === "recent" ? undefined : sort })} />
            </div>
          </div>

          <div className="mt-6 md:mt-7">
            {search.q ? (
              <p className="mb-4 text-sm text-muted" role="status">
                Resultados para “{search.q}”{catalog.data ? ` — ${catalog.data.total} encontrado${catalog.data.total === 1 ? "" : "s"}` : ""}
              </p>
            ) : null}
            {catalog.isPending ? <CatalogSkeleton /> : null}
            {catalog.isError && !catalog.data ? (
              <ErrorBlock message={errorMessage(catalog.error, "Não foi possível carregar o catálogo.")} onRetry={() => void catalog.refetch()} />
            ) : null}
            {catalog.isError && catalog.data ? (
              <ErrorBlock
                className="mb-6"
                message={`${errorMessage(catalog.error, "Falha ao atualizar o catálogo.")} Exibindo o último resultado carregado.`}
                onRetry={() => void catalog.refetch()}
              />
            ) : null}
            {catalog.data && catalog.data.items.length === 0 ? (
              <EmptyState
                title="Nenhum NFT encontrado"
                text="Nenhum item corresponde à busca e aos filtros selecionados. Ajuste os critérios ou limpe os filtros."
                action={
                  <Button type="button" variant="outline" onClick={() => void navigate({ to: "/", search: {} })}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : null}
            {catalog.data && catalog.data.items.length > 0 ? <CatalogGrid list={catalog.data} stale={catalog.isPlaceholderData} /> : null}
            {catalog.isFetching && !catalog.isPending ? (
              <p className="sr-only" role="status">
                Atualizando catálogo
              </p>
            ) : null}
          </div>
          {catalog.data && catalog.data.totalPages > 1 ? (
            <Pagination page={catalog.data.page} totalPages={catalog.data.totalPages} onPage={(page) => update({ page: page === 1 ? undefined : page }, false)} />
          ) : null}
        </section>
      </div>

      {catalogSettled ? (
        <>
          <Promos onExplore={update} />
          <Journal />
        </>
      ) : null}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent aria-describedby={undefined}>
          <SheetTitle>Filtros</SheetTitle>
          <div className="mt-4 md:hidden">
            <SortSelect value={search.sort ?? "recent"} onChange={(sort) => update({ sort: sort === "recent" ? undefined : sort })} />
          </div>
          <div className="mt-6">
            <FilterPanel search={search} facets={catalog.data?.facets} onChange={update} plain />
          </div>
          <Button type="button" className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
            Ver {catalog.data?.total ?? 0} resultados
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MobileSearch({ onOpenFilters, activeFilters }: { onOpenFilters: () => void; activeFilters: number }) {
  const search = useSearchDraft()
  return (
    <form
      role="search"
      className="flex gap-2.5 px-6 pt-10 md:hidden"
      onSubmit={(event) => {
        event.preventDefault()
        search.submit()
      }}
    >
      <label htmlFor="mobile-search" className="sr-only">
        Explorar coleções
      </label>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-[#d9b58b]" aria-hidden="true" />
        <input
          id="mobile-search"
          type="search"
          value={search.draft}
          onChange={(event) => search.setDraft(event.target.value)}
          placeholder="Explorar coleções"
          className="h-[45px] w-full rounded-[16px] bg-panel pr-3 pl-11 text-base tracking-wide text-cream outline-none placeholder:text-[#d9b58b] focus-visible:ring-2 focus-visible:ring-fill"
        />
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        className="relative grid size-[45px] place-items-center rounded-[16px] bg-fill-gradient text-ink"
        aria-label={activeFilters ? `Filtros, ${activeFilters} ativos` : "Filtros"}
      >
        <SlidersHorizontal className="size-5" strokeWidth={2.2} aria-hidden="true" />
        {activeFilters ? (
          <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-cream text-[10px] font-bold text-ink" aria-hidden="true">
            {activeFilters}
          </span>
        ) : null}
      </button>
    </form>
  )
}

function Hero() {
  const [slide, setSlide] = useState(0)
  const current = heroSlides[slide]
  const scrollToCatalog = () => document.getElementById("catalogo")?.scrollIntoView({ block: "start" })
  // Só uma variante no DOM: evita baixar a imagem prioritária da variante oculta.
  const desktop = useMediaQuery("(min-width: 768px)")
  return desktop ? (
      <section aria-labelledby="hero-titulo" className="relative hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-8 pt-8 md:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,450px)]">
        <div className="pt-6 lg:pt-[42px] lg:pl-10">
          <p className="text-sm tracking-[0.08em]">Bem-vindo à Kurio</p>
          <h1 id="hero-titulo" className="mt-4 text-[26px] leading-[42px] font-bold tracking-[0.04em] lg:text-[40px] lg:leading-[70px]">
            SEJA DONO DO FUTURO
            <br />
            DA ARTE DIGITAL
          </h1>
          <p className="mt-3 max-w-[560px] text-sm leading-6 tracking-[0.02em] text-muted">
            Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie artistas e tenha uma parte da cultura da
            internet.
          </p>
          <Button type="button" className="mt-8 h-10 w-[140px]" onClick={scrollToCatalog}>
            EXPLORAR
          </Button>
          <HeroDots slide={slide} onSlide={setSlide} className="mt-8 lg:absolute lg:bottom-[46px] lg:left-[600px] lg:mt-0" />
        </div>
        <NftArt art={current.art} alt={current.alt} priority sizes="(min-width: 1024px) 450px, 45vw" className="w-full rounded-[20px]" />
      </section>
  ) : (
      <section aria-labelledby="hero-titulo-mobile" className="mx-6 mt-4 md:hidden">
        <div className="relative overflow-hidden rounded-[24px] bg-hero-mobile px-4 pt-3 pb-5">
          <div className="grid grid-cols-[minmax(0,1fr)_138px] gap-2">
            <div className="min-w-0">
              <p className="text-[13px] tracking-wide">Bem-vindo à Kurio</p>
              <h1 id="hero-titulo-mobile" className="mt-2 text-[17px] leading-[29px] font-bold tracking-[0.06em]">
                SEJA DONO DA CULTURA DIGITAL
              </h1>
              <p className="mt-2 text-[12px] leading-[18px] tracking-wide text-[#dfc6a6]">Descubra NFTs selecionados de criadores do mundo todo.</p>
              <button type="button" onClick={scrollToCatalog} className="mt-1 inline-flex items-center gap-2 text-[13px] font-bold tracking-wide text-amber">
                EXPLORAR
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="relative pt-1">
              <NftArt art={current.art} alt={current.alt} priority sizes="140px" className="w-full rounded-[16px]" />
              <NftArt art="sage" alt="" sizes="60px" className="absolute -bottom-2 -left-3 w-[58px] rounded-[12px] border-2 border-[#3d2716]" />
            </div>
          </div>
          <HeroDots slide={slide} onSlide={setSlide} className="mt-3 justify-center" />
        </div>
      </section>
  )
}

function HeroDots({ slide, onSlide, className }: { slide: number; onSlide: (index: number) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1.5", className)} role="group" aria-label="Destaques do banner">
      {heroSlides.map((item, index) => (
        <button
          key={item.art}
          type="button"
          onClick={() => onSlide(index)}
          aria-label={`Destaque ${index + 1} de ${heroSlides.length}`}
          aria-pressed={slide === index}
          className="grid size-6 place-items-center"
        >
          <span className={cn("block size-2 rounded-full bg-fill transition-transform", slide === index ? "scale-125" : "opacity-80")} />
        </button>
      ))}
    </div>
  )
}

function SortSelect({ value, onChange }: { value: SortKey; onChange: (sort: SortKey) => void }) {
  return (
    <label className="relative flex items-center gap-1 text-[15px] tracking-wide">
      <span>Ordenar por:</span>
      <select
        aria-label="Ordenar por"
        value={value}
        onChange={(event) => onChange(event.target.value as SortKey)}
        className="appearance-none bg-transparent py-1 pr-6 text-cream outline-none focus-visible:ring-2 focus-visible:ring-fill"
      >
        {sorts.map((item) => (
          <option key={item} value={item} className="bg-panel">
            {sortLabel[item]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 size-4" aria-hidden="true" />
    </label>
  )
}

function CatalogGrid({ list, stale }: { list: NftList; stale: boolean }) {
  return (
    <ul data-testid="catalog-grid" className={cn("grid grid-cols-2 gap-x-[13px] gap-y-6 sm:grid-cols-3 md:gap-x-[34px] md:gap-y-12", stale && "opacity-70 transition-opacity")}>
      {list.items.map((nft, index) => (
        // Grade escalonada no mobile (coluna direita deslocada), como no frame "Mobile / Início".
        <li key={nft.id} className={cn(index % 2 === 1 && "max-sm:translate-y-8")}>
          <NftCard nft={nft} priority={index < 2} />
        </li>
      ))}
    </ul>
  )
}

export function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-[13px] gap-y-6 sm:grid-cols-3 md:gap-x-[34px] md:gap-y-12" data-testid="catalog-skeleton" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => (
        <NftCardSkeleton key={index} className={cn(index % 2 === 1 && "max-sm:translate-y-8")} />
      ))}
    </div>
  )
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return (
    <nav className="mt-14 flex items-center justify-center gap-2 md:mt-[46px] md:justify-end" aria-label="Paginação do catálogo">
      {page > 1 ? (
        <PageButton label="Página anterior" onClick={() => onPage(page - 1)}>
          <ChevronRight className="size-4 rotate-180" aria-hidden="true" />
        </PageButton>
      ) : null}
      {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
        <PageButton key={item} label={`Página ${item}`} current={item === page} onClick={() => onPage(item)}>
          {item}
        </PageButton>
      ))}
      {page < totalPages ? (
        <PageButton label="Próxima página" onClick={() => onPage(page + 1)}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </PageButton>
      ) : null}
    </nav>
  )
}

function PageButton({ children, label, current, onClick }: { children: React.ReactNode; label: string; current?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "grid size-[34px] place-items-center rounded-[4px] border text-sm",
        current ? "border-fill bg-fill font-bold text-ink" : "border-[#3b271c] text-cream hover:border-fill",
      )}
    >
      {children}
    </button>
  )
}

function FilterPanel({
  search,
  facets,
  onChange,
  plain = false,
}: {
  search: CatalogSearch
  facets?: NftList["facets"]
  onChange: (patch: Partial<CatalogSearch>) => void
  plain?: boolean
}) {
  const selectedCollections = listed(search.collections)
  const selectedNetworks = listed(search.networks)

  function toggle(current: string[], value: string) {
    return current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
  }

  return (
    <aside id="filtros" aria-label="Filtros do catálogo" className={cn("grid gap-8", !plain && "bg-panel px-5 pt-5 pb-7")}>
      <section aria-labelledby="filtro-colecoes">
        <h2 id="filtro-colecoes" className="text-lg font-bold">
          Coleções
        </h2>
        <ul className="mt-3 grid gap-1">
          {collections.map((name) => {
            const count = facets?.collections.find((item) => item.name === name)?.count ?? 0
            const active = selectedCollections.includes(name)
            return (
              <li key={name}>
                <FilterRow
                  label={name}
                  count={count}
                  active={active}
                  onClick={() => {
                    const next = toggle(selectedCollections, name)
                    onChange({ collections: next.length ? next.join(",") : undefined })
                  }}
                />
              </li>
            )
          })}
        </ul>
      </section>
      <PriceRange search={search} facets={facets} onChange={onChange} />
      <section aria-labelledby="filtro-rede">
        <h2 id="filtro-rede" className="text-lg font-bold">
          Rede
        </h2>
        <ul className="mt-3 grid gap-1">
          {networks.map((name) => {
            const count = facets?.networks.find((item) => item.name === name)?.count ?? 0
            return (
              <li key={name}>
                <FilterRow
                  label={networkLabel[name]}
                  count={count}
                  active={selectedNetworks.includes(name)}
                  onClick={() => {
                    const next = toggle(selectedNetworks, name)
                    onChange({ networks: next.length ? next.join(",") : undefined })
                  }}
                />
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}

function FilterRow({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-[4px] px-3 text-left text-[15px] tracking-wide hover:bg-white/5",
        active ? "font-bold text-amber" : "text-muted",
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", active ? "bg-fill" : "bg-transparent")} aria-hidden="true" />
        {label}
      </span>
      <span>({count})</span>
    </button>
  )
}

function PriceRange({
  search,
  facets,
  onChange,
}: {
  search: CatalogSearch
  facets?: NftList["facets"]
  onChange: (patch: Partial<CatalogSearch>) => void
}) {
  const floor = facets?.priceRange.min ?? "0.02"
  const ceiling = facets?.priceRange.max ?? "12.30"
  const toNum = (value: string) => Math.round(Number(value) * 100)
  const [low, setLow] = useState(toNum(search.min ?? floor))
  const [high, setHigh] = useState(toNum(search.max ?? ceiling))
  useEffect(() => {
    setLow(toNum(search.min ?? floor))
    setHigh(toNum(search.max ?? ceiling))
  }, [search.min, search.max, floor, ceiling])
  const min = toNum(floor)
  const max = toNum(ceiling)
  const pct = (value: number) => ((value - min) / Math.max(1, max - min)) * 100
  const asEth = (value: number) => (value / 100).toFixed(2)

  return (
    <section aria-labelledby="filtro-preco">
      <h2 id="filtro-preco" className="text-lg font-bold">
        Faixa de preço
      </h2>
      <div className="relative mx-3 mt-4 h-6">
        <div className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 rounded bg-line" />
        <div className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded bg-fill" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
        <input
          type="range"
          aria-label="Preço mínimo em ETH"
          min={min}
          max={max}
          value={low}
          aria-valuetext={`${ptBr(asEth(low))} ETH`}
          onChange={(event) => setLow(Math.min(Number(event.target.value), high))}
          className="range-dual absolute inset-0 h-6 w-full"
        />
        <input
          type="range"
          aria-label="Preço máximo em ETH"
          min={min}
          max={max}
          value={high}
          aria-valuetext={`${ptBr(asEth(high))} ETH`}
          onChange={(event) => setHigh(Math.max(Number(event.target.value), low))}
          className="range-dual absolute inset-0 h-6 w-full"
        />
      </div>
      <p className="mt-3 px-3 text-sm tracking-wide" aria-live="polite">
        Preço: {ptBr(asEth(low))} - {ptBr(asEth(high))} ETH
      </p>
      <Button
        type="button"
        size="sm"
        className="mt-3 ml-3 h-9 px-3 text-[15px]"
        onClick={() => {
          const nextMin = asEth(low)
          const nextMax = asEth(high)
          onChange({
            min: cmpEth(nextMin, floor) <= 0 ? undefined : nextMin,
            max: cmpEth(nextMax, ceiling) >= 0 ? undefined : nextMax,
          })
        }}
      >
        Aplicar
      </Button>
    </section>
  )
}

function FeaturedPanel() {
  const featured = useQuery({
    queryKey: queryKeys.nfts({ sort: "trending" }),
    queryFn: ({ signal }) => listNfts({ sort: "trending" }, signal),
    staleTime: 60_000,
  })
  const nft = featured.data?.items.find((item) => item.featured) ?? featured.data?.items[0]
  return (
    <section aria-labelledby="destaque-titulo" className="bg-featured">
      <h2 id="destaque-titulo" className="px-5 pt-6 text-[22px] leading-7 font-bold tracking-[0.04em] text-amber">
        NFT EM DESTAQUE
        <span className="mt-2 block pl-9 text-[19px] text-cream">OFERTA LIMITADA</span>
      </h2>
      <div className="mt-3">
        {nft ? (
          <Link to="/nfts/$nftId" params={{ nftId: nft.id }} aria-label={`${nft.name}, NFT em destaque`}>
            <NftArt art={nft.art} alt={`Ilustração de ${nft.name}`} sizes="310px" className="h-[365px] w-full rounded-[20px] object-cover" />
          </Link>
        ) : (
          <Skeleton className="h-[365px] rounded-[20px]" />
        )}
      </div>
    </section>
  )
}

function Promos({ onExplore }: { onExplore: (patch: Partial<CatalogSearch>) => void }) {
  const items = [
    {
      art: "emerald" as const,
      title: "Lançamentos gênesis de edição limitada",
      text: "Colecione edições escassas diretamente dos criadores antes da revelação pública.",
      patch: { tab: "new" as const },
    },
    {
      art: "ivory" as const,
      title: "Arte digital selecionada e muito mais",
      text: "Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.",
      patch: { collections: "Arte digital" },
    },
  ]
  return (
    <section aria-label="Coleções em destaque" className="mt-24 grid gap-6 px-6 md:px-0 lg:mt-[116px] lg:grid-cols-2 lg:gap-7">
      {items.map((item) => (
        <article key={item.title} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center bg-panel md:h-[250px] md:grid-cols-[287px_minmax(0,1fr)]">
          <NftArt art={item.art} alt="" sizes="(min-width: 768px) 287px, 50vw" className="h-full w-full rounded-[20px] object-cover" />
          <div className="flex flex-col items-end px-4 py-4 text-right md:px-7">
            <h3 className="text-[15px] leading-6 font-bold tracking-wide md:text-[17px]">{item.title}</h3>
            <p className="mt-3 text-[13px] leading-6 tracking-wide text-muted md:text-sm">{item.text}</p>
            <Button
              type="button"
              className="mt-2 h-10 w-[140px] font-bold"
              onClick={() => {
                onExplore(item.patch)
                document.getElementById("catalogo")?.scrollIntoView({ block: "start" })
              }}
            >
              Explorar
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </article>
      ))}
    </section>
  )
}

const journal: { art: ArtKey; date: string; read: string; title: string; text: string }[] = [
  {
    art: "ivory",
    date: "12 de setembro",
    read: "Leitura de 6 min",
    title: "Como funciona a propriedade de NFTs",
    text: "Aprenda a colecionar, negociar e verificar ativos digitais.",
  },
  {
    art: "emerald",
    date: "13 de setembro",
    read: "Leitura de 2 min",
    title: "10 artistas digitais para acompanhar",
    text: "Conheça criadores que moldam a cultura digital.",
  },
  {
    art: "sage",
    date: "15 de setembro",
    read: "Leitura de 3 min",
    title: "Raridade, atributos e procedência",
    text: "Entenda raridade, procedência, direitos autorais e utilidade.",
  },
  {
    art: "golden",
    date: "15 de setembro",
    read: "Leitura de 2 min",
    title: "Como proteger sua carteira",
    text: "Proteja sua carteira, seus ativos e sua identidade.",
  },
]

function Journal() {
  return (
    <section id="diario" aria-labelledby="diario-titulo" className="mt-24 scroll-mt-6 px-6 md:px-0 lg:mt-[104px]">
      <h2 id="diario-titulo" className="text-center text-2xl font-bold tracking-wide md:text-[28px]">
        Diário da Cunhagem
      </h2>
      <p className="mt-3 text-center text-sm tracking-wide text-muted">Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.</p>
      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {journal.map((post) => (
          <li key={post.title}>
            <article className="h-full overflow-hidden rounded-[4px] bg-panel">
              <NftArt art={post.art} alt="" sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 90vw" className="aspect-[268/195] w-full object-cover" />
              <div className="p-4 pt-3">
                <p className="text-xs tracking-wide text-muted">
                  {post.date} <span aria-hidden="true">|</span> {post.read}
                </p>
                <h3 className="mt-3 text-base leading-[21px] font-bold tracking-wide">{post.title}</h3>
                <p className="mt-3 text-xs leading-4 tracking-wide text-muted">{post.text}</p>
                <button type="button" className="mt-2 text-xs font-bold text-amber hover:underline" onClick={() => openOutOfScope(`Artigo “${post.title}”`)}>
                  Ler mais <span aria-hidden="true">→</span>
                  <span className="sr-only">: {post.title}</span>
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}

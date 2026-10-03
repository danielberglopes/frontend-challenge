import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import { NftArt } from "@/components/nft-art.tsx"
import { useMediaQuery } from "@/features/media.ts"
import type { CatalogSearch } from "@/contracts/api.ts"
import { listNfts } from "@/lib/api/http.ts"
import { formatEth } from "@/lib/eth.ts"
import { queryKeys } from "@/lib/query.ts"
import { cn } from "@/lib/utils.ts"
import { Skeleton } from "@/components/ui/skeleton.tsx"

/** Carrossel "Mais desta coleção" / "Colecionadores também viram". */
export function RelatedCarousel({ title, params, excludeId }: { title: string; params: CatalogSearch; excludeId?: string }) {
  const list = useQuery({
    queryKey: queryKeys.nfts(params),
    queryFn: ({ signal }) => listNfts(params, signal),
    staleTime: 60_000,
  })
  const items = (list.data?.items ?? []).filter((item) => item.id !== excludeId).slice(0, 15)
  const track = useRef<HTMLUListElement>(null)
  const [page, setPage] = useState(0)
  const desktop = useMediaQuery("(min-width: 1024px)")
  const tablet = useMediaQuery("(min-width: 768px)")
  const perView = desktop ? 5 : tablet ? 3 : 2
  const pages = Math.max(1, Math.ceil(items.length / perView))
  const headingId = `rel-${title.replace(/\W+/g, "-").toLowerCase()}`

  function go(index: number) {
    const element = track.current
    if (!element) return
    element.scrollTo({ left: element.clientWidth * index, behavior: "smooth" })
    setPage(index)
  }

  return (
    <section aria-labelledby={headingId} className="mt-16 md:mt-[72px]">
      <h2 id={headingId} className="border-b border-line pb-3 text-base font-bold tracking-wide text-amber md:text-lg">
        {title}
      </h2>
      {list.isPending ? (
        <div className="mt-8 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={cn("h-[255px] rounded-none", index > 1 && "max-md:hidden", index > 2 && "max-lg:hidden")} />
          ))}
        </div>
      ) : null}
      {items.length > 0 ? (
        <>
          <ul
            ref={track}
            onScroll={(event) => {
              const element = event.currentTarget
              setPage(Math.round(element.scrollLeft / Math.max(1, element.clientWidth)))
            }}
            className="no-scrollbar mt-8 grid snap-x snap-mandatory auto-cols-[calc((100%-24px)/2)] grid-flow-col gap-6 overflow-x-auto md:auto-cols-[calc((100%-48px)/3)] lg:auto-cols-[calc((100%-96px)/5)]"
          >
            {items.map((nft) => (
              <li key={nft.id} className="snap-start">
                <Link to="/nfts/$nftId" params={{ nftId: nft.id }} className="group block">
                  <div className="flex h-[255px] items-center bg-panel p-2.5 md:p-5">
                    <NftArt art={nft.art} alt={`Ilustração de ${nft.name}`} sizes="(min-width: 768px) 200px, 45vw" className="w-full rounded-[12px]" />
                  </div>
                  <p className="mt-4 text-[15px] tracking-wide group-hover:text-amber">{nft.name}</p>
                  <p className="text-[15px] font-bold tracking-wide text-amber">{formatEth(nft.price)} ETH</p>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <div className="mt-6 flex justify-center gap-1" role="group" aria-label={`Páginas de ${title}`}>
              {Array.from({ length: pages }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className="grid size-6 place-items-center"
                  aria-label={`Página ${index + 1} de ${pages}`}
                  aria-pressed={page === index}
                  onClick={() => go(index)}
                >
                  <span className={cn("block size-3 rounded-full border-2 border-fill", page === index && "bg-fill")} />
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

import type { ArtKey } from "@/contracts/api.ts"
import { cn } from "@/lib/utils.ts"

const widths = [160, 400, 720, 1080] as const

/** Ilustração original do Figma, servida em WebP responsivo a partir de /public/nfts. */
export function NftArt({
  art,
  alt,
  sizes = "(min-width: 1024px) 260px, 50vw",
  priority = false,
  eager = false,
  className,
}: {
  art: ArtKey
  alt: string
  sizes?: string
  priority?: boolean
  /** Carrega já (acima da dobra) sem elevar a prioridade de rede. */
  eager?: boolean
  className?: string
}) {
  return (
    <img
      src={`/nfts/${art}-400.webp`}
      srcSet={widths.map((width) => `/nfts/${art}-${width}.webp ${width}w`).join(", ")}
      sizes={sizes}
      width={400}
      height={400}
      alt={alt}
      loading={priority || eager ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className={cn("block aspect-square object-cover", className)}
    />
  )
}

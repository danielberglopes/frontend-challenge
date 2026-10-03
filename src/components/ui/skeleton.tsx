import * as React from "react"
import { cn } from "@/lib/utils.ts"

// shadcn/ui Skeleton (new-york) com shimmer (desligado em prefers-reduced-motion) no lugar do pulse.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden="true" className={cn("shimmer rounded-md", className)} {...props} />
}

export { Skeleton }

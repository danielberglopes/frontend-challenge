import * as React from "react"
import { cn } from "@/lib/utils.ts"

// shadcn/ui Textarea (new-york) no estilo dos campos do Figma.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[150px] w-full resize-y rounded-[2px] border border-input bg-background px-3 py-3 text-sm text-foreground transition-colors outline-none placeholder:text-faint disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }

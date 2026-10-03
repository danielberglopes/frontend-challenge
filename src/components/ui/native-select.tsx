import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils.ts"

// shadcn/ui NativeSelect (new-york) — <select> nativo (melhor em mobile e acessível por padrão)
// no estilo dos campos do Figma ("Selecione uma rede ⌄").
function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <div className="group/native-select relative w-full has-[select:disabled]:opacity-50" data-slot="native-select-wrapper">
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "h-10 w-full min-w-0 appearance-none rounded-[2px] border border-input bg-background px-3 pr-10 text-sm text-foreground transition-colors outline-none invalid:text-faint disabled:pointer-events-none disabled:cursor-not-allowed data-[size=sm]:h-8",
          "focus-visible:border-primary aria-invalid:border-destructive",
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" className={cn("bg-card text-card-foreground", className)} {...props} />
}

export { NativeSelect, NativeSelectOption }

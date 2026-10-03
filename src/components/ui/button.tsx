import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/lib/utils.ts"

// shadcn/ui Button (new-york) adaptado à identidade Kurio: tokens primary/secondary mapeados
// para a paleta do Figma, cantos de 4px e Roboto Mono em negrito. Variante extra: "pill" (CTAs mobile).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[4px] font-bold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-fill-deep",
        destructive: "bg-destructive text-primary-foreground hover:bg-destructive/90",
        outline: "border border-primary bg-transparent text-foreground hover:bg-primary/10",
        secondary: "border border-line/70 bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "bg-transparent text-foreground hover:bg-accent",
        link: "h-auto px-0 font-medium text-amber underline-offset-4 hover:underline",
        pill: "rounded-full bg-fill-gradient text-primary-foreground hover:brightness-105",
      },
      size: {
        default: "h-10 px-6 text-sm",
        sm: "h-8 px-3 text-sm",
        lg: "h-12 px-8 text-base",
        xl: "h-[60px] px-8 text-lg",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

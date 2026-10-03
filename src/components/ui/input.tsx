import * as React from "react"
import { cn } from "@/lib/utils.ts"

// shadcn/ui Input (new-york) com os campos do Figma: fundo #140d0a, borda marrom, cantos de 2px.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[2px] border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none placeholder:text-faint disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:border-primary",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  )
}

/**
 * Campo que o autopreenchimento do navegador não deve tocar (ex.: endereço 0x da carteira).
 * O Chrome ignora autocomplete="off" em campos que parecem endereço postal ("Endereço…"),
 * mas não preenche campos readonly: o campo fica readonly até receber foco.
 */
function NoAutofillInput({ onFocus, onBlur, ...props }: React.ComponentProps<"input">) {
  const [editable, setEditable] = React.useState(false)
  return (
    <Input
      autoComplete="off"
      readOnly={!editable}
      onFocus={(event) => {
        setEditable(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setEditable(false)
        onBlur?.(event)
      }}
      {...props}
    />
  )
}

export { Input, NoAutofillInput }

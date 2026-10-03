import type { ReactNode } from "react"
import { Label } from "@/components/ui/label.tsx"
import { cn } from "@/lib/utils.ts"

/** Rótulo + controle + mensagem de erro associada (aria-describedby = `${id}-error`). */
export function Field({
  id,
  label,
  error,
  required,
  hideLabel,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  required?: boolean
  hideLabel?: boolean
  /** Texto de ajuda sob o campo (associado via aria-describedby = `${id}-hint`). */
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
        {label}
        {required ? (
          <span className="ml-0.5 text-required" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (obrigatório)</span> : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs leading-5 text-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Props de acessibilidade para um controle ligado a um Field. */
export function fieldA11y(id: string, error?: string, hint?: boolean) {
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ")
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const
}

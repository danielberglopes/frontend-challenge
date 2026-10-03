import { TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button.tsx"
import { ApiRequestError } from "@/lib/api/client.ts"
import { cn } from "@/lib/utils.ts"

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiRequestError ? error.message : fallback
}

export function ErrorBlock({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-4 border border-danger/40 bg-panel p-6", className)} role="alert">
      <p className="flex items-start gap-3 text-sm leading-6">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
        <span>{message}</span>
      </p>
      {onRetry ? (
        <Button type="button" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  )
}

export function EmptyState({ title, text, action, className }: { title: string; text: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("grid justify-items-center gap-3 border border-dashed border-line px-6 py-12 text-center", className)} role="status">
      <p className="text-lg font-bold">{title}</p>
      <p className="max-w-md text-sm leading-6 text-muted">{text}</p>
      {action}
    </div>
  )
}

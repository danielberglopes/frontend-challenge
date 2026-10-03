import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button.tsx"

export function NotFoundPage() {
  return (
    <section className="mx-auto grid max-w-[1200px] justify-items-start gap-4 px-6 py-24 md:px-6 lg:px-0">
      <p className="text-sm font-bold tracking-[0.2em] text-amber">ERRO 404</p>
      <h1 className="text-[28px] font-bold tracking-wide">Página não encontrada</h1>
      <p className="max-w-lg text-sm leading-6 text-muted">Este endereço não faz parte do marketplace. Confira o link ou volte para o catálogo.</p>
      <Button asChild className="mt-2">
        <Link to="/">Voltar ao início</Link>
      </Button>
    </section>
  )
}

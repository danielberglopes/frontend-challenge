import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/features/session.ts"
import { getCart } from "@/lib/api/http.ts"
import { queryKeys } from "@/lib/query.ts"
import { ensureGuestId } from "@/lib/utils.ts"

/** Dono do carrinho: usuário autenticado ou visitante (guest id persistido). */
export function useOwnerId() {
  const session = useSession()
  return session.data?.user?.id ?? `guest:${ensureGuestId()}`
}

export function useCart() {
  const ownerId = useOwnerId()
  const cart = useQuery({
    queryKey: queryKeys.cart(ownerId),
    queryFn: ({ signal }) => getCart(signal),
  })
  return { ownerId, cart, count: cart.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0 }
}

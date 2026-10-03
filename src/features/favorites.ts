import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { addFavorite, listFavorites, removeFavorite } from "@/lib/api/http.ts"
import { announce } from "@/lib/announce.ts"
import { ApiRequestError } from "@/lib/api/client.ts"
import { queryKeys } from "@/lib/query.ts"
import { useSession } from "@/features/session.ts"

export function useFavoriteToggle(nftId: string, name: string) {
  const session = useSession()
  const userId = session.data?.user?.id
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const redirect = useRouterState({ select: (state) => state.location.href })
  const favorites = useQuery({
    queryKey: queryKeys.favorites(userId ?? "anonymous"),
    queryFn: ({ signal }) => listFavorites(signal),
    enabled: Boolean(userId),
  })
  const active = favorites.data?.includes(nftId) ?? false
  const mutation = useMutation({
    mutationFn: (next: boolean) => (next ? addFavorite(nftId) : removeFavorite(nftId)),
    onMutate: async (next) => {
      if (!userId) return { previous: undefined }
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites(userId) })
      const previous = queryClient.getQueryData<string[]>(queryKeys.favorites(userId))
      queryClient.setQueryData<string[]>(queryKeys.favorites(userId), (current = []) =>
        next ? Array.from(new Set([...current, nftId])) : current.filter((id) => id !== nftId),
      )
      return { previous }
    },
    onError: (error, _next, context) => {
      if (userId) queryClient.setQueryData(queryKeys.favorites(userId), context?.previous ?? [])
      const message = error instanceof ApiRequestError ? error.message : "Não foi possível atualizar os favoritos."
      announce(message)
    },
    onSuccess: (_data, next) => announce(next ? `${name} adicionado aos favoritos.` : `${name} removido dos favoritos.`),
    onSettled: () => {
      if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.favorites(userId) })
    },
  })

  return {
    active,
    pending: mutation.isPending,
    toggle() {
      if (!userId) {
        void navigate({ to: "/login", search: { redirect } })
        return
      }
      mutation.mutate(!active)
    },
  }
}

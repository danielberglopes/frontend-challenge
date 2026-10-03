import { useQuery } from "@tanstack/react-query"
import { getSession } from "@/lib/api/http.ts"
import { queryKeys } from "@/lib/query.ts"

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => getSession(signal),
    retry: false,
    staleTime: 30_000,
  })
}

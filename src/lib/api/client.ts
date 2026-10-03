import axios, { type AxiosError } from "axios"
import type { ApiErrorBody } from "@/contracts/api.ts"
import { mocksReady } from "@/lib/mocks-ready.ts"
import { readTimeout } from "@/lib/timeout.ts"
import { ensureGuestId, readToken, writeToken } from "@/lib/utils.ts"

export class ApiRequestError extends Error {
  status: number
  code: string
  fields?: Record<string, string>

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export const http = axios.create({
  baseURL: "/",
  timeout: readTimeout(),
})

http.interceptors.request.use(async (config) => {
  await mocksReady
  config.timeout = readTimeout()
  const token = readToken()
  const guest = ensureGuestId()
  config.headers.set("X-Guest-Id", guest)
  if (token) config.headers.set("Authorization", `Bearer ${token}`)
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.includes("/api/auth/login")) {
      writeToken(null)
      sessionStorage.setItem("kurio:expired", "1")
      window.dispatchEvent(new CustomEvent("kurio:unauthorized"))
    }
    if (error.code === "ECONNABORTED") {
      throw new ApiRequestError(0, "TIMEOUT", "A resposta demorou além do limite. A operação pode ter sido registrada.")
    }
    if (!error.response) {
      throw new ApiRequestError(0, "NETWORK", "Sem conexão com a simulação. Tente novamente.")
    }
    const body = error.response.data
    throw new ApiRequestError(
      error.response.status,
      body?.code ?? "HTTP_ERROR",
      body?.message ?? "Não foi possível concluir a operação.",
      body?.fields,
    )
  },
)

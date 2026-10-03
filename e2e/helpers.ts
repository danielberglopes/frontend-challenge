import { expect, type Page, type TestInfo } from "@playwright/test"

export const ana = "ana.colecionadora@kurio.test"
export const bruno = "bruno.nomad@kurio.test"
export const password = "Kurio#2026"

export function isMobile(info: TestInfo) {
  return info.project.name === "mobile"
}

/**
 * Estado isolado: cada teste roda em um contexto novo (storage vazio).
 * O cenário MSW e o guest id são definidos antes do primeiro script da página.
 */
export async function prepare(page: Page, scenario = "default", options: { timeout?: number } = {}) {
  await page.addInitScript(
    ({ scenario, timeout }) => {
      if (sessionStorage.getItem("e2e:ready")) return
      sessionStorage.setItem("e2e:ready", "1")
      localStorage.setItem("kurio:scenario", scenario)
      localStorage.setItem("kurio:guest", "guest-e2e")
      if (timeout) localStorage.setItem("kurio:http-timeout", String(timeout))
    },
    { scenario, timeout: options.timeout },
  )
}

/** Troca o cenário MSW em tempo de execução (mesmo armazenamento lido pelos handlers). */
export async function setScenario(page: Page, scenario: string) {
  await page.evaluate((name) => localStorage.setItem("kurio:scenario", name), scenario)
}

export async function login(page: Page, email = ana, redirect?: string) {
  await page.goto(redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login")
  await page.getByLabel("E-mail", { exact: true }).fill(email)
  await page.getByLabel("Senha", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Entrar", exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export async function logout(page: Page) {
  await page.goto("/profile")
  await page.getByRole("button", { name: "Sair" }).click()
  await expect(page).toHaveURL("/")
}

export async function search(page: Page, info: TestInfo, text: string) {
  if (isMobile(info)) {
    await page.getByRole("searchbox", { name: "Explorar coleções" }).fill(text)
    return
  }
  await page.getByRole("button", { name: "Buscar NFTs" }).click()
  const dialog = page.getByRole("dialog", { name: "Buscar NFTs" })
  await dialog.getByRole("searchbox", { name: "Explorar coleções" }).fill(text)
  await dialog.getByRole("button", { name: "Buscar" }).click()
}

/** Abre o drawer de filtros no mobile; no desktop a barra lateral já está visível. */
export async function filters(page: Page, info: TestInfo) {
  if (isMobile(info)) {
    await page.getByRole("button", { name: /^Filtros/ }).first().click()
    return page.getByRole("dialog", { name: "Filtros" })
  }
  return page.getByRole("complementary", { name: "Filtros do catálogo" })
}

export async function closeFilters(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.getByRole("button", { name: /^Ver \d+ resultados/ }).click()
}

export function card(page: Page, name: string) {
  return page.getByRole("heading", { name, exact: true, level: 3 })
}

export async function devAction(page: Page, body: Record<string, unknown>) {
  return page.evaluate(async (payload) => {
    const response = await fetch("/api/dev/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    return response.json()
  }, body)
}

export async function orderCount(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/dev/orders")
    const data = (await response.json()) as { count: number; orders: { id: string; status: string }[] }
    return data
  })
}

/** Aguarda o socket.io-client conectar via @mswjs/socket.io-binding. */
export async function waitForSocket(page: Page) {
  await page.waitForFunction(() => Boolean(window.__kurioSocket?.connected))
}

export async function addToCart(page: Page, info: TestInfo, nftId: string) {
  await page.goto(`/nfts/${nftId}`)
  if (isMobile(info)) await page.getByRole("button", { name: "Adicionar ao carrinho" }).click()
  else {
    await page.getByRole("button", { name: "COMPRAR", exact: true }).click()
    await expect(page).toHaveURL(/\/cart/)
  }
}

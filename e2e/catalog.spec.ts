import { expect, test } from "@playwright/test"
import { card, closeFilters, filters, isMobile, prepare, search, setScenario } from "./helpers"

test.describe("catálogo e detalhe", () => {
  test("busca, filtros combinados, ordenação, paginação e restauração pelo histórico", async ({ page }, info) => {
    await prepare(page)
    await page.goto("/")
    await expect(card(page, "Emerald Ape #042")).toBeVisible()

    await search(page, info, "nomad")
    await expect(page).toHaveURL(/q=nomad/)
    await expect(card(page, "Sage Nomad #009")).toBeVisible()
    await expect(card(page, "Violet Nomad #314")).toBeVisible()
    await expect(card(page, "Emerald Ape #042")).toHaveCount(0)

    await page.goto("/")
    const panel = await filters(page, info)
    await panel.getByRole("checkbox", { name: /^Arte digital/ }).click()
    await expect(page).toHaveURL(/collections=Arte/)
    await panel.getByRole("checkbox", { name: /^Ethereum/ }).click()
    await expect(page).toHaveURL(/networks=ethereum/)
    await expect(panel.getByRole("checkbox", { name: /^Arte digital/ })).toHaveAttribute("aria-checked", "true")
    await closeFilters(page, info)
    await expect(card(page, "Mint Captain #064")).toBeVisible()
    await expect(card(page, "Dusk Wanderer #260")).toHaveCount(0) // Polygon: excluído pelo filtro de rede
    await expect(page.getByTestId("catalog-grid").locator("h3")).toHaveCount(3)

    // Ordenação e paginação compõem a URL; mudar filtro reinicia a página.
    await page.goto("/?sort=price-asc")
    if (!isMobile(info)) await expect(page.getByRole("combobox", { name: "Ordenar por" })).toHaveValue("price-asc")
    await expect(page.getByTestId("catalog-grid").locator("h3").first()).toHaveText("Ink Architect #099")
    await page.getByRole("navigation", { name: "Paginação do catálogo" }).getByRole("button", { name: "Página 2" }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole("button", { name: "Página 2" })).toHaveAttribute("aria-current", "page")
    await page.reload()
    await expect(page).toHaveURL(/page=2/)
    await expect(page).toHaveURL(/sort=price-asc/)
    await expect(page.getByRole("button", { name: "Página 2" })).toHaveAttribute("aria-current", "page")

    const panel2 = await filters(page, info)
    await panel2.getByRole("checkbox", { name: /^Música/ }).click()
    await expect(page).toHaveURL(/collections=M/)
    await expect(page).not.toHaveURL(/page=2/)
    await closeFilters(page, info)

    await page.goBack()
    await expect(page).toHaveURL(/page=2/)
    await expect(page).not.toHaveURL(/collections=/)
    await page.goForward()
    await expect(page).toHaveURL(/collections=M/)
  })

  test("acesso direto ao detalhe, NFT inexistente e rota desconhecida", async ({ page }) => {
    await prepare(page)
    await page.goto("/nfts/emerald-ape-042")
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 1 })).toBeVisible()
    await expect(page.getByText("ID do token:").filter({ visible: true }).first()).toBeVisible()
    await page.goto("/nfts/nao-existe")
    await expect(page.getByText("NFT não encontrado")).toBeVisible()
    await page.goto("/rota-inexistente")
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible()
  })

  test("edição esgotada e limite de quantidade", async ({ page }) => {
    await prepare(page)
    await page.goto("/nfts/emerald-ape-042")
    await expect(page.getByRole("button", { name: /^1\/1 \(esgotada\)/ })).toBeDisabled()
    await expect(page.getByRole("button", { name: /^1\/50/ })).toHaveAttribute("aria-pressed", "true")

    await page.goto("/nfts/brass-groove-007")
    await page.getByRole("button", { name: /^1\/1 \(1 disponíveis\)/ }).click()
    await expect(page.getByRole("button", { name: "Aumentar quantidade" })).toBeDisabled()
    await expect(page.getByText(/Limite atingido: 1 disponível/).filter({ visible: true })).toBeVisible()

    await page.goto("/nfts/marble-sprint-008")
    await expect(page.getByText("Esta edição está esgotada", { exact: false }).filter({ visible: true })).toBeVisible()
  })

  test("skeleton em carregamento lento, falha HTTP e recuperação após nova tentativa", async ({ page }) => {
    await page.clock.install()
    await prepare(page, "slow")
    await page.goto("/")
    await expect(page.getByTestId("catalog-skeleton")).toBeVisible()
    await expect(card(page, "Emerald Ape #042")).toBeVisible()
    await expect(page.getByTestId("catalog-skeleton")).toHaveCount(0)

    // Relógio pausado: o atraso de 1,6 s do cenário "slow" (setTimeout no MSW) só passa quando avançamos.
    await page.clock.pauseAt(Date.now() + 1000)
    await page.getByRole("link", { name: /^Sage Nomad #009/ }).first().click()
    await expect(page.getByTestId("detail-skeleton")).toBeVisible()
    await page.clock.runFor(1000)
    await expect(page.getByTestId("detail-skeleton")).toBeVisible()
    await page.clock.runFor(800)
    // Retoma o fluxo normal para os timers internos (notificações em lote do TanStack Query).
    await page.clock.resume()
    await expect(page.getByRole("heading", { name: "Sage Nomad #009", level: 1 })).toBeVisible()

    await setScenario(page, "http-500")
    await page.goto("/?tab=trending")
    await expect(page.getByRole("alert").filter({ hasText: "Falha transitória" })).toBeVisible()
    await setScenario(page, "default")
    await page.getByRole("button", { name: "Tentar novamente" }).click()
    await expect(page.getByRole("alert")).toHaveCount(0)
    await expect(page.getByTestId("catalog-grid").locator("h3").first()).toBeVisible()
  })

  test("resultado vazio e indisponibilidade de conexão", async ({ page }) => {
    await prepare(page, "empty")
    await page.goto("/")
    await expect(page.getByText("Nenhum NFT encontrado")).toBeVisible()
    await setScenario(page, "offline")
    await page.goto("/nfts/emerald-ape-042")
    await expect(page.getByRole("alert").filter({ hasText: "Sem conexão" })).toBeVisible()
  })

  test("respostas fora de ordem não sobrescrevem a consulta atual", async ({ page }, info) => {
    test.skip(isMobile(info), "Cenário de rede validado no desktop")
    await prepare(page, "variable-latency")
    await page.goto("/")
    // A listagem sem filtros (1400 ms) ainda está pendente quando o filtro (70 ms) é aplicado.
    const panel = await filters(page, info)
    await panel.getByRole("checkbox", { name: /^Fotografia/ }).click()
    await expect(card(page, "Cosmic Bloom #118")).toBeVisible()
    await page.waitForTimeout(1800)
    await expect(card(page, "Emerald Ape #042")).toHaveCount(0)
    await expect(page.getByTestId("catalog-grid").locator("h3")).toHaveCount(3)
  })
})

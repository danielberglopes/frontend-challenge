import { expect, test, type Page } from "@playwright/test"
import { ana, login, prepare } from "./helpers"

// Dados estáveis: cenário padrão resetado por contexto, relógio fixo e animações desligadas.
async function stable(page: Page) {
  await page.clock.setFixedTime(new Date("2026-07-29T12:00:00Z"))
  await prepare(page)
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.evaluate(async () => {
    await document.fonts.ready
    // Espera cada imagem visível carregar (load/error), com limite de 5 s para imagens ocultas.
    await Promise.all(
      [...document.images]
        .filter((image) => !image.complete && image.getClientRects().length > 0)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true })
              image.addEventListener("error", resolve, { once: true })
              setTimeout(resolve, 5000)
            }),
        ),
    )
  })
}

const options = { fullPage: true, maxDiffPixelRatio: 0.01, animations: "disabled" as const }

test.describe("regressão visual", () => {
  test("início", async ({ page }) => {
    await stable(page)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 3 })).toBeVisible()
    // Banners e diário entram depois do catálogo: espera tudo estar montado antes de capturar.
    await expect(page.getByRole("heading", { name: "Diário da Cunhagem" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Como proteger sua carteira" })).toBeVisible()
    await page.evaluate(() => document.querySelectorAll<HTMLImageElement>("img[loading=lazy]").forEach((image) => (image.loading = "eager")))
    await settle(page)
    await expect(page).toHaveScreenshot("inicio.png", options)
  })

  test("detalhe do NFT", async ({ page }, info) => {
    await stable(page)
    await page.goto("/nfts/emerald-ape-042")
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 1 })).toBeVisible()
    // "Mais desta coleção" só existe no desktop.
    if (info.project.name === "desktop") await expect(page.getByText("Mint Captain #064").filter({ visible: true }).first()).toBeVisible()
    await page.evaluate(() => document.querySelectorAll<HTMLImageElement>("img[loading=lazy]").forEach((image) => (image.loading = "eager")))
    await settle(page)
    await expect(page).toHaveScreenshot("detalhe.png", options)
  })

  test("carrinho", async ({ page }) => {
    await stable(page)
    await login(page, ana, "/cart")
    await expect(page.getByTestId("quote-summary")).toContainText("26.846 ETH")
    await page.evaluate(() => document.querySelectorAll<HTMLImageElement>("img[loading=lazy]").forEach((image) => (image.loading = "eager")))
    await settle(page)
    await expect(page).toHaveScreenshot("carrinho.png", options)
  })

  test("pagamento", async ({ page }) => {
    await stable(page)
    await login(page, ana, "/checkout")
    await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeEnabled()
    await expect(page.getByText("26.846 ETH").first()).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot("pagamento.png", options)
  })
})

import { expect, test } from "@playwright/test"
import { addToCart, ana, card, login, prepare, setScenario } from "./helpers"

test.describe("favoritos e carrinho", () => {
  test("favorito otimista com falha, rollback e recuperação persistida", async ({ page }) => {
    await prepare(page)
    await page.goto("/nfts/sage-nomad-009")
    await page.getByRole("button", { name: "Favoritar Sage Nomad #009" }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fnfts%2Fsage-nomad-009/)

    await login(page, ana, "/nfts/sage-nomad-009")
    const add = page.getByRole("button", { name: "Favoritar Sage Nomad #009" })
    await expect(add).toHaveAttribute("aria-pressed", "false")

    await setScenario(page, "favorite-fail")
    await add.click()
    // Rollback: a mutation falha e o estado volta ao anterior.
    await expect(page.getByRole("button", { name: "Favoritar Sage Nomad #009" })).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByText("Não foi possível salvar o favorito.")).toBeAttached()

    await setScenario(page, "default")
    await page.getByRole("button", { name: "Favoritar Sage Nomad #009" }).click()
    const remove = page.getByRole("button", { name: "Remover Sage Nomad #009 dos favoritos" })
    await expect(remove).toHaveAttribute("aria-pressed", "true")
    await page.reload()
    await expect(page.getByRole("button", { name: "Remover Sage Nomad #009 dos favoritos" })).toBeVisible()
    await page.goto("/favorites")
    await expect(card(page, "Sage Nomad #009")).toBeVisible()
  })

  test("carrinho: quantidades, remoção, cupom e persistência após refresh e login", async ({ page }, info) => {
    await prepare(page)
    await addToCart(page, info, "emerald-ape-042")
    await page.goto("/cart")
    await expect(page.getByRole("link", { name: "Emerald Ape #042", exact: true }).filter({ visible: true })).toBeVisible()

    await page.getByRole("button", { name: "Aumentar Emerald Ape #042" }).click()
    await expect(page.getByText("2.38 ETH").filter({ visible: true }).first()).toBeVisible()
    const summary = page.getByTestId("quote-summary")
    await expect(summary).toContainText("2.38 ETH")
    await expect(summary).toContainText("2.396 ETH")

    const coupon = page.getByLabel("Código promocional").first()
    await coupon.fill("INVALIDO")
    await page.getByRole("button", { name: "Aplicar" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Cupom inválido." })).toBeVisible()
    await coupon.fill("EXPIRADO")
    await page.getByRole("button", { name: "Aplicar" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Este cupom expirou." })).toBeVisible()
    await coupon.fill("kurio10")
    await page.getByRole("button", { name: "Aplicar" }).click()
    await expect(page.getByRole("status").filter({ hasText: "Cupom KURIO10 aplicado" })).toBeVisible()
    await expect(summary).toContainText("(-) 0.238 ETH")
    await expect(summary).toContainText("2.158 ETH")

    await page.reload()
    await expect(page.getByRole("status").filter({ hasText: "Cupom KURIO10 aplicado" })).toBeVisible()
    await expect(page.getByRole("group", { name: "Quantidade de Emerald Ape #042" }).filter({ visible: true })).toContainText("2")
    await page.getByRole("button", { name: "Remover cupom" }).click()
    await expect(summary).toContainText("(-) 00.00")

    await page.getByRole("button", { name: "Diminuir Emerald Ape #042" }).click()
    await expect(summary).toContainText("1.206 ETH")
    await page.getByRole("button", { name: "Remover Emerald Ape #042 do carrinho" }).click()
    await expect(page.getByText("Seu carrinho está vazio")).toBeVisible()

    // Itens do visitante são preservados ao autenticar (mesclados ao carrinho da conta).
    await addToCart(page, info, "golden-signal-160")
    await login(page, ana, "/cart")
    await expect(page.getByRole("link", { name: "Golden Signal #160", exact: true }).filter({ visible: true })).toBeVisible()
    await expect(page.getByRole("link", { name: "Ivory Baron #088", exact: true }).filter({ visible: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole("link", { name: "Golden Signal #160", exact: true }).filter({ visible: true })).toBeVisible()
  })
})

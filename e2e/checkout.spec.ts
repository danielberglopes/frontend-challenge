import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { ana, devAction, isMobile, login, orderCount, prepare, setScenario, waitForSocket } from "./helpers"

async function openReview(page: Page) {
  await page.getByRole("button", { name: "Confirmar compra" }).click()
  const connect = page.getByRole("dialog", { name: /^Conectar/ })
  if (await connect.isVisible().catch(() => false)) await connect.getByRole("button", { name: "Aprovar conexão" }).click()
  const review = page.getByRole("dialog", { name: "Revisar pedido" })
  await expect(review).toBeVisible()
  return review
}

async function submitReview(page: Page) {
  const review = page.getByRole("dialog", { name: "Revisar pedido" })
  await review.getByRole("checkbox", { name: /Confirmo os valores/ }).check()
  await review.getByRole("button", { name: "Confirmar e enviar pedido" }).click()
}

async function goToCheckout(page: Page) {
  await page.goto("/cart")
  await page.getByRole("button", { name: "Conectar e finalizar" }).click()
  await expect(page).toHaveURL("/checkout")
  await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeEnabled()
}

const receiptHeading = (page: Page) => page.getByRole("heading", { name: "Seus NFTs agora estão na sua carteira" })

test.describe("compra, pagamento e tempo real", () => {
  test("compra completa do catálogo ao recibo confirmado", async ({ page }, info: TestInfo) => {
    await prepare(page)
    await login(page, ana)
    await page.goto("/")
    await page.getByRole("link", { name: /^Golden Signal #160/ }).first().click()
    await expect(page.getByRole("heading", { name: "Golden Signal #160", level: 1 })).toBeVisible()
    await page.getByRole("button", { name: isMobile(info) ? "Comprar NFT" : "COMPRAR", exact: true }).click()
    await expect(page).toHaveURL("/cart")
    await expect(page.getByTestId("quote-summary")).toContainText("27.236 ETH")

    await page.getByRole("button", { name: "Conectar e finalizar" }).click()
    await expect(page).toHaveURL("/checkout")
    await openReview(page)
    await submitReview(page)

    await expect(receiptHeading(page)).toBeVisible()
    await expect(page.getByText("Golden Signal #160")).toBeVisible()
    await expect(page.getByText("27.236 ETH").first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Ver no Etherscan/ })).toBeVisible()
    const orderUrl = page.url()

    // O recibo é um snapshot: alterações posteriores no catálogo não mudam seus valores.
    await devAction(page, { type: "set-price", nftId: "golden-signal-160", price: "9.99" })
    await page.reload()
    await expect(receiptHeading(page)).toBeVisible()
    await expect(page.getByText("0.39 ETH")).toBeVisible()
    await expect(page.getByText("9.99 ETH")).toHaveCount(0)

    // Somente as quantidades compradas saem do carrinho.
    await page.goto("/cart")
    await expect(page.getByText("Seu carrinho está vazio")).toBeVisible()
    expect((await orderCount(page)).count).toBe(1)
    await page.goto(orderUrl)
    await page.getByRole("link", { name: /Ver no Etherscan/ }).click()
    await expect(page.getByRole("heading", { name: "Explorador simulado" })).toBeVisible()
  })

  test("relógio controlado: pedido fica pendente até a simulação confirmar", async ({ page }) => {
    // O MSW confirma o pedido 450 ms após a criação (setTimeout na página). Com o relógio
    // pausado, o estado pendente é observável de forma determinística.
    await page.clock.install()
    await prepare(page)
    await login(page, ana)
    await goToCheckout(page)
    await waitForSocket(page)
    await openReview(page)
    await page.clock.pauseAt(Date.now() + 1000)
    await submitReview(page)
    await expect(page.getByRole("heading", { name: "Pedido pendente" })).toBeVisible()
    await expect(receiptHeading(page)).toHaveCount(0)
    expect((await orderCount(page)).orders[0].status).toBe("pending")

    await page.clock.runFor(500)
    await expect(receiptHeading(page)).toBeVisible()
    expect((await orderCount(page)).orders[0].status).toBe("confirmed")
  })

  test("pagamento recusado preserva os itens e não exibe confirmação", async ({ page }) => {
    await prepare(page, "payment-declined")
    await login(page, ana)
    await goToCheckout(page)
    await openReview(page)
    await submitReview(page)
    await expect(page.getByRole("heading", { name: "Pagamento recusado" })).toBeVisible()
    await expect(receiptHeading(page)).toHaveCount(0)
    await page.getByRole("link", { name: "Revisar carrinho" }).click()
    await expect(page.getByRole("link", { name: "Ivory Baron #088" }).filter({ visible: true })).toBeVisible()
  })

  test("recusa de conexão da carteira exige nova tentativa", async ({ page }) => {
    await prepare(page)
    await login(page, ana)
    await goToCheckout(page)
    await page.getByRole("button", { name: "Confirmar compra" }).click()
    await page.getByRole("dialog", { name: /^Conectar/ }).getByRole("button", { name: "Recusar" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "conexão com a carteira foi recusada" })).toBeVisible()
    await expect(page.getByText("recusada", { exact: true })).toBeVisible()
    const review = await openReview(page)
    await expect(review).toBeVisible()
    expect((await orderCount(page)).count).toBe(0)
  })

  test("clique repetido não duplica o pedido", async ({ page }) => {
    await prepare(page)
    await login(page, ana)
    await goToCheckout(page)
    const review = await openReview(page)
    await review.getByRole("checkbox", { name: /Confirmo os valores/ }).check()
    await review.getByRole("button", { name: "Confirmar e enviar pedido" }).dblclick({ force: true })
    await expect(receiptHeading(page)).toBeVisible()
    expect((await orderCount(page)).count).toBe(1)
  })

  test("timeout após criação recupera o mesmo pedido pela chave de idempotência", async ({ page }) => {
    // Relógio da página congelado: a resposta do POST /api/orders (atrasada 15 s no MSW) nunca chega,
    // o Axios estoura o timeout de 1,5 s e o app recupera o pedido por GET /api/orders/by-key/:key.
    await page.clock.install()
    await prepare(page, "order-timeout", { timeout: 1500 })
    await login(page, ana)
    await goToCheckout(page)
    await openReview(page)
    await page.clock.pauseAt(Date.now() + 1000)
    await submitReview(page)
    await expect(page.getByRole("heading", { name: "Pedido pendente" })).toBeVisible()
    let orders = await orderCount(page)
    expect(orders.count).toBe(1)
    const recovered = orders.orders[0].id
    await expect(page).toHaveURL(`/orders/${recovered}`)

    await page.clock.runFor(500)
    await expect(receiptHeading(page)).toBeVisible()
    orders = await orderCount(page)
    expect(orders.count).toBe(1)
    expect(orders.orders[0]).toMatchObject({ id: recovered, status: "confirmed" })
  })

  test("alteração de preço via Socket.IO durante o checkout exige nova confirmação", async ({ page }) => {
    await prepare(page)
    await login(page, ana)
    await goToCheckout(page)
    await waitForSocket(page)
    const review = await openReview(page)
    await review.getByRole("checkbox", { name: /Confirmo os valores/ }).check()
    await expect(review.getByRole("button", { name: "Confirmar e enviar pedido" })).toBeEnabled()

    await devAction(page, { type: "set-price", nftId: "emerald-ape-042", price: "1.49" })
    await expect(review.getByRole("alert").filter({ hasText: "Os valores mudaram" })).toBeVisible()
    await expect(review.getByRole("checkbox", { name: /Confirmo os valores/ })).not.toBeChecked()
    await expect(review.getByRole("button", { name: "Confirmar e enviar pedido" })).toBeDisabled()
    await expect(review.getByTestId("quote-summary")).toContainText("27.446 ETH")

    await submitReview(page)
    await expect(receiptHeading(page)).toBeVisible()
    await expect(page.getByText("2.98 ETH")).toBeVisible()
    await expect(page.getByText("27.446 ETH").first()).toBeVisible()
  })

  test("carrinho aberto reflete preço e disponibilidade recebidos em tempo real", async ({ page }) => {
    await prepare(page)
    await login(page, ana, "/cart")
    // O aviso compara com o que já estava na tela: espera o carrinho carregar antes do evento.
    await expect(page.getByTestId("quote-summary")).toContainText("26.846 ETH")
    await waitForSocket(page)
    await devAction(page, { type: "set-price", nftId: "ivory-baron-088", price: "1.89" })
    const notice = page.getByRole("status").filter({ hasText: "O carrinho foi atualizado" })
    await expect(notice).toContainText("Ivory Baron #088: preço alterado de 1.79 para 1.89 ETH")
    await expect(page.getByTestId("quote-summary")).toContainText("27.746 ETH")

    await devAction(page, { type: "sell-out", nftId: "violet-nomad-314", editionId: "violet-nomad-314-e3" })
    await expect(notice).toContainText("Violet Nomad #314: edição esgotada")
    await expect(page.getByRole("alert").filter({ hasText: "Ajuste os itens indisponíveis" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Conectar e finalizar" })).toBeDisabled()
  })

  test("eventos duplicados ou antigos não regridem o estado", async ({ page }) => {
    await prepare(page)
    await page.goto("/nfts/emerald-ape-042")
    await waitForSocket(page)
    const price = page.getByText(/^\d+\.\d+ ETH$/).filter({ visible: true }).first()
    await expect(price).toHaveText("1.19 ETH")

    await devAction(page, { type: "set-price", nftId: "emerald-ape-042", price: "1.49" }) // versão 2
    await expect(price).toHaveText("1.49 ETH")
    await devAction(page, { type: "emit-nft", nftId: "emerald-ape-042", price: "0.10", version: 1 }) // antigo
    await devAction(page, { type: "emit-nft", nftId: "emerald-ape-042", price: "2.00", version: 5, eventId: "evt-dup" })
    await expect(price).toHaveText("2.00 ETH")
    await devAction(page, { type: "emit-nft", nftId: "emerald-ape-042", price: "3.00", version: 6, eventId: "evt-dup" }) // duplicado
    await page.waitForTimeout(600)
    await expect(price).toHaveText("2.00 ETH")
  })

  test("desconexão com pedido pendente: retomada sem nova compra e estado terminal", async ({ page }) => {
    await prepare(page, "payment-hold")
    await login(page, ana)
    await goToCheckout(page)
    await openReview(page)
    await submitReview(page)
    await expect(page.getByRole("heading", { name: "Pedido pendente" })).toBeVisible()
    const orderId = page.url().split("/orders/")[1]
    expect((await orderCount(page)).count).toBe(1)

    await devAction(page, { type: "drop-sockets" })
    await page.reload()
    await expect(page.getByRole("heading", { name: "Pedido pendente" })).toBeVisible()

    await page.goto("/checkout")
    await expect(page.getByText("Você tem um pedido pendente")).toBeVisible()
    await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeDisabled()
    await page.getByRole("link", { name: "Acompanhar pedido" }).click()
    await expect(page).toHaveURL(`/orders/${orderId}`)
    await waitForSocket(page)

    await devAction(page, { type: "confirm-order", orderId })
    await expect(receiptHeading(page)).toBeVisible()
    await devAction(page, { type: "decline-order", orderId })
    await page.reload()
    await expect(receiptHeading(page)).toBeVisible()
    expect((await orderCount(page)).count).toBe(1)
  })

  test("expiração de sessão no checkout preserva o contexto para retomada", async ({ page }) => {
    await prepare(page)
    await login(page, ana)
    await goToCheckout(page)
    await setScenario(page, "session-expired")
    await page.getByRole("button", { name: "Confirmar compra" }).click()
    await page.getByRole("dialog", { name: /^Conectar/ }).getByRole("button", { name: "Aprovar conexão" }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout&expired=1/)
    await expect(page.getByText("Sua sessão expirou")).toBeVisible()

    await setScenario(page, "default")
    await page.getByLabel("E-mail", { exact: true }).fill(ana)
    await page.getByLabel("Senha", { exact: true }).fill("Kurio#2026")
    await page.getByRole("button", { name: "Entrar", exact: true }).click()
    await expect(page).toHaveURL("/checkout")
    // Carrinho e cotação preservados após a nova autenticação.
    await expect(page.getByText("26.846 ETH").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Confirmar compra" })).toBeEnabled()
  })
})

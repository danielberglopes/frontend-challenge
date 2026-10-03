import { expect, test } from "@playwright/test"
import { ana, isMobile, login, prepare } from "./helpers"

test.describe("acessibilidade e teclado", () => {
  test.beforeEach(async ({ page }, info) => {
    test.skip(isMobile(info), "Navegação por teclado validada no desktop")
    await prepare(page)
  })

  test("skip link, foco visível e navegação até o detalhe pelo teclado", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Emerald Ape #042", level: 3 })).toBeVisible()
    await page.keyboard.press("Tab")
    const skip = page.getByRole("link", { name: "Ir para o conteúdo" })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press("Enter")
    await expect(page.locator("main#conteudo")).toBeFocused()

    const link = page.getByRole("link", { name: /^Emerald Ape #042, 1\.19 ETH/ })
    await link.focus()
    const outline = await link.evaluate((element) => getComputedStyle(element).outlineStyle)
    expect(outline).not.toBe("none")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL("/nfts/emerald-ape-042")

    // Abas do detalhe operam com setas.
    await page.getByRole("tab", { name: "Detalhes do NFT" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: /Avaliações de colecionadores/ })).toBeFocused()
    await expect(page.getByRole("tabpanel")).toContainText("Nota média")
  })

  test("diálogos prendem e devolvem o foco", async ({ page }) => {
    await page.goto("/")
    const trigger = page.getByRole("button", { name: "Buscar NFTs" })
    await trigger.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Buscar NFTs" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("searchbox", { name: "Explorar coleções" })).toBeFocused()
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press("Tab")
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await page.getByRole("button", { name: "Criadores" }).click()
    const scope = page.getByRole("dialog", { name: "Fora desta entrega" })
    await expect(scope).toContainText("Nenhuma ação foi executada")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("button", { name: "Criadores" })).toBeFocused()
  })

  test("validação de formulários com mensagens associadas aos campos", async ({ page }) => {
    await page.goto("/login")
    await page.getByRole("button", { name: "Entrar", exact: true }).click()
    const email = page.getByLabel("E-mail", { exact: true })
    await expect(email).toHaveAttribute("aria-invalid", "true")
    const describedBy = await email.getAttribute("aria-describedby")
    await expect(page.locator(`[id="${describedBy}"]`)).toHaveText("Informe um e-mail válido.")

    await login(page, ana)
    await page.goto("/checkout")
    await page.getByLabel("E-mail").fill("invalido")
    await page.getByRole("button", { name: "Confirmar compra" }).click()
    const field = page.getByLabel("E-mail")
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute("aria-describedby", "co-email-error")
    await expect(page.locator("#co-email-error")).toHaveText("Informe um e-mail válido.")
  })
})

// Zoom do navegador = viewport CSS menor: 200% em 1280 px ≈ 640 px; 400% ≈ 320 px (WCAG 1.4.10, reflow).
test.describe("zoom e reflow sem perda de conteúdo", () => {
  const routes = [
    { path: "/", ready: "Emerald Ape #042" },
    { path: "/nfts/emerald-ape-042", ready: "Emerald Ape #042" },
    { path: "/cart", ready: "Ivory Baron #088", private: true },
    { path: "/checkout", ready: "26.846 ETH", private: true },
    { path: "/profile", ready: "Perfil do colecionador", private: true },
    { path: "/wallets", ready: "Carteira principal", private: true },
    { path: "/login", ready: "Entrar" },
    { path: "/register", ready: "Criar" },
  ]

  for (const zoom of [{ label: "200%", width: 640 }, { label: "400%", width: 320 }]) {
    test(`telas a ${zoom.label} (${zoom.width}px) sem overflow horizontal`, async ({ page }, info) => {
      test.skip(isMobile(info), "Reflow validado uma vez, no projeto desktop")
      await prepare(page)
      await page.setViewportSize({ width: zoom.width, height: 800 })
      await login(page, ana)
      for (const route of routes) {
        await page.goto(route.path)
        await expect(page.getByText(route.ready).filter({ visible: true }).first()).toBeVisible()
        const problems = await page.evaluate(() => {
          const width = document.documentElement.clientWidth
          const issues: string[] = []
          if (document.documentElement.scrollWidth > width + 1) issues.push(`documento ${document.documentElement.scrollWidth}px > ${width}px`)
          for (const element of document.querySelectorAll<HTMLElement>("main *")) {
            const rect = element.getBoundingClientRect()
            if (rect.width === 0 || rect.right <= width + 1) continue
            let scroller = false
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              if (["auto", "scroll"].includes(getComputedStyle(parent).overflowX)) scroller = true
            }
            if (!scroller) issues.push(`${element.tagName.toLowerCase()} termina em ${Math.round(rect.right)}px`)
          }
          return issues.slice(0, 5)
        })
        expect(problems, `${route.path} a ${zoom.label}`).toEqual([])
      }
    })
  }
})

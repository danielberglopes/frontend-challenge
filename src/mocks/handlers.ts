import type { CreateOrderBody, Network, Nft, ProfileInput, SortKey, WalletInput } from "@/contracts/api.ts"
import { collections, networks, pageSize, walletTypes } from "@/contracts/api.ts"
import { cmpEth } from "@/lib/eth.ts"
import { delay, http, HttpResponse } from "msw"
import {
  broadcast,
  dropSockets,
  nftEvent,
  orderEvent,
  socketHandlers,
} from "@/mocks/realtime.ts"
import {
  buildQuote,
  canonicalOrderBody,
  cartFor,
  findUserByToken,
  hashPassword,
  loadDb,
  mergeGuestCart,
  presentCart,
  publicUser,
  quoteChanged,
  readScenario,
  resetDb,
  saveDb,
  toPublicOrder,
  withinPrice,
  writeScenario,
  type Database,
  type StoredOrder,
  type StoredUser,
} from "@/mocks/store.ts"

const resolvers = new Map<string, number>()

function fail(status: number, code: string, message: string, fields?: Record<string, string>) {
  return HttpResponse.json({ code, message, fields }, { status })
}

function tokenOf(request: Request) {
  const header = request.headers.get("Authorization") ?? ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

function userOf(db: Database, request: Request) {
  return findUserByToken(db, tokenOf(request))
}

function ownerOf(user: StoredUser | null, request: Request) {
  if (user) return user.id
  const guest = request.headers.get("X-Guest-Id")
  return `guest:${guest || "anonymous"}`
}

async function gate(kind: "catalog" | "detail" | "quote" | "cart" | "write", request?: Request) {
  const scenario = readScenario()
  if (scenario === "offline") return HttpResponse.error()
  if (scenario === "http-500" && (kind === "catalog" || kind === "detail")) {
    return fail(500, "TRANSIENT", "Falha transitória ao consultar o catálogo. Tente novamente.")
  }
  if (scenario === "slow" && (kind === "catalog" || kind === "detail" || kind === "quote" || kind === "cart")) {
    await delay(1600)
  }
  if (scenario === "variable-latency" && kind === "catalog") {
    // Determinístico: listagem sem filtros é lenta (1400 ms) e com filtros é rápida (70 ms),
    // de modo que a resposta antiga chega depois da nova (respostas fora de ordem).
    const params = new URL(request?.url ?? "http://x").searchParams
    const filtered = ["q", "collections", "networks", "min", "max"].some((key) => params.get(key))
    await delay(filtered ? 70 : 1400)
  }
  return null
}

function listParam(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function sortNfts(items: Nft[], sort: SortKey) {
  const copy = [...items]
  if (sort === "price-asc") copy.sort((a, b) => cmpEth(a.price, b.price))
  else if (sort === "price-desc") copy.sort((a, b) => cmpEth(b.price, a.price))
  else if (sort === "trending") copy.sort((a, b) => b.trendScore - a.trendScore || b.createdAt.localeCompare(a.createdAt))
  else copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return copy
}

function facets(items: Nft[]) {
  const prices = items.map((item) => item.price).sort(cmpEth)
  return {
    priceRange: { min: prices[0] ?? "0.00", max: prices[prices.length - 1] ?? "0.00" },
    collections: collections.map((name) => ({
      name,
      count: items.filter((item) => item.collection === name).length,
    })),
    networks: networks.map((name) => ({
      name,
      count: items.filter((item) => item.network === name).length,
    })),
  }
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isEns(value: string) {
  return /^[a-z0-9][a-z0-9.-]{1,30}$/.test(value.trim().replace(/\.eth$/, ""))
}

function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

function fieldErrors(fields: Record<string, string | null>) {
  const entries = Object.entries(fields).filter((entry): entry is [string, string] => Boolean(entry[1]))
  if (entries.length === 0) return null
  return Object.fromEntries(entries)
}

async function readJson<T>(request: Request) {
  return (await request.json()) as T
}

function confirmOrder(db: Database, order: StoredOrder) {
  if (order.status !== "pending") return
  order.status = "confirmed"
  order.version += 1
  order.updatedAt = new Date().toISOString()
  order.declineReason = null
  const hash = Array.from(order.id).reduce((sum, char) => sum + char.charCodeAt(0), 0).toString(16).padStart(8, "0")
  order.txHash = `0x${(hash + order.id.replace(/-/g, "")).padEnd(64, "a").slice(0, 64)}`
  order.explorerPath = `/explorar/${order.txHash}`
  const cart = db.carts.find((item) => item.ownerId === order.userId)
  for (const line of order.snapshot.items) {
    const nft = db.nfts.find((item) => item.id === line.nftId)
    const edition = nft?.editions.find((item) => item.id === line.editionId)
    if (edition) {
      edition.remaining = Math.max(0, edition.remaining - line.quantity)
      edition.status = edition.remaining > 0 ? "open" : "soldout"
    }
    if (nft) nft.version += 1
    if (cart) {
      const cartLine = cart.items.find((item) => item.nftId === line.nftId && item.editionId === line.editionId)
      if (cartLine) {
        cartLine.quantity -= line.quantity
        if (cartLine.quantity <= 0) cart.items = cart.items.filter((item) => item.id !== cartLine.id)
      }
    }
  }
}

function declineOrder(order: StoredOrder) {
  if (order.status !== "pending") return
  order.status = "declined"
  order.version += 1
  order.updatedAt = new Date().toISOString()
  order.declineReason = "A carteira simulada recusou a transação."
}

function emitOrder(order: StoredOrder) {
  broadcast(orderEvent(toPublicOrder(order), order.userId))
}

function emitNft(db: Database, nftId: string) {
  const nft = db.nfts.find((item) => item.id === nftId)
  if (!nft) return
  broadcast(nftEvent({ id: nft.id, price: nft.price, version: nft.version, editions: nft.editions }))
}

function scheduleResolution(orderId: string, mode: "confirm" | "decline" | "hold") {
  if (mode === "hold") return
  const timer = window.setTimeout(() => {
    resolvers.delete(orderId)
    const db = loadDb()
    const order = db.orders.find((item) => item.id === orderId)
    if (!order || order.status !== "pending") return
    if (mode === "confirm") {
      confirmOrder(db, order)
      saveDb(db)
      emitOrder(order)
      for (const line of order.snapshot.items) emitNft(db, line.nftId)
      return
    }
    declineOrder(order)
    saveDb(db)
    emitOrder(order)
  }, 450)
  resolvers.set(orderId, timer)
}

function resolutionMode() {
  const scenario = readScenario()
  if (scenario === "payment-declined") return "decline" as const
  if (scenario === "payment-hold") return "hold" as const
  return "confirm" as const
}

export const handlers = [
  ...socketHandlers(),
  http.post("/api/dev/reset", () => {
    for (const timer of resolvers.values()) window.clearTimeout(timer)
    resolvers.clear()
    writeScenario("default")
    const db = resetDb()
    return HttpResponse.json({ ok: true, nfts: db.nfts.length })
  }),
  http.post("/api/dev/scenario", async ({ request }) => {
    const body = await readJson<{ scenario?: string }>(request)
    writeScenario(body.scenario || "default")
    return HttpResponse.json({ scenario: readScenario() })
  }),
  http.get("/api/dev/orders", () => {
    const db = loadDb()
    return HttpResponse.json({
      count: db.orders.length,
      orders: db.orders.map((order) => ({ id: order.id, status: order.status, key: order.idempotencyKey })),
    })
  }),
  http.post("/api/dev/actions", async ({ request }) => {
    const body = await readJson<{
      type: string
      nftId?: string
      price?: string
      editionId?: string
      version?: number
      eventId?: string
      orderId?: string
    }>(request)
    const db = loadDb()
    if (body.type === "drop-sockets") {
      dropSockets()
      return HttpResponse.json({ ok: true })
    }
    if (body.type === "expire-session") {
      writeScenario("session-expired")
      return HttpResponse.json({ ok: true })
    }
    if (body.type === "set-price" && body.nftId && body.price) {
      const nft = db.nfts.find((item) => item.id === body.nftId)
      if (!nft) return fail(404, "NFT_NOT_FOUND", "NFT não encontrado.")
      nft.price = body.price
      nft.version += 1
      saveDb(db)
      emitNft(db, nft.id)
      return HttpResponse.json({ ok: true, version: nft.version, price: nft.price })
    }
    if (body.type === "sell-out" && body.nftId) {
      const nft = db.nfts.find((item) => item.id === body.nftId)
      if (!nft) return fail(404, "NFT_NOT_FOUND", "NFT não encontrado.")
      const edition = body.editionId ? nft.editions.find((item) => item.id === body.editionId) : nft.editions[0]
      if (!edition) return fail(404, "EDITION_NOT_FOUND", "Edição não encontrada.")
      edition.remaining = 0
      edition.status = "soldout"
      nft.version += 1
      saveDb(db)
      emitNft(db, nft.id)
      return HttpResponse.json({ ok: true, version: nft.version })
    }
    if (body.type === "emit-nft" && body.nftId && body.price && body.version) {
      const nft = db.nfts.find((item) => item.id === body.nftId)
      if (!nft) return fail(404, "NFT_NOT_FOUND", "NFT não encontrado.")
      broadcast(
        nftEvent(
          { id: nft.id, price: body.price, version: body.version, editions: nft.editions },
          body.eventId,
        ),
      )
      return HttpResponse.json({ ok: true })
    }
    if ((body.type === "confirm-order" || body.type === "decline-order") && body.orderId) {
      const order = db.orders.find((item) => item.id === body.orderId)
      if (!order) return fail(404, "ORDER_NOT_FOUND", "Pedido não encontrado.")
      if (body.type === "confirm-order") {
        confirmOrder(db, order)
        saveDb(db)
        emitOrder(order)
        for (const line of order.snapshot.items) emitNft(db, line.nftId)
      } else {
        declineOrder(order)
        saveDb(db)
        emitOrder(order)
      }
      return HttpResponse.json(toPublicOrder(order))
    }
    return fail(422, "VALIDATION", "Ação de simulação desconhecida.")
  }),

  http.post("/api/auth/register", async ({ request }) => {
    const blocked = await gate("write")
    if (blocked) return blocked
    if (readScenario() === "register-conflict") {
      return fail(409, "EMAIL_TAKEN", "Já existe uma conta com este e-mail.")
    }
    const body = await readJson<{ name?: string; email?: string; password?: string }>(request)
    const name = body.name?.trim() ?? ""
    const email = body.email?.trim().toLowerCase() ?? ""
    const password = body.password ?? ""
    const fields = fieldErrors({
      name: name.length < 2 ? "Informe o nome do colecionador." : null,
      email: isEmail(email) ? null : "Informe um e-mail válido.",
      password: password.length < 8 ? "A senha precisa ter ao menos 8 caracteres." : null,
    })
    if (fields) return fail(422, "VALIDATION", "Revise os campos do cadastro.", fields)
    const db = loadDb()
    if (db.users.some((user) => user.email === email)) {
      return fail(409, "EMAIL_TAKEN", "Já existe uma conta com este e-mail.", { email: "Este e-mail já está em uso." })
    }
    const username = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.]+/g, ".")
    const user: StoredUser = {
      id: crypto.randomUUID(),
      name,
      username,
      email,
      ensName: username.replace(/\./g, "-"),
      walletNickname: "",
      passwordHash: await hashPassword(password),
      avatarDataUrl: null,
    }
    db.users.push(user)
    const token = crypto.randomUUID()
    db.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 8 })
    mergeGuestCart(db, user.id, request.headers.get("X-Guest-Id"))
    saveDb(db)
    return HttpResponse.json({ token, user: publicUser(user) }, { status: 201 })
  }),

  http.post("/api/auth/login", async ({ request }) => {
    const blocked = await gate("write")
    if (blocked) return blocked
    const body = await readJson<{ email?: string; password?: string }>(request)
    const email = body.email?.trim().toLowerCase() ?? ""
    const password = body.password ?? ""
    const fields = fieldErrors({
      email: isEmail(email) ? null : "Informe um e-mail válido.",
      password: password ? null : "Informe a senha.",
    })
    if (fields) return fail(422, "VALIDATION", "Revise o acesso.", fields)
    const db = loadDb()
    const user = db.users.find((item) => item.email === email)
    const hash = await hashPassword(password)
    if (!user || user.passwordHash !== hash) {
      return fail(401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos.")
    }
    const token = crypto.randomUUID()
    db.sessions.push({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 8 })
    mergeGuestCart(db, user.id, request.headers.get("X-Guest-Id"))
    saveDb(db)
    return HttpResponse.json({ token, user: publicUser(user) })
  }),

  http.get("/api/auth/session", ({ request }) => {
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Sessão inválida ou expirada.")
    return HttpResponse.json({ user: publicUser(user) })
  }),

  http.post("/api/auth/logout", ({ request }) => {
    const db = loadDb()
    const token = tokenOf(request)
    db.sessions = db.sessions.filter((session) => session.token !== token)
    saveDb(db)
    return HttpResponse.json({ ok: true })
  }),

  http.get("/api/nfts", async ({ request }) => {
    const blocked = await gate("catalog", request)
    if (blocked) return blocked
    const url = new URL(request.url)
    if (readScenario() === "empty") {
      const db = loadDb()
      return HttpResponse.json({
        items: [],
        page: 1,
        pageSize,
        total: 0,
        totalPages: 0,
        facets: facets(db.nfts),
      })
    }
    const db = loadDb()
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase()
    const selectedCollections = listParam(url.searchParams.get("collections"))
    const selectedNetworks = listParam(url.searchParams.get("networks"))
    const min = url.searchParams.get("min") ?? undefined
    const max = url.searchParams.get("max") ?? undefined
    const tab = url.searchParams.get("tab") ?? "all"
    const sort = (url.searchParams.get("sort") ?? "recent") as SortKey
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)
    const filtered = db.nfts.filter((nft) => {
      const haystack = `${nft.name} ${nft.collection} ${nft.tokenId} ${nft.attributes.join(" ")}`.toLowerCase()
      if (q && !haystack.includes(q)) return false
      if (selectedCollections.length > 0 && !selectedCollections.includes(nft.collection)) return false
      if (selectedNetworks.length > 0 && !selectedNetworks.includes(nft.network)) return false
      if (!withinPrice(nft.price, min || undefined, max || undefined)) return false
      if (tab === "new" && !nft.isNew) return false
      if (tab === "trending" && nft.trendScore < 75) return false
      return true
    })
    const sorted = sortNfts(filtered, sort)
    const total = sorted.length
    const totalPages = Math.ceil(total / pageSize)
    const start = (page - 1) * pageSize
    return HttpResponse.json({
      items: sorted.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages,
      facets: facets(db.nfts),
    })
  }),

  http.get("/api/nfts/:id", async ({ params }) => {
    const blocked = await gate("detail")
    if (blocked) return blocked
    const db = loadDb()
    const nft = db.nfts.find((item) => item.id === params.id)
    if (!nft) return fail(404, "NFT_NOT_FOUND", "Este NFT não existe no catálogo.")
    return HttpResponse.json(nft)
  }),

  http.get("/api/favorites", ({ request }) => {
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para ver seus favoritos.")
    return HttpResponse.json({
      nftIds: db.favorites.filter((item) => item.userId === user.id).map((item) => item.nftId),
    })
  }),

  http.post("/api/favorites", async ({ request }) => {
    if (readScenario() === "favorite-fail") {
      return fail(500, "TRANSIENT", "Não foi possível salvar o favorito.")
    }
    const blocked = await gate("write")
    if (blocked) return blocked
    const body = await readJson<{ nftId?: string }>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para favoritar.")
    if (!body.nftId || !db.nfts.some((nft) => nft.id === body.nftId)) {
      return fail(404, "NFT_NOT_FOUND", "NFT não encontrado.")
    }
    if (!db.favorites.some((item) => item.userId === user.id && item.nftId === body.nftId)) {
      db.favorites.push({ userId: user.id, nftId: body.nftId })
      saveDb(db)
    }
    return HttpResponse.json({ ok: true })
  }),

  http.delete("/api/favorites/:nftId", ({ request, params }) => {
    if (readScenario() === "favorite-fail") {
      return fail(500, "TRANSIENT", "Não foi possível remover o favorito.")
    }
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para alterar favoritos.")
    db.favorites = db.favorites.filter((item) => !(item.userId === user.id && item.nftId === params.nftId))
    saveDb(db)
    return HttpResponse.json({ ok: true })
  }),

  http.get("/api/cart", async ({ request }) => {
    const blocked = await gate("cart")
    if (blocked) return blocked
    const db = loadDb()
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    saveDb(db)
    return HttpResponse.json(presentCart(db, cart))
  }),

  http.post("/api/cart/items", async ({ request }) => {
    const blocked = await gate("write")
    if (blocked) return blocked
    const body = await readJson<{ nftId?: string; editionId?: string; quantity?: number }>(request)
    const db = loadDb()
    const quantity = body.quantity ?? 1
    if (!body.nftId || !body.editionId || !Number.isInteger(quantity) || quantity < 1) {
      return fail(422, "VALIDATION", "Informe NFT, edição e quantidade inteira.")
    }
    const nft = db.nfts.find((item) => item.id === body.nftId)
    const edition = nft?.editions.find((item) => item.id === body.editionId)
    if (!nft || !edition) return fail(404, "NFT_NOT_FOUND", "NFT ou edição não encontrados.")
    if (edition.remaining < quantity || edition.status === "soldout") {
      return fail(409, "AVAILABILITY", "A edição não tem quantidade suficiente.", {
        quantity: `Disponível: ${edition.remaining}.`,
      })
    }
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    const existing = cart.items.find((item) => item.nftId === body.nftId && item.editionId === body.editionId)
    const next = (existing?.quantity ?? 0) + quantity
    if (next > edition.remaining) {
      return fail(409, "AVAILABILITY", "A quantidade passa do limite da edição.", {
        quantity: `Disponível: ${edition.remaining}.`,
      })
    }
    if (existing) existing.quantity = next
    else cart.items.push({ id: crypto.randomUUID(), nftId: body.nftId, editionId: body.editionId, quantity })
    saveDb(db)
    return HttpResponse.json(presentCart(db, cart))
  }),

  http.patch("/api/cart/items/:itemId", async ({ request, params }) => {
    const blocked = await gate("write")
    if (blocked) return blocked
    const body = await readJson<{ quantity?: number }>(request)
    const db = loadDb()
    const quantity = body.quantity ?? 0
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail(422, "VALIDATION", "A quantidade precisa ser um inteiro maior que zero.", {
        quantity: "Informe uma quantidade válida.",
      })
    }
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    const line = cart.items.find((item) => item.id === params.itemId)
    if (!line) return fail(404, "CART_ITEM_NOT_FOUND", "Item não está no carrinho.")
    const nft = db.nfts.find((item) => item.id === line.nftId)
    const edition = nft?.editions.find((item) => item.id === line.editionId)
    if (!edition || quantity > edition.remaining) {
      return fail(409, "AVAILABILITY", "Quantidade acima da disponibilidade.", {
        quantity: `Disponível: ${edition?.remaining ?? 0}.`,
      })
    }
    line.quantity = quantity
    saveDb(db)
    return HttpResponse.json(presentCart(db, cart))
  }),

  http.delete("/api/cart/items/:itemId", ({ request, params }) => {
    const db = loadDb()
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    cart.items = cart.items.filter((item) => item.id !== params.itemId)
    saveDb(db)
    return HttpResponse.json(presentCart(db, cart))
  }),

  http.post("/api/cart/coupon", async ({ request }) => {
    const blocked = await gate("write")
    if (blocked) return blocked
    const body = await readJson<{ code?: string }>(request)
    const db = loadDb()
    const code = body.code?.trim().toUpperCase() ?? ""
    if (!code) return fail(422, "VALIDATION", "Informe o cupom.", { code: "Cupom obrigatório." })
    if (code === "EXPIRADO") return fail(422, "COUPON_EXPIRED", "Este cupom expirou.", { code: "Cupom expirado." })
    if (code !== "KURIO10") return fail(422, "COUPON_INVALID", "Cupom inválido.", { code: "Cupom não reconhecido." })
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    cart.couponCode = code
    saveDb(db)
    return HttpResponse.json(presentCart(db, cart))
  }),

  http.delete("/api/cart/coupon", ({ request }) => {
    const db = loadDb()
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    cart.couponCode = null
    saveDb(db)
    return HttpResponse.json(presentCart(db, cart))
  }),

  http.get("/api/quotes", async ({ request }) => {
    const blocked = await gate("quote")
    if (blocked) return blocked
    const db = loadDb()
    const network = (new URL(request.url).searchParams.get("network") ?? "ethereum") as Network
    if (!networks.includes(network)) return fail(422, "VALIDATION", "Rede desconhecida.")
    const user = userOf(db, request)
    const cart = cartFor(db, ownerOf(user, request))
    return HttpResponse.json(buildQuote(db, cart, network))
  }),

  http.post("/api/orders", async ({ request }) => {
    const blocked = await gate("write")
    if (blocked && readScenario() !== "order-timeout") return blocked
    // Corpo lido antes de carregar o banco: daqui até saveDb não há await, então tentativas
    // simultâneas com a mesma chave são serializadas (equivalente a uma constraint única).
    const body = await readJson<Partial<CreateOrderBody>>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para concluir a compra.")
    const key = request.headers.get("Idempotency-Key")?.trim() ?? ""
    if (!key) return fail(422, "VALIDATION", "A chave de idempotência é obrigatória.")
    const fields = fieldErrors({
      collectorName: (body.collectorName?.trim().length ?? 0) < 2 ? "Informe o nome do colecionador." : null,
      collectorEmail: isEmail(body.collectorEmail ?? "") ? null : "Informe um e-mail válido.",
      walletId: body.walletId ? null : "Selecione uma carteira.",
      network: body.network && networks.includes(body.network) ? null : "Selecione a rede.",
      fingerprint: body.fingerprint ? null : "A cotação é obrigatória.",
      collectorUsername: (body.collectorUsername?.trim().length ?? 0) >= 3 ? null : "Informe o nome de usuário.",
      profileName: (body.profileName?.trim().length ?? 0) >= 2 ? null : "Informe o nome do perfil.",
      walletType: body.walletType && walletTypes.includes(body.walletType) ? null : "Selecione o tipo de carteira.",
      referralCode: (body.referralCode?.trim().length ?? 0) >= 3 ? null : "Informe o código de indicação.",
      ensName: isEns(body.ensName ?? "") ? null : "Use letras minúsculas, números, ponto ou hífen.",
    })
    if (fields || !body.fingerprint || !body.walletId || !body.network || !body.collectorName || !body.collectorEmail) {
      return fail(422, "VALIDATION", "Revise os dados do pagamento.", fields ?? undefined)
    }
    const canonical = canonicalOrderBody({
      fingerprint: body.fingerprint,
      walletId: body.walletId,
      network: body.network,
      collectorName: body.collectorName,
      collectorEmail: body.collectorEmail,
    })
    const existing = db.orders.find((order) => order.userId === user.id && order.idempotencyKey === key)
    if (existing) {
      if (existing.bodyHash !== canonical) {
        return fail(409, "IDEMPOTENCY_CONFLICT", "Esta chave já foi usada com outro conteúdo de pedido.")
      }
      return HttpResponse.json(toPublicOrder(existing))
    }
    const wallet = db.wallets.find((item) => item.id === body.walletId && item.userId === user.id)
    if (!wallet) return fail(403, "FORBIDDEN", "A carteira não pertence a esta conta.")
    if (wallet.connection !== "connected") {
      return fail(422, "WALLET_NOT_CONNECTED", "Conecte a carteira antes de confirmar.", {
        walletId: "A carteira precisa estar conectada.",
      })
    }
    const cart = cartFor(db, user.id)
    const quote = buildQuote(db, cart, body.network)
    if (quoteChanged(quote, body.fingerprint) || quote.items.some((item) => !item.available) || quote.items.length === 0) {
      return fail(409, "QUOTE_STALE", "A cotação mudou. Confirme os novos valores antes de comprar.")
    }
    if (quote.coupon && !quote.coupon.valid) {
      return fail(422, quote.coupon.reason === "expired" ? "COUPON_EXPIRED" : "COUPON_INVALID", "O cupom não pode ser usado.")
    }
    const now = new Date().toISOString()
    const order: StoredOrder = {
      id: crypto.randomUUID(),
      userId: user.id,
      idempotencyKey: key,
      bodyHash: canonical,
      status: "pending",
      version: 1,
      createdAt: now,
      updatedAt: now,
      walletLabel: wallet.label,
      walletType: body.walletType ?? wallet.walletType,
      network: body.network,
      txHash: null,
      explorerPath: null,
      declineReason: null,
      snapshot: {
        items: quote.items.map((item) => ({
          nftId: item.nftId,
          editionId: item.editionId,
          name: item.name,
          tokenId: item.tokenId,
          editionLabel: item.editionLabel,
          art: item.art,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
        subtotal: quote.subtotal,
        discount: quote.discount,
        networkFee: quote.networkFee,
        total: quote.total,
        couponCode: quote.coupon?.valid ? quote.coupon.code : null,
        collectorName: body.collectorName.trim(),
        collectorEmail: body.collectorEmail.trim().toLowerCase(),
        network: body.network,
      },
    }
    db.orders.push(order)
    saveDb(db)
    scheduleResolution(order.id, resolutionMode())
    if (readScenario() === "order-timeout") await delay(15_000)
    return HttpResponse.json(toPublicOrder(loadDb().orders.find((item) => item.id === order.id) ?? order), { status: 201 })
  }),

  http.get("/api/orders/by-key/:key", ({ request, params }) => {
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Sessão inválida.")
    const order = db.orders.find((item) => item.userId === user.id && item.idempotencyKey === params.key)
    if (!order) return fail(404, "ORDER_NOT_FOUND", "Pedido não encontrado para esta tentativa.")
    return HttpResponse.json(toPublicOrder(order))
  }),

  http.get("/api/orders/:id", ({ request, params }) => {
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Sessão inválida.")
    const order = db.orders.find((item) => item.id === params.id && item.userId === user.id)
    if (!order) return fail(404, "ORDER_NOT_FOUND", "Pedido não encontrado.")
    return HttpResponse.json(toPublicOrder(order))
  }),

  http.get("/api/profile", ({ request }) => {
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para ver o perfil.")
    return HttpResponse.json(publicUser(user))
  }),

  http.patch("/api/profile", async ({ request }) => {
    const blocked = await gate("write")
    if (blocked) return blocked
    const body = await readJson<Partial<ProfileInput>>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para editar o perfil.")
    const name = body.name?.trim() ?? user.name
    const username = body.username?.trim() ?? user.username
    const email = body.email?.trim().toLowerCase() ?? user.email
    const ensName = (body.ensName?.trim() ?? user.ensName).replace(/\.eth$/, "")
    const walletNickname = body.walletNickname?.trim() ?? user.walletNickname
    const fields = fieldErrors({
      name: name.length < 2 ? "Informe o nome de exibição." : null,
      username: /^[a-z0-9._]{3,24}$/.test(username) ? null : "Use de 3 a 24 letras minúsculas, números, ponto ou _.",
      email: isEmail(email) ? null : "Informe um e-mail válido.",
      ensName: isEns(ensName) ? null : "Use letras minúsculas, números, ponto ou hífen.",
      walletNickname: walletNickname.length >= 2 ? null : "Informe o apelido da carteira.",
    })
    if (fields) return fail(422, "VALIDATION", "Revise o perfil.", fields)
    if (db.users.some((item) => item.email === email && item.id !== user.id)) {
      return fail(409, "EMAIL_TAKEN", "Este e-mail já está em uso.", { email: "E-mail já cadastrado." })
    }
    if (db.users.some((item) => item.username === username && item.id !== user.id)) {
      return fail(409, "USERNAME_TAKEN", "Este nome de usuário já está em uso.", { username: "Nome de usuário indisponível." })
    }
    if (body.avatarDataUrl && body.avatarDataUrl.length > 350_000) {
      return fail(422, "VALIDATION", "O avatar é grande demais.", { avatar: "Use uma imagem menor." })
    }
    user.name = name
    user.username = username
    user.email = email
    user.ensName = ensName
    user.walletNickname = walletNickname
    if (body.avatarDataUrl !== undefined) user.avatarDataUrl = body.avatarDataUrl
    saveDb(db)
    return HttpResponse.json(publicUser(user))
  }),

  http.post("/api/profile/password", async ({ request }) => {
    const body = await readJson<{ currentPassword?: string; nextPassword?: string }>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para alterar a senha.")
    const currentHash = await hashPassword(body.currentPassword ?? "")
    const fields = fieldErrors({
      currentPassword: currentHash === user.passwordHash ? null : "A senha atual não confere.",
      nextPassword: (body.nextPassword?.length ?? 0) >= 8 ? null : "A nova senha precisa ter ao menos 8 caracteres.",
    })
    if (fields) return fail(422, "VALIDATION", "Não foi possível alterar a senha.", fields)
    user.passwordHash = await hashPassword(body.nextPassword ?? "")
    saveDb(db)
    return HttpResponse.json({ ok: true })
  }),

  http.get("/api/wallets", ({ request }) => {
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para ver as carteiras.")
    const wallets = db.wallets
      .filter((wallet) => wallet.userId === user.id)
      .map(({ userId: _userId, ...wallet }) => wallet)
    return HttpResponse.json({ wallets })
  }),

  http.post("/api/wallets", async ({ request }) => {
    const body = await readJson<Partial<WalletInput>>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para cadastrar uma carteira.")
    const fields = validateWallet(body)
    if (fields) return fail(422, "VALIDATION", "Revise a carteira.", fields)
    const owned = db.wallets.filter((wallet) => wallet.userId === user.id)
    if (owned.some((wallet) => wallet.role === body.role)) {
      return fail(409, "WALLET_ROLE_TAKEN", "Esta conta já tem uma carteira nesse papel.")
    }
    if (body.role === "primary") {
      for (const wallet of owned) if (wallet.role === "primary") wallet.role = "secondary"
    }
    const wallet = {
      id: crypto.randomUUID(),
      userId: user.id,
      ...normalizeWallet(body),
      connection: "disconnected" as const,
    }
    db.wallets.push(wallet)
    saveDb(db)
    const { userId: _userId, ...publicWallet } = wallet
    return HttpResponse.json(publicWallet, { status: 201 })
  }),

  http.patch("/api/wallets/:id", async ({ request, params }) => {
    const body = await readJson<Partial<WalletInput>>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para editar a carteira.")
    const wallet = db.wallets.find((item) => item.id === params.id)
    if (!wallet || wallet.userId !== user.id) return fail(403, "FORBIDDEN", "Você não pode editar esta carteira.")
    const fields = validateWallet(body)
    if (fields) return fail(422, "VALIDATION", "Revise a carteira.", fields)
    const duplicate = db.wallets.find((item) => item.userId === user.id && item.role === body.role && item.id !== wallet.id)
    if (duplicate) return fail(409, "WALLET_ROLE_TAKEN", "Já existe uma carteira com este papel.")
    Object.assign(wallet, normalizeWallet(body))
    saveDb(db)
    const { userId: _userId, ...publicWallet } = wallet
    return HttpResponse.json(publicWallet)
  }),

  http.post("/api/wallets/:id/connection", async ({ request, params }) => {
    const body = await readJson<{ action?: "connect" | "refuse" | "disconnect"; network?: Network }>(request)
    const db = loadDb()
    const user = userOf(db, request)
    if (!user) return fail(401, "SESSION_INVALID", "Entre para conectar a carteira.")
    const wallet = db.wallets.find((item) => item.id === params.id)
    if (!wallet || wallet.userId !== user.id) return fail(403, "FORBIDDEN", "Carteira indisponível para esta conta.")
    if (body.action === "connect") wallet.connection = "connected"
    else if (body.action === "refuse") wallet.connection = "refused"
    else if (body.action === "disconnect") wallet.connection = "disconnected"
    else return fail(422, "VALIDATION", "Ação de conexão inválida.")
    if (body.network && networks.includes(body.network)) wallet.network = body.network
    saveDb(db)
    const { userId: _userId, ...publicWallet } = wallet
    return HttpResponse.json(publicWallet)
  }),
]

function validateWallet(body: Partial<WalletInput>) {
  const ensSecondary = body.ensSecondary?.trim() ?? ""
  return fieldErrors({
    role: body.role === "primary" || body.role === "secondary" ? null : "Escolha principal ou secundária.",
    displayName: (body.displayName?.trim().length ?? 0) >= 2 ? null : "Informe o nome de exibição.",
    label: (body.label?.trim().length ?? 0) >= 2 ? null : "Informe o apelido da carteira.",
    profileName: (body.profileName?.trim().length ?? 0) >= 2 ? null : "Informe o nome do perfil.",
    address: isAddress(body.address ?? "") ? null : "Informe um endereço 0x com 40 caracteres hexadecimais.",
    ensSecondary:
      !ensSecondary || isAddress(ensSecondary) || /^[a-z0-9.-]+\.eth$/.test(ensSecondary)
        ? null
        : "Use um nome .eth ou um endereço 0x.",
    walletType: body.walletType && walletTypes.includes(body.walletType) ? null : "Selecione o tipo de carteira.",
    referralCode: (body.referralCode?.trim().length ?? 0) >= 3 ? null : "Informe o código de indicação.",
    email: isEmail(body.email?.trim() ?? "") ? null : "Informe um e-mail válido.",
    ensName: isEns(body.ensName ?? "") ? null : "Use letras minúsculas, números, ponto ou hífen.",
    network: body.network && networks.includes(body.network as Network) ? null : "Escolha a rede.",
  })
}

function normalizeWallet(body: Partial<WalletInput>): WalletInput {
  return {
    role: body.role!,
    label: body.label!.trim(),
    displayName: body.displayName!.trim(),
    profileName: body.profileName!.trim(),
    address: body.address!.trim(),
    ensSecondary: body.ensSecondary?.trim() ?? "",
    walletType: body.walletType!,
    referralCode: body.referralCode!.trim().toUpperCase(),
    email: body.email!.trim().toLowerCase(),
    ensName: body.ensName!.trim().replace(/\.eth$/, ""),
    network: body.network!,
  }
}

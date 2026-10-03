# Arquitetura — Kurio

Este documento registra a organização do código, os contratos REST e de eventos, a política de sessão, o estado do carrinho, a estratégia de cache, a reconciliação REST ↔ Socket.IO, as limitações, as decisões de UX e os desvios em relação ao Figma.

## 1. Visão geral

```
UI (React + shadcn/ui + Tailwind)
   │  rotas, search params e guards ........ TanStack Router  (src/router.tsx)
   │  consultas, mutations e cache ......... TanStack Query   (src/lib/query.ts, src/features/*)
   ▼
Transporte tipado ......................... Axios            (src/lib/api/client.ts, src/lib/api/http.ts)
   │                                        socket.io-client (src/components/realtime.tsx)
   ▼
Rede simulada ............................. MSW (service worker) + @mswjs/socket.io-binding
                                            handlers, store e fixtures (src/mocks/*)
```

- **Contratos tipados** em `src/contracts/api.ts`, compartilhados por transporte, mocks, estado e interface.
- **Nenhum componente, hook ou cliente Axios contém respostas fictícias.** Toda resposta vem dos handlers MSW. Os mocks interceptam `fetch`/XHR no service worker e o WebSocket via interceptor do MSW.
- **A camada de mocks é ligada por configuração** (`VITE_ENABLE_MSW`, padrão `true`) e entra no build de demonstração.

### Estrutura

| Caminho | Responsabilidade |
|---|---|
| `src/contracts/api.ts` | Tipos e constantes do contrato (NFT, carrinho, cotação, pedido, eventos, cenários) |
| `src/lib/api/client.ts` | Instância Axios: token/guest id, timeout, normalização de erros (`ApiRequestError`) e evento `kurio:unauthorized` em 401 |
| `src/lib/api/http.ts` | Funções REST tipadas, todas com `AbortSignal` |
| `src/lib/query.ts` | `QueryClient`, chaves de cache e limpeza do cache privado |
| `src/lib/eth.ts` | Aritmética de ETH em `bigint` (8 casas) sobre strings decimais |
| `src/lib/mocks-ready.ts` | Sinal de "mocks prontos": a UI renderiza já e só o transporte espera |
| `src/features/*` | Hooks de domínio: sessão, carrinho, favoritos (otimista), busca, media query |
| `src/components/ui/*` | Componentes shadcn/ui (`components.json`, estilo new-york): Button, Dialog, Sheet, Input, Textarea, NativeSelect, Label, Skeleton |
| `src/components/*` | Shell (header, rodapé, barra mobile), cards, carrosséis, estados, ponte de tempo real |
| `src/pages/*` | Telas. Só a home fica no bundle inicial; as demais usam `lazyRouteComponent` |
| `src/mocks/*` | Handlers REST, servidor Socket.IO simulado, banco persistido, fixtures |
| `e2e/*` | Testes Playwright e baselines visuais |
| `lighthouse/*` | Configuração versionada, script e relatórios da auditoria |
| `design/source/*` | Ilustrações originais extraídas do Figma (1254×1254 PNG) |

## 2. Rotas

| Rota | Tela | Proteção |
|---|---|---|
| `/` | Início (search params: `q`, `collections`, `networks`, `min`, `max`, `sort`, `tab`, `page`) | pública |
| `/nfts/$nftId` | Detalhe | pública |
| `/cart` | Carrinho | pública (carrinho de visitante) |
| `/checkout` | Pagamento | autenticada |
| `/orders/$orderId` | Pendente / confirmado / recusado | autenticada |
| `/explorer/$txHash` | Explorador simulado | pública |
| `/login`, `/register` | Modal sobre a home (desktop) ou tela cheia (mobile); `redirect` e `expired` | pública |
| `/profile`, `/wallets`, `/favorites` | Conta | autenticada |
| qualquer outra | 404 | — |

Os guards usam `beforeLoad` + `ensureQueryData(session)`. Sem sessão, a rota redireciona para `/login?redirect=<rota>` e, se a sessão expirou, acrescenta `&expired=1`. Os search params são validados (`validateSearch`), e valores padrão (`sort=recent`, `tab=all`, `page=1`) são omitidos da URL. Toda mudança de filtro, busca ou aba reinicia a paginação.

## 3. Contratos REST

Base `/api`. Corpo e respostas em JSON. Valores em ETH sempre como **string decimal**; quantidades são inteiros. Cabeçalhos enviados pelo cliente: `Authorization: Bearer <token>` (quando autenticado) e `X-Guest-Id` (sempre, para o carrinho de visitante).

Erros seguem `ApiErrorBody = { code, message, fields? }`:

| HTTP | `code` | Uso |
|---|---|---|
| 401 | `SESSION_INVALID`, `INVALID_CREDENTIALS` | Sessão ausente/expirada; login inválido |
| 403 | `FORBIDDEN` | Recurso de outro usuário (ex.: carteira) |
| 404 | `NFT_NOT_FOUND`, `ORDER_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `EDITION_NOT_FOUND` | Recurso inexistente |
| 409 | `AVAILABILITY`, `QUOTE_STALE`, `IDEMPOTENCY_CONFLICT`, `EMAIL_TAKEN`, `USERNAME_TAKEN`, `WALLET_ROLE_TAKEN` | Conflitos de disponibilidade, cotação, idempotência e cadastro |
| 422 | `VALIDATION`, `COUPON_INVALID`, `COUPON_EXPIRED`, `WALLET_NOT_CONNECTED` | Validação (com `fields` por campo) |
| 500 | `TRANSIENT` | Falha transitória (cenário `http-500`, `favorite-fail`) |
| — | `NETWORK` / `TIMEOUT` (cliente) | Sem conexão (cenário `offline`) / timeout do Axios |

### Sessão e conta

| Método e rota | Corpo | Resposta |
|---|---|---|
| `POST /auth/register` | `{ name, email, password }` | `201 { token, user: PublicUser }` · 409 `EMAIL_TAKEN` · 422 |
| `POST /auth/login` | `{ email, password }` | `{ token, user }` · 401 `INVALID_CREDENTIALS` · 422 |
| `GET /auth/session` | — | `{ user }` · 401 |
| `POST /auth/logout` | — | `{ ok: true }` (invalida o token) |
| expiração | — | Sessões valem 8 h. O cenário `session-expired` e a ação `expire-session` invalidam todas |

### Catálogo e favoritos

| Método e rota | Parâmetros / corpo | Resposta |
|---|---|---|
| `GET /nfts` | `q, collections (csv), networks (csv), min, max, sort (recent\|price-asc\|price-desc\|trending), tab (all\|new\|trending), page, pageSize` | `NftList { items, page, pageSize, total, totalPages, facets { collections, networks, priceRange } }` |
| `GET /nfts/:id` | — | `Nft` (com `editions[]` e `version`) · 404 |
| `GET /favorites` | — | `{ nftIds: string[] }` · 401 |
| `POST /favorites` | `{ nftId }` | `{ ok }` · 404 · 500 (cenário) |
| `DELETE /favorites/:nftId` | — | `{ ok }` |

### Carrinho, cotação e pedidos

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /cart` | — | `Cart { ownerId, couponCode, items: CartLine[] }` (do usuário ou do visitante) |
| `POST /cart/items` | `{ nftId, editionId, quantity }` | `Cart` · 409 `AVAILABILITY` |
| `PATCH /cart/items/:id` | `{ quantity }` | `Cart` · 409 · 422 |
| `DELETE /cart/items/:id` | — | `Cart` |
| `POST /cart/coupon` | `{ code }` | `Cart` · 422 `COUPON_INVALID`/`COUPON_EXPIRED` |
| `DELETE /cart/coupon` | — | `Cart` |
| `GET /quotes?network=` | — | `Quote { fingerprint, items, subtotal, discount, networkFee, total, coupon, network }` |
| `POST /orders` | `CreateOrderBody` + cabeçalho **`Idempotency-Key`** | `201 Order` (pendente) · 409 `QUOTE_STALE` · 409 `IDEMPOTENCY_CONFLICT` · 422 `WALLET_NOT_CONNECTED` |
| `GET /orders/:id` | — | `Order` (com `snapshot`) · 404 |
| `GET /orders/by-key/:key` | — | `Order` da tentativa (recuperação após timeout) · 404 |

`CreateOrderBody = { fingerprint, walletId, network, walletType, collectorName, collectorEmail, collectorUsername, profileName, referralCode, ensName, note? }`.

**Idempotência.** A mesma chave com o mesmo conteúdo canônico (`fingerprint`, carteira, rede, nome e e-mail) devolve o **mesmo** pedido. Reutilizar a chave com conteúdo diferente gera 409 `IDEMPOTENCY_CONFLICT`. No cliente, a chave é derivada da tentativa (conteúdo do corpo) e guardada em `sessionStorage`, de modo que um reenvio após timeout ou refresh reaproveita a chave. No mock, o corpo é lido antes de carregar o banco, e não há `await` até a gravação: tentativas simultâneas são serializadas, como uma constraint única faria.

**Revalidação.** O servidor recalcula a cotação no `POST /orders`. Se preço, versão, disponibilidade, cupom ou taxa divergem do `fingerprint` aceito, responde 409 `QUOTE_STALE`, e a UI exige nova confirmação.

### Perfil e carteiras

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /profile` | — | `PublicUser { id, name, username, email, ensName, walletNickname, avatarDataUrl }` |
| `PATCH /profile` | `ProfileInput` (avatar como data URL ≤ 250 KB) | `PublicUser` · 409 `EMAIL_TAKEN`/`USERNAME_TAKEN` · 422 |
| `POST /profile/password` | `{ currentPassword, nextPassword }` | `{ ok }` · 422 (senha atual incorreta / nova curta) |
| `GET /wallets` | — | `{ wallets: Wallet[] }` |
| `POST /wallets` | `WalletInput` (`role`, apelido, nome de exibição, nome do perfil, endereço 0x, ENS secundário, tipo, código de indicação, e-mail, nome ENS, rede) | `201 Wallet` · 409 `WALLET_ROLE_TAKEN` · 422 |
| `PATCH /wallets/:id` | `WalletInput` | `Wallet` · 403 · 409 · 422 |
| `POST /wallets/:id/connection` | `{ action: connect\|refuse\|disconnect, network? }` | `Wallet` (simulação de conexão) |

### Simulação (somente mocks)

`POST /dev/reset`, `POST /dev/scenario { scenario }`, `GET /dev/orders`, `POST /dev/actions { type: set-price | sell-out | emit-nft | confirm-order | decline-order | drop-sockets | expire-session, ... }`.

## 4. Eventos Socket.IO

Envelope comum (`RealtimeEvent<T>`):

```ts
{ id: string; type: "nft.updated" | "order.updated"; resourceId: string; version: number;
  userId: string | null; occurredAt: string; payload: T }
```

| Evento | Payload | Destinatários | Efeito no cliente |
|---|---|---|---|
| `nft.updated` | `{ id, price, version, editions[] }` | todos | Atualiza preço e edições na listagem (`["nfts", …]`), no detalhe (`["nft", id]`) e nas linhas do carrinho (preço, `maxQuantity`, `available`, `lineTotal`), invalida as cotações e anuncia a mudança |
| `order.updated` | `{ order }` | só o dono (`userId`) | Grava o pedido no cache (`["order", id]`). Em estado terminal, invalida o carrinho e anuncia a confirmação ou a recusa |

**Garantias no cliente** (`src/components/realtime.tsx`):

- **Deduplicação:** os `id` vistos ficam numa janela de 400 eventos, e um evento repetido é ignorado.
- **Ordenação:** um evento só se aplica se `version` for maior que a maior versão conhecida para `tipo:recurso` (comparada também com o cache). Eventos antigos não regridem o estado.
- **Isolamento por usuário:** ao conectar, o cliente emite `session` com o token, e o servidor simulado só entrega `order.updated` ao dono. O cliente também descarta `order.updated` de outro `userId`.
- **Ciclo de vida:** o socket é recriado quando o usuário muda, como no login, logout e troca de conta. Os listeners são removidos e o socket é desconectado no cleanup.
- **Reconexão:** a cada reconexão (exceto a primeira conexão), o cliente invalida todas as consultas ativas, reconciliando com a REST, e anuncia "Conexão restabelecida".
- **Pedido pendente:** a tela do pedido também consulta a REST a cada 4 s enquanto estiver `pending`, como rede de segurança caso um evento se perca.

**Transporte e limitações nos mocks.** O `socket.io-client` usa `transports: ["websocket"]`. O MSW intercepta o WebSocket com `ws.link("ws(s)://<host>")` (o MSW remove o prefixo `/socket.io/` antes de comparar), e o `@mswjs/socket.io-binding` codifica e decodifica os pacotes Engine.IO/Socket.IO e faz o handshake. Limitações conhecidas:

- **Sem long-polling:** só o transporte WebSocket.
- **Sem namespaces e salas:** só o namespace `/`. O "servidor" vive na aba, então eventos não atravessam abas, embora o banco no `localStorage` seja compartilhado.
- **Import tardio:** o `engine.io-client` guarda o construtor `WebSocket` ao ser avaliado, por isso o `socket.io-client` é importado depois que os mocks estão prontos.
- **Heartbeat:** o servidor simulado envia ping a cada 20 s para manter a conexão.

## 5. Sessão

- O token opaco fica em `localStorage["kurio:token"]`. Senhas só existem como hash SHA-256 no banco simulado.
- **Recuperação após refresh:** a consulta `["session"]` (`GET /auth/session`) restaura o usuário. Se o token for inválido, o cliente volta ao estado de visitante.
- **Expiração durante a navegação:** qualquer 401 limpa o token, marca `kurio:expired`, remove o cache privado e, se a rota for privada, redireciona para `/login?redirect=<rota atual>&expired=1`. Após o login, o usuário volta exatamente para a rota de origem.
- **Expiração no checkout:** o carrinho e a cotação ficam no servidor, então o contexto é preservado e a retomada volta direto a `/checkout`.
- **Logout e troca de usuário:** `clearPrivateCache()` remove sessão, favoritos, carrinho, cotações, pedidos, perfil e carteiras. A chave do cache inclui o `userId`, e o socket é recriado com a nova sessão.

## 6. Carrinho

- O carrinho fica **no servidor simulado, por dono**: o `userId` ou `guest:<X-Guest-Id>` (UUID persistido em `localStorage`). Isso faz o carrinho sobreviver ao refresh.
- **Ao autenticar,** o carrinho do visitante é **mesclado** ao da conta, somando quantidades até o limite da edição, e o cupom é preservado.
- **Disponibilidade por NFT e edição:** a disponibilidade é validada em toda escrita (409 `AVAILABILITY`). A UI limita o stepper ao estoque e marca as linhas que ficaram indisponíveis.
- **Totais:** o resumo exibe exatamente os valores da cotação (`GET /quotes`). A cotação é a referência para fechar o pedido, e o cliente não recalcula totais. Toda a aritmética usa `bigint` com 8 casas decimais.
- **Tempo real:** mudanças recebidas com o carrinho aberto geram um aviso visível ("O carrinho foi atualizado…"), anunciado em `aria-live`, e uma nova cotação.
- **Após a confirmação,** o servidor remove do carrinho só as quantidades compradas.

## 7. Cache, retries e sincronização

| Item | Política |
|---|---|
| `staleTime` padrão | 15 s (sessão: 30 s; carrossel e destaque: 60 s) |
| `gcTime` | 5 min |
| Retry de consultas | 1 tentativa. Detalhe com 404 não tenta de novo. Sessão sem retry |
| Retry de mutations | Nenhum (evita duplicar operações). O pedido usa idempotência em vez de retry cego |
| Foco da janela | `refetchOnWindowFocus: true` |
| Isolamento | As chaves incluem os parâmetros (`["nfts", search]`) e o dono (`["cart", ownerId]`, `["quote", ownerId, network]`, `["favorites", userId]`, `["wallets", userId]`, `["profile", userId]`) |
| Respostas obsoletas | Toda consulta repassa o `signal` ao Axios: trocar parâmetros cancela a requisição anterior, e a resposta só é gravada na chave dela. A listagem usa `placeholderData` (dados anteriores esmaecidos) durante a troca |
| Otimista | Favoritos: `onMutate` atualiza o cache, `onError` faz rollback e anuncia a falha, `onSettled` invalida |
| Invalidação | Carrinho → `cart` + `quote`. Cupom → `cart` + `quote`. Perfil → `profile` + `session`. Carteiras → `wallets`. Pedido → `cart`. `nft.updated` → `quote`. Reconexão → tudo |
| Erros | Bloco de erro com "Tentar novamente". Quando já há dados, a UI os mantém e mostra a falha da atualização |

## 8. Mocks (MSW)

- O banco fica em `localStorage["kurio:db:v2"]`, semeado por `createDatabase()`.
  - **Catálogo:** 30 NFTs, 9 coleções e 3 redes, com edições esgotadas e de estoque unitário.
  - **Contas:** 2 usuários, carteiras, favoritos e carrinhos.
- Todos os handlers leem e gravam o mesmo banco, então catálogo, favoritos, carrinho, perfil, carteiras e pedidos ficam consistentes. Toda alteração de NFT gera `nft.updated`, e toda mudança de pedido gera `order.updated`.
- `POST /api/dev/reset` recria o banco e volta ao cenário `default`, restaurando integralmente o estado conhecido. Os testes partem de um contexto novo, com o mesmo efeito.
- Os cenários são determinísticos (ver README): latência fixa por tipo de rota, sem aleatoriedade.
- **Peso do chunk do MSW:** o `tough-cookie` (dependência do MSW) puxa a Public Suffix List (`tldts`, cerca de 100 KB gzip). Como a aplicação não usa cookies, um alias troca `tldts` por `src/mocks/tldts-lite.ts`.

## 9. shadcn/ui

- `components.json` declara estilo **new-york**, Tailwind v4 (`src/index.css`), CSS variables e aliases `@/components/ui` e `@/lib/utils` (`cn` = clsx + tailwind-merge).
- Os componentes foram obtidos do registro oficial (`shadcn view`) e mantêm a API e a estrutura: `data-slot`, partes exportadas (`DialogHeader`, `SheetContent` etc.), `cva` com `buttonVariants` e primitivos do pacote `radix-ui`.
- **Adaptação ao Figma**, como pede o enunciado:
  - Os tokens semânticos do shadcn (`--primary`, `--background`, `--card`, `--ring` etc.) apontam para a paleta Kurio em `src/index.css`.
  - Cantos de 4 px, Roboto Mono em negrito, X e barra laranja no Dialog, drawer inferior arredondado no Sheet.
  - Variantes extras: `pill` (CTA mobile) e `size="xl"`.
  - O Skeleton usa shimmer no lugar do pulse.
- Por que não usamos o `shadcn add` direto: a CLI 4.x tentou instalar um pacote npm chamado `cn` (o placeholder do import de utils) e foi bloqueada pelo pnpm. Para não adicionar uma dependência indevida, o código veio do registro e o import aponta para `@/lib/utils`, que é o que a CLI geraria.

## 10. Acessibilidade

- **Navegação e foco:** skip link, `main` focável, foco visível (`outline` laranja) em todos os controles e navegação completa por teclado.
- **Diálogos e drawers:** Radix prende o foco e fecha com Esc. O foco volta ao elemento de origem mesmo em diálogos abertos por evento.
- **Semântica:** landmarks, um único `h1` por tela, ordem de títulos coerente, abas com `role="tablist"` e setas, e filtros como `role="checkbox"` com `aria-checked`.
- **Formulários:** labels associados, obrigatoriedade anunciada (não só o asterisco), mensagens de erro com `aria-describedby`, `aria-invalid` e foco no primeiro campo inválido.
- **Feedback:** mutations e eventos em tempo real são anunciados numa região `aria-live`. Estados de erro e esgotado usam texto e ícone, não só cor.
- **Imagens:** as ilustrações de NFTs têm texto alternativo. As decorativas (blog, banners, miniaturas repetidas) usam `alt=""`.
- **Movimento:** `prefers-reduced-motion` desliga o shimmer e as transições.
- **Ajustes em relação ao Figma:**
  - Os campos sem rótulo visível no Figma (login, cadastro, "ENS ou carteira secundária") têm rótulo oculto para leitores de tela.
  - Os sliders de preço ganharam área de toque de 24 px.
  - As cores de erro (`#ff9f8a`) e de sucesso (`#a6dcb0`) foram adicionadas, porque o Figma não define esses estados.

## 11. Performance

As medianas e o ambiente estão em `lighthouse/reports/summary.md`. Decisões:

- **Imagens:** as ilustrações originais (1254 px PNG, cerca de 2 MB cada) viraram WebP de 160, 400, 720 e 1080 px (3 a 74 KB), servidas com `srcset`/`sizes`. A imagem do hero tem preload no HTML.
- **Fontes:** Roboto Mono é servida localmente, só no subset latin, em 3 pesos e com `font-display: swap`.
- **Code splitting:** cada rota além da home é carregada sob demanda. O `socket.io-client` carrega quando o navegador fica ocioso.
- **MSW fora do caminho da renderização:** a UI renderiza imediatamente e só o transporte espera os mocks. O service worker é registrado já no HTML, e o chunk dos mocks tem `modulepreload`.
- **Conteúdo abaixo da dobra:** banners e "Diário da Cunhagem" entram depois do catálogo, para não disputar banda com a imagem do LCP. A lateral de filtros só é montada no desktop.
- **CLS:** os skeletons têm as dimensões finais, e as imagens declaram `width` e `height`.

**Resultado abaixo da meta: performance mobile (~87 contra a meta de 90).** No perfil mobile (Slow 4G simulado e CPU 4×), o elemento de LCP é a imagem do primeiro card do catálogo. Ela depende da resposta da API, e a API depende do service worker do MSW, que precisa ser instalado e ativado a cada medição, porque o Lighthouse limpa o storage. Somando o bundle da SPA (React, Router, Query e Radix) e a ativação do worker, o LCP fica em ~2,9–3,3 s. Em produção, com uma API real, ou em visitas seguintes, com o worker já ativo, esse custo desaparece. O TBT varia bastante nesta máquina (Windows com outros processos ativos), entre 100 e 500 ms entre execuções iguais, e isso explica a dispersão de 77 a 89. Não usamos simplificações exclusivas para a auditoria: a página medida carrega as mesmas imagens, fontes, mocks e tempo real da entrega.

## 12. Fidelidade ao Figma e decisões de UX

**Assets:**
- As ilustrações são as 4 imagens originais do arquivo (`design/source`), reaproveitadas pelos 30 NFTs, como o próprio Figma faz.
- A fonte Roboto Mono foi identificada no arquivo.
- A paleta foi extraída dos pixels dos frames: fundo `#140d0a`, superfície `#241612`, botões `#d28a4c`, destaque `#e89b55`, textos `#f5f1eb`, `#cfb28c` e `#b39463`.
- Os ícones de marca (redes sociais, Google, Facebook) e o envelope "THANK YOU" foram redesenhados em SVG.

**Desvios e estados não desenhados:**

| Item | Figma | Implementação |
|---|---|---|
| Login/Cadastro desktop | Modal sobre a home | Igual. No mobile, tela cheia conforme o frame mobile |
| Confirmação | Cartão central sem cabeçalho | Igual. Os estados pendente e recusado usam o mesmo cartão (não desenhados) |
| Galeria do detalhe | 4 miniaturas iguais | 4 vistas da mesma obra (completa e recortes ampliados) e zoom em diálogo |
| Pagamento mobile | Só carteiras, provedores e total | Inclui seção recolhível "Perfil do colecionador" (pré-preenchida) para cumprir a validação dos campos. A revisão do pedido ocorre num diálogo |
| "Carteira e rede" (desktop) | 1ª opção é o selo METAMASK · WALLETCONNECT · COINBASE | Mapeada para WalletConnect (nome acessível "WalletConnect") |
| Conexão da carteira | Não desenhada | Diálogo de simulação com "Aprovar conexão" e "Recusar", mais status e "Desconectar" |
| Header autenticado | Só "Entrar" | Botão com avatar e primeiro nome, que leva ao perfil |
| Barra mobile | Botão central de "scan" | Abre a busca de coleções |
| Contagens dos filtros | Números ilustrativos | Refletem o catálogo simulado |
| Menu do perfil no mobile | Sem frame | Vira uma faixa horizontal rolável. Perfil, carteiras, favoritos e confirmação funcionam em 320–1440 px |
| Aba "Avaliações" | Só o título | Mostra a nota média. A listagem de avaliações está fora do escopo |
| Ações fora do escopo (Criadores, artigos, ajuda, redes sociais, newsletter, login social, "Esqueceu a senha?", Atividade, Ofertas, Arquivos, Suporte) | — | Diálogo "Fora desta entrega" que nunca simula sucesso. Os links de compartilhamento do detalhe abrem os sites reais em nova aba |
| Tablet (768) | Sem frame | Header desktop, filtros em drawer, grade de 3 colunas, hero em duas colunas iguais, carrosséis com 3 itens por vez e colunas do carrinho compactadas |
| Pagamento sem carteira | Sem frame | Estado vazio com "Cadastrar carteira". Ao salvar a carteira principal, o usuário volta direto ao pagamento (`/wallets?redirect=/checkout`) |

Breakpoints verificados: 320, 360, 390, 414, 768 e 1440 px, sem overflow horizontal de página. Os únicos elementos com rolagem própria são as abas da home e o menu do perfil no mobile. **Zoom:** o zoom do navegador equivale a um viewport menor (200% em 1280 px ≈ 640 px; 400% ≈ 320 px). O teste `e2e/a11y.spec.ts › zoom e reflow` percorre início, detalhe, carrinho, pagamento, perfil, carteiras, login e cadastro nessas larguras e falha se houver overflow horizontal ou conteúdo cortado.

## 13. Limitações

- Não há backend real: autenticação, carteiras, pagamentos e blockchain são simulados. Hashes de transação e links de explorador são fictícios.
- O "servidor" Socket.IO roda na própria aba (ver §4), então duas abas abertas não trocam eventos entre si.
- O banco simulado vive no `localStorage` do navegador. Limpar os dados do site equivale a um reset.
- As baselines visuais foram geradas no Chromium do Playwright no Windows. Em outro sistema operacional, diferenças de renderização de fonte podem exigir `pnpm test:visual:update`.

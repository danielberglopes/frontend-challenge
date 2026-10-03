# Kurio — Marketplace de NFTs

Implementação do desafio [Frontend Challenge](docs/DESAFIO.md) em React + TypeScript, fiel ao [layout no Figma](https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1) (desktop e mobile), com APIs, autenticação, carteiras, pagamentos e tempo real **simulados na camada de rede com MSW**.

- Arquitetura, contratos REST/eventos, cache, sessão e reconciliação: [ARCHITECTURE.md](ARCHITECTURE.md)
- Enunciado original: [docs/DESAFIO.md](docs/DESAFIO.md)
- Auditoria Lighthouse (medianas, ambiente, relatórios): [lighthouse/reports/summary.md](lighthouse/reports/summary.md)

## Início rápido

Você precisa ter instalado o [Node.js](https://nodejs.org) (versão 20 ou mais nova) e o pnpm (`npm install -g pnpm`).

### Rodar o projeto

```bash
pnpm install   # 1. instala as dependências (só na primeira vez)
pnpm dev       # 2. sobe o site
```

Abra **http://127.0.0.1:5173** no navegador. Não precisa de backend nem de configuração: os dados são simulados no próprio navegador.

Para entrar, use `ana.colecionadora@kurio.test` com a senha `Kurio#2026`.

### Testar o projeto

```bash
pnpm exec playwright install chromium   # 1. baixa o navegador de testes (só na primeira vez)
pnpm test:e2e                           # 2. roda todos os testes (desktop e mobile)
pnpm test:report                        # 3. abre o relatório dos testes no navegador
```

Não precisa deixar o `pnpm dev` aberto: os testes sobem o site sozinhos. A execução completa leva cerca de 2 minutos.

### Outros comandos úteis

```bash
pnpm build        # gera a versão de produção
pnpm preview      # abre a versão de produção em http://127.0.0.1:4173
pnpm lighthouse   # roda a auditoria de performance (leva alguns minutos)
```

## Stack

React 19 · TypeScript · Vite · TanStack Router · TanStack Query · Axios · Socket.IO client · Tailwind CSS 4 · shadcn/ui (`components.json`, estilo new-york, primitivos `radix-ui`) · MSW 2 + `@mswjs/socket.io-binding` · Playwright · Lighthouse.

> O `pnpm-workspace.yaml` autoriza o script de instalação do `msw` (`allowBuilds`), exigido pelo pnpm 11+ para `pnpm install --frozen-lockfile` funcionar num checkout limpo.

## Setup

Requisitos: Node 20+ (testado com Node 24) e pnpm 10.

```bash
pnpm install
pnpm exec playwright install chromium   # só para os testes E2E e a auditoria
pnpm dev                                 # http://127.0.0.1:5173 com mocks ativos
```

A aplicação executa a partir de um checkout limpo: não há backend real nem serviços privados. Imagens (`public/nfts`), fontes (`@fontsource/roboto-mono`) e o service worker do MSW (`public/mockServiceWorker.js`) são servidos localmente.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Desenvolvimento com mocks MSW (REST + Socket.IO) |
| `pnpm dev:no-mocks` | Desenvolvimento sem MSW (`--mode no-mocks`) |
| `pnpm build` | Verificação de tipos + build de produção (mocks incluídos no build de demonstração) |
| `pnpm preview` | Serve o build em `http://127.0.0.1:4173` |
| `pnpm typecheck` | `tsc -b` (app, e2e e configs) |
| `pnpm lint` | oxlint |
| `pnpm test:e2e` | Playwright: Chromium desktop (1440) e mobile (390) |
| `pnpm test:e2e:desktop` / `pnpm test:e2e:mobile` | Um projeto só |
| `pnpm test:visual:update` | Regera as baselines de regressão visual |
| `pnpm test:report` | Abre o relatório HTML (`playwright-report/`) |
| `pnpm lighthouse` | Build + preview + 3 medições por página/perfil; gera `lighthouse/reports/` |

## Variáveis de ambiente

Copie `.env.example` para `.env.local` se quiser alterar algo.

| Variável | Padrão | Descrição |
|---|---|---|
| `VITE_ENABLE_MSW` | `true` | `false` desliga a camada de mocks (`.env.no-mocks`) |
| `VITE_HTTP_TIMEOUT` | `8000` | Timeout do Axios em ms. Também pode ser sobrescrito em runtime por `localStorage["kurio:http-timeout"]` (usado nos testes de timeout) |

## Credenciais fictícias

Senha de ambos: **`Kurio#2026`** (armazenada apenas como hash SHA-256 no banco simulado).

| Usuário | E-mail | Estado inicial |
|---|---|---|
| Ana Colecionadora | `ana.colecionadora@kurio.test` | Carrinho igual ao Figma (Emerald ×2, Violet ×6, Ivory ×9 = 26.846 ETH), carteiras principal (MetaMask/Ethereum) e secundária (Coinbase/Polygon), favorito Emerald Ape |
| Bruno Nomad | `bruno.nomad@kurio.test` | Carrinho vazio, sem carteiras, favorito Golden Signal |

Cupons: `KURIO10` (10% de desconto) · `EXPIRADO` (expirado) · qualquer outro é inválido.

Cadastro de carteira (`/wallets`): o endereço precisa ser `0x` + 40 caracteres hexadecimais. Use o link **"Gerar endereço de teste"** sob o campo. Código de indicação: qualquer valor com 3+ caracteres (ex.: `KURIO-01`). Nome ENS: minúsculas, números, ponto ou hífen (espaços viram hífen).

## Cenários e reset

Os cenários vivem na camada MSW e são **determinísticos**. Selecione pelo rodapé → **Ambiente de simulação**, ou programaticamente:

```js
localStorage.setItem("kurio:scenario", "slow") // e recarregue
await fetch("/api/dev/scenario", { method: "POST", body: JSON.stringify({ scenario: "slow" }) })
await fetch("/api/dev/reset", { method: "POST" }) // restaura integralmente o cenário conhecido
```

| Cenário | Efeito |
|---|---|
| `default` | Sucesso; pagamento confirmado ~450 ms após a criação |
| `empty` | Catálogo vazio |
| `slow` | Catálogo, detalhe, carrinho e cotação com +1,6 s (skeletons) |
| `variable-latency` | Listagem sem filtros 1,4 s, com filtros 70 ms → respostas fora de ordem |
| `offline` | Falha de conexão (`HttpResponse.error()`) em todas as rotas |
| `http-500` | 500 transitório em catálogo e detalhe |
| `session-expired` | Toda sessão passa a ser inválida (401) |
| `register-conflict` | Cadastro sempre retorna 409 |
| `favorite-fail` | Inclusão/remoção de favorito retorna 500 (rollback otimista) |
| `order-timeout` | `POST /api/orders` cria o pedido mas responde só após 15 s |
| `payment-declined` | Pedido é recusado pela "carteira" |
| `payment-hold` | Pedido fica pendente até uma ação manual |

Ações de simulação (mesma tela ou `POST /api/dev/actions`): `set-price`, `sell-out`, `emit-nft` (evento com versão/ID arbitrários), `confirm-order`, `decline-order`, `drop-sockets`, `expire-session`. Toda mudança é gravada no banco simulado **e** emitida como evento Socket.IO.

## Reproduzindo os fluxos de falha

| Fluxo | Passos |
|---|---|
| Skeleton + recuperação | Cenário `slow` → recarregue a home/detalhe. Depois `http-500` → abra a home → "Tentar novamente" após voltar para `default` |
| Respostas fora de ordem | `variable-latency` → na home clique em uma coleção antes de a listagem inicial terminar |
| Sessão expirada (navegação) | Entre como Ana → Perfil → cenário `session-expired` → clique em "Carteiras" → login com aviso e retorno a `/wallets` |
| Sessão expirada (checkout) | Em `/checkout`, aplique `session-expired` → "Confirmar compra" → "Aprovar conexão" → login → volta ao checkout |
| Conflito de cadastro | `/register` com `ana.colecionadora@kurio.test` |
| Favorito com falha | `favorite-fail` → clique no coração → o estado volta e a falha é anunciada |
| Cupom inválido/expirado | No carrinho: `ABC` / `EXPIRADO` |
| Preço/esgotado durante a compra | Carrinho ou checkout aberto → "Alterar preço do Emerald Ape" / "Esgotar edição 1/50" no ambiente de simulação |
| Timeout com idempotência | `localStorage["kurio:http-timeout"]="1500"` + cenário `order-timeout` → finalize; o app recupera o **mesmo** pedido por `GET /api/orders/by-key/:key` |
| Pagamento recusado | `payment-declined` → finalize → "Pagamento recusado", itens preservados |
| Pendente + reconexão | `payment-hold` → finalize → "Derrubar tempo real" → recarregue → o pedido segue pendente sem duplicar; `confirm-order` o confirma |
| Eventos duplicados/antigos | `emit-nft` com versão menor que a atual ou com `eventId` repetido → a UI ignora |

## Testes

```bash
pnpm test:e2e            # 68 execuções (34 casos × desktop + mobile; os específicos de desktop são pulados no mobile)
pnpm test:report         # relatório HTML; traces/vídeos ficam em test-results/ para falhas
```

Cobertura (pasta `e2e/`): busca/filtros/ordenação/paginação/histórico, detalhe direto e inexistente, edição esgotada e limite, skeletons e falhas com nova tentativa, respostas fora de ordem, cadastro/login/expiração/logout/troca de usuário, favoritos com rollback, carrinho/cupom/persistência/mesclagem no login, compra completa até o recibo, recusa de pagamento e de conexão, clique repetido, timeout com recuperação do mesmo pedido, preço e disponibilidade via Socket.IO durante o checkout, eventos duplicados/antigos, desconexão com pedido pendente, perfil/avatar/senha/carteiras com erros da API, cadastro de carteira a partir do pagamento, teclado, foco de diálogos e validação acessível, zoom de 200% e 400% sem overflow (reflow em 640 e 320 px), e regressão visual de início, detalhe, carrinho e pagamento (baselines em `e2e/__screenshots__`).

Cada teste roda num contexto de navegador novo (storage vazio → banco simulado recriado). O relógio é controlado com `page.clock` nos cenários sensíveis a tempo: data fixa nos testes visuais e tempo pausado/avançado manualmente para o pedido pendente (confirmação em 450 ms), o timeout com recuperação idempotente (resposta atrasada 15 s) e os skeletons do cenário lento (1,6 s). A latência vem dos cenários MSW e o disparo de eventos das ações de simulação — os eventos passam pelo `socket.io-client` e o REST pelos handlers MSW.

## Deploy

O build é estático (SPA) e inclui os mocks. `vercel.json` reescreve qualquer rota para `index.html`, permitindo acesso direto e refresh. Em Vercel: framework **Vite**, comando `pnpm build`, saída `dist`.

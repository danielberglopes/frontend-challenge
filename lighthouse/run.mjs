// Auditoria Lighthouse reproduzível: build otimizado + vite preview + cenário padrão dos mocks.
// Uso: pnpm lighthouse            (faz o build antes)
//      pnpm lighthouse --no-build (reaproveita dist/)
import { spawn, execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import * as chromeLauncher from "chrome-launcher"
import lighthouse from "lighthouse"
import desktopConfig from "lighthouse/core/config/desktop-config.js"
import { chromium } from "@playwright/test"
import config from "./config.json" with { type: "json" }

const root = path.resolve(import.meta.dirname, "..")
const outDir = path.join(root, "lighthouse", "reports")
const port = config.port
const base = `http://127.0.0.1:${port}`

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function waitFor(url, timeout = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* servidor ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Servidor não respondeu em ${url}`)
}

if (!process.argv.includes("--no-build")) {
  execSync("pnpm build", { cwd: root, stdio: "inherit" })
}

fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const preview = spawn("pnpm", ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  shell: process.platform === "win32",
  stdio: "ignore",
})

const chromePath = process.env.CHROME_PATH ?? chromium.executablePath()
const results = []

try {
  await waitFor(base)
  for (const page of config.pages) {
    for (const profile of config.profiles) {
      for (let run = 1; run <= config.runs; run += 1) {
        const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] })
        try {
          const options = { port: chrome.port, output: ["html", "json"], logLevel: "error", onlyCategories: config.categories }
          const lhConfig = profile === "desktop" ? desktopConfig : undefined
          const result = await lighthouse(`${base}${page.path}`, options, lhConfig)
          const [html, json] = result.report
          const name = `${page.name}-${profile}-${run}`
          fs.writeFileSync(path.join(outDir, `${name}.report.html`), html)
          fs.writeFileSync(path.join(outDir, `${name}.report.json`), json)
          const lhr = result.lhr
          const entry = {
            page: page.name,
            profile,
            run,
            scores: Object.fromEntries(config.categories.map((key) => [key, Math.round((lhr.categories[key]?.score ?? 0) * 100)])),
            metrics: {
              LCP: Math.round(lhr.audits["largest-contentful-paint"].numericValue),
              CLS: Number(lhr.audits["cumulative-layout-shift"].numericValue.toFixed(3)),
              TBT: Math.round(lhr.audits["total-blocking-time"].numericValue),
            },
            lighthouseVersion: lhr.lighthouseVersion,
            userAgent: lhr.environment.hostUserAgent,
          }
          results.push(entry)
          console.log(name, JSON.stringify(entry.scores), JSON.stringify(entry.metrics))
        } finally {
          await chrome.kill()
        }
      }
    }
  }
} finally {
  preview.kill()
  if (process.platform === "win32" && preview.pid) {
    try {
      execSync(`taskkill /pid ${preview.pid} /T /F`, { stdio: "ignore" })
    } catch {
      /* já encerrado */
    }
  }
}

const groups = []
for (const page of config.pages) {
  for (const profile of config.profiles) {
    const runs = results.filter((entry) => entry.page === page.name && entry.profile === profile)
    groups.push({
      page: page.name,
      path: page.path,
      profile,
      runs: runs.length,
      median: {
        ...Object.fromEntries(config.categories.map((key) => [key, median(runs.map((entry) => entry.scores[key]))])),
        LCP: median(runs.map((entry) => entry.metrics.LCP)),
        CLS: median(runs.map((entry) => entry.metrics.CLS)),
        TBT: median(runs.map((entry) => entry.metrics.TBT)),
      },
    })
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))
const environment = {
  date: new Date().toISOString(),
  lighthouse: results[0]?.lighthouseVersion,
  chrome: results[0]?.userAgent,
  node: process.version,
  os: `${os.type()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model,
  memoryGb: Math.round(os.totalmem() / 1024 ** 3),
  vite: pkg.devDependencies.vite,
  conditions: "vite preview (build de produção) em 127.0.0.1, MSW ativo no cenário 'default', throttling padrão do Lighthouse (mobile: Slow 4G simulado + CPU 4x; desktop: preset desktop)",
}
fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ environment, groups, results }, null, 2))

const table = [
  "| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP (ms) | CLS | TBT (ms) |",
  "|---|---|---|---|---|---|---|---|---|",
  ...groups.map(
    (group) =>
      `| ${group.page} | ${group.profile} | ${group.median.performance} | ${group.median.accessibility} | ${group.median["best-practices"]} | ${group.median.seo} | ${group.median.LCP} | ${group.median.CLS} | ${group.median.TBT} |`,
  ),
].join("\n")
const md = `# Lighthouse — medianas de ${config.runs} execuções\n\n${table}\n\n## Ambiente\n\n${Object.entries(environment)
  .map(([key, value]) => `- **${key}**: ${value}`)
  .join("\n")}\n`
fs.writeFileSync(path.join(outDir, "summary.md"), md)
console.log(`\n${md}`)

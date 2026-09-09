import { spawn, spawnSync } from "child_process"
import fs from "fs"
import path from "path"
import http from "http"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const outputDir = path.join(rootDir, "docs", "screenshots")

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH
  }
  const macPaths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
  ]
  for (const p of macPaths) {
    if (fs.existsSync(p)) return p
  }
  return "google-chrome"
}

function checkPort(port, pathname = "/preview.html") {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}${pathname}`, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 304)
    })
    req.on("error", () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function ensureServer() {
  // If pnpm dev is already running on port 3030, reuse it directly!
  if (await checkPort(3030, "/entrypoints/preview/index.html")) {
    return {
      baseUrl: "http://localhost:3030/entrypoints/preview/index.html",
      kill: () => {}
    }
  }

  // Check if static server on 3333 is already alive
  if (await checkPort(3333, "/preview.html")) {
    return {
      baseUrl: "http://localhost:3333/preview.html",
      kill: () => {}
    }
  }

  console.log("⚡ Building extension for preview...")
  spawnSync("pnpm", ["build"], { cwd: rootDir, stdio: "inherit" })

  console.log("🚀 Starting temporary preview server on port 3333...")
  const server = spawn("python3", ["-m", "http.server", "3333", "--directory", ".output/chrome-mv3"], {
    cwd: rootDir,
    stdio: "ignore"
  })

  // Wait for server to become ready
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300))
    if (await checkPort(3333, "/preview.html")) {
      break
    }
  }

  return {
    baseUrl: "http://localhost:3333/preview.html",
    kill: () => {
      try {
        server.kill()
      } catch {}
    }
  }
}

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error("❌ Google Chrome not found. Please install Chrome or set CHROME_PATH.")
    process.exit(1)
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const server = await ensureServer()

  const tasks = [
    {
      name: "subtitle_panel_subtitles",
      url: `${server.baseUrl}?view=panel&tab=subtitles&pure=1`,
      width: 460,
      height: 720,
      output: path.join(outputDir, "subtitle_panel_subtitles.png")
    },
    {
      name: "subtitle_panel_summary",
      url: `${server.baseUrl}?view=panel&tab=summary&pure=1`,
      width: 460,
      height: 720,
      output: path.join(outputDir, "subtitle_panel_summary.png")
    },
    {
      name: "subtitle_panel_mindmap",
      url: `${server.baseUrl}?view=panel&tab=mindmap&pure=1`,
      width: 460,
      height: 720,
      output: path.join(outputDir, "subtitle_panel_mindmap.png")
    }
  ]

  console.log("\n📸 Capturing screenshots of original TSX components...\n")

  try {
    for (const task of tasks) {
      process.stdout.write(`  Capturing ${task.name}... `)
      const args = [
        "--headless=new",
        "--virtual-time-budget=3000",
        `--window-size=${task.width},${task.height}`,
        `--screenshot=${task.output}`,
        task.url
      ]
      spawnSync(chrome, args, { stdio: "ignore" })
      if (fs.existsSync(task.output)) {
        console.log(`✔ Saved: ${path.relative(rootDir, task.output)}`)
      } else {
        console.log(`❌ Failed to save ${task.name}`)
      }
    }
    console.log("\n✨ All screenshots captured successfully in docs/screenshots/!\n")
  } finally {
    server.kill()
  }
}

main().catch((err) => {
  console.error("Screenshot failed:", err)
  process.exit(1)
})

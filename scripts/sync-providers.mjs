import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.resolve(__dirname, '../config/models-dev-providers.json')

// Standard OpenAI-compatible base URLs for prominent providers where models.dev omits `api`
// because they use custom SDK packages (e.g. @ai-sdk/openai, @ai-sdk/google, @ai-sdk/groq)
const KNOWN_API_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  perplexity: 'https://api.perplexity.ai',
  togetherai: 'https://api.together.xyz/v1',
  xai: 'https://api.x.ai/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
  cerebras: 'https://api.cerebras.ai/v1',
  venice: 'https://api.venice.ai/api/v1',
  aihubmix: 'https://aihubmix.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
}

// Provider ids handled natively by the extension (built-in UI / custom entry).
// They must not come from models.dev to avoid duplicates.
const RESERVED_IDS = new Set(['mind-elixir', 'openai-compatible'])

async function syncProviders() {
  console.log('Fetching providers from https://models.dev/api.json...')
  const res = await fetch('https://models.dev/api.json')
  if (!res.ok) {
    throw new Error(`Failed to fetch models.dev: ${res.status} ${res.statusText}`)
  }

  const raw = await res.json()
  const entries = Object.entries(raw)
  console.log(`Fetched ${entries.length} raw providers.`)

  const providers = []
  const seenBaseUrls = new Set()

  for (const [id, p] of entries) {
    if (RESERVED_IDS.has(id)) continue

    let api = p.api ? String(p.api).replace(/\/+$/, '') : undefined
    if (!api && KNOWN_API_BASE_URLS[id]) {
      api = KNOWN_API_BASE_URLS[id]
    }
    // SDK-only channels (Bedrock / Azure / Vertex / native Anthropic...) cannot
    // be used via the OpenAI-compatible protocol — drop them.
    if (!api) continue

    // Deduplicate by normalized base URL: two entries pointing at the same
    // gateway add no value for a simple OpenAI-compatible client.
    const normalized = api.replace(/\/+$/, '').toLowerCase()
    if (seenBaseUrls.has(normalized)) continue
    seenBaseUrls.add(normalized)

    providers.push({
      id,
      name: p.name || id,
      api,
      doc: p.doc || undefined,
      env: Array.isArray(p.env) && p.env.length > 0 ? p.env[0] : undefined,
    })
  }

  // Sort alphabetically by name
  providers.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(providers, null, 2) + '\n', 'utf8')
  console.log(`Successfully synced ${providers.length} providers to ${OUTPUT_PATH}`)
}

syncProviders().catch(err => {
  console.error('Error syncing providers:', err)
  process.exit(1)
})

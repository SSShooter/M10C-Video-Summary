import { storage } from "@wxt-dev/storage"

/**
 * ── V2 (legacy, read-only) ────────────────────────────────────────────────
 * Old single-provider config shape. Kept for one-shot migration into V3.
 */
export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface AIConfig {
  activeProvider: string
  replyLanguage?: string
  providers: Record<string, ProviderConfig>
}

/**
 * ── V3 (current) ──────────────────────────────────────────────────────────
 * Multi-model config: users can save any number of model entries and pick a
 * default one. The built-in Mind Elixir model always exists and stays first.
 */
export interface AIModelConfig {
  id: string
  /** Display name chosen by the user. */
  name: string
  /** Provider id: a models.dev id, "openai-compatible", or a legacy V2 id. */
  provider: string
  apiKey?: string
  model: string
  baseUrl?: string
}

export interface AIModelsConfig {
  models: AIModelConfig[]
  defaultModelId: string
  replyLanguage?: string
}

export const AI_MODELS_CONFIG_KEY = "local:aiConfigV3"
const LEGACY_AI_CONFIG_KEY = "local:aiConfigV2"

export const MIND_ELIXIR_MODEL_ID = "mind-elixir"

// Shared default config for the built-in Mind Elixir provider.
// No API key required — the backend uses the project's own balance.
export const DEFAULT_MIND_ELIXIR_PROVIDER: ProviderConfig = {
  apiKey: "mind-elixir",
  model: "MindElixirStar",
  baseUrl: `${import.meta.env.WXT_BACKEND_BASE_URL}/api/v1`
}

export function createBuiltInModel(): AIModelConfig {
  return {
    id: MIND_ELIXIR_MODEL_ID,
    name: "Mind Elixir",
    provider: MIND_ELIXIR_MODEL_ID,
    apiKey: DEFAULT_MIND_ELIXIR_PROVIDER.apiKey,
    model: DEFAULT_MIND_ELIXIR_PROVIDER.model!,
    baseUrl: DEFAULT_MIND_ELIXIR_PROVIDER.baseUrl
  }
}

export function isMindElixirModel(model?: AIModelConfig | null): boolean {
  return (
    !!model &&
    (model.id === MIND_ELIXIR_MODEL_ID || model.provider === MIND_ELIXIR_MODEL_ID)
  )
}

/**
 * Migrate a legacy V2 config (one active provider + per-provider settings)
 * into the V3 multi-model shape. The provider that was active becomes the
 * default model; all configured providers become model entries.
 */
export function migrateLegacyConfig(legacy: AIConfig): AIModelsConfig {
  const models: AIModelConfig[] = [createBuiltInModel()]

  for (const [providerId, cfg] of Object.entries(legacy.providers || {})) {
    if (providerId === MIND_ELIXIR_MODEL_ID) continue
    if (!cfg?.apiKey && !cfg?.baseUrl) continue
    models.push({
      id: `${providerId}`,
      name: providerId,
      provider: providerId,
      apiKey: cfg.apiKey,
      model: cfg.model || "",
      baseUrl: cfg.baseUrl
    })
  }

  let defaultModelId = MIND_ELIXIR_MODEL_ID
  const active = legacy.activeProvider
  if (active && active !== MIND_ELIXIR_MODEL_ID) {
    const activeModel = models.find((m) => m.provider === active)
    if (activeModel) defaultModelId = activeModel.id
  }

  return { models, defaultModelId, replyLanguage: legacy.replyLanguage }
}

/**
 * Load the V3 multi-model config. Falls back to migrating the legacy V2
 * config when V3 is absent, so existing users keep their provider settings.
 */
export async function loadAIModelsConfig(): Promise<AIModelsConfig | null> {
  try {
    const config = await storage.getItem<AIModelsConfig>(AI_MODELS_CONFIG_KEY)
    if (config && Array.isArray(config.models) && config.models.length > 0) {
      // Normalize the built-in model name (older versions stored a ⭐ suffix).
      for (const m of config.models) {
        if (isMindElixirModel(m) && m.name.includes("⭐")) {
          m.name = m.name.replaceAll("⭐", "").trim()
        }
      }
      return config
    }

    const legacy = await storage.getItem<AIConfig>(LEGACY_AI_CONFIG_KEY)
    if (legacy) {
      const migrated = migrateLegacyConfig(legacy)
      await storage.setItem(AI_MODELS_CONFIG_KEY, migrated)
      return migrated
    }

    return null
  } catch (error) {
    console.error("获取AI配置失败:", error)
    return null
  }
}

export async function saveAIModelsConfig(config: AIModelsConfig): Promise<void> {
  await storage.setItem(AI_MODELS_CONFIG_KEY, config)
}

export function getDefaultModel(
  config: AIModelsConfig | null
): AIModelConfig | null {
  if (!config || config.models.length === 0) return null
  return (
    config.models.find((m) => m.id === config.defaultModelId) || config.models[0]
  )
}

export function isAIConfigured(config: AIModelsConfig | null): boolean {
  const model = getDefaultModel(config)
  if (!model) return false
  if (isMindElixirModel(model)) return true
  return !!model.apiKey?.trim()
}

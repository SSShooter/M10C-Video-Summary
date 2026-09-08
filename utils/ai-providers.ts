import modelsDevProvidersJson from "~/config/models-dev-providers.json"

/**
 * Provider metadata sourced from models.dev (see scripts/sync-providers.mjs).
 * Every entry speaks the OpenAI-compatible protocol at `api`.
 */
export interface ModelsDevProvider {
  id: string
  name: string
  api: string
  doc?: string
  env?: string
}

export const MODELS_DEV_PROVIDERS = modelsDevProvidersJson as ModelsDevProvider[]

/** Generic custom entry — the only provider whose base URL is user-editable. */
export const CUSTOM_PROVIDER_ID = "openai-compatible"

/**
 * Legacy V2 provider ids that are not part of models.dev. They keep their
 * native base URLs (and native request handlers in the background worker).
 */
export const LEGACY_PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  claude: "https://api.anthropic.com/v1",
  openrouter: "https://openrouter.ai/api/v1"
}

export function getProviderConfig(providerId: string): ModelsDevProvider | null {
  return MODELS_DEV_PROVIDERS.find((p) => p.id === providerId) || null
}

/**
 * Resolve the default base URL for a provider:
 * models.dev entry → legacy built-in URL → undefined (user must supply one).
 */
export function getProviderBaseUrl(providerId: string): string | undefined {
  return (
    getProviderConfig(providerId)?.api || LEGACY_PROVIDER_BASE_URLS[providerId]
  )
}

export function getProviderLabel(providerId: string): string {
  if (providerId === "mind-elixir") return "Mind Elixir"
  if (providerId === CUSTOM_PROVIDER_ID) return "OpenAI Compatible API"
  return getProviderConfig(providerId)?.name || providerId
}

export interface ProviderOption {
  id: string
  name: string
  /** Default base URL (empty for the custom entry). */
  baseUrl: string
  /** Whether the base URL is user-editable. */
  baseUrlEditable: boolean
  /** Environment-variable name of the API key, used as input placeholder. */
  env?: string
  doc?: string
}

/**
 * Options for the searchable provider dropdown in the add/edit model form.
 * The custom entry comes first, then all models.dev providers (alphabetical).
 */
export function getProviderOptions(): ProviderOption[] {
  return [
    {
      id: CUSTOM_PROVIDER_ID,
      name: getProviderLabel(CUSTOM_PROVIDER_ID),
      baseUrl: "",
      baseUrlEditable: true
    },
    ...MODELS_DEV_PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      baseUrl: p.api,
      baseUrlEditable: false,
      env: p.env,
      doc: p.doc
    }))
  ]
}

/**
 * Fetch the model list from an OpenAI-compatible `${baseUrl}/models` endpoint.
 */
export async function fetchOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  if (!baseUrl || !apiKey) return []
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data?.map((m: { id: string }) => m.id) || []).sort()
  } catch (error) {
    console.error("Failed to fetch models:", error)
    return []
  }
}

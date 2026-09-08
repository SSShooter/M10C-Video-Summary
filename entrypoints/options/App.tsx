import {
  Check,
  Star,
  RefreshCw,
  LogOut,
  LogIn,
  User,
  Plus,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  Search
} from "lucide-react"
import { useEffect, useMemo, useState, useRef } from "react"
import { storage } from "@wxt-dev/storage"
import iconBase64 from "~/assets/icon.png"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import { cn } from "~/lib/utils"
import { t, getMatchedBrowserLanguage } from "~/utils/i18n"
import type { AIModelConfig, AIModelsConfig } from "~/utils/ai-service"
import {
  MIND_ELIXIR_MODEL_ID,
  createBuiltInModel,
  isMindElixirModel,
  loadAIModelsConfig,
  saveAIModelsConfig
} from "~/utils/ai-service"
import {
  getProviderLabel,
  getProviderOptions,
  fetchOpenAICompatibleModels
} from "~/utils/ai-providers"
import type { ProviderOption } from "~/utils/ai-providers"

const REPLY_LANGUAGES = [
  { id: "en", name: "English" },
  { id: "zh-CN", name: "中文" },
  { id: "zh-TW", name: "繁體中文" },
  { id: "ja", name: "日本語" },
  { id: "ko", name: "한국어" },
  { id: "fr", name: "Français" },
  { id: "de", name: "Deutsch" },
  { id: "es", name: "Español" },
  { id: "pt", name: "Português" },
  { id: "ru", name: "Русский" }
]

interface UserData {
  _id?: string
  id?: string
  name?: string
  email?: string
  image?: string
  star?: number
}

const BACKEND_BASE_URL = import.meta.env.WXT_BACKEND_BASE_URL

function createInitialConfig(): AIModelsConfig {
  return {
    models: [createBuiltInModel()],
    defaultModelId: MIND_ELIXIR_MODEL_ID,
    replyLanguage: getMatchedBrowserLanguage(navigator.language)
  }
}

function OptionsPage() {
  const [aiConfig, setAiConfig] = useState<AIModelsConfig>(createInitialConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ── Model edit form state ────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<AIModelConfig>>({})
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([])
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [providerSearch, setProviderSearch] = useState("")
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const providerSearchRef = useRef<HTMLInputElement>(null)

  const [user, setUser] = useState<UserData | null>(null)
  const [loadingUser, setLoadingUser] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }

  const startPolling = () => {
    stopPolling()
    setIsPolling(true)
    let attempts = 0
    const maxAttempts = 20 // 20 attempts * 5 seconds = 1.6 minutes

    pollingIntervalRef.current = setInterval(async () => {
      attempts++
      const userData = await fetchUser(true) // Silent check
      if (userData) {
        stopPolling()
        ensureBuiltInModelSaved()
      }
      if (attempts >= maxAttempts) {
        stopPolling()
      }
    }, 5000)
  }

  const fetchUser = async (silent = false) => {
    if (!silent) setLoadingUser(true)
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/user`, {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        if (data.data) {
          setUser(data.data)
          // Unlock the m10c badge for the user
          try {
            const badgeKey = `local:m10cBadgeUnlocked:${data.data.id || data.data._id || data.data.email || "guest"}` as `local:${string}`
            const hasBadge = await storage.getItem<boolean>(badgeKey)
            if (!hasBadge) {
              const badgeRes = await fetch(`${BACKEND_BASE_URL}/api/user/badge/m10c`, {
                method: "POST",
                credentials: "include"
              })
              if (badgeRes.ok) {
                await storage.setItem(badgeKey, true)
              }
            }
          } catch (badgeError) {
            console.error("Failed to unlock m10c badge:", badgeError)
          }
          return data.data
        } else {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    } catch (error) {
      console.error("Fetch user failed:", error)
      setUser(null)
    } finally {
      if (!silent) setLoadingUser(false)
    }
    return null
  }

  const handleLogout = async () => {
    stopPolling()
    try {
      await fetch(`${BACKEND_BASE_URL}/api/user/logout`, {
        method: "POST",
        credentials: "include"
      })
    } catch (error) {
      console.error("Logout failed:", error)
    } finally {
      setUser(null)
    }
  }

  const handleLogin = () => {
    window.open(`${BACKEND_BASE_URL}/oauth/authme/login/cloud`, "_blank")
    startPolling()
  }

  useEffect(() => {
    loadConfig()
    fetchUser()
    setProviderOptions(getProviderOptions())

    const handleFocus = () => {
      fetchUser(true)
    }
    window.addEventListener("focus", handleFocus)

    return () => {
      stopPolling()
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  const loadConfig = async () => {
    try {
      const config = await loadAIModelsConfig()
      if (config) {
        if (!config.replyLanguage || config.replyLanguage === "auto") {
          config.replyLanguage = getMatchedBrowserLanguage(navigator.language)
        }
        setAiConfig(config)
      }
    } catch (error) {
      console.error(t("loadConfigFailed"), error)
    }
  }

  const persistConfig = async (next: AIModelsConfig) => {
    setAiConfig(next)
    try {
      await saveAIModelsConfig(next)
    } catch (error) {
      console.error(t("saveConfigFailed"), error)
    }
  }

  // Ensure a config exists in storage after login, so the popup sees the
  // extension as configured. No-op when V3 (or migratable V2) data exists.
  const ensureBuiltInModelSaved = async () => {
    const stored = await loadAIModelsConfig()
    if (stored) return
    persistConfig(createInitialConfig())
  }

  const saveConfig = async () => {
    try {
      setSaving(true)
      await saveAIModelsConfig(aiConfig)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error(t("saveConfigFailed"), error)
    } finally {
      setSaving(false)
    }
  }

  // ── Model form helpers ───────────────────────────────────────────────────

  const isCustomProvider = formData.provider === "openai-compatible"

  const selectedProviderOption = providerOptions.find(
    (p) => p.id === formData.provider
  )

  const filteredProviderOptions = useMemo(() => {
    const q = providerSearch.trim().toLowerCase()
    if (!q) return providerOptions
    return providerOptions.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    )
  }, [providerOptions, providerSearch])

  const loadModelOptions = async (baseUrl?: string, apiKey?: string) => {
    if (!baseUrl || !apiKey) {
      setModelOptions([])
      return
    }
    setFetchingModels(true)
    const models = await fetchOpenAICompatibleModels(baseUrl, apiKey)
    setModelOptions(models)
    setFetchingModels(false)
  }

  const handleOpenAddForm = () => {
    setEditingModelId(null)
    setFormData({
      name: "",
      provider: "",
      apiKey: "",
      model: "",
      baseUrl: ""
    })
    setModelOptions([])
    setProviderSearch("")
    setHasSubmitted(false)
    setFormOpen(true)
  }

  const handleOpenEditForm = (model: AIModelConfig) => {
    if (isMindElixirModel(model)) return
    setEditingModelId(model.id)
    setFormData({ ...model })
    setModelOptions([])
    setProviderSearch("")
    setHasSubmitted(false)
    setFormOpen(true)
    if (model.apiKey && model.baseUrl) {
      loadModelOptions(model.baseUrl, model.apiKey)
    }
  }

  const handleOpenCopyForm = (model: AIModelConfig) => {
    if (isMindElixirModel(model)) return
    setEditingModelId(null)
    setFormData({
      name: `${model.name} (${t("copy")})`,
      provider: model.provider,
      apiKey: model.apiKey,
      model: model.model,
      baseUrl: model.baseUrl
    })
    setModelOptions([])
    setProviderSearch("")
    setHasSubmitted(false)
    setFormOpen(true)
    if (model.apiKey && model.baseUrl) {
      loadModelOptions(model.baseUrl, model.apiKey)
    }
  }

  const handleCloseForm = () => {
    setFormOpen(false)
    setEditingModelId(null)
    setFormData({})
    setHasSubmitted(false)
    setProviderDropdownOpen(false)
    setModelDropdownOpen(false)
  }

  const handleFormProviderChange = (providerId: string) => {
    const option = providerOptions.find((p) => p.id === providerId)
    setFormData((prev) => ({
      ...prev,
      provider: providerId,
      baseUrl: option?.baseUrlEditable ? "" : option?.baseUrl || ""
    }))
    setProviderDropdownOpen(false)
    setProviderSearch("")
    if (formData.apiKey && option?.baseUrl) {
      loadModelOptions(option.baseUrl, formData.apiKey)
    } else {
      setModelOptions([])
    }
  }

  const handleFormApiKeyChange = (apiKey: string) => {
    setFormData((prev) => ({ ...prev, apiKey }))
    if (formData.baseUrl && apiKey) {
      loadModelOptions(formData.baseUrl, apiKey)
    } else {
      setModelOptions([])
    }
  }

  const handleFormBaseUrlChange = (baseUrl: string) => {
    setFormData((prev) => ({ ...prev, baseUrl }))
    if (apiKeyReadyForFetch(baseUrl)) {
      loadModelOptions(baseUrl, formData.apiKey)
    } else {
      setModelOptions([])
    }
  }

  const apiKeyReadyForFetch = (_baseUrl: string) => !!formData.apiKey?.trim()

  const handleDeleteModel = (id: string) => {
    const model = aiConfig.models.find((m) => m.id === id)
    if (!model || isMindElixirModel(model)) return
    const models = aiConfig.models.filter((m) => m.id !== id)
    const defaultModelId =
      aiConfig.defaultModelId === id ? MIND_ELIXIR_MODEL_ID : aiConfig.defaultModelId
    persistConfig({ ...aiConfig, models, defaultModelId })
  }

  const handleSaveModel = () => {
    const isInvalid =
      !formData.name?.trim() ||
      !formData.provider ||
      !formData.apiKey?.trim() ||
      !formData.model?.trim() ||
      (isCustomProvider && !formData.baseUrl?.trim())

    if (isInvalid) {
      setHasSubmitted(true)
      return
    }

    let models: AIModelConfig[]
    let defaultModelId = aiConfig.defaultModelId

    if (editingModelId) {
      models = aiConfig.models.map((m) =>
        m.id === editingModelId
          ? {
              ...m,
              name: formData.name!.trim(),
              provider: formData.provider!,
              apiKey: formData.apiKey,
              model: formData.model!.trim(),
              baseUrl: formData.baseUrl || undefined
            }
          : m
      )
    } else {
      const newModel: AIModelConfig = {
        id: Date.now().toString(),
        name: formData.name!.trim(),
        provider: formData.provider!,
        apiKey: formData.apiKey,
        model: formData.model!.trim(),
        baseUrl: formData.baseUrl || undefined
      }
      models = [...aiConfig.models, newModel]
      // First custom model becomes the default so it is used right away.
      if (aiConfig.defaultModelId === MIND_ELIXIR_MODEL_ID) {
        defaultModelId = newModel.id
      }
    }

    persistConfig({ ...aiConfig, models, defaultModelId })
    handleCloseForm()
  }

  const defaultModel =
    aiConfig.models.find((m) => m.id === aiConfig.defaultModelId) ||
    aiConfig.models[0]
  const isDefaultMindElixir = isMindElixirModel(defaultModel)

  const currentModelLabel = (model: AIModelConfig) =>
    `${getProviderLabel(model.provider)} · ${model.model}`

  return (
    <div className="min-h-screen bg-background">
      <div className="w-[680px] mx-auto py-10 px-4 sm:px-6">
        <div className="mb-8 pb-4 border-b border-border flex items-center gap-3">
          <img
            src={iconBase64}
            alt="M10C"
            className="w-10 h-10 rounded-lg"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
             M10C {t("optionsTitle")}
            </h1>
          </div>
        </div>

        <div className="space-y-5">
        {/* ── Model list ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium text-foreground">
              {t("aiModels")}
            </Label>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleOpenAddForm}>
              <Plus className="h-3.5 w-3.5" />
              {t("addModel")}
            </Button>
          </div>

          {/* Add / edit form */}
          {formOpen && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {editingModelId ? t("editModel") : t("addModel")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleCloseForm}>
                  {t("close")}
                </Button>
              </div>

              <div className="space-y-1">
                <Label htmlFor="model-name" className="text-xs font-medium text-foreground">
                  {t("modelName")}
                </Label>
                <Input
                  id="model-name"
                  type="text"
                  className={cn(
                    "h-9 text-sm",
                    hasSubmitted && !formData.name?.trim() && "border-destructive focus-visible:ring-destructive"
                  )}
                  value={formData.name || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("modelNamePlaceholder")}
                />
              </div>

              {/* Searchable provider dropdown */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-foreground">
                  {t("aiProvider")}
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    className={cn(
                      "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm",
                      hasSubmitted && !formData.provider && "border-destructive"
                    )}
                    onClick={() => {
                      setProviderDropdownOpen((v) => !v)
                      setTimeout(() => providerSearchRef.current?.focus(), 0)
                    }}>
                    <span className={cn(!formData.provider && "text-muted-foreground")}>
                      {formData.provider
                        ? getProviderLabel(formData.provider)
                        : t("searchProvider")}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 opacity-50 transition-transform",
                        providerDropdownOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {providerDropdownOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md">
                      <div className="p-2 border-b border-border">
                        <div className="relative">
                          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            ref={providerSearchRef}
                            className="h-8 pl-7 text-xs"
                            value={providerSearch}
                            onChange={(e) => setProviderSearch(e.target.value)}
                            placeholder={t("searchProvider")}
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1">
                        {filteredProviderOptions.map((opt) => (
                          <div
                            key={opt.id}
                            className={cn(
                              "flex items-center justify-between px-2 py-1.5 text-xs rounded-sm cursor-pointer hover:bg-accent",
                              formData.provider === opt.id && "bg-accent"
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleFormProviderChange(opt.id)
                            }}>
                            <span className="truncate">{opt.name}</span>
                            <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                              {opt.id}
                            </span>
                          </div>
                        ))}
                        {filteredProviderOptions.length === 0 && (
                          <div className="py-4 text-center text-xs text-muted-foreground">
                            {t("noProvidersFound")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="model-base-url" className="text-xs font-medium text-foreground">
                  {t("apiAddress")}
                </Label>
                <Input
                  id="model-base-url"
                  type="text"
                  className={cn(
                    "h-9 text-sm",
                    hasSubmitted && isCustomProvider && !formData.baseUrl?.trim() && "border-destructive focus-visible:ring-destructive"
                  )}
                  disabled={!isCustomProvider}
                  value={formData.baseUrl || ""}
                  onChange={(e) => handleFormBaseUrlChange(e.target.value)}
                  placeholder={selectedProviderOption?.baseUrl || "https://api.example.com/v1"}
                />
                {!isCustomProvider && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t("baseUrlLockedTip")}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="model-api-key" className="text-xs font-medium text-foreground">
                  {t("apiKey")}
                </Label>
                <Input
                  id="model-api-key"
                  type="password"
                  className={cn(
                    "h-9 text-sm",
                    hasSubmitted && !formData.apiKey?.trim() && "border-destructive focus-visible:ring-destructive"
                  )}
                  value={formData.apiKey || ""}
                  onChange={(e) => handleFormApiKeyChange(e.target.value)}
                  placeholder={
                    selectedProviderOption?.env ||
                    t("enterApiKeyPlaceholder", getProviderLabel(formData.provider || ""))
                  }
                />
              </div>

              {/* Model input with dropdown */}
              <div className="space-y-1">
                <Label htmlFor="model-id" className="text-xs font-medium text-foreground">
                  {t("modelSelection")}
                </Label>
                <div className="relative">
                  <Input
                    className={cn(
                      "h-9 text-sm",
                      hasSubmitted && !formData.model?.trim() && "border-destructive focus-visible:ring-destructive"
                    )}
                    value={formData.model || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, model: e.target.value })
                      setModelDropdownOpen(true)
                    }}
                    onFocus={() => setModelDropdownOpen(true)}
                    onBlur={() => {
                      setTimeout(() => setModelDropdownOpen(false), 150)
                    }}
                    placeholder={t("enterCustomModelName")}
                  />
                  {modelDropdownOpen && modelOptions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md">
                      <div className="max-h-[180px] overflow-y-auto p-1">
                        {modelOptions
                          .filter((m) =>
                            m
                              .toLowerCase()
                              .includes((formData.model || "").toLowerCase())
                          )
                          .map((m) => (
                            <div
                              key={m}
                              className={cn(
                                "flex items-center px-2 py-1.5 text-xs rounded-sm cursor-pointer hover:bg-accent",
                                formData.model === m && "bg-accent"
                              )}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setFormData({ ...formData, model: m })
                                setModelDropdownOpen(false)
                              }}>
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
                                  formData.model === m ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {m}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formData.baseUrl && formData.apiKey
                    ? t("supportsAutoFetchModels")
                    : t("notSupportsAutoFetchModels")}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCloseForm}>
                  {t("close")}
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={handleSaveModel}>
                  {t("saveConfig")}
                </Button>
              </div>
            </div>
          )}

          {/* Model rows */}
          <RadioGroup
            value={aiConfig.defaultModelId}
            onValueChange={(id) => persistConfig({ ...aiConfig, defaultModelId: id })}
            className="space-y-2">
            {aiConfig.models.map((model) => {
              const builtIn = isMindElixirModel(model)
              return (
                <div
                  key={model.id}
                  className={cn(
                    "flex items-center justify-between p-3 border rounded-lg",
                    model.id === aiConfig.defaultModelId && "border-primary/50 bg-primary/5"
                  )}>
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <RadioGroupItem value={model.id} id={`model-${model.id}`} />
                    <Label
                      htmlFor={`model-${model.id}`}
                      className="flex-1 cursor-pointer min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        {builtIn && (
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
                        )}
                        <span className="truncate">{model.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {currentModelLabel(model)}
                      </div>
                    </Label>
                  </div>
                  {!builtIn && (
                    <div className="flex items-center space-x-0.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenCopyForm(model)}
                        title={t("copyModel")}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenEditForm(model)}
                        title={t("editModel")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                        onClick={() => handleDeleteModel(model.id)}
                        title={t("deleteModel")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </RadioGroup>
          <p className="text-[10px] text-muted-foreground">
            {t("defaultModelTip")}
          </p>
        </div>

        {/* Mind Elixir built-in panel (shown when it is the default model) */}
        {isDefaultMindElixir && (
          <div className="rounded-lg border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
            <p className="text-xs font-medium text-amber-900/90 dark:text-amber-200/90">
              {t("meProviderDesc")}
            </p>

            <div className="border-t border-amber-200/50 dark:border-amber-800/30 pt-3">
              {loadingUser ? (
                <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                  <span>{t("loading")}</span>
                </div>
              ) : user ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={user.name || ""}
                        className="h-8 w-8 rounded-full border border-amber-200 dark:border-amber-800/50 shadow-sm"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-800/50 shadow-sm text-xs">
                        {user.name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold text-amber-950 dark:text-amber-100 truncate">
                        {user.name}
                      </span>
                      <span className="text-[10px] text-amber-800/70 dark:text-amber-300/70 truncate">
                        {user.email}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-950/40 px-2.5 py-1.5 rounded-lg border border-yellow-200/50 dark:border-yellow-800/20">
                      <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500 animate-pulse" />
                      <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400">
                        {user.star?.toFixed(2) || "0.00"}
                      </span>
                      <span className="text-[10px] font-medium text-yellow-600/80 dark:text-yellow-500/80 ml-0.5">
                        {t("starBalance")}
                      </span>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchUser()}
                      className="h-8 text-xs gap-1 text-amber-800 hover:text-amber-950 hover:bg-amber-100/50 dark:text-amber-200 dark:hover:text-amber-50 dark:hover:bg-amber-900/30"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>{t("refreshBalance")}</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLogout}
                      className="h-8 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>{t("logout")}</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-medium text-amber-900 dark:text-amber-200 truncate">
                      {t("notLoggedIn")}
                    </p>
                    <p className="text-[10px] text-amber-800/70 dark:text-amber-300/70 truncate">
                      {t("loginDescription")}
                    </p>
                  </div>
                  <Button
                    onClick={handleLogin}
                    disabled={isPolling}
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 h-8 text-xs px-3 rounded-lg shadow-sm border border-amber-700/20 flex-shrink-0"
                  >
                    {isPolling ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogIn className="h-3.5 w-3.5" />
                    )}
                    <span>{isPolling ? t("connecting") : t("clickToLogin")}</span>
                  </Button>
                </div>
              )}
            </div>

            <p className="text-[10px] text-amber-800/60 dark:text-amber-300/60 border-t border-amber-200/30 dark:border-amber-800/20 pt-2">
              {t("meProviderRecharge")}{" "}
              <a
                href="https://app.mind-elixir.com/recharge"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
              >
                app.mind-elixir.com
              </a>
            </p>
          </div>
        )}

        <div className="space-y-1 border-t border-border pt-4 mt-2">
          <Label htmlFor="reply-language" className="text-sm font-medium text-foreground">{t("aiReplyLanguage")}</Label>
          <Select
            value={aiConfig.replyLanguage || getMatchedBrowserLanguage(navigator.language)}
            onValueChange={(value) =>
              setAiConfig({ ...aiConfig, replyLanguage: value })
            }>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPLY_LANGUAGES.map((lang) => (
                <SelectItem key={lang.id} value={lang.id}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("aiReplyLanguageTip")}
          </p>
        </div>

        <div className="pt-2">
          <Button
            onClick={saveConfig}
            disabled={saving}
            className={cn("w-full h-10 text-sm font-semibold", saved ? "bg-green-600 hover:bg-green-700" : "")}>
            {saving ? t("saving") : saved ? t("saved") : t("saveConfig")}
          </Button>
        </div>
      </div>

      </div>
    </div>
  )
}

export default OptionsPage

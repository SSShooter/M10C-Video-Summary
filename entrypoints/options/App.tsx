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
  Search,
  Eye,
  EyeOff,
  X
} from "lucide-react"
import { useEffect, useMemo, useState, useRef } from "react"
import { toast } from "sonner"
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
import { Toaster } from "~/components/ui/sonner"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"
import { t, getMatchedBrowserLanguage, SUPPORTED_LANGUAGES } from "~/utils/i18n"
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
  const [showApiKey, setShowApiKey] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([])
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [providerSearch, setProviderSearch] = useState("")
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  const providerSearchRef = useRef<HTMLInputElement>(null)
  const providerDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

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
      toast.success(t("saved") || "Configuration saved")
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error(t("saveConfigFailed"), error)
      toast.error(t("saveConfigFailed") || "Failed to save configuration")
    } finally {
      setSaving(false)
    }
  }

  // ── Dropdown outside-click & keyboard dismissal ───────────────────────────
  const isAnyDropdownOpenRef = useRef(false)
  isAnyDropdownOpenRef.current = providerDropdownOpen || modelDropdownOpen

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        providerDropdownRef.current &&
        !providerDropdownRef.current.contains(event.target as Node)
      ) {
        setProviderDropdownOpen(false)
      }
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(event.target as Node)
      ) {
        setModelDropdownOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isAnyDropdownOpenRef.current) {
          event.preventDefault()
          setProviderDropdownOpen(false)
          setModelDropdownOpen(false)
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

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
    if (!baseUrl || !apiKey?.trim()) {
      setModelOptions([])
      return
    }
    setFetchingModels(true)
    try {
      const models = await fetchOpenAICompatibleModels(baseUrl, apiKey.trim())
      setModelOptions(models)
    } catch (error) {
      console.error("Failed to fetch models:", error)
      setModelOptions([])
    } finally {
      setFetchingModels(false)
    }
  }

  // Debounced auto-fetch models when baseUrl or apiKey changes
  useEffect(() => {
    if (!formOpen) return
    const baseUrl = formData.baseUrl?.trim()
    const apiKey = formData.apiKey?.trim()
    if (!baseUrl || !apiKey) {
      setModelOptions([])
      return
    }
    const timer = setTimeout(() => {
      loadModelOptions(baseUrl, apiKey)
    }, 400)
    return () => clearTimeout(timer)
  }, [formData.baseUrl, formData.apiKey, formOpen])

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
    setShowApiKey(false)
    setHasSubmitted(false)
    setFormOpen(true)
  }

  const handleOpenEditForm = (model: AIModelConfig) => {
    if (isMindElixirModel(model)) return
    setEditingModelId(model.id)
    setFormData({ ...model })
    setModelOptions([])
    setProviderSearch("")
    setShowApiKey(false)
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
    setShowApiKey(false)
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
    setShowApiKey(false)
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
  }

  const handleFormApiKeyChange = (apiKey: string) => {
    setFormData((prev) => ({ ...prev, apiKey }))
  }

  const handleFormBaseUrlChange = (baseUrl: string) => {
    setFormData((prev) => ({ ...prev, baseUrl }))
  }

  const handleDeleteModel = (id: string) => {
    const model = aiConfig.models.find((m) => m.id === id)
    if (!model || isMindElixirModel(model)) return
    const models = aiConfig.models.filter((m) => m.id !== id)
    const defaultModelId =
      aiConfig.defaultModelId === id ? MIND_ELIXIR_MODEL_ID : aiConfig.defaultModelId
    persistConfig({ ...aiConfig, models, defaultModelId })
    toast.success(`${t("deleteModel")}: ${model.name}`)
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
      toast.error(t("saveConfigFailed") || "Please fill in all required fields")
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
              apiKey: formData.apiKey!.trim(),
              model: formData.model!.trim(),
              baseUrl: formData.baseUrl?.trim() || undefined
            }
          : m
      )
      toast.success(t("saved") || "Model updated")
    } else {
      const newModel: AIModelConfig = {
        id: Date.now().toString(),
        name: formData.name!.trim(),
        provider: formData.provider!,
        apiKey: formData.apiKey!.trim(),
        model: formData.model!.trim(),
        baseUrl: formData.baseUrl?.trim() || undefined
      }
      models = [...aiConfig.models, newModel]
      // First custom model becomes the default so it is used right away.
      if (aiConfig.defaultModelId === MIND_ELIXIR_MODEL_ID) {
        defaultModelId = newModel.id
      }
      toast.success(t("saved") || "Model added")
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="w-full max-w-[680px] mx-auto py-8 sm:py-12 px-4 sm:px-6">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="mb-8 pb-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={iconBase64}
              alt="M10C"
              className="w-10 h-10 rounded-xl shadow-xs shrink-0"
            />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                M10C {t("optionsTitle")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("aiServiceConfig")}
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-8">
          {/* ── AI Models Section ──────────────────────────────────────────── */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {t("aiModels")}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("defaultModelTip")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 shrink-0 self-start sm:self-auto"
                onClick={handleOpenAddForm}>
                <Plus className="h-3.5 w-3.5" />
                {t("addModel")}
              </Button>
            </div>

            {/* Model rows */}
            <RadioGroup
              value={aiConfig.defaultModelId}
              onValueChange={(id) => persistConfig({ ...aiConfig, defaultModelId: id })}
              className="space-y-2.5">
              {aiConfig.models.map((model) => {
                const builtIn = isMindElixirModel(model)
                const isSelected = model.id === aiConfig.defaultModelId
                return (
                  <div
                    key={model.id}
                    onClick={() => {
                      if (aiConfig.defaultModelId !== model.id) {
                        persistConfig({ ...aiConfig, defaultModelId: model.id })
                      }
                    }}
                    className={cn(
                      "border rounded-xl transition-all duration-150 overflow-hidden cursor-pointer",
                      isSelected
                        ? "border-primary/50 bg-primary/[0.03] shadow-xs ring-1 ring-primary/20"
                        : "border-border/80 hover:border-border hover:bg-muted/10"
                    )}>
                    <div className="flex items-center justify-between p-3.5 sm:p-4 gap-3">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <RadioGroupItem
                          value={model.id}
                          id={`model-${model.id}`}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Label
                          htmlFor={`model-${model.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 cursor-pointer min-w-0 space-y-0.5">
                          <div className="text-sm font-medium flex items-center gap-1.5 text-foreground">
                            {builtIn && (
                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                            <span className="truncate">{model.name}</span>
                            {isSelected && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary shrink-0">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {currentModelLabel(model)}
                          </div>
                        </Label>
                      </div>
                      {!builtIn && (
                        <div
                          className="flex items-center space-x-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteId === model.id ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                              <span className="text-xs text-destructive font-medium hidden sm:inline">
                                {t("deleteModel")}?
                              </span>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 px-2.5 text-xs font-medium"
                                onClick={() => {
                                  handleDeleteModel(model.id)
                                  setConfirmDeleteId(null)
                                }}>
                                {t("deleteModel")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setConfirmDeleteId(null)}>
                                {t("close")}
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenCopyForm(model)}
                                title={t("copyModel")}>
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenEditForm(model)}
                                title={t("editModel")}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmDeleteId(model.id)}
                                title={t("deleteModel")}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mind Elixir built-in panel (shown directly attached when it is the default model) */}
                    {builtIn && isSelected && (
                      <div className="border-t border-amber-300/40 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
                        <p className="text-xs font-medium text-amber-900/90 dark:text-amber-200/90">
                          {t("meProviderDesc")}
                        </p>

                        <div className="border-t border-amber-200/60 dark:border-amber-800/40 pt-3">
                          {loadingUser ? (
                            <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                              <span>{t("loading")}</span>
                            </div>
                          ) : user ? (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                {user.image && !avatarError ? (
                                  <img
                                    src={user.image}
                                    alt={user.name || ""}
                                    onError={() => setAvatarError(true)}
                                    className="h-8 w-8 rounded-full border border-amber-200 dark:border-amber-800/50 shadow-xs shrink-0 object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-800/50 shadow-xs text-xs shrink-0">
                                    {user.name?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                                  </div>
                                )}
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold text-amber-950 dark:text-amber-100 truncate">
                                    {user.name}
                                  </span>
                                  <span className="text-[11px] text-amber-800/70 dark:text-amber-300/70 truncate">
                                    {user.email}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap shrink-0">
                                <div className="flex items-center gap-1 bg-amber-100/80 dark:bg-amber-900/40 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800/30">
                                  <Star className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 fill-amber-500" />
                                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                                    {user.star?.toFixed(2) || "0.00"}
                                  </span>
                                  <span className="text-[10px] font-medium text-amber-700/80 dark:text-amber-300/80 ml-0.5">
                                    {t("starBalance")}
                                  </span>
                                </div>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => fetchUser()}
                                  className="h-8 px-2.5 text-xs gap-1 text-amber-800 hover:text-amber-950 hover:bg-amber-100 dark:text-amber-200 dark:hover:text-amber-50 dark:hover:bg-amber-900/30">
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  <span>{t("refreshBalance")}</span>
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleLogout}
                                  className="h-8 px-2.5 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20">
                                  <LogOut className="h-3.5 w-3.5" />
                                  <span>{t("logout")}</span>
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="space-y-0.5 min-w-0">
                                <p className="text-xs font-medium text-amber-900 dark:text-amber-200 truncate">
                                  {t("notLoggedIn")}
                                </p>
                                <p className="text-[11px] text-amber-800/70 dark:text-amber-300/70">
                                  {t("loginDescription")}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                                <Button
                                  onClick={handleLogin}
                                  disabled={isPolling}
                                  className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 h-8 text-xs px-3 rounded-lg shadow-xs">
                                  {isPolling ? (
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <LogIn className="h-3.5 w-3.5" />
                                  )}
                                  <span>{isPolling ? t("connecting") : t("clickToLogin")}</span>
                                </Button>
                                {isPolling && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={stopPolling}
                                    className="h-8 px-2 text-xs text-amber-800 hover:text-amber-950 dark:text-amber-200">
                                    <X className="h-3 w-3 mr-1" />
                                    {t("close")}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-amber-800/70 dark:text-amber-300/70 border-t border-amber-200/40 dark:border-amber-800/20 pt-2.5">
                          {t("meProviderRecharge")}{" "}
                          <a
                            href="https://app.mind-elixir.com/recharge"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100">
                            app.mind-elixir.com
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </RadioGroup>
          </section>

          {/* ── Preferences Section ────────────────────────────────────────── */}
          <section className="space-y-4 pt-6 border-t border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {t("aiReplyLanguage")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("aiReplyLanguageTip")}
              </p>
            </div>
            <div className="w-full sm:max-w-xs">
              <Select
                value={aiConfig.replyLanguage || getMatchedBrowserLanguage(navigator.language)}
                onValueChange={(value) => {
                  const next = { ...aiConfig, replyLanguage: value }
                  persistConfig(next)
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                }}>
                <SelectTrigger id="reply-language" className="h-9.5 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.id} value={lang.id}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* ── Bottom Save & Status Bar ───────────────────────────────────── */}
          <div className="pt-4 flex items-center justify-between border-t border-border/60">
            <div className="text-xs text-muted-foreground min-h-[20px] flex items-center">
              {saved && (
                <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check className="h-3.5 w-3.5" />
                  {t("saved")}
                </span>
              )}
            </div>
            <Button
              onClick={saveConfig}
              disabled={saving}
              className={cn(
                "h-9 px-5 text-xs font-semibold transition-all",
                saved ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
              )}>
              {saving ? t("saving") : saved ? t("saved") : t("saveConfig")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Add / Edit Model Dialog ────────────────────────────────────── */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseForm()
        }}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingModelId ? t("editModel") : t("addModel")}
            </DialogTitle>
            <DialogDescription>
              {editingModelId
                ? formData.name || t("editModel")
                : t("defaultModelTip")}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="model-name" className="text-sm font-medium text-foreground">
                  {t("modelName")}
                </Label>
                <Input
                  id="model-name"
                  type="text"
                  className={cn(
                    "h-10 text-sm rounded-lg",
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
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">
                  {t("aiProvider")}
                </Label>
                <div ref={providerDropdownRef} className="relative">
                  <button
                    type="button"
                    className={cn(
                      "flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3.5 py-2 text-sm transition-colors hover:border-border",
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
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-popover border rounded-xl shadow-lg animate-in fade-in-50 zoom-in-95 duration-100">
                      <div className="p-2.5 border-b border-border">
                        <div className="relative">
                          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            ref={providerSearchRef}
                            className="h-9 pl-8 text-sm rounded-lg"
                            value={providerSearch}
                            onChange={(e) => setProviderSearch(e.target.value)}
                            placeholder={t("searchProvider")}
                          />
                        </div>
                      </div>
                      <div className="max-h-[240px] overflow-y-auto p-1.5">
                        {filteredProviderOptions.map((opt) => (
                          <div
                            key={opt.id}
                            className={cn(
                              "flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent transition-colors",
                              formData.provider === opt.id && "bg-accent font-medium"
                            )}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleFormProviderChange(opt.id)
                            }}>
                            <span className="truncate">{opt.name}</span>
                          </div>
                        ))}
                        {filteredProviderOptions.length === 0 && (
                          <div className="py-5 text-center text-sm text-muted-foreground">
                            {t("noProvidersFound")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model-base-url" className="text-sm font-medium text-foreground">
                  {t("apiAddress")}
                </Label>
                <Input
                  id="model-base-url"
                  type="text"
                  className={cn(
                    "h-10 text-sm rounded-lg",
                    hasSubmitted && isCustomProvider && !formData.baseUrl?.trim() && "border-destructive focus-visible:ring-destructive"
                  )}
                  disabled={!isCustomProvider}
                  value={formData.baseUrl || ""}
                  onChange={(e) => handleFormBaseUrlChange(e.target.value)}
                  placeholder={selectedProviderOption?.baseUrl || "https://api.example.com/v1"}
                />
                {!isCustomProvider && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("baseUrlLockedTip")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="model-api-key" className="text-sm font-medium text-foreground">
                  {t("apiKey")}
                </Label>
                <div className="relative">
                  <Input
                    id="model-api-key"
                    type={showApiKey ? "text" : "password"}
                    className={cn(
                      "h-10 text-sm rounded-lg pr-10",
                      hasSubmitted && !formData.apiKey?.trim() && "border-destructive focus-visible:ring-destructive"
                    )}
                    value={formData.apiKey || ""}
                    onChange={(e) => handleFormApiKeyChange(e.target.value)}
                    placeholder={
                      selectedProviderOption?.env ||
                      t("enterApiKeyPlaceholder", getProviderLabel(formData.provider || ""))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors rounded focus:outline-none"
                    tabIndex={-1}
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}>
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Model input with dropdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="model-id" className="text-sm font-medium text-foreground">
                    {t("modelSelection")}
                  </Label>
                  {formData.baseUrl && formData.apiKey?.trim() && (
                    <button
                      type="button"
                      onClick={() => loadModelOptions(formData.baseUrl, formData.apiKey)}
                      disabled={fetchingModels}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      title={t("refresh")}>
                      <RefreshCw className={cn("h-3 w-3", fetchingModels && "animate-spin")} />
                      <span>{fetchingModels ? t("refreshing") : t("refresh")}</span>
                    </button>
                  )}
                </div>
                <div ref={modelDropdownRef} className="relative">
                  <Input
                    id="model-id"
                    className={cn(
                      "h-10 text-sm rounded-lg pr-8",
                      hasSubmitted && !formData.model?.trim() && "border-destructive focus-visible:ring-destructive"
                    )}
                    value={formData.model || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, model: e.target.value })
                      setModelDropdownOpen(true)
                    }}
                    onFocus={() => setModelDropdownOpen(true)}
                    placeholder={t("enterCustomModelName")}
                  />
                  {fetchingModels && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {modelDropdownOpen && (modelOptions.length > 0 || fetchingModels) && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-popover border rounded-xl shadow-lg animate-in fade-in-50 zoom-in-95 duration-100">
                      {fetchingModels ? (
                        <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>{t("fetchingModels")}</span>
                        </div>
                      ) : (
                        <>
                          <div className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground border-b border-border flex items-center justify-between">
                            <span>{modelOptions.length} {t("modelSelection")}</span>
                          </div>
                          <div className="max-h-[220px] overflow-y-auto p-1.5">
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
                                    "flex items-center px-3 py-2 text-sm rounded-lg cursor-pointer hover:bg-accent transition-colors",
                                    formData.model === m && "bg-accent font-medium"
                                  )}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    setFormData({ ...formData, model: m })
                                    setModelDropdownOpen(false)
                                  }}>
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.model === m ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {m}
                                </div>
                              ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.baseUrl && formData.apiKey
                    ? t("supportsAutoFetchModels")
                    : t("notSupportsAutoFetchModels")}
                </p>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 text-xs font-medium rounded-lg"
              onClick={handleCloseForm}>
              {t("close")}
            </Button>
            <Button
              type="button"
              className="h-9 px-5 text-xs font-medium rounded-lg shadow-sm"
              onClick={handleSaveModel}>
              {t("saveConfig")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster position="top-right" richColors />
    </div>
  )
}

export default OptionsPage

import { Check, ChevronsUpDown, Search, Star, RefreshCw, LogOut, LogIn, User } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { storage } from "@wxt-dev/storage"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "~/components/ui/dropdown-menu"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "~/components/ui/select"
import { cn } from "~/lib/utils"
import { t, getMatchedBrowserLanguage } from "~/utils/i18n"

interface AIProvider {
  id: string
  name: string
  baseUrl?: string
  modelsEndpoint?: string
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: "mind-elixir",
    name: "Mind Elixir ⭐"
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelsEndpoint: "/models"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelsEndpoint: "/models"
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com/v1"
  },
  {
    id: "openai-compatible",
    name: "OpenAI Compatible API",
    baseUrl: "https://api.example.com/v1",
    modelsEndpoint: "/models"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsEndpoint: "/models"
  }
]

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

interface AIConfig {
  provider: string
  apiKeys: {
    "mind-elixir"?: string
    openai?: string
    gemini?: string
    claude?: string
    "openai-compatible"?: string
    openrouter?: string
  }
  model: string
  baseUrl?: string
  baseUrls?: {
    "mind-elixir"?: string
    openai?: string
    gemini?: string
    claude?: string
    "openai-compatible"?: string
    openrouter?: string
  }
  customModel?: string
  replyLanguage?: string
}

interface UserData {
  _id?: string
  id?: string
  name?: string
  email?: string
  image?: string
  star?: number
}

const BACKEND_BASE_URL = import.meta.env.WXT_BACKEND_BASE_URL

function OptionsPage() {
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: "mind-elixir",
    apiKeys: {},
    model: "",
    baseUrls: {},
    replyLanguage: getMatchedBrowserLanguage(navigator.language)
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [availableModels, setAvailableModels] = useState<{
    [key: string]: string[]
  }>({})
  const [fetchingModels, setFetchingModels] = useState(false)
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [openModelSelect, setOpenModelSelect] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState("")

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
      if (userData || attempts >= maxAttempts) {
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
      const config = await storage.getItem<AIConfig>("local:aiConfig")
      if (config) {
        if (!config.replyLanguage || config.replyLanguage === "auto") {
          config.replyLanguage = getMatchedBrowserLanguage(navigator.language)
        }
        setAiConfig(config)
        // 检查是否使用自定义模型
        if (config.customModel) {
          setUseCustomModel(true)
        }

        // 如果有API Key且支持获取模型，尝试获取模型列表
        const provider = AI_PROVIDERS.find((p) => p.id === config.provider)
        const apiKey =
          config.apiKeys?.[config.provider as keyof typeof config.apiKeys]
        if (provider && apiKey) {
          fetchModels(
            provider,
            apiKey,
            config.baseUrl ||
              config.baseUrls?.[provider.id as keyof typeof config.baseUrls]
          ).then((models) => {
            setAvailableModels((prev) => ({
              ...prev,
              [provider.id]: models
            }))
          })
        }
      }
    } catch (error) {
      console.error(t("loadConfigFailed"), error)
    }
  }

  const saveConfig = async () => {
    try {
      setSaving(true)

      // 构建要保存的配置
      const configToSave = {
        ...aiConfig,
        customModel: useCustomModel ? aiConfig.model : undefined,
        // 保存当前服务商的baseUrl到baseUrls对象中
        baseUrls: {
          ...aiConfig.baseUrls,
          [aiConfig.provider]: aiConfig.baseUrl
        }
      }

      await storage.setItem("local:aiConfig", configToSave)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (error) {
      console.error(t("saveConfigFailed"), error)
    } finally {
      setSaving(false)
    }
  }

  const fetchModels = async (
    provider: AIProvider,
    apiKey: string,
    baseUrlOverride?: string
  ) => {
    if (!provider.modelsEndpoint || !apiKey) {
      return []
    }

    try {
      setFetchingModels(true)
      const baseUrl = baseUrlOverride || aiConfig.baseUrl || provider.baseUrl
      const url = `${baseUrl}${provider.modelsEndpoint}`

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      }

      if (
        provider.id === "openai" ||
        provider.id === "openai-compatible" ||
        provider.id === "openrouter"
      ) {
        headers["Authorization"] = `Bearer ${apiKey}`
      } else if (provider.id === "gemini") {
        // Gemini uses API key as query parameter and different endpoint
        const geminiUrl = `${provider.baseUrl}/models?key=${apiKey}`
        const response = await fetch(geminiUrl, { headers })
        const data = await response.json()
        // 过滤出支持 generateContent 的模型
        const supportedModels =
          data.models
            ?.filter((m: any) =>
              m.supportedGenerationMethods?.includes("generateContent")
            )
            .map((m: any) => m.name.replace("models/", "")) || []
        return supportedModels
      }

      const response = await fetch(url, { headers })
      const data = await response.json()

      return data.data?.map((m: any) => m.id) || []
    } catch (error) {
      console.error(t("fetchModelsFailed"), error)
      return []
    } finally {
      setFetchingModels(false)
    }
  }

  const handleProviderChange = async (providerId: string) => {
    stopPolling()
    const provider = AI_PROVIDERS.find((p) => p.id === providerId)
    if (provider) {
      // 从存储中加载完整配置，以获取该服务商之前保存的baseUrl
      const savedConfig = await storage.getItem<AIConfig>("local:aiConfig")

      // 优先使用该服务商之前保存的baseUrl，否则使用默认的baseUrl
      let newBaseUrl = provider.baseUrl
      if (
        savedConfig?.baseUrls?.[providerId as keyof typeof savedConfig.baseUrls]
      ) {
        newBaseUrl =
          savedConfig.baseUrls[providerId as keyof typeof savedConfig.baseUrls]
      }

      setAiConfig({
        ...aiConfig,
        provider: providerId,
        model: "",
        baseUrl: newBaseUrl
      })
      setUseCustomModel(false)

      // 如果有API Key，尝试获取模型列表
      const apiKey =
        aiConfig.apiKeys?.[providerId as keyof typeof aiConfig.apiKeys]
      if (apiKey) {
        fetchModels(provider, apiKey, newBaseUrl).then((models) => {
          setAvailableModels((prev) => ({
            ...prev,
            [providerId]: models
          }))
          if (models.length > 0) {
            setAiConfig((prev) => ({
              ...prev,
              model: models[0]
            }))
          }
        })
      }
    }
  }

  const handleApiKeyChange = (apiKey: string) => {
    const newApiKeys = {
      ...aiConfig.apiKeys,
      [aiConfig.provider]: apiKey
    }
    setAiConfig({ ...aiConfig, apiKeys: newApiKeys })

    const provider = AI_PROVIDERS.find((p) => p.id === aiConfig.provider)
    if (provider && apiKey) {
      fetchModels(provider, apiKey).then((models) => {
        setAvailableModels((prev) => ({
          ...prev,
          [provider.id]: models
        }))
      })
    }
  }

  const handleModelChange = (model: string) => {
    setAiConfig({
      ...aiConfig,
      model,
      customModel: useCustomModel ? model : undefined
    })
  }

  const currentProvider = AI_PROVIDERS.find((p) => p.id === aiConfig.provider)

  const isMindElixir = aiConfig.provider === "mind-elixir"

  return (
    <div className="min-h-screen bg-background">
      <div className="w-[680px] mx-auto py-10 px-4 sm:px-6">
        <div className="mb-8 pb-4 border-b border-border">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t("optionsTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Video Mindmap - {t("optionsTitle")}
          </p>
        </div>

        <div className="space-y-5">
        <div className="space-y-1">
          <Label htmlFor="ai-provider" className="text-sm font-medium text-foreground">{t("aiProvider")}</Label>
          <Select
            value={aiConfig.provider}
            onValueChange={handleProviderChange}>
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mind Elixir built-in provider panel */}
        {isMindElixir ? (
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
        ) : (
          <div className="space-y-4">
            {currentProvider?.baseUrl && (
              <div className="space-y-1">
                <Label htmlFor="api-address" className="text-sm font-medium text-foreground">{t("apiAddress")}</Label>
                <Input
                  id="api-address"
                  type="text"
                  className="h-10 text-sm"
                  value={aiConfig.baseUrl || ""}
                  onChange={(e) =>
                    setAiConfig({
                      ...aiConfig,
                      baseUrl: e.target.value || undefined
                    })
                  }
                  placeholder={currentProvider.baseUrl}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t("customApiAddressTip")}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="api-key" className="text-sm font-medium text-foreground">
                {t("apiKey")}
              </Label>
              <Input
                id="api-key"
                type="password"
                className="h-10 text-sm"
                value={
                  aiConfig.apiKeys?.[
                    aiConfig.provider as keyof typeof aiConfig.apiKeys
                  ] || ""
                }
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={t(
                  "enterApiKeyPlaceholder",
                  currentProvider?.name || ""
                )}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t("autoFetchModelsTip")}
              </p>
            </div>
          </div>
        )}

        {!isMindElixir && (
          <div className="space-y-2 border-t border-border pt-4 mt-2">
            <Label className="text-sm font-semibold text-foreground">
              {t("modelSelection")}
            </Label>

            <RadioGroup
              value={useCustomModel ? "custom" : "preset"}
              onValueChange={(value) => setUseCustomModel(value === "custom")}
              className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="preset" id="preset-model" />
                  <Label htmlFor="preset-model" className="cursor-pointer text-xs font-medium">
                    {t("usePresetModel")}
                  </Label>
                </div>

                {!useCustomModel && (
                  <div className="ml-6 space-y-2">
                    <div className="flex gap-2 items-center">
                      <DropdownMenu
                        modal={false}
                        open={openModelSelect}
                        onOpenChange={setOpenModelSelect}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openModelSelect}
                            className="flex-1 justify-between text-left font-normal h-9 text-xs"
                            disabled={fetchingModels}>
                            {aiConfig.model || t("modelSelection")}
                            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="p-0" align="start">
                          <div className="flex items-center border-b px-2.5">
                            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                            <input
                              className="flex h-8 w-full rounded-md bg-transparent py-2 text-xs outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder={t("searchModels")}
                              value={modelSearchQuery}
                              onChange={(e) =>
                                setModelSearchQuery(e.target.value)
                              }
                            />
                          </div>
                          <div className="max-h-[180px] overflow-y-auto p-1">
                            {(availableModels[aiConfig.provider] || [])
                              .filter((model) =>
                                model
                                  .toLowerCase()
                                  .includes(modelSearchQuery.toLowerCase())
                              )
                              .map((model) => (
                                <DropdownMenuItem
                                  key={model}
                                  className="text-xs"
                                  onSelect={() => {
                                    handleModelChange(model)
                                    setOpenModelSelect(false)
                                    setModelSearchQuery("")
                                  }}>
                                  <Check
                                    className={cn(
                                      "mr-2 h-3.5 w-3.5",
                                      aiConfig.model === model
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {model}
                                </DropdownMenuItem>
                              ))}
                            {(availableModels[aiConfig.provider] || []).filter(
                              (model) =>
                                model
                                  .toLowerCase()
                                  .includes(modelSearchQuery.toLowerCase())
                            ).length === 0 && (
                              <div className="py-4 text-center text-xs text-muted-foreground">
                                No models found.
                              </div>
                            )}
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {aiConfig.apiKeys?.[
                        aiConfig.provider as keyof typeof aiConfig.apiKeys
                      ] && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          onClick={() => {
                            const provider = AI_PROVIDERS.find(
                              (p) => p.id === aiConfig.provider
                            )
                            const apiKey =
                              aiConfig.apiKeys?.[
                                aiConfig.provider as keyof typeof aiConfig.apiKeys
                              ]
                            if (provider && apiKey) {
                              fetchModels(provider, apiKey).then((models) => {
                                setAvailableModels((prev) => ({
                                  ...prev,
                                  [provider.id]: models
                                }))
                              })
                            }
                          }}
                          disabled={fetchingModels}>
                          {fetchingModels ? t("refreshing") : t("refresh")}
                        </Button>
                      )}
                    </div>

                    {fetchingModels && (
                      <p className="text-[10px] text-muted-foreground ml-0">
                        {t("fetchingModels")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom-model" />
                  <Label htmlFor="custom-model" className="cursor-pointer text-xs font-medium">
                    {t("useCustomModel")}
                  </Label>
                </div>

                {useCustomModel && (
                  <div className="ml-6">
                    <Input
                      className="h-9 text-xs"
                      value={aiConfig.customModel || aiConfig.model}
                      onChange={(e) => handleModelChange(e.target.value)}
                      placeholder={t("enterCustomModelName")}
                    />
                  </div>
                )}
              </div>
            </RadioGroup>

            <p className="text-[10px] text-muted-foreground">
              {t("supportsAutoFetchModels")}
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

      <div className="mt-8 pt-5 border-t border-border space-y-3">
        <h3 className="font-semibold text-xs text-foreground">{t("usageInstructions")}</h3>
        <div className="text-xs break-all">
          <a
            href="https://github.com/SSShooter/Video-Summary/blob/master/guide/index.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium">
            https://github.com/SSShooter/Video-Summary/blob/master/guide/index.md
          </a>
        </div>

        <div className="space-y-1.5">
          <h4 className="font-medium text-[11px] text-muted-foreground">{t("features")}</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-primary rounded-full flex-shrink-0"></div>
              <span>{t("autoSubtitleExtraction")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-primary rounded-full flex-shrink-0"></div>
              <span>{t("oneClickJump")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-primary rounded-full flex-shrink-0"></div>
              <span>{t("aiContentSummary")}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 bg-primary rounded-full flex-shrink-0"></div>
              <span>{t("articleMindmap")}</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

export default OptionsPage

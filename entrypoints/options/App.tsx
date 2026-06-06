import { Check, ChevronsUpDown, Search, Star, RefreshCw, LogOut, LogIn, User } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { storage } from "@wxt-dev/storage"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card"
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
import { t } from "~/utils/i18n"

interface AIProvider {
  id: string
  name: string
  apiKeyLabel: string
  baseUrl?: string
  modelsEndpoint?: string
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: "mind-elixir",
    name: "Mind Elixir ⭐",
    apiKeyLabel: ""
  },
  {
    id: "openai",
    name: "OpenAI",
    apiKeyLabel: "API Key",
    baseUrl: "https://api.openai.com/v1",
    modelsEndpoint: "/models"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    apiKeyLabel: "API Key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelsEndpoint: "/models"
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    apiKeyLabel: "API Key",
    baseUrl: "https://api.anthropic.com/v1"
  },
  {
    id: "openai-compatible",
    name: "OpenAI Compatible API",
    apiKeyLabel: "API Key",
    baseUrl: "https://api.example.com/v1",
    modelsEndpoint: "/models"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    apiKeyLabel: "OpenRouter API Key",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsEndpoint: "/models"
  }
]

const REPLY_LANGUAGES = [
  { id: "auto", name: "Auto Detect" },
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
    replyLanguage: "auto"
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
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-10">
      <div className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">
          {t("optionsTitle")}
        </h1>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-bold">{t("aiServiceConfig")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="ai-provider" className="text-lg font-semibold">{t("aiProvider")}</Label>
            <Select
              value={aiConfig.provider}
              onValueChange={handleProviderChange}>
              <SelectTrigger className="h-12 text-lg">
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
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-4">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {t("meProviderDesc")}
              </p>

              <div className="border-t border-amber-200 dark:border-amber-800/60 pt-4">
                {loadingUser ? (
                  <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <RefreshCw className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
                    <span>{t("loading")}</span>
                  </div>
                ) : user ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt={user.name || ""}
                          className="h-10 w-10 rounded-full border border-amber-200 dark:border-amber-800/50 shadow-sm"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-800 dark:text-amber-200 font-bold border border-amber-200 dark:border-amber-800/50 shadow-sm">
                          {user.name?.charAt(0).toUpperCase() || <User className="h-5 w-5" />}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-amber-950 dark:text-amber-100 truncate">
                          {user.name}
                        </span>
                        <span className="text-xs text-amber-800/70 dark:text-amber-300/70 truncate">
                          {user.email}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-950/40 px-3.5 py-2 rounded-xl border border-yellow-200/60 dark:border-yellow-800/20 shadow-sm">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 animate-pulse" />
                        <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">
                          {user.star?.toFixed(2) || "0.00"}
                        </span>
                        <span className="text-xs font-medium text-yellow-600/80 dark:text-yellow-500/80">
                          {t("starBalance")}
                        </span>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchUser()}
                        className="h-9 gap-1.5 text-amber-800 hover:text-amber-950 hover:bg-amber-100/50 dark:text-amber-200 dark:hover:text-amber-50 dark:hover:bg-amber-900/30"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span>{t("refreshBalance")}</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="h-9 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/20"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        <span>{t("logout")}</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                        {t("notLoggedIn")}
                      </p>
                      <p className="text-xs text-amber-800/70 dark:text-amber-300/70">
                        {t("loginDescription")}
                      </p>
                    </div>
                    <Button
                      onClick={handleLogin}
                      disabled={isPolling}
                      className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 h-10 px-4 rounded-xl shadow-sm border border-amber-700/20"
                    >
                      {isPolling ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <LogIn className="h-4 w-4" />
                      )}
                      <span>{isPolling ? t("connecting") : t("clickToLogin")}</span>
                    </Button>
                  </div>
                )}
              </div>

              <p className="text-xs text-amber-800/60 dark:text-amber-300/60 border-t border-amber-200/50 dark:border-amber-800/30 pt-3 flex items-center justify-between">
                <span>
                  {t("meProviderRecharge")}{" "}
                  <a
                    href="https://app.mind-elixir.com/recharge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline underline-offset-2 hover:text-amber-950 dark:hover:text-amber-100"
                  >
                    app.mind-elixir.com
                  </a>
                </span>
              </p>
            </div>
          ) : (
            <>
              {currentProvider?.baseUrl && (
                <div className="space-y-2">
                  <Label htmlFor="api-address" className="text-lg font-semibold">{t("apiAddress")}</Label>
                  <Input
                    id="api-address"
                    type="text"
                    className="h-12 text-lg"
                    value={aiConfig.baseUrl || ""}
                    onChange={(e) =>
                      setAiConfig({
                        ...aiConfig,
                        baseUrl: e.target.value || undefined
                      })
                    }
                    placeholder={currentProvider.baseUrl}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("customApiAddressTip")}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="api-key" className="text-lg font-semibold">
                  {currentProvider?.apiKeyLabel || "API Key"}
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  className="h-12 text-lg"
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
                <p className="text-xs text-muted-foreground">
                  {t("autoFetchModelsTip")}
                </p>
              </div>
            </>
          )}

          {!isMindElixir && <div className="space-y-4">
            <Label className="text-xl font-bold">
              {t("modelSelection")}
            </Label>

            <RadioGroup
              value={useCustomModel ? "custom" : "preset"}
              onValueChange={(value) => setUseCustomModel(value === "custom")}
              className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="preset" id="preset-model" />
                    <Label htmlFor="preset-model" className="cursor-pointer text-lg">
                    {t("usePresetModel")}
                  </Label>
                </div>

                {!useCustomModel && (
                  <div className="ml-6 space-y-2">
                    <div className="flex gap-2 items-center">
                      <DropdownMenu
                        open={openModelSelect}
                        onOpenChange={setOpenModelSelect}>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openModelSelect}
                            className="flex-1 justify-between text-left font-normal"
                            disabled={fetchingModels}>
                            {aiConfig.model || t("modelSelection")}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="p-0" align="start">
                          <div className="flex items-center border-b px-3">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <input
                              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              placeholder={t("searchModels")}
                              value={modelSearchQuery}
                              onChange={(e) =>
                                setModelSearchQuery(e.target.value)
                              }
                            />
                          </div>
                          <div className="max-h-[220px] overflow-y-auto p-1">
                            {(availableModels[aiConfig.provider] || [])
                              .filter((model) =>
                                model
                                  .toLowerCase()
                                  .includes(modelSearchQuery.toLowerCase())
                              )
                              .map((model) => (
                                <DropdownMenuItem
                                  key={model}
                                  onSelect={() => {
                                    handleModelChange(model)
                                    setOpenModelSelect(false)
                                    setModelSearchQuery("")
                                  }}>
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
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
                              <div className="py-6 text-center text-sm text-muted-foreground">
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
                      <p className="text-xs text-muted-foreground ml-0">
                        {t("fetchingModels")}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="custom" id="custom-model" />
                  <Label htmlFor="custom-model" className="cursor-pointer text-lg">
                    {t("useCustomModel")}
                  </Label>
                </div>

                {useCustomModel && (
                  <div className="ml-6">
                    <Input
                      className="h-12 text-lg"
                      value={aiConfig.customModel || aiConfig.model}
                      onChange={(e) => handleModelChange(e.target.value)}
                      placeholder={t("enterCustomModelName")}
                    />
                  </div>
                )}
              </div>
            </RadioGroup>

            <p className="text-xs text-muted-foreground">
              {t("supportsAutoFetchModels")}
            </p>
          </div>}

          <div className="space-y-2">
            <Label htmlFor="reply-language" className="text-lg font-semibold">{t("aiReplyLanguage")}</Label>
            <Select
              value={aiConfig.replyLanguage || "auto"}
              onValueChange={(value) =>
                setAiConfig({ ...aiConfig, replyLanguage: value })
              }>
              <SelectTrigger className="h-12 text-lg">
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
            <p className="text-xs text-muted-foreground">
              {t("aiReplyLanguageTip")}
            </p>
          </div>

          <div className="pt-4">
            <Button
              onClick={saveConfig}
              disabled={saving}
              variant={saved ? "default" : "default"}
              className={cn("px-8 py-6 text-lg font-semibold", saved ? "bg-green-600 hover:bg-green-700" : "")}>
              {saving ? t("saving") : saved ? t("saved") : t("saveConfig")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>{t("usageInstructions")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <a
              href="https://github.com/SSShooter/Video-Summary/blob/master/guide/index.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline">
              https://github.com/SSShooter/Video-Summary/blob/master/guide/index.md
            </a>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-3">{t("features")}</h4>
            <div className="grid gap-2">
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                <span>{t("autoSubtitleExtraction")}</span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                <span>{t("oneClickJump")}</span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                <span>{t("aiContentSummary")}</span>
              </div>
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-primary rounded-full mr-3 flex-shrink-0"></div>
                <span>{t("articleMindmap")}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default OptionsPage

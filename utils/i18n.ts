/**
 * 国际化工具函数
 * 简化chrome.i18n.getMessage的使用
 */

/**
 * 获取本地化消息
 * @param key 消息键名
 * @param substitutions 替换参数
 * @returns 本地化后的消息
 */
export function t(key: string, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions) || key
}

/**
 * 获取当前语言
 * @returns 当前语言代码
 */
export function getCurrentLanguage(): string {
  return chrome.i18n.getUILanguage()
}

/**
 * 检查是否为中文环境
 * @returns 是否为中文
 */
export function isChinese(): boolean {
  const lang = getCurrentLanguage().toLowerCase()
  return lang.includes("zh") || lang.includes("cn")
}

/**
 * 检查是否为英文环境
 * @returns 是否为英文
 */
export function isEnglish(): boolean {
  const lang = getCurrentLanguage().toLowerCase()
  return lang.includes("en")
}


/**
 * 获取相对时间描述
 * @param seconds 秒数
 * @returns 相对时间描述
 */
export function getRelativeTimeDescription(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}${t("hours")}${minutes}${t("minutes")}${secs}${t("seconds")}`
  } else if (minutes > 0) {
    return `${minutes}${t("minutes")}${secs}${t("seconds")}`
  } else {
    return `${secs}${t("seconds")}`
  }
}

export const SUPPORTED_LANGUAGES = [
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
] as const

/**
 * 根据浏览器/系统语言匹配最接近的受支持语言，未匹配到则默认返回 "en"
 * @param browserLang 浏览器或系统语言代码，默认自动获取 chrome.i18n 或 navigator 的语言代码
 */
export function getMatchedBrowserLanguage(browserLang?: string): string {
  const rawLang = browserLang || 
    (typeof chrome !== "undefined" && chrome.i18n ? chrome.i18n.getUILanguage() : undefined) || 
    (typeof navigator !== "undefined" ? navigator.language : undefined) || 
    "";
  const lang = rawLang.toLowerCase();
  
  // 1. 完全匹配
  const exact = SUPPORTED_LANGUAGES.find((item) => item.id.toLowerCase() === lang);
  if (exact) return exact.id;

  // 2. 前缀匹配 (例如 "en-US" 匹配 "en")
  const prefix = lang.split("-")[0];
  const prefMatch = SUPPORTED_LANGUAGES.find((item) => item.id.toLowerCase() === prefix);
  if (prefMatch) return prefMatch.id;

  // 3. 针对中文环境的特殊处理
  if (lang.startsWith("zh")) {
    if (lang.includes("tw") || lang.includes("hk") || lang.includes("mo") || lang.includes("hant")) {
      return "zh-TW";
    }
    return "zh-CN";
  }

  return "en";
}


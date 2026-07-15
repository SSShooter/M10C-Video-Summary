import type { AIConfig } from "~/utils/ai-service"

const BACKUP_FORMAT = "m10c-config-backup"
const BACKUP_VERSION = 1

export interface ConfigBackup {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  config: AIConfig
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function createConfigBackup(config: AIConfig): ConfigBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    config
  }
}

export function parseConfigBackup(value: unknown): AIConfig {
  if (!isRecord(value) || value.format !== BACKUP_FORMAT) {
    throw new Error("不是有效的 M10C 配置备份文件")
  }
  if (value.version !== BACKUP_VERSION) {
    throw new Error(`不支持的配置备份版本：${String(value.version)}`)
  }
  if (!isRecord(value.config)) {
    throw new Error("配置备份缺少 config 数据")
  }

  const config = value.config
  if (typeof config.activeProvider !== "string" || !config.activeProvider) {
    throw new Error("配置备份缺少 AI 服务商")
  }
  if (!isRecord(config.providers)) {
    throw new Error("配置备份中的服务商配置无效")
  }
  if (config.blogPublish !== undefined && !isRecord(config.blogPublish)) {
    throw new Error("配置备份中的 Blog 配置无效")
  }
  if (config.summaryPrompt !== undefined && typeof config.summaryPrompt !== "string") {
    throw new Error("配置备份中的摘要 Prompt 无效")
  }
  if (config.mindmapPrompt !== undefined && typeof config.mindmapPrompt !== "string") {
    throw new Error("配置备份中的思维导图 Prompt 无效")
  }

  return config as unknown as AIConfig
}

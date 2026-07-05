export interface STTConfig {
  modelSize: string
  language: string
}

export type STTModelStatus = 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'transcribing'

export interface STTModelInfo {
  id: string
  repo: string
  label: string
  sizeLabel: string
}

export const STT_MODELS: STTModelInfo[] = [
  { id: 'tiny', repo: 'onnx-community/whisper-tiny', label: 'Whisper Tiny', sizeLabel: '~40MB' },
  { id: 'base', repo: 'onnx-community/whisper-base', label: 'Whisper Base', sizeLabel: '~80MB' },
  { id: 'small', repo: 'onnx-community/whisper-small', label: 'Whisper Small', sizeLabel: '~150MB' },
  { id: 'medium', repo: 'onnx-community/whisper-medium', label: 'Whisper Medium', sizeLabel: '~300MB' },
]

export const STT_LANGUAGES = [
  { id: 'auto', name: 'Auto Detect' },
  { id: 'en', name: 'English' },
  { id: 'zh', name: '中文' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
  { id: 'fr', name: 'Français' },
  { id: 'de', name: 'Deutsch' },
  { id: 'es', name: 'Español' },
  { id: 'pt', name: 'Português' },
  { id: 'ru', name: 'Русский' },
  { id: 'ar', name: 'العربية' },
  { id: 'it', name: 'Italiano' },
  { id: 'nl', name: 'Nederlands' },
  { id: 'pl', name: 'Polski' },
  { id: 'th', name: 'ไทย' },
  { id: 'vi', name: 'Tiếng Việt' },
  { id: 'tr', name: 'Türkçe' },
]

export const STT_STORAGE_KEY = 'local:sttConfig' as `local:${string}`

export const DEFAULT_STT_CONFIG: STTConfig = {
  modelSize: 'base',
  language: 'auto',
}

// Chrome runtime message types for STT communication
export const MSG = {
  STT_LOAD_MODEL: 'STT_LOAD_MODEL',
  STT_TRANSCRIBE: 'STT_TRANSCRIBE',
  STT_CHECK_MODEL: 'STT_CHECK_MODEL',
  STT_DELETE_MODEL: 'STT_DELETE_MODEL',
  STT_TERMINATE: 'STT_TERMINATE',
  STT_PROGRESS: 'STT_PROGRESS',
  STT_RESULT: 'STT_RESULT',
  STT_ERROR: 'STT_ERROR',
} as const

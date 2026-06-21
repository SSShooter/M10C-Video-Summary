import { createContext, useContext } from 'react'

export interface STTEngine {
  loadModel: (modelRepo: string) => void
  deleteModel: (modelRepo: string) => void
  checkModel: () => Promise<{ ready: boolean; modelRepo: string | null }>
}

export const STTEngineContext = createContext<STTEngine | null>(null)

export function useSTTEngine() {
  return useContext(STTEngineContext)
}

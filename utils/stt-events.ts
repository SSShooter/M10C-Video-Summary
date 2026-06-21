type STTListener = (msg: any) => void

const listeners = new Set<STTListener>()

export const sttEvents = {
  emit(msg: any) {
    for (const fn of listeners) fn(msg)
  },
  on(fn: STTListener) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}

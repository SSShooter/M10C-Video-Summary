export function consumeSseLines(
  buffer: string,
  chunk: string
): { lines: string[]; buffer: string } {
  const lines = `${buffer}${chunk}`.split("\n")
  return {
    lines: lines.slice(0, -1),
    buffer: lines.at(-1) || ""
  }
}

export function flushSseBuffer(buffer: string): string[] {
  return buffer.trim() ? [buffer] : []
}

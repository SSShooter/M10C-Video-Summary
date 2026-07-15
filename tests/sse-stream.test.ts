import assert from "node:assert/strict"
import test from "node:test"

import { consumeSseLines, flushSseBuffer } from "../utils/sse-stream.ts"

test("保留不完整行，并在收到换行后输出", () => {
  const first = consumeSseLines("", 'data: {"content":"摘要"}')
  assert.deepEqual(first.lines, [])

  const second = consumeSseLines(first.buffer, "\n")
  assert.deepEqual(second.lines, ['data: {"content":"摘要"}'])
  assert.equal(second.buffer, "")
})

test("流结束时输出没有换行的最后一条 SSE 数据", () => {
  const result = consumeSseLines("", 'data: {"content":"摘要正文"}')
  assert.deepEqual(flushSseBuffer(result.buffer), [
    'data: {"content":"摘要正文"}'
  ])
})

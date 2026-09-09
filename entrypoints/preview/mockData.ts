import { plaintextToMindElixir } from "mind-elixir/plaintextConverter"
import { ResponseParser } from "~/utils/response-parser"
import type { MindElixirData } from "mind-elixir"

export const MOCK_MINDMAP_PLAINTEXT = `- AI 赋能的现代软件工程与架构演进
  - 1. 大语言模型在研发周期的落地场景
    - 智能代码补全与架构重构建议
    - 自动化单元测试与端到端用例生成
    - 复杂系统架构图与文档反向推演
  - 2. AI Agent 智能体工作范式
    - 感知层：多模态输入与工程上下文构建
    - 规划层：CoT 思维链与 ReAct 推理机制
    - 行动层：Tool-Calling 与沙箱环境调用
  - 3. 核心技术栈与工程实践
    - 提示词工程与上下文工程 (Context Engineering)
    - 检索增强生成 (RAG) 与混合检索策略
    - 领域模型微调与人类偏好对齐 (DPO)
  - 4. 效能提升与未来展望
    - 研发流全链路综合提效超过 40%
    - 架构设计评审与代码审查自动化
    - 迈向自主式结对编程 (Pair Programming)`

const cleanedText = ResponseParser.cleanMindmapResponse(MOCK_MINDMAP_PLAINTEXT)
export const mockMindmapData: MindElixirData = plaintextToMindElixir(cleanedText)

export const mockSummaryMarkdown = `# 视频核心总结：AI 赋能的现代软件工程与架构演进

> **核心摘要**：本视频深入探讨了以大语言模型（LLM）与自主智能体（AI Agent）为核心的新一代研发生产力变革。系统梳理了从代码辅助到全自主协同编码的演进路线，并结合一线工程落地实践，解析了从编写代码向“系统设计与意图编排”的转型路径。

---

### 1. 研发周期的全链路智能化
- **智能补全与重构**：超越传统的单行补全，结合全局工程上下文提供高内聚、低耦合的重构方案。
- **自动化测试生成**：基于函数签名与边界条件自动推导出高覆盖率的单元测试，提升交付质量。
- **文档与知识沉淀**：实时解析代码变更与 commit log，自动生成规范的技术方案与发布文档。

### 2. AI Agent 范式：从辅助到自主
- **感知与上下文**：利用长上下文与代码 AST 解析，精准定位工程内部的调用拓扑图。
- **ReAct 规划机制**：模型具备“思考-行动-观察”闭环能力，能够自我排查并修正运行报错。
- **工具沙箱执行**：安全调度终端命令、Git 版本控制与自动化测试套件。

### 3. 工程落地关键洞察
- **上下文工程 (Context Engineering)**：单一 Prompt 正在让位于结构化上下文注入与动态索引。
- **混合检索架构**：向量检索 (Dense) + BM25 关键词检索 (Sparse) 兼顾概念与符号精确匹配。
- **结构化输出保障**：通过严格的 JSON Schema 与重试策略确保输出确定性。

💡 **核心启示**：未来的优秀工程师不再比拼敲代码的速度，而是作为**系统架构师与质量把关人**，指挥 AI Agent 高效落地复杂业务。`

export const mockSubtitles = [
  { from: 0, to: 84, content: "欢迎来到本期深度技术拆解：AI 赋能的现代软件工程演进。" },
  { from: 85, to: 290, content: "第一部分：大语言模型在研发全生命周期中的实际落地场景与重构方案。" },
  { from: 291, to: 552, content: "第二部分：AI Agent 工作范式——从单轮问答演进到 ReAct 闭环与工具调用。" },
  { from: 553, to: 940, content: "第三部分：上下文工程 (Context Engineering) 与混合检索实战技巧。" },
  { from: 941, to: 1320, content: "第四部分：工程效能评估指标与面向未来的技术选型指南。" },
  { from: 1321, to: 1680, content: "深入探讨：从传统单行补全转向代码库级别意图理解与架构重构。" },
  { from: 1681, to: 1950, content: "多智能体协同模式：代码编写者、审查者与测试者的协同工作流。" },
  { from: 1951, to: 2280, content: "总结与展望：开发者在 AI 时代的思维模型转变与未来技能图谱。" }
]

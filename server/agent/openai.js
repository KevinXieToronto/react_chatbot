import OpenAI from 'openai'

/** 是不是 Mock 模式：没配 key，或显式开了 MOCK */
export function isMock() {
  return process.env.MOCK === '1' || !process.env.OPENAI_API_KEY
}

let client = null

export function getClient() {
  if (isMock()) return null
  if (!client) {
    // 不传参数，SDK 自动从环境变量 OPENAI_API_KEY 和 OPENAI_BASE_URL 读
    client = new OpenAI()
  }
  return client
}

/** 模型名放在 server/.env 的 OPENAI_MODEL 里，换模型不用改代码 */
export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.6-luna'

export const SYSTEM_PROMPT = `你是 TaskFlow 的任务助手 Copilot。

你可以帮用户管理他们的任务清单。回答要简洁、直接，用中文。

重要规则：
- 需要看任务数据时，先调用工具查询，不要凭空编造。
- 创建任务前如果信息不全（比如只说"加个任务"没说标题），先问清楚。
- 批量删除这类不可逆操作，先向用户确认。
- 不要在回复里重复罗列工具返回的完整 JSON，用自然语言总结。`

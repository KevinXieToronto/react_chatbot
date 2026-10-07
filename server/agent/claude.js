import Anthropic from '@anthropic-ai/sdk'

/** 是不是 Mock 模式：没配 key，或显式开了 MOCK */
export function isMock() {
  return process.env.MOCK === '1' || !process.env.ANTHROPIC_API_KEY
}

let client = null

export function getClient() {
  if (isMock()) return null
  if (!client) {
    // 不传 apiKey，SDK 自动从环境变量 ANTHROPIC_API_KEY 读
    client = new Anthropic()
  }
  return client
}

/**
 * 模型选择。
 * - claude-opus-5   最强，适合复杂推理和长链条工具调用
 * - claude-sonnet-5 便宜不少，日常对话足够
 * - claude-haiku-4-5 最便宜最快，适合简单分类/改写
 *
 * 教程默认用 opus-5。你自己用的话按任务复杂度选，
 * 一个聊天助手其实 sonnet-5 就够了。
 */
export const MODEL = 'claude-opus-5'

export const SYSTEM_PROMPT = `你是 TaskFlow 的任务助手 Copilot。

你可以帮用户管理他们的任务清单。回答要简洁、直接，用中文。

重要规则：
- 需要看任务数据时，先调用工具查询，不要凭空编造。
- 创建任务前如果信息不全（比如只说"加个任务"没说标题），先问清楚。
- 批量删除这类不可逆操作，先向用户确认。
- 不要在回复里重复罗列工具返回的完整 JSON，用自然语言总结。`

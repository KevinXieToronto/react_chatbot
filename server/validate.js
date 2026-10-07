/**
 * 校验 /chat 请求体里的 messages。合法时返回 null，不合法返回错误信息。
 *
 * 为什么要校验：
 * - role 只能是 user / assistant。不校验的话，客户端可以塞进别的 role，
 *   直接让模型 API 报 400，或者绕过我们对上下文的假设。
 * - content 必须是字符串。Claude API 也接受"内容块数组"（图片、tool_result……），
 *   不拦住的话，客户端就能伪造工具结果；而且后面第 28 章按字符数限制长度时，
 *   String([对象]) 会变成 "[object Object]"，长度检查形同虚设。
 * - 最后一条必须是用户消息：以 assistant 结尾在新模型上会被当成"预填充"直接 400。
 *
 * 注意：对话历史本来就由前端保存、每次整个发过来，所以客户端【总是】可以编造
 * "助手以前说过的话"。这是无状态 BFF 的固有特点，校验只保证形状正确；
 * 要彻底杜绝，得把对话历史存在服务端，前端只发新的那一句。
 */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages 不能为空'

  for (const m of messages) {
    if (m?.role !== 'user' && m?.role !== 'assistant') {
      return 'messages 里的 role 只能是 user 或 assistant'
    }
    if (typeof m.content !== 'string') {
      return 'messages 里的 content 必须是字符串'
    }
  }

  if (messages.at(-1).role !== 'user') return '最后一条消息必须是用户消息'
  return null
}

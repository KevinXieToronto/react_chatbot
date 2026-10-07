import { useActiveConversation } from '../../store/copilotStore'

/**
 * 每百万 token 的价格（美元）。
 * ⚠️ 这里是占位值（教程里 claude-opus-5 的价格）。我们用的是 OpenAI 的模型（server/.env 的 OPENAI_MODEL），
 *    请按 OpenAI 官网的定价页把 input / output 改成那个模型的真实价格。
 * 数字会变，正式产品应该从后端配置读（和 MODEL 放在一起），这里写死只为演示。
 */
const PRICE_PER_MTOK = { input: 5, output: 25 }

export default function UsageBar() {
  const conv = useActiveConversation()
  if (!conv) return null

  const { input, output } = conv.usage
  if (input === 0 && output === 0) return null

  const cost = (input / 1e6) * PRICE_PER_MTOK.input + (output / 1e6) * PRICE_PER_MTOK.output

  return (
    <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-400">
      <span>
        输入 {input.toLocaleString()} · 输出 {output.toLocaleString()} tokens
      </span>
      <span title="按当前定价估算，仅供参考">≈ ${cost.toFixed(4)}</span>
    </div>
  )
}

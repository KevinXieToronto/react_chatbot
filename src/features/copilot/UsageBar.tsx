import { useActiveConversation } from '../../store/copilotStore'
import { estimateCost } from '../../lib/tokenCost'

/**
 * 当前会话累计用了多少 token、大概花了多少钱（第 28 章）。
 *
 * 第 33 章：价格挪到了 lib/tokenCost.ts，并把缓存读 / 写也算进去。
 * 以前只累加 input_tokens —— 用上提示缓存以后，它只是"没命中缓存的那部分"，
 * 不加上缓存的两项，显示的输入量和费用都会偏少。
 */
export default function UsageBar() {
  const conv = useActiveConversation()
  if (!conv) return null

  const { input, output, cacheRead = 0, cacheWrite = 0 } = conv.usage
  if (input + output + cacheRead + cacheWrite === 0) return null

  const cost = estimateCost(conv.usage)

  return (
    <div className="flex items-center justify-between px-3 py-1 text-[11px] text-slate-400">
      <span>
        本会话：输入 {(input + cacheRead + cacheWrite).toLocaleString()}（缓存读 {cacheRead.toLocaleString()}）·
        输出 {output.toLocaleString()}
      </span>
      <span title="按当前定价估算，仅供参考">≈ ${cost.toFixed(4)}</span>
    </div>
  )
}

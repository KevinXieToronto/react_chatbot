/**
 * 按 token 估算费用（第 28 章的 UsageBar 里原来写死了输入 / 输出两个价格，第 33 章挪到这里并补上缓存）。
 *
 * ⚠️ 这里是占位值（教程里 claude-opus-5 的价格）。我们用的是 OpenAI 的模型（server/.env 的 OPENAI_MODEL），
 *    请按 OpenAI 官网的定价页把 input / output / cached input 改成那个模型的真实价格。
 * 数字会变，正式产品应该从后端配置读（和 MODEL 放在一起），这里写死只为演示。
 *
 * OpenAI 的缓存计价和教程里的 Claude 不一样：
 * - 读缓存（定价页上的 cached input）有折扣，这里先按输入价的 0.1 倍占位；
 * - 写缓存不额外收费（服务端报的 cache_creation_input_tokens 一直是 0），万一有也按普通输入价算。
 */
export const PRICE_PER_MTOK = {
  input: 5,
  output: 25,
  cacheWrite: 5,
  cacheRead: 5 * 0.1,
}

export interface UsageTotals {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

/** 美元 */
export function estimateCost({ input, output, cacheRead = 0, cacheWrite = 0 }: UsageTotals): number {
  return (
    (input * PRICE_PER_MTOK.input +
      output * PRICE_PER_MTOK.output +
      cacheRead * PRICE_PER_MTOK.cacheRead +
      cacheWrite * PRICE_PER_MTOK.cacheWrite) /
    1e6
  )
}

/** 输入里有多少比例是从缓存读的（0~1）。没有输入时返回 0 */
export function cacheHitRate({ input, cacheRead = 0, cacheWrite = 0 }: UsageTotals): number {
  const total = input + cacheRead + cacheWrite
  return total === 0 ? 0 : cacheRead / total
}

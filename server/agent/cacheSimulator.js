import { createHash } from 'node:crypto'
import { estimateTokens } from './context.js'

/**
 * 【Mock 专用】提示缓存的模拟器（第 33 章）。
 *
 * 没有 API Key 就看不到真实的 usage.prompt_tokens_details.cached_tokens。
 * 这个模拟器按 OpenAI 文档描述的规则算一个"差不多"的数字，让缓存的效果在界面上看得见：
 *
 * - 缓存是自动的、按【前缀】匹配：请求按 tools → messages（system 是第一条）展开成一串"块"，
 *   找和以前某次请求完全相同的最长前缀；
 * - 整个请求不到 1024 token 就不缓存；命中的长度按 128 token 一档往下取整；
 * - 没有断点：每次请求都把自己的前缀记进缓存（OpenAI 写缓存不额外收费，也不单独报数）；
 * - 缓存闲置一段时间（一般 5~10 分钟）就清掉，这里按 5 分钟算，每次命中刷新。
 *
 * 真实的匹配精确到 128 token，这里只精确到"一条消息"。token 数全是 estimateTokens 估的，只看趋势，别当真。
 */

const MIN_CACHEABLE_TOKENS = 1024
const CACHE_STEP = 128
const TTL_MS = 5 * 60 * 1000

/** 前缀哈希 → 最近一次写入 / 命中的时间 */
const store = new Map()

/** 按请求的顺序把它展开成块：工具定义在前，然后是一条条消息 */
function flatten(params) {
  return [...(params.tools ?? []), ...(params.messages ?? [])]
}

/**
 * 模拟一次请求的 usage，返回和 OpenAI 一样的形状（loop.js 再用 toUsage 换算）。
 * @param {object} params 发给 chat.completions.create 的参数（buildRequest 拼好的）
 * @param {string} outputText 这次"模型"输出的内容，用来估 completion_tokens
 */
export function simulateUsage(params, outputText = '', now = Date.now()) {
  // 过期的顺手清掉，免得 Mock 跑久了越攒越多
  for (const [key, at] of store) {
    if (now - at >= TTL_MS) store.delete(key)
  }

  // 每个位置的累计 token 和前缀哈希（前一个哈希 + 这一块的内容 → 这个位置的哈希）
  const prefixTokens = []
  const prefixHash = []
  let total = 0
  let hash = ''
  for (const block of flatten(params)) {
    const json = JSON.stringify(block)
    total += estimateTokens(json)
    hash = createHash('sha256').update(hash + json).digest('hex')
    prefixTokens.push(total)
    prefixHash.push(hash)
  }

  let cached = 0
  if (total >= MIN_CACHEABLE_TOKENS) {
    // 从长到短找：第一个还在缓存里的前缀就是最长的那个
    for (let p = prefixHash.length - 1; p >= 0; p--) {
      if (store.has(prefixHash[p])) {
        if (prefixTokens[p] >= MIN_CACHEABLE_TOKENS) {
          cached = Math.floor(prefixTokens[p] / CACHE_STEP) * CACHE_STEP
        }
        break
      }
    }
    // 这次请求的每个前缀都记下来（命中的那些顺便刷新了时间）
    for (const h of prefixHash) store.set(h, now)
  }

  return {
    prompt_tokens: total,
    completion_tokens: estimateTokens(outputText),
    prompt_tokens_details: { cached_tokens: cached },
  }
}

/** 测试用：清空模拟的缓存 */
export function resetCacheSimulator() {
  store.clear()
}

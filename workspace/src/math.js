// 几个很小的数学工具函数，给编码 Agent 练手用。
// 里面故意留了一个 bug —— 你能先找到它吗？

/** 求和 */
export function sum(nums) {
  let total = 0
  for (let i = 1; i < nums.length; i++) {
    total += nums[i]
  }
  return total
}

/** 平均值 */
export function average(nums) {
  return sum(nums) / nums.length
}

/** 最大值 */
export function max(nums) {
  let result = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] > result) result = nums[i]
  }
  return result
}

// 用 Node 自带的测试运行器（node --test），不用装任何依赖。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sum, average, max } from './math.js'

test('sum 把所有数加起来', () => {
  assert.equal(sum([1, 2, 3]), 6)
})

test('average 求平均值', () => {
  assert.equal(average([2, 4, 6]), 4)
})

test('max 找最大值', () => {
  assert.equal(max([3, 9, 2]), 9)
})

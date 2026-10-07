// 一个"假构建"：什么文件都不产生，只是慢慢地打印输出，
// 用来观察代码助手的终端面板怎么实时显示命令输出（第 32 章）。

const green = (s) => `\x1b[32m${s}\x1b[39m`
const yellow = (s) => `\x1b[33m${s}\x1b[39m`
const dim = (s) => `\x1b[2m${s}\x1b[22m`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log(dim('demo-utils 构建开始'))

console.log('[1/4] 清理 dist/ …')
await sleep(500)
console.log(`[1/4] 清理 dist/ ${green('✓')}`)

console.log('[2/4] 检查 src/math.js …')
await sleep(600)
// 警告写到 stderr：终端面板里它会是另一种颜色
console.error(yellow('警告：average([]) 会返回 NaN，建议处理空数组'))

console.log('[3/4] 编译 …')
for (let i = 1; i <= 10; i++) {
  await sleep(150)
  // \r 回到行首再写一遍：终端里看到的是同一行上的进度条在走
  process.stdout.write(`\r[3/4] 编译 [${'#'.repeat(i)}${'.'.repeat(10 - i)}] ${i * 10}%`)
}
process.stdout.write('\n')

console.log('[4/4] 写入 dist/demo-utils.js …')
await sleep(400)
console.log(green('✓ 构建完成，用时 3.1 秒'))

import { useEffect, useState } from 'react'

/**
 * 防抖：返回一个"延迟跟随"的值。
 * 输入停止 delay 毫秒后，返回值才更新成最新的。
 *
 *   const [keyword, setKeyword] = useState('')
 *   const debouncedKeyword = useDebounce(keyword, 300)
 *   // keyword 每次输入都变；debouncedKeyword 停手 300ms 后才变
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    // 关键：value 每次变化，先清掉上一个定时器再设新的。
    // 这就是防抖的本质 —— 不停地"推迟"，直到用户停手。
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

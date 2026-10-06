export default function PageLoading() {
  return (
    <div className="space-y-3">
      {/* 骨架屏：比转圈圈的 spinner 体验好，因为形状接近真实内容，不会跳动 */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
        />
      ))}
    </div>
  )
}

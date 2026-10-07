import { useAutoScroll } from '../../hooks/useAutoScroll'
import { useCopilotStore } from '../../store/copilotStore'
import MessageBubble from './MessageBubble'

export default function MessageList() {
  const messages = useCopilotStore((s) => s.messages)

  // 依赖用一个"内容签名"，只要列表底部可能变高，它就要变：
  // - 消息数变化 = 新增了一条
  // - 最后一条长度变化 = 流式输出中
  // - 最后一条状态变化 = 出错提示、"（已停止）"出现了
  // - 最后一条的工具状态变化 = 第 25 章的工具卡片出现 / 更新了（现在还没有，先写上）
  // 直接传 messages 数组也行，但那样每次 patch 都是新数组引用，
  // 传这个组合更明确地表达了"我关心什么变化"。
  const last = messages.at(-1)
  const toolSig = last?.toolCalls?.map((t) => t.status).join(',') ?? ''
  const scrollDep = `${messages.length}:${last?.content.length ?? 0}:${last?.status}:${toolSig}`

  const { containerRef, hasNew, scrollToBottom } = useAutoScroll<HTMLDivElement>({
    dep: scrollDep,
  })

  return (
    <div className="relative flex-1 overflow-hidden">
      <div ref={containerRef} className="h-full space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="pt-10 text-center text-sm text-slate-400">
            <p>还没有对话</p>
            <p className="mt-1 text-xs">试试："我还有哪些任务没做完？"</p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      {/* 用户往上滑且有新内容时，右下角浮出提示 */}
      {hasNew && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition hover:bg-blue-700"
        >
          ↓ 有新消息
        </button>
      )}
    </div>
  )
}

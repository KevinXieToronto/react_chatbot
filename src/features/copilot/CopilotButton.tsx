import { useCopilotStore } from '../../store/copilotStore'

export default function CopilotButton() {
  const open = useCopilotStore((s) => s.open)
  const toggle = useCopilotStore((s) => s.toggle)

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? '关闭 Copilot' : '打开 Copilot'}
      className="fixed bottom-4 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-xl text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700"
    >
      {open ? '✕' : '✨'}
    </button>
  )
}

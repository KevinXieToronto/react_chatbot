interface ErrorBannerProps {
  message: string
  onRetry?: () => void
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900 dark:bg-rose-950">
      <p className="text-sm text-rose-700 dark:text-rose-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md bg-rose-600 px-3 py-1 text-sm font-medium text-white hover:bg-rose-700"
        >
          重试
        </button>
      )}
    </div>
  )
}

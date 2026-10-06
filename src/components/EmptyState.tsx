interface EmptyStateProps {
  title: string
  description?: string
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-800">
      <p className="text-slate-600 dark:text-slate-300">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{description}</p>
      )}
    </div>
  )
}

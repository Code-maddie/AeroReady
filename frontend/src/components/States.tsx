export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 text-muted" role="status">
      <span className="h-3 w-3 animate-ping rounded-full bg-accent/70" />
      <span className="label-caps">{label}…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel m-1 flex items-start justify-between gap-4 border-bad/50 bg-bad/10 p-4" role="alert">
      <div>
        <div className="label-caps !text-bad">Data unavailable</div>
        <p className="mt-1 text-sm text-ink">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 rounded border border-line2 px-3 py-1 text-sm hover:border-accent hover:text-accent">
          Retry
        </button>
      )}
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-dim">{text}</div>
}

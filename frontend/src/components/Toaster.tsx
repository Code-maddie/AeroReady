import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Fire a short notice from anywhere: toast('Saved'). */
export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('aeroready:toast', { detail: message }))
}

export default function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const id = Date.now() + Math.random()
      setItems((xs) => [...xs, { id, text: (e as CustomEvent<string>).detail }])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 7000)
    }
    window.addEventListener('aeroready:toast', on)
    return () => window.removeEventListener('aeroready:toast', on)
  }, [])
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex w-[380px] max-w-[calc(100vw-3rem)] flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="flex items-start gap-3 rounded border border-line2 bg-panel px-3 py-2.5 text-[13px] text-ink shadow-2xl">
          <span className="flex-1">{t.text}</span>
          <button onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-muted hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

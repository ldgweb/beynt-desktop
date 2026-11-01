import { useToastStore } from '../../store/toasts'

export function Toaster() {
  const { toasts, dismiss } = useToastStore()

  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast is-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

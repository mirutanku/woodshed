import { createContext, useContext, useState, useCallback } from 'react'
import './Toast.css'

type ToastFn = (message: string, type?: string, duration?: number) => void

const ToastContext = createContext<ToastFn | null>(null)

let toastIdCounter = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number, message: string, type: string }[]>([])

  const addToast: ToastFn = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++toastIdCounter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`toast toast-${toast.type} slide-up`}
              onClick={() => dismiss(toast.id)}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  return useContext(ToastContext) as ToastFn
}

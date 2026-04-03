import { useState } from 'react'
import './ConfirmDialog.css'

function ConfirmDialog({ title, message, confirmLabel, danger, requirePassword, onConfirm, onCancel }: {
  title: string
  message: string
  onConfirm: (password?: string) => void
  onCancel: () => void
  confirmLabel?: string
  danger?: boolean
  requirePassword?: boolean 
}) {

  const [password, setPassword] = useState('')

  function handleConfirm() {
    if (requirePassword) {
      onConfirm(password)
    } else {
      onConfirm()
    }
  }

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>

        {requirePassword && (
          <input
            type="password"
            className="confirm-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoFocus
          />
        )}

        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={handleConfirm}
            disabled={requirePassword && !password}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
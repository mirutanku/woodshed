import { useState } from 'react'
import api from '../api'

function ResetPassword({ token, onBackToLogin }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 12) {
      setError('Password must be at least 12 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset password. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="login-container fade-in">
        <div className="login-card">
          <h2 style={{ marginBottom: 'var(--space-md)' }}>Password reset</h2>
          <p className="text-dim" style={{ marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
            Your password has been updated. You can now log in with your new password.
          </p>
          <button
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={onBackToLogin}
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container fade-in">
      <div className="login-card">
        <h2 style={{ marginBottom: 'var(--space-md)' }}>Set new password</h2>
        <p className="text-dim" style={{ marginBottom: 'var(--space-lg)' }}>
          Choose a new password for your account.
        </p>

        {error && <div className="login-error mb-md">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-md">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 12 characters"
              autoFocus
            />
          </div>
          <div className="form-group mb-md">
            <label>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginBottom: 'var(--space-md)' }}
            disabled={loading}
          >
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>

        <button className="btn-ghost" onClick={onBackToLogin}>
          ← Back to login
        </button>
      </div>
    </div>
  )
}

export default ResetPassword

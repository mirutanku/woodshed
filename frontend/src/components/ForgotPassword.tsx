import { useState } from 'react'
import api from '../api'

function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="login-container fade-in">
        <div className="login-card">
          <h2 style={{ marginBottom: 'var(--space-md)' }}>Check your email</h2>
          <p className="text-dim" style={{ marginBottom: 'var(--space-lg)', lineHeight: 1.6 }}>
            If an account exists with <strong>{email}</strong>, we've sent a password reset link.
            Check your inbox (and spam folder).
          </p>
          <button className="btn-ghost" onClick={onBack}>
            ← Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container fade-in">
      <div className="login-card">
        <h2 style={{ marginBottom: 'var(--space-md)' }}>Reset password</h2>
        <p className="text-dim" style={{ marginBottom: 'var(--space-lg)' }}>
          Enter the email associated with your account and we'll send you a reset link.
        </p>

        {error && <div className="form-error mb-md">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group mb-md">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginBottom: 'var(--space-md)' }}
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <button className="btn-ghost" onClick={onBack}>
          ← Back to login
        </button>
      </div>
    </div>
  )
}

export default ForgotPassword

import { useState } from 'react'
import api from '../api'

function LoginForm({ onLogin }) {
    const [isRegister, setIsRegister] = useState(false)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            if (isRegister) {
                await api.post('/register', { username, password })
                // After successful registration, automatically log in the user
            }
            const res = await api.post('/login', { username, password })
            localStorage.setItem('token',res.data.access_token)
            onLogin()
        } catch (err) {
            const detail = err.response?.data?.detail || 'An error occurred'
            if (typeof detail === 'string') {
                setError(detail)
            } else if (Array.isArray(detail)) {
                // Pydantic validation errors come as an array of { loc, msg, type }
                setError(detail.map(d => d.msg).join(', '))
            } else {
                setError('Something went wrong. Please try again.')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>Woodshed</h1>
          <p>Your practice journal</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <button onClick={() => { setIsRegister(false); setError('') }}>
                Sign in
              </button>
            </>
          ) : (
            <>
              Need an account?{' '}
              <button onClick={() => { setIsRegister(true); setError('') }}>
                Create one
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoginForm
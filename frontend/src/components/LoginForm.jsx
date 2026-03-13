import { useState } from 'react'
import api from '../api'

function LoginForm({ onLogin, onForgotPassword }) {
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

    function handleGoogleLogin() {
      window.google.accounts.id.initialize({
        client_id: '208976121237-r7hlmq8a42rvcvcsgj7v8cd4ohocg28d.apps.googleusercontent.com',
        callback: async (response) => {
          setError('')
          setLoading(true)
          try {
            const res = await api.post('/auth/google', {
              credential: response.credential,
            })
            localStorage.setItem('token', res.data.access_token)
            onLogin()
          } catch (err) {
            setError(err.response?.data?.detail || 'Google sign-in failed')
          } finally {
            setLoading(false)
          }
        },
      })
      window.google.accounts.id.prompt()
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

          <div className="login-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn-google"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            Sign in with Google
          </button>
        </form>
        {!isRegister && onForgotPassword && (
          <div className="login-toggle" style={{ marginBottom: 0 }}>
            <button onClick={onForgotPassword}>
              Forgot password?
            </button>
          </div>
        )}
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
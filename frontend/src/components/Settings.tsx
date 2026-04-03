import { useState, useEffect, useCallback } from 'react'
import api from '../api'
import { useToast } from './Toast'
import ConfirmDialog from './ConfirmDialog'

function Settings() {
  const toast = useToast()

  // User info
  const [user, setUser] = useState<any>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  // Username
  const [username, setUsername] = useState('')
  const [editingUsername, setEditingUsername] = useState(false)

  // Email
  const [email, setEmail] = useState('')
  const [editingEmail, setEditingEmail] = useState(false)

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [saving, setSaving] = useState(false)

  const [confirmDelete, setConfirmDelete] = useState(false)

  // Fetch current user on mount
  useEffect(() => {
    api.get('/users/me').then(res => {
      setUser(res.data)
      setUsername(res.data.username)
      setEmail(res.data.email || '')
      setLoadingUser(false)
    }).catch(() => setLoadingUser(false))
  }, [])

  // --- Google linking ---

  const handleLinkGoogle = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      toast('Google login is not configured', 'error')
      return
    }

    /* global google */
    if (!window.google?.accounts?.id) {
      toast('Google Sign-In not loaded yet — try again in a moment', 'error')
      return
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: any) => {
        setSaving(true)
        try {
          const res = await api.post('/users/me/link-google', {
            credential: response.credential,
          })
          setUser((prev: any) => ({ ...prev, has_google: true, email: res.data.email || prev.email }))
          if (res.data.email && !email) {
            setEmail(res.data.email)
          }
          toast('Google account linked')
        } catch (err: any) {
          toast(err.response?.data?.detail || 'Failed to link Google account', 'error')
        } finally {
          setSaving(false)
        }
      },
    })

    google.accounts.id.prompt()
  }, [email, toast])

  async function handleUnlinkGoogle() {
    setSaving(true)
    try {
      await api.post('/users/me/unlink-google')
      setUser((prev: any) => ({ ...prev, has_google: false }))
      toast('Google account unlinked')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to unlink Google account', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Username ---

  async function handleSaveUsername() {
    if (!username.trim() || username.trim().length < 3) {
      toast('Username must be at least 3 characters', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await api.patch('/users/me', { username: username.trim() })
      setUsername(res.data.username)
      setEditingUsername(false)
      toast('Username updated')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to update username', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Email ---

  async function handleSaveEmail() {
    if (!email.trim() || !email.includes('@')) {
      toast('Please enter a valid email', 'error')
      return
    }
    setSaving(true)
    try {
      const res = await api.patch('/users/me/email', { email: email.trim() })
      setEmail(res.data.email)
      setUser((prev: any) => ({ ...prev, email: res.data.email }))
      setEditingEmail(false)
      toast('Email updated')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to update email', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Password ---

  async function handleChangePassword() {
    if (user?.has_password && !currentPassword) {
      toast('Please enter your current password', 'error')
      return
    }
    if (!newPassword) {
      toast('Please enter a new password', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('New passwords do not match', 'error')
      return
    }
    if (newPassword.length < 12) {
      toast('Password must be at least 12 characters', 'error')
      return
    }
    setSaving(true)
    try {
      if (user?.has_password) {
        await api.post('/users/me/password', {
          current_password: currentPassword,
          new_password: newPassword,
        })
      } else {
        await api.post('/users/me/set-password', {
          new_password: newPassword,
        })
        setUser((prev: any) => ({ ...prev, has_password: true }))
      }
      toast('Password changed')
      setShowPasswordForm(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to change password', 'error')
    } finally {
      setSaving(false)
    }
  }

  // --- Delete Account ---

  async function handleDeleteAccount(password?: string) {
    setSaving(true)
    try {
      await api.delete('/users/me', { data: { password: password || null } })
      localStorage.removeItem('token')
      window.location.reload()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to delete account', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loadingUser) {
    return <div className="empty-state"><p>Loading...</p></div>
  }

  return (
    <div className="fade-in">
      <h1 style={{ marginBottom: 'var(--space-xl)' }}>Settings</h1>

      {/* Username */}
      <div className="card mb-lg">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Username</h3>
        {editingUsername ? (
          <div>
            <div className="form-group mb-md">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn-primary btn-sm" onClick={handleSaveUsername} disabled={saving}>
                {saving ? '...' : 'Save'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setEditingUsername(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{username}</span>
            <button className="btn-ghost btn-sm" onClick={() => setEditingUsername(true)}>Change</button>
          </div>
        )}
      </div>

      {/* Email */}
      <div className="card mb-lg">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Email</h3>
        {!user?.email && !editingEmail && (
          <p className="text-sm text-dim" style={{ marginBottom: 'var(--space-sm)' }}>
            Add an email to enable password recovery.
          </p>
        )}
        {editingEmail ? (
          <div>
            <div className="form-group mb-md">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn-primary btn-sm" onClick={handleSaveEmail} disabled={saving}>
                {saving ? '...' : 'Save'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => {
                setEditingEmail(false)
                setEmail(user?.email || '')
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{user?.email || '—'}</span>
            <button className="btn-ghost btn-sm" onClick={() => setEditingEmail(true)}>
              {user?.email ? 'Change' : 'Add'}
            </button>
          </div>
        )}
      </div>

      {/* Password */}
      <div className="card mb-lg">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Password</h3>
        {!user?.has_password && (
          <p className="text-sm text-dim" style={{ marginBottom: 'var(--space-sm)' }}>
            No password set — you signed up with Google. Add a password to enable username/password login.
          </p>
        )}
        {showPasswordForm ? (
          <div>
            {user?.has_password && (
              <div className="form-group mb-md">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            <div className="form-group mb-md">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus={!user?.has_password}
              />
            </div>
            <div className="form-group mb-md">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn-primary btn-sm" onClick={handleChangePassword} disabled={saving}>
                {saving ? '...' : user?.has_password ? 'Change Password' : 'Set Password'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => {
                setShowPasswordForm(false)
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-dim">{user?.has_password ? '••••••••' : 'Not set'}</span>
            <button className="btn-ghost btn-sm" onClick={() => setShowPasswordForm(true)}>
              {user?.has_password ? 'Change' : 'Set Password'}
            </button>
          </div>
        )}
      </div>

      {/* Google Account */}
      <div className="card mb-lg">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Google Account</h3>
        {user?.has_google ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="text-sm" style={{ color: 'var(--color-success, #4caf50)' }}>
              ✓ Connected
            </span>
            <button
              className="btn-ghost btn-sm"
              onClick={handleUnlinkGoogle}
              disabled={saving}
              style={{ color: 'var(--color-danger)' }}
            >
              Unlink
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-dim" style={{ marginBottom: 'var(--space-sm)' }}>
              Link your Google account to sign in with Google or as a recovery option.
            </p>
            <button
              className="btn-primary btn-sm"
              onClick={handleLinkGoogle}
              disabled={saving}
            >
              {saving ? '...' : 'Link Google Account'}
            </button>
          </div>
        )}
      </div>
      {/* Delete Account */}
      <div className="card mb-lg">
        <h3 style={{ marginBottom: 'var(--space-md)', color: 'var(--color-danger)' }}>Delete Account</h3>
        <button
          className="btn-ghost btn-sm"
          style={{ color: 'var(--color-danger)' }}
          onClick={() => setConfirmDelete(true)}
        >
          Delete my account
        </button>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Account"
          message="This will permanently delete your account and all your data — tunes, recordings, practice history, everything. This cannot be undone."
          confirmLabel={saving ? '...' : 'Delete my account'}
          danger
          requirePassword={user?.has_password}
          onConfirm={(password) => handleDeleteAccount(password)}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

export default Settings

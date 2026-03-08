import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

function Settings({ onLogout }) {
  const toast = useToast()

  // Username
  const [username, setUsername] = useState('')
  const [editingUsername, setEditingUsername] = useState(false)
  const [loadingUser, setLoadingUser] = useState(true)

  // Password
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [saving, setSaving] = useState(false)

  // Fetch current user on mount
  useState(() => {
    api.get('/users/me').then(res => {
      setUsername(res.data.username)
      setLoadingUser(false)
    }).catch(() => setLoadingUser(false))
  })

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
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to update username', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      toast('Please fill in both fields', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('New passwords do not match', 'error')
      return
    }
    if (newPassword.length < 8) {
      toast('Password must be at least 8 characters', 'error')
      return
    }
    setSaving(true)
    try {
      await api.post('/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      toast('Password changed')
      setShowPasswordForm(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast(err.response?.data?.detail || 'Failed to change password', 'error')
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

      {/* Password */}
      <div className="card mb-lg">
        <h3 style={{ marginBottom: 'var(--space-md)' }}>Password</h3>
        {showPasswordForm ? (
          <div>
            <div className="form-group mb-md">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div className="form-group mb-md">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
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
                {saving ? '...' : 'Change Password'}
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
            <span className="text-dim">••••••••</span>
            <button className="btn-ghost btn-sm" onClick={() => setShowPasswordForm(true)}>Change</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
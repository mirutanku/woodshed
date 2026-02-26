import { useState, useEffect } from 'react'
import api from '../api'
import RecordingUpload from './RecordingUpload'
import SegmentList from './SegmentList'

function TuneDetail({ tuneId, onBack }) {
  const [tune, setTune] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [expandedRecording, setExpandedRecording] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    fetchTune()
    fetchRecordings()
  }, [tuneId])

  async function fetchTune() {
    try {
      const res = await api.get(`/tunes/${tuneId}`)
      setTune(res.data)
      setEditForm({
        title: res.data.title || '',
        composer: res.data.composer || '',
        key: res.data.key || '',
        tempo: res.data.tempo || '',
        form: res.data.form || '',
        status: res.data.status || 'learning',
        notes: res.data.notes || '',
      })
    } catch (err) {
      console.error('Failed to fetch tune:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRecordings() {
    try {
      const res = await api.get(`/tunes/${tuneId}/recordings`)
      setRecordings(res.data)
    } catch (err) {
      console.error('Failed to fetch recordings:', err)
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        title: editForm.title.trim(),
        composer: editForm.composer.trim() || null,
        key: editForm.key.trim() || null,
        tempo: editForm.tempo ? parseInt(editForm.tempo, 10) : null,
        form: editForm.form.trim() || null,
        status: editForm.status,
        notes: editForm.notes.trim() || null,
      }
      const res = await api.patch(`/tunes/${tuneId}`, payload)
      setTune(res.data)
      setEditing(false)
    } catch (err) {
      console.error('Failed to update tune:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/tunes/${tuneId}`)
      onBack()
    } catch (err) {
      const detail = err.response?.data?.detail
      alert(detail || 'Failed to delete tune')
      setConfirmDelete(false)
    }
  }

  async function handleDeleteRecording(recordingId) {
    try {
      await api.delete(`/recordings/${recordingId}`)
      setRecordings(prev => prev.filter(r => r.id !== recordingId))
      if (expandedRecording === recordingId) setExpandedRecording(null)
    } catch (err) {
      console.error('Failed to delete recording:', err)
    }
  }

  function handleEditChange(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  function formatFileSize(bytes) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return <div className="empty-state"><p>Loading...</p></div>
  }

  if (!tune) {
    return <div className="empty-state"><p>Tune not found.</p></div>
  }

  return (
    <div className="fade-in">
      {/* Back button */}
      <button className="btn-ghost mb-lg" onClick={onBack}>
        ← Back to Tunes
      </button>

      {/* Header */}
      {editing ? (
        <form onSubmit={handleSaveEdit}>
          <div className="tune-detail-header">
            <div style={{ flex: 1 }}>
              <div className="form-group mb-md">
                <label>Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => handleEditChange('title', e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-row mb-md">
                <div className="form-group">
                  <label>Composer</label>
                  <input
                    type="text"
                    value={editForm.composer}
                    onChange={e => handleEditChange('composer', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Key</label>
                  <input
                    type="text"
                    value={editForm.key}
                    onChange={e => handleEditChange('key', e.target.value)}
                  />
                </div>
              </div>
              <div className="form-row mb-md">
                <div className="form-group">
                  <label>Tempo (BPM)</label>
                  <input
                    type="number"
                    value={editForm.tempo}
                    onChange={e => handleEditChange('tempo', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Form</label>
                  <input
                    type="text"
                    value={editForm.form}
                    onChange={e => handleEditChange('form', e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group mb-md">
                <label>Status</label>
                <select
                  value={editForm.status}
                  onChange={e => handleEditChange('status', e.target.value)}
                >
                  <option value="learning">Learning</option>
                  <option value="transcribing">Transcribing</option>
                  <option value="playable">Playable</option>
                  <option value="polished">Polished</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
              <div className="form-group mb-md">
                <label>Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => handleEditChange('notes', e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-xl)' }}>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="tune-detail-header">
            <div>
              <h1>{tune.title}</h1>
              {tune.composer && <span className="text-dim">{tune.composer}</span>}
            </div>
            <div className="tune-detail-actions">
              <span className={`status-badge ${tune.status}`}>{tune.status}</span>
              <button className="btn-sm" onClick={() => setEditing(true)}>Edit</button>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                  <span className="text-sm text-dim">Sure?</span>
                  <button className="btn-danger btn-sm" onClick={handleDelete}>Yes, Delete</button>
                  <button className="btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
                </div>
              ) : (
                <button className="btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
            </div>
          </div>

          {/* Metadata grid */}
          <div className="tune-meta-grid">
            {tune.key && (
              <div className="meta-item">
                <span className="meta-label">Key</span>
                <span className="meta-value">{tune.key}</span>
              </div>
            )}
            {tune.tempo && (
              <div className="meta-item">
                <span className="meta-label">Tempo</span>
                <span className="meta-value">{tune.tempo} BPM</span>
              </div>
            )}
            {tune.form && (
              <div className="meta-item">
                <span className="meta-label">Form</span>
                <span className="meta-value">{tune.form}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          {tune.notes && (
            <div className="tune-notes">{tune.notes}</div>
          )}
        </>
      )}

      {/* Recordings section */}
      <div className="section-header">
        <h2>Recordings</h2>
      </div>

      <RecordingUpload tuneId={tuneId} onUploaded={fetchRecordings} />

      {recordings.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
          <p className="text-dim">No recordings yet. Upload an audio file above.</p>
        </div>
      ) : (
        <div className="recording-list">
          {recordings.map(rec => (
            <div key={rec.id}>
              <div className="recording-item">
                <div className="recording-info">
                  <span className="recording-name">{rec.original_name}</span>
                  <div className="recording-meta">
                    {rec.artist && <span>{rec.artist}</span>}
                    <span>{formatFileSize(rec.file_size)}</span>
                    <span>{formatDate(rec.created_at)}</span>
                  </div>
                  {rec.description && (
                    <span className="text-sm text-dim mt-sm">{rec.description}</span>
                  )}
                </div>
                <div className="recording-actions">
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() =>
                      setExpandedRecording(expandedRecording === rec.id ? null : rec.id)
                    }
                  >
                    {expandedRecording === rec.id ? 'Hide Segments' : 'Segments'}
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => handleDeleteRecording(rec.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
              {expandedRecording === rec.id && (
                <div style={{ marginLeft: 'var(--space-lg)', marginTop: 'var(--space-sm)' }}>
                  <SegmentList recordingId={rec.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default TuneDetail
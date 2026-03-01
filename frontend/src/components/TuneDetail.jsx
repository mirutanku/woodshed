import { useState, useEffect } from 'react'
import api from '../api'
import { useToast } from './Toast'
import useIsMobile from '../useIsMobile'
import MobileTuneDetail from './MobileTuneDetail'
import RecordingUpload from './RecordingUpload'
import SegmentList from './SegmentList'
import AudioPlayer from './AudioPlayer'
import KeyPicker from './KeyPicker'
import { parseKey, buildKey } from '../keyConstants'

function TuneDetail({ tuneId, onBack }) {
  const toast = useToast()
  const isMobile = useIsMobile()
  const [tune, setTune] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [expandedRecording, setExpandedRecording] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteRecording, setConfirmDeleteRecording] = useState(null)
  const [recordingSegments, setRecordingSegments] = useState({})
  const [playbackTime, setPlaybackTime] = useState(0)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    fetchTune()
    fetchRecordings()
  }, [tuneId])

  useEffect(() => {
    if (expandedRecording && !recordingSegments[expandedRecording]) {
      fetchSegments(expandedRecording)
    }
  }, [expandedRecording])

  async function fetchSegments(recordingId) {
    try {
      const res = await api.get(`/recordings/${recordingId}/segments`)
      setRecordingSegments(prev => ({ ...prev, [recordingId]: res.data }))
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    }
  }

  function handleSegmentsChanged(recordingId) {
    fetchSegments(recordingId)
  }

  async function fetchTune() {
    try {
      const res = await api.get(`/tunes/${tuneId}`)
      setTune(res.data)
      const parsed = parseKey(res.data.key)
      setEditForm({
        title: res.data.title || '',
        composer: res.data.composer || '',
        keyTonic: parsed.tonic,
        keyQuality: parsed.quality,
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

    // All-or-nothing key validation
    if ((editForm.keyTonic && !editForm.keyQuality) || (!editForm.keyTonic && editForm.keyQuality)) {
      alert('Please select both a tonic and quality for the key, or leave both blank')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: editForm.title.trim(),
        composer: editForm.composer.trim() || null,
        key: buildKey(editForm.keyTonic, editForm.keyQuality),
        tempo: editForm.tempo ? parseInt(editForm.tempo, 10) : null,
        form: editForm.form.trim() || null,
        status: editForm.status,
        notes: editForm.notes.trim() || null,
      }
      const res = await api.patch(`/tunes/${tuneId}`, payload)
      setTune(res.data)
      setEditing(false)
      toast('Changes saved')
    } catch (err) {
      console.error('Failed to update tune:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/tunes/${tuneId}`)
      toast('Tune deleted')
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
      setConfirmDeleteRecording(null)
      toast('Recording deleted')
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

  // Mobile: render shed-style player with quick segment marking
  if (isMobile) {
    return (
      <MobileTuneDetail
        tune={tune}
        recordings={recordings}
        onBack={onBack}
        onRecordingsChanged={fetchRecordings}
      />
    )
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
                <KeyPicker
                  tonic={editForm.keyTonic}
                  quality={editForm.keyQuality}
                  onTonicChange={v => handleEditChange('keyTonic', v)}
                  onQualityChange={v => handleEditChange('keyQuality', v)}
                />
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
                <span className="meta-label">Canonical Key</span>
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

      {recordings.length === 0 ? (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <RecordingUpload tuneId={tuneId} onUploaded={fetchRecordings} />
        </div>
      ) : (
        <div className="recording-list">
          {recordings.map(rec => {
            const isExpanded = expandedRecording === rec.id
            const segments = recordingSegments[rec.id] || []
            return (
              <div key={rec.id}>
                <div
                  className={`recording-item ${isExpanded ? 'expanded' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedRecording(isExpanded ? null : rec.id)}
                >
                  <div className="recording-info">
                    <span className="recording-name">{rec.original_name}</span>
                    <div className="recording-meta">
                      {rec.artist && <span>{rec.artist}</span>}
                      {rec.key && <span>{rec.key}</span>}
                      <span>{formatFileSize(rec.file_size)}</span>
                      <span>{formatDate(rec.created_at)}</span>
                    </div>
                    {rec.description && (
                      <span className="text-sm text-dim mt-sm">{rec.description}</span>
                    )}
                  </div>
                  <div className="recording-actions">
                    <span className="text-dim">{isExpanded ? '▾' : '▸'}</span>
                    {confirmDeleteRecording === rec.id ? (
                      <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="text-sm text-dim">Sure?</span>
                        <button className="btn-danger btn-sm" onClick={() => handleDeleteRecording(rec.id)}>Yes</button>
                        <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteRecording(null)}>No</button>
                      </div>
                    ) : (
                      <button
                        className="btn-ghost btn-sm"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={e => { e.stopPropagation(); setConfirmDeleteRecording(rec.id) }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                {isExpanded && (
                  <div className="recording-expanded fade-in">
                    <AudioPlayer
                      filename={rec.filename}
                      segments={segments}
                      onTimeUpdate={setPlaybackTime}
                    />
                    <SegmentList
                      recordingId={rec.id}
                      onChanged={() => handleSegmentsChanged(rec.id)}
                      playbackTime={playbackTime}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Upload box — shown below recordings when recordings exist */}
      {recordings.length > 0 && (
        showUpload ? (
          <div className="mt-md">
            <RecordingUpload tuneId={tuneId} onUploaded={() => { fetchRecordings(); setShowUpload(false) }} />
            <button
              className="btn-ghost btn-sm mt-sm"
              onClick={() => setShowUpload(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn-ghost mt-md"
            onClick={() => setShowUpload(true)}
          >
            + Add Recording
          </button>
        )
      )}
    </div>
  )
}

export default TuneDetail
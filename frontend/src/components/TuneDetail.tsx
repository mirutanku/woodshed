import { useState, useEffect, useRef } from 'react'
import api from '../api'
import { useToast } from './Toast'
import useIsMobile from '../useIsMobile'
import MobileTuneDetail from './MobileTuneDetail'
import RecordingUpload from './RecordingUpload'
import SegmentList from './SegmentList'
import AudioPlayer from './AudioPlayer'
import KeyPicker from './KeyPicker'
import ConfirmDialog from './ConfirmDialog'
import useVisibilityTimer from '../useVisibilityTimer'
import { localToday } from '../dateUtils'
import { parseKey, buildKey } from '../keyConstants'
import './TuneDetail.css'

function formatTime(seconds: number) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function TuneDetail({ tuneId, onBack }: {
  tuneId: number
  onBack: () => void
}) {
  const toast = useToast()
  const isMobile = useIsMobile()
  const [tune, setTune] = useState<any>(null)
  const [recordings, setRecordings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [expandedRecording, setExpandedRecording] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteRecording, setConfirmDeleteRecording] = useState<number | null>(null)
  const [recordingSegments, setRecordingSegments] = useState<Record<number, any[]>>({})
  const [playbackTime, setPlaybackTime] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [editingRecordingId, setEditingRecordingId] = useState<number | null>(null)
  const [editRecordingForm, setEditRecordingForm] = useState({ original_name: '', artist: '', description: '', keyTonic: '', keyQuality: '' })

  // Desktop audio-aware tracking
  const isPlayingRef = useRef(false)

  const { flush: flushTimer } = useVisibilityTimer((seconds) => {
    api.post(`/tunes/${tuneId}/play-time?seconds=${seconds}&client_date=${localToday()}`).catch(() => {})
  }, isPlayingRef)

  // Display timer — independent from tracking
  const [practiceElapsed, setPracticeElapsed] = useState(0)
  const practiceStartRef = useRef(Date.now())
  const practiceBaseRef = useRef(0)

  useEffect(() => {
    api.get(`/today?client_date=${localToday()}`).then(res => {
      const tuneData = res.data.tunes?.find((t: any) => t.tune_id === tuneId)
      if (tuneData?.play_seconds) {
        practiceBaseRef.current = tuneData.play_seconds
      }
    }).catch(() => {})
  }, [tuneId])

  useEffect(() => {
    const interval = setInterval(() => {
      const sessionSeconds = Math.round((Date.now() - practiceStartRef.current) / 1000)
      setPracticeElapsed(practiceBaseRef.current + sessionSeconds)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  function handlePlayingChange(playing: boolean) {
    isPlayingRef.current = playing
  }

  useEffect(() => {
    fetchTune()
    fetchRecordings()
  }, [tuneId])

  useEffect(() => {
    if (expandedRecording && !recordingSegments[expandedRecording]) {
      fetchSegments(expandedRecording)
    }
  }, [expandedRecording])

  async function fetchSegments(recordingId: number) {
    try {
      const res = await api.get(`/recordings/${recordingId}/segments`)
      setRecordingSegments(prev => ({ ...prev, [recordingId]: res.data }))
    } catch (err: any) {
      console.error('Failed to fetch segments:', err)
    }
  }

  function handleSegmentsChanged(recordingId: number) {
    fetchSegments(recordingId)
  }

  async function fetchTune() {
    try {
      const res = await api.get(`/tunes/${tuneId}`)
      setTune(res.data)
      setNotesValue(res.data.notes || '')
      const parsed = parseKey(res.data.key)
      setEditForm({
        title: res.data.title || '',
        composer: res.data.composer || '',
        keyTonic: parsed.tonic,
        keyQuality: parsed.quality,
        status: res.data.status || 'learning',
        notes: res.data.notes || '',
      })
    } catch (err: any) {
      console.error('Failed to fetch tune:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchRecordings() {
    try {
      const res = await api.get(`/tunes/${tuneId}/recordings`)
      setRecordings(res.data)
    } catch (err: any) {
      console.error('Failed to fetch recordings:', err)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
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
        status: editForm.status,
      }
      const res = await api.patch(`/tunes/${tuneId}`, payload)
      setTune(res.data)
      setEditing(false)
      toast('Changes saved')
    } catch (err: any) {
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
    } catch (err: any) {
      const detail = err.response?.data?.detail
      alert(detail || 'Failed to delete tune')
      setConfirmDelete(false)
    }
  }

  function startEditRecording(rec: any) {
    const parsed = parseKey(rec.key)
    setEditingRecordingId(rec.id)
    setEditRecordingForm({
      original_name: rec.original_name || '',
      artist: rec.artist || '',
      description: rec.description || '',
      keyTonic: parsed.tonic,
      keyQuality: parsed.quality,
    })
  }

  async function handleSaveRecording(recId: number) {
    if ((editRecordingForm.keyTonic && !editRecordingForm.keyQuality) || (!editRecordingForm.keyTonic && editRecordingForm.keyQuality)) {
      alert('Please select both a tonic and quality for the key, or leave both blank')
      return
    }
    try {
      const params = new URLSearchParams()
      params.set('original_name', editRecordingForm.original_name.trim())
      params.set('artist', editRecordingForm.artist.trim())
      params.set('description', editRecordingForm.description.trim())
      const key = buildKey(editRecordingForm.keyTonic, editRecordingForm.keyQuality)
      params.set('key', key || '')
      await api.patch(`/recordings/${recId}?${params.toString()}`)
      setEditingRecordingId(null)
      toast('Recording updated')
      fetchRecordings()
    } catch (err) {
      console.error('Failed to update recording:', err)
    }
  }

  async function handleDeleteRecording(recordingId: number) {
    try {
      await api.delete(`/recordings/${recordingId}`)
      setRecordings(prev => prev.filter(r => r.id !== recordingId))
      if (expandedRecording === recordingId) setExpandedRecording(null)
      setConfirmDeleteRecording(null)
      toast('Recording deleted')
    } catch (err: any) {
      console.error('Failed to delete recording:', err)
    }
  }

  function handleEditChange(field: string, value: string) {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  function formatFileSize(bytes: number) {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  async function handleNotesSave() {
    if (notesValue === (tune.notes || '')) return
    setNotesSaving(true)
    try {
      const res = await api.patch(`/tunes/${tuneId}`, {
        notes: notesValue.trim() || null,
      })
      setTune(res.data)
    } catch (err: any) {
      console.error('Failed to save notes:', err)
    } finally {
      setNotesSaving(false)
    }
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
        onTuneChanged={fetchTune}
        onTuneDeleted={onBack}
      />
    )
  }

  return (
    <div className="fade-in">
      {/* Back button */}
      <button className="btn-ghost mb-lg" onClick={() => { flushTimer(); onBack() }}>
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
              <div className="form-group mb-md">
                <label>Status</label>
                <select
                  value={editForm.status}
                  onChange={e => handleEditChange('status', e.target.value)}
                >
                  <option value="learning">Learning</option>
                  <option value="polishing">Polishing</option>
                  <option value="mastering">Mastering</option>
                </select>
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
              <button className="btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>Delete</button>
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
          </div>

          {/* Notes — always visible, inline editable */}
          <div className="tune-notes-inline">
            <textarea
              className="tune-notes-editor"
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              onBlur={handleNotesSave}
              placeholder="What are you working on?"
              spellCheck={false}
              rows={1}
            />
            {notesSaving && <span className="tune-notes-saving">Saving...</span>}
          </div>
        </>
      )}

      {/* Practice time display */}
      {practiceElapsed > 0 && (
        <div className="tune-practice-timer">
          {formatTime(practiceElapsed)} on this tune today
        </div>
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
                  {editingRecordingId === rec.id ? (
                    <div className="upload-fields" onClick={e => e.stopPropagation()}>
                      <div className="form-group">
                        <label>Title</label>
                        <input
                          type="text"
                          value={editRecordingForm.original_name}
                          onChange={e => setEditRecordingForm(prev => ({ ...prev, original_name: e.target.value }))}
                          autoFocus
                        />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Artist</label>
                          <input
                            type="text"
                            value={editRecordingForm.artist}
                            onChange={e => setEditRecordingForm(prev => ({ ...prev, artist: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label>Description</label>
                          <input
                            type="text"
                            value={editRecordingForm.description}
                            onChange={e => setEditRecordingForm(prev => ({ ...prev, description: e.target.value }))}
                          />
                        </div>
                      </div>
                      <KeyPicker
                        tonic={editRecordingForm.keyTonic}
                        quality={editRecordingForm.keyQuality}
                        onTonicChange={(v: string) => setEditRecordingForm(prev => ({ ...prev, keyTonic: v }))}
                        onQualityChange={(v: string) => setEditRecordingForm(prev => ({ ...prev, keyQuality: v }))}
                        label="Key"
                      />
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                        <button className="btn-primary btn-sm" onClick={() => handleSaveRecording(rec.id)}>Save</button>
                        <button className="btn-ghost btn-sm" onClick={() => setEditingRecordingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
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
                        <button
                          className="btn-ghost btn-action"
                          onClick={e => { e.stopPropagation(); startEditRecording(rec) }}
                          title="Edit recording"
                        >
                          ✎
                        </button>
                        <button
                          className="btn-ghost btn-action"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={e => { e.stopPropagation(); setConfirmDeleteRecording(rec.id) }}
                          title="Delete recording"
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {isExpanded && (
                  <div className="recording-expanded fade-in">
                    <AudioPlayer
                      recordingId={rec.id}
                      tuneId={tuneId}
                      tuneTitle={tune.title}
                      segments={segments}
                      onTimeUpdate={setPlaybackTime}
                      onPlayingChange={handlePlayingChange}
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
      {confirmDeleteRecording && (
        <ConfirmDialog
          title="Delete Recording"
          message="Are you sure you want to delete this recording? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteRecording(confirmDeleteRecording)}
          onCancel={() => setConfirmDeleteRecording(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Tune"
          message={`Are you sure you want to delete "${tune.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

export default TuneDetail
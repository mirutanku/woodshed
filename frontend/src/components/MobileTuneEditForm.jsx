import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'
import KeyPicker from './KeyPicker'
import ConfirmDialog from './ConfirmDialog'
import { parseKey, buildKey } from '../keyConstants'

function MobileTuneEditForm({ tune, recordings, onSave, onDelete, onDeleteRecording, onCancel }) {
  const toast = useToast()
  const parsed = parseKey(tune.key)
  const [tuneForm, setTuneForm] = useState({
    title: tune.title || '',
    composer: tune.composer || '',
    keyTonic: parsed.tonic,
    keyQuality: parsed.quality,
    status: tune.status || 'learning',
    notes: tune.notes || '',
  })
  const [confirmDeleteTune, setConfirmDeleteTune] = useState(false)
  const [confirmDeleteRecording, setConfirmDeleteRecording] = useState(null)

  async function handleSave() {
    if (!tuneForm.title.trim()) return
    try {
      await api.patch(`/tunes/${tune.id}`, {
        title: tuneForm.title.trim(),
        composer: tuneForm.composer.trim() || null,
        key: buildKey(tuneForm.keyTonic, tuneForm.keyQuality),
        status: tuneForm.status,
        notes: tuneForm.notes.trim() || null,
      })
      toast('Tune updated')
      onSave()
    } catch (err) {
      toast('Failed to update tune', 'error')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/tunes/${tune.id}`)
      toast('Tune deleted')
      onDelete()
    } catch (err) {
      toast('Failed to delete tune', 'error')
    } finally {
      setConfirmDeleteTune(false)
    }
  }

  async function handleDeleteRecording(recId) {
    try {
      await api.delete(`/recordings/${recId}`)
      toast('Recording deleted')
      setConfirmDeleteRecording(null)
      onDeleteRecording(recId)
    } catch (err) {
      toast('Failed to delete recording', 'error')
    }
  }

  async function handleNotesSave() {
    if (notesValue === (tune.notes || '')) return
    setNotesSaving(true)
    try {
      await api.patch(`/tunes/${tune.id}`, { notes: notesValue.trim() || null })
      if (onTuneChanged) onTuneChanged()
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setNotesSaving(false)
    }
  }

  return (
    <div className="shed-tune-edit">
      <div className="form-group">
        <label>Title *</label>
        <input
          type="text"
          value={tuneForm.title}
          onChange={e => setTuneForm(prev => ({ ...prev, title: e.target.value }))}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label>Composer</label>
        <input
          type="text"
          value={tuneForm.composer}
          onChange={e => setTuneForm(prev => ({ ...prev, composer: e.target.value }))}
        />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <div style={{ flex: 1 }}>
          <KeyPicker
            tonic={tuneForm.keyTonic}
            quality={tuneForm.keyQuality}
            onTonicChange={v => setTuneForm(prev => ({ ...prev, keyTonic: v }))}
            onQualityChange={v => setTuneForm(prev => ({ ...prev, keyQuality: v }))}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Status</label>
          <select
            value={tuneForm.status}
            onChange={e => setTuneForm(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="learning">Learning</option>
            <option value="polishing">Polishing</option>
            <option value="mastering">Mastering</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Notes</label>
        <textarea
          value={tuneForm.notes}
          onChange={e => setTuneForm(prev => ({ ...prev, notes: e.target.value }))}
          rows={2}
        />
      </div>
      {recordings.length > 0 && (
        <div className="form-group">
          <label>Recordings</label>
          {recordings.map(rec => (
            <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-xs) 0' }}>
              <span className="text-sm">{rec.artist || rec.original_name}</span>
              <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteRecording(rec.id)}>Delete Recording</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-primary btn-sm" onClick={handleSave}>Save</button>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteTune(true)} style={{ marginLeft: 'auto' }}>Delete Tune</button>
      </div>
    {confirmDeleteTune && (
        <ConfirmDialog
          title="Delete Tune"
          message={`Are you sure you want to delete "${tune.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteTune(false)}
        />
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
    </div>
  )
}

export default MobileTuneEditForm
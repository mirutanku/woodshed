import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

function MobileTuneEditForm({ tune, recordings, onSave, onDelete, onDeleteRecording, onCancel }) {
  const toast = useToast()
  const [tuneForm, setTuneForm] = useState({
    title: tune.title || '',
    composer: tune.composer || '',
    key: tune.key || '',
    tempo: tune.tempo || '',
    form: tune.form || '',
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
        key: tuneForm.key.trim() || null,
        tempo: tuneForm.tempo ? parseInt(tuneForm.tempo, 10) : null,
        form: tuneForm.form.trim() || null,
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
        <div className="form-group" style={{ flex: 1 }}>
          <label>Key</label>
          <input
            type="text"
            value={tuneForm.key}
            onChange={e => setTuneForm(prev => ({ ...prev, key: e.target.value }))}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Tempo</label>
          <input
            type="number"
            value={tuneForm.tempo}
            onChange={e => setTuneForm(prev => ({ ...prev, tempo: e.target.value }))}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Form</label>
          <input
            type="text"
            value={tuneForm.form}
            onChange={e => setTuneForm(prev => ({ ...prev, form: e.target.value }))}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Status</label>
          <select
            value={tuneForm.status}
            onChange={e => setTuneForm(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="learning">Learning</option>
            <option value="transcribing">Transcribing</option>
            <option value="playable">Playable</option>
            <option value="polished">Polished</option>
            <option value="retired">Retired</option>
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
              {confirmDeleteRecording === rec.id ? (
                <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                  <span className="text-sm text-dim">You sure?</span>
                  <button className="btn-danger btn-sm" onClick={() => handleDeleteRecording(rec.id)}>Yes</button>
                  <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteRecording(null)}>No</button>
                </div>
              ) : (
                <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteRecording(rec.id)}>Delete Recording</button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn-primary btn-sm" onClick={handleSave}>Save</button>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        {confirmDeleteTune ? (
          <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', marginLeft: 'auto' }}>
            <span className="text-sm text-dim">You sure?</span>
            <button className="btn-danger btn-sm" onClick={handleDelete}>Yes</button>
            <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteTune(false)}>No</button>
          </div>
        ) : (
          <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteTune(true)} style={{ marginLeft: 'auto' }}>Delete Tune</button>
        )}
      </div>
    </div>
  )
}

export default MobileTuneEditForm
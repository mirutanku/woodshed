import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'
import KeyPicker from './KeyPicker'
import ConfirmDialog from './ConfirmDialog'
import { parseKey, buildKey } from '../keyConstants'

function MobileTuneEditForm({ tune, recordings, onSave, onDelete, onDeleteRecording, onCancel }: {
  tune: any
  recordings: any[]
  onSave: () => void
  onDelete: () => void
  onDeleteRecording: (recId: number) => void
  onCancel: () => void
}) {
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
  const [confirmDeleteRecording, setConfirmDeleteRecording] = useState<number | null>(null)
  const [editingRecordingId, setEditingRecordingId] = useState<number | null>(null)
  const [editRecordingForm, setEditRecordingForm] = useState({ original_name: '', artist: '', description: '', keyTonic: '', keyQuality: '' })
  
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
    } catch (err: any) {
      toast('Failed to update tune', 'error')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/tunes/${tune.id}`)
      toast('Tune deleted')
      onDelete()
    } catch (err: any) {
      toast('Failed to delete tune', 'error')
    } finally {
      setConfirmDeleteTune(false)
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
      onSave()
    } catch (err) {
      console.error('Failed to update recording:', err)
    }
  }

  async function handleDeleteRecording(recId: number) {
    try {
      await api.delete(`/recordings/${recId}`)
      toast('Recording deleted')
      setConfirmDeleteRecording(null)
      onDeleteRecording(recId)
    } catch (err: any) {
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
          {recordings.map((rec: any) => (
            <div key={rec.id} style={{ padding: 'var(--space-xs) 0' }}>
              {editingRecordingId === rec.id ? (
                <div className="upload-fields">
                  <div className="form-group">
                    <label>Title</label>
                    <input
                      type="text"
                      value={editRecordingForm.original_name}
                      onChange={e => setEditRecordingForm(prev => ({ ...prev, original_name: e.target.value }))}
                      autoFocus
                    />
                  </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-sm">{rec.artist || rec.original_name}</span>
                  <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                    <button className="btn-ghost btn-sm" onClick={() => startEditRecording(rec)}>Edit</button>
                    <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteRecording(rec.id)}>Delete</button>
                  </div>
                </div>
              )}
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

import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

function formatTime(seconds) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MobileSegmentEditForm({ segment, currentTime, onSave, onDelete, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState({
    label: segment.label,
    start_time: segment.start_time,
    end_time: segment.end_time,
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    try {
      await api.patch(`/segments/${segment.id}`, {
        label: form.label.trim(),
        start_time: parseFloat(form.start_time),
        end_time: parseFloat(form.end_time),
      })
      toast('Segment updated')
      onSave()
    } catch (err) {
      toast('Failed to update segment', 'error')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/segments/${segment.id}`)
      toast('Segment deleted')
      onDelete(segment.id)
    } catch (err) {
      toast('Failed to delete segment', 'error')
    } finally {
      setConfirmDelete(false)
    }
  }

  return (
    <div className="shed-segment-edit">
      <input
        type="text"
        value={form.label}
        onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
        placeholder="Label"
      />
      <div className="shed-segment-edit-times">
        <div className="shed-segment-edit-field">
          <label>Start (sec)</label>
          <input
            type="number"
            step="0.1"
            value={form.start_time}
            onChange={e => setForm(prev => ({ ...prev, start_time: e.target.value }))}
          />
          <button
            className="btn-ghost btn-action"
            onClick={() => setForm(prev => ({ ...prev, start_time: Math.round(currentTime * 10) / 10 }))}
          >
            Now
          </button>
        </div>
        <div className="shed-segment-edit-field">
          <label>End (sec)</label>
          <input
            type="number"
            step="0.1"
            value={form.end_time}
            onChange={e => setForm(prev => ({ ...prev, end_time: e.target.value }))}
          />
          <button
            className="btn-ghost btn-action"
            onClick={() => setForm(prev => ({ ...prev, end_time: Math.round(currentTime * 10) / 10 }))}
          >
            Now
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button className="btn-primary btn-sm" onClick={handleSave}>Save</button>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
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
  )
}

export default MobileSegmentEditForm
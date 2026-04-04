import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

function formatTime(seconds: number) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MobileSegmentEditForm({ segment, currentTime, onSave, onDelete, onCancel }: {
  segment: any
  currentTime: number
  onSave: () => void
  onDelete: (segmentId: number) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({
    label: segment.label,
    start_time: Math.round(segment.start_time),
    end_time: Math.round(segment.end_time),
  })
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleSave() {
    try {
      await api.patch(`/segments/${segment.id}`, {
        label: form.label.trim(),
        start_time: Math.min(form.start_time, form.end_time),
        end_time: Math.max(form.start_time, form.end_time),
      })
      toast('Segment updated')
      onSave()
    } catch (err: any) {
      toast('Failed to update segment', 'error')
    }
  }

  async function handleDelete() {
    try {
      await api.delete(`/segments/${segment.id}`)
      toast('Segment deleted')
      onDelete(segment.id)
    } catch (err: any) {
      toast('Failed to delete segment', 'error')
    } finally {
      setConfirmDelete(false)
    }
  }

  return (
    <div className="shed-segment-edit">
      <div className="shed-mark-header">
        <span className="shed-mark-title">Edit Segment</span>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <input
        type="text"
        value={form.label}
        onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))}
        placeholder="Label"
      />

      <div className="shed-mark-buttons">
        <div className="shed-mark-row">
          <button
            className="shed-mark-btn marked"
            onClick={() => setForm(prev => ({ ...prev, start_time: Math.round(currentTime) }))}
          >
            Start: {formatTime(form.start_time)}
          </button>
          <div className="shed-mark-nudge">
            <button className="btn-ghost btn-sm" onClick={() => setForm(prev => ({ ...prev, start_time: Math.max(0, prev.start_time - 1) }))}>−1s</button>
            <button className="btn-ghost btn-sm" onClick={() => setForm(prev => ({ ...prev, start_time: prev.start_time + 1 }))}>+1s</button>
          </div>
        </div>
        <div className="shed-mark-row">
          <button
            className="shed-mark-btn marked"
            onClick={() => setForm(prev => ({ ...prev, end_time: Math.round(currentTime) }))}
          >
            End: {formatTime(form.end_time)}
          </button>
          <div className="shed-mark-nudge">
            <button className="btn-ghost btn-sm" onClick={() => setForm(prev => ({ ...prev, end_time: Math.max(0, prev.end_time - 1) }))}>−1s</button>
            <button className="btn-ghost btn-sm" onClick={() => setForm(prev => ({ ...prev, end_time: prev.end_time + 1 }))}>+1s</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
        <button className="btn-primary btn-sm" onClick={handleSave}>Save</button>
        <div style={{ marginLeft: 'auto' }}>
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
    </div>
  )
}

export default MobileSegmentEditForm
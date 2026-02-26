import { useState, useEffect } from 'react'
import api from '../api'

const SEGMENT_COLORS = [
  '#d4a04a', '#5a9e6f', '#6b8ec4', '#c45b4a',
  '#9b7ec4', '#4a9e9e', '#c4884a', '#7a9e5a',
]

function formatTime(seconds) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function SegmentList({ recordingId, onChanged, playbackTime = 0 }) {
  const [segments, setSegments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)

  // Form state
  const [label, setLabel] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [color, setColor] = useState(SEGMENT_COLORS[0])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSegments()
  }, [recordingId])

  async function fetchSegments() {
    try {
      const res = await api.get(`/recordings/${recordingId}/segments`)
      setSegments(res.data)
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setLabel('')
    setStartTime('')
    setEndTime('')
    setColor(SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length])
    setNotes('')
    setEditingId(null)
    setShowForm(false)
  }

  function startEdit(segment) {
    setLabel(segment.label)
    setStartTime(Math.round(segment.start_time).toString())
    setEndTime(Math.round(segment.end_time).toString())
    setColor(segment.color || SEGMENT_COLORS[0])
    setNotes(segment.notes || '')
    setEditingId(segment.id)
    setShowForm(true)
  }

  function markStart() {
    setStartTime(Math.round(playbackTime).toString())
  }

  function markEnd() {
    setEndTime(Math.round(playbackTime).toString())
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!label.trim() || !startTime || !endTime) return

    setSaving(true)
    try {
      const payload = {
        label: label.trim(),
        start_time: parseInt(startTime, 10),
        end_time: parseInt(endTime, 10),
        color,
        notes: notes.trim() || null,
      }

      if (editingId) {
        await api.patch(`/segments/${editingId}`, payload)
      } else {
        await api.post(`/recordings/${recordingId}/segments`, payload)
      }

      await fetchSegments()
      if (onChanged) onChanged()
      resetForm()
    } catch (err) {
      console.error('Failed to save segment:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(segmentId) {
    try {
      await api.delete(`/segments/${segmentId}`)
      setSegments(prev => prev.filter(s => s.id !== segmentId))
      if (onChanged) onChanged()
    } catch (err) {
      console.error('Failed to delete segment:', err)
    }
  }

  if (loading) return <p className="text-dim text-sm">Loading segments...</p>

  return (
    <div className="fade-in">
      {segments.length > 0 && (
        <div className="segment-list">
          {segments.map(seg => (
            <div key={seg.id} className="segment-item">
              <div
                className="segment-color"
                style={{ backgroundColor: seg.color || SEGMENT_COLORS[0] }}
              />
              <div className="segment-info">
                <span className="segment-label">{seg.label}</span>
                <span className="segment-times">
                  {formatTime(seg.start_time)} – {formatTime(seg.end_time)}
                </span>
                {seg.notes && <span className="text-sm text-dim">{seg.notes}</span>}
              </div>
              <div className="segment-actions">
                <button className="btn-ghost btn-sm" onClick={() => startEdit(seg)}>
                  Edit
                </button>
                <button
                  className="btn-ghost btn-sm"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => handleDelete(seg.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <form className="segment-form mt-md" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Label</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Head, Solo, Bridge"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Start (sec)</label>
            <div className="mark-input">
              <input
                type="number"
                step="1"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                placeholder="0"
              />
              <button
                type="button"
                className="mark-btn"
                onClick={markStart}
                title="Mark current playback time as start"
              >
                ● Mark
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>End (sec)</label>
            <div className="mark-input">
              <input
                type="number"
                step="1"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                placeholder="0"
              />
              <button
                type="button"
                className="mark-btn"
                onClick={markEnd}
                title="Mark current playback time as end"
              >
                ● Mark
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Color</label>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {SEGMENT_COLORS.map(c => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: color === c ? '2px solid var(--color-text)' : '2px solid transparent',
                    transition: 'border-color 0.15s ease',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="submit" className="btn-primary btn-sm" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Segment'}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn-ghost btn-sm mt-md"
          onClick={() => {
            setColor(SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length])
            setShowForm(true)
          }}
        >
          + Add Segment
        </button>
      )}
    </div>
  )
}

export default SegmentList
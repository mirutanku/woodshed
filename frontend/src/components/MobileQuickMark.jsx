import { useState } from 'react'
import api from '../api'
import { useToast } from './Toast'

function formatTime(seconds) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const SEGMENT_COLORS = [
  '#d4a04a', '#5a9e6f', '#6b8ec4', '#c45b4a',
  '#9b7ec4', '#4a9e9e', '#c4884a', '#7a9e5a',
]

function MobileQuickMark({ recordingId, segmentCount, currentTime, onSaved, onCancel }) {
  const toast = useToast()
  const [markStart, setMarkStart] = useState(null)
  const [markEnd, setMarkEnd] = useState(null)
  const [markLabel, setMarkLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (markStart === null || markEnd === null || !markLabel.trim()) return

    setSaving(true)
    try {
      await api.post(`/recordings/${recordingId}/segments`, {
        label: markLabel.trim(),
        start_time: Math.min(markStart, markEnd),
        end_time: Math.max(markStart, markEnd),
        color: SEGMENT_COLORS[segmentCount % SEGMENT_COLORS.length],
      })
      toast(`Added "${markLabel.trim()}"`)
      onSaved()
    } catch (err) {
      toast('Failed to save segment', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="shed-mark-panel">
      <div className="shed-mark-header">
        <span className="shed-mark-title">Mark Segment</span>
        <button className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <div className="shed-mark-buttons">
        <button
          className={`shed-mark-btn ${markStart !== null ? 'marked' : ''}`}
          onClick={() => setMarkStart(Math.round(currentTime))}
        >
          {markStart !== null ? `Start: ${formatTime(markStart)}` : '● Mark Start'}
        </button>
        <button
          className={`shed-mark-btn ${markEnd !== null ? 'marked' : ''}`}
          onClick={() => setMarkEnd(Math.round(currentTime))}
        >
          {markEnd !== null ? `End: ${formatTime(markEnd)}` : '● Mark End'}
        </button>
      </div>

      {markStart !== null && markEnd !== null && (
        <div className="shed-mark-save">
          <input
            type="text"
            value={markLabel}
            onChange={e => setMarkLabel(e.target.value)}
            placeholder="Label (e.g. Solo, Bridge)"
            autoFocus
            className="shed-mark-input"
          />
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!markLabel.trim() || saving}
          >
            {saving ? '...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

export default MobileQuickMark
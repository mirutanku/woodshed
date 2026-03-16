import { useState, useMemo } from 'react'
import { localToday } from './dateUtils'
import { FOCUS_OPTIONS } from './constants'

function StarRating({ value, onChange }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          className={`star ${star <= value ? 'filled' : ''}`}
          onClick={() => onChange(star === value ? 0 : star)}
        >
          ★
        </span>
      ))}
    </div>
  )
}

function SessionForm({ tunes, onSubmit, onCancel, saving, error }) {
  const [sessionDate, setSessionDate] = useState(localToday())
  const [sessionDuration, setSessionDuration] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')

  // Track which tunes are checked and their optional details
  const [checked, setChecked] = useState({})       // { tuneId: true }
  const [details, setDetails] = useState({})        // { tuneId: { focus, tempo_practiced, duration_minutes, notes, rating } }
  const [expanded, setExpanded] = useState({})       // { tuneId: true } — which detail panels are open

  function toggleTune(tuneId) {
    setChecked(prev => {
      const next = { ...prev }
      if (next[tuneId]) {
        delete next[tuneId]
        // Also collapse and clear details
        setExpanded(p => { const n = { ...p }; delete n[tuneId]; return n })
        setDetails(p => { const n = { ...p }; delete n[tuneId]; return n })
      } else {
        next[tuneId] = true
      }
      return next
    })
  }

  function toggleExpand(tuneId) {
    setExpanded(prev => {
      const next = { ...prev }
      if (next[tuneId]) {
        delete next[tuneId]
      } else {
        next[tuneId] = true
        // Initialize details if not set
        if (!details[tuneId]) {
          setDetails(p => ({
            ...p,
            [tuneId]: { focus: '', tempo_practiced: '', duration_minutes: '', notes: '', rating: 0 },
          }))
        }
      }
      return next
    })
  }

  function updateDetail(tuneId, field, value) {
    setDetails(prev => ({
      ...prev,
      [tuneId]: { ...prev[tuneId], [field]: value },
    }))
  }

  // Sort: checked tunes first, then alphabetical
  const sortedTunes = useMemo(() => {
    return [...tunes].sort((a, b) => {
      const aChecked = checked[a.id] ? 0 : 1
      const bChecked = checked[b.id] ? 0 : 1
      if (aChecked !== bChecked) return aChecked - bChecked
      return a.title.localeCompare(b.title)
    })
  }, [tunes, checked])

  const checkedCount = Object.keys(checked).length

  function handleSubmit(e) {
    e.preventDefault()
    if (checkedCount === 0) return

    const entries = Object.keys(checked).map(tuneId => {
      const d = details[tuneId] || {}
      return {
        tune_id: parseInt(tuneId, 10),
        segment_id: null,
        focus: d.focus || null,
        tempo_practiced: d.tempo_practiced ? parseInt(d.tempo_practiced, 10) : null,
        notes: d.notes?.trim() || null,
        rating: d.rating || null,
        duration_minutes: d.duration_minutes ? parseInt(d.duration_minutes, 10) : null,
      }
    })

    onSubmit({
      date: sessionDate,
      duration_minutes: sessionDuration ? parseInt(sessionDuration, 10) : null,
      notes: sessionNotes.trim() || null,
      entries,
    })
  }

  return (
    <div className="card mb-lg slide-up">
      <h2 style={{ marginBottom: 'var(--space-lg)' }}>Log Practice</h2>
      {error && <div className="login-error mb-md">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row mb-md">
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Duration (min)</label>
            <input
              type="number"
              value={sessionDuration}
              onChange={e => setSessionDuration(e.target.value)}
              placeholder="e.g. 60"
            />
          </div>
        </div>

        <div className="form-group mb-md">
          <label>Notes</label>
          <textarea
            value={sessionNotes}
            onChange={e => setSessionNotes(e.target.value)}
            placeholder="How did the session go?"
            rows={2}
          />
        </div>

        <hr className="divider" />

        <h3 style={{ marginBottom: 'var(--space-md)' }}>
          What did you practice?
          {checkedCount > 0 && (
            <span className="text-sm text-dim" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, marginLeft: 'var(--space-sm)' }}>
              {checkedCount} selected
            </span>
          )}
        </h3>

        {tunes.length === 0 ? (
          <p className="text-dim text-sm">No tunes in your library yet. Add tunes first.</p>
        ) : (
          <div className="session-checklist">
            {sortedTunes.map(tune => {
              const isChecked = !!checked[tune.id]
              const isExpanded = !!expanded[tune.id]
              const d = details[tune.id] || {}

              return (
                <div key={tune.id} className={`checklist-item ${isChecked ? 'checked' : ''}`}>
                  <div className="checklist-row" onClick={() => toggleTune(tune.id)}>
                    <span className={`checklist-check ${isChecked ? 'on' : ''}`}>
                      {isChecked ? '✓' : ''}
                    </span>
                    <div className="checklist-tune-info">
                      <span className="checklist-tune-title">{tune.title}</span>
                      {tune.composer && <span className="checklist-tune-composer">{tune.composer}</span>}
                    </div>
                    {isChecked && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm checklist-detail-toggle"
                        onClick={e => { e.stopPropagation(); toggleExpand(tune.id) }}
                      >
                        {isExpanded ? '▾' : '+ details'}
                      </button>
                    )}
                  </div>

                  {isChecked && isExpanded && (
                    <div className="checklist-details fade-in">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Focus</label>
                          <select
                            value={d.focus || ''}
                            onChange={e => updateDetail(tune.id, 'focus', e.target.value)}
                          >
                            <option value="">—</option>
                            {FOCUS_OPTIONS.map(f => (
                              <option key={f} value={f}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Tempo (BPM)</label>
                          <input
                            type="number"
                            value={d.tempo_practiced || ''}
                            onChange={e => updateDetail(tune.id, 'tempo_practiced', e.target.value)}
                            placeholder="e.g. 120"
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Duration (min)</label>
                          <input
                            type="number"
                            value={d.duration_minutes || ''}
                            onChange={e => updateDetail(tune.id, 'duration_minutes', e.target.value)}
                            placeholder="e.g. 15"
                          />
                        </div>
                        <div className="form-group">
                          <label>Rating</label>
                          <StarRating
                            value={d.rating || 0}
                            onChange={val => updateDetail(tune.id, 'rating', val)}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Notes</label>
                        <input
                          type="text"
                          value={d.notes || ''}
                          onChange={e => updateDetail(tune.id, 'notes', e.target.value)}
                          placeholder="What did you work on?"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 'var(--space-lg)' }}>
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || checkedCount === 0}>
            {saving ? 'Saving...' : `Log Session (${checkedCount})`}
          </button>
        </div>
      </form>
    </div>
  )
}

export default SessionForm
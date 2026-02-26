import { useState, useEffect } from 'react'
import api from '../api'

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

function StarDisplay({ value }) {
  if (!value) return null
  return (
    <span className="star-rating" style={{ cursor: 'default' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <span key={star} className={`star ${star <= value ? 'filled' : ''}`} style={{ cursor: 'default' }}>
          ★
        </span>
      ))}
    </span>
  )
}

const FOCUS_OPTIONS = ['transcription', 'technique', 'memorization', 'tempo', 'ear training', 'reading']

function PracticeLog() {
  const [sessions, setSessions] = useState([])
  const [tunes, setTunes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedSession, setExpandedSession] = useState(null)

  // Form state
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [sessionDuration, setSessionDuration] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [entries, setEntries] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSessions()
    fetchTunes()
  }, [])

  async function fetchSessions() {
    try {
      const res = await api.get('/sessions')
      setSessions(res.data)
    } catch (err) {
      console.error('Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTunes() {
    try {
      const res = await api.get('/tunes')
      setTunes(res.data)
    } catch (err) {
      console.error('Failed to fetch tunes:', err)
    }
  }

  function addEntry() {
    setEntries(prev => [
      ...prev,
      {
        id: Date.now(), // local key
        tune_id: '',
        focus: '',
        tempo_practiced: '',
        notes: '',
        rating: 0,
        duration_minutes: '',
      },
    ])
  }

  function updateEntry(localId, field, value) {
    setEntries(prev =>
      prev.map(e => (e.id === localId ? { ...e, [field]: value } : e))
    )
  }

  function removeEntry(localId) {
    setEntries(prev => prev.filter(e => e.id !== localId))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (entries.length === 0) {
      setError('Add at least one practice entry')
      return
    }

    const invalidEntry = entries.find(ent => !ent.tune_id)
    if (invalidEntry) {
      setError('Each entry needs a tune selected')
      return
    }

    setSaving(true)
    try {
      const payload = {
        date: sessionDate,
        duration_minutes: sessionDuration ? parseInt(sessionDuration, 10) : null,
        notes: sessionNotes.trim() || null,
        entries: entries.map(ent => ({
          tune_id: parseInt(ent.tune_id, 10),
          segment_id: null,
          focus: ent.focus || null,
          tempo_practiced: ent.tempo_practiced ? parseInt(ent.tempo_practiced, 10) : null,
          notes: ent.notes.trim() || null,
          rating: ent.rating || null,
          duration_minutes: ent.duration_minutes ? parseInt(ent.duration_minutes, 10) : null,
        })),
      }
      await api.post('/sessions', payload)

      // Reset
      setShowForm(false)
      setSessionDate(new Date().toISOString().split('T')[0])
      setSessionDuration('')
      setSessionNotes('')
      setEntries([])
      fetchSessions()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to log session')
    } finally {
      setSaving(false)
    }
  }

  function formatSessionDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return <div className="empty-state"><p>Loading...</p></div>
  }

  return (
    <div className="fade-in">
      <div className="practice-header">
        <h1>Practice Log</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setShowForm(!showForm)
            if (!showForm && entries.length === 0) addEntry()
          }}
        >
          {showForm ? 'Cancel' : '+ Log Session'}
        </button>
      </div>

      {/* New session form */}
      {showForm && (
        <div className="card mb-lg slide-up">
          <h2 style={{ marginBottom: 'var(--space-lg)' }}>New Practice Session</h2>
          {error && <div className="login-error mb-md">{error}</div>}

          <form className="practice-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={e => setSessionDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Total Duration (min)</label>
                <input
                  type="number"
                  value={sessionDuration}
                  onChange={e => setSessionDuration(e.target.value)}
                  placeholder="e.g. 60"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Session Notes</label>
              <textarea
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                placeholder="How did the session go overall?"
                rows={2}
              />
            </div>

            <hr className="divider" />

            <h3>What did you practice?</h3>

            {entries.map((entry, idx) => (
              <div key={entry.id} className="practice-entry-card">
                <div className="practice-entry-header">
                  <span className="text-sm text-dim">Entry {idx + 1}</span>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => removeEntry(entry.id)}
                  >
                    Remove
                  </button>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tune *</label>
                    <select
                      value={entry.tune_id}
                      onChange={e => updateEntry(entry.id, 'tune_id', e.target.value)}
                    >
                      <option value="">Select a tune...</option>
                      {tunes.map(t => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Focus</label>
                    <select
                      value={entry.focus}
                      onChange={e => updateEntry(entry.id, 'focus', e.target.value)}
                    >
                      <option value="">Select focus...</option>
                      {FOCUS_OPTIONS.map(f => (
                        <option key={f} value={f}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tempo Practiced (BPM)</label>
                    <input
                      type="number"
                      value={entry.tempo_practiced}
                      onChange={e => updateEntry(entry.id, 'tempo_practiced', e.target.value)}
                      placeholder="e.g. 120"
                    />
                  </div>
                  <div className="form-group">
                    <label>Duration (min)</label>
                    <input
                      type="number"
                      value={entry.duration_minutes}
                      onChange={e => updateEntry(entry.id, 'duration_minutes', e.target.value)}
                      placeholder="e.g. 15"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 'var(--space-sm)' }}>
                  <label>Notes</label>
                  <input
                    type="text"
                    value={entry.notes}
                    onChange={e => updateEntry(entry.id, 'notes', e.target.value)}
                    placeholder="What did you work on specifically?"
                  />
                </div>

                <div className="form-group">
                  <label>Rating</label>
                  <StarRating
                    value={entry.rating}
                    onChange={val => updateEntry(entry.id, 'rating', val)}
                  />
                </div>
              </div>
            ))}

            <button type="button" className="add-entry-btn" onClick={addEntry}>
              + Add Another Tune
            </button>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Log Session'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Session history */}
      {sessions.length === 0 && !showForm ? (
        <div className="empty-state">
          <h3>No sessions logged</h3>
          <p>Log your first practice session to start tracking your progress.</p>
          <button className="btn-primary" onClick={() => { setShowForm(true); addEntry() }}>
            + Log Your First Session
          </button>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map(session => (
            <div key={session.id} className="session-card slide-up">
              <div
                className="session-card-header"
                onClick={() =>
                  setExpandedSession(expandedSession === session.id ? null : session.id)
                }
              >
                <div>
                  <span className="session-date">{formatSessionDate(session.date)}</span>
                  {session.notes && (
                    <p className="text-sm text-dim mt-sm">{session.notes}</p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                  <span className="text-sm text-dim">
                    {session.entries.length} tune{session.entries.length !== 1 ? 's' : ''}
                  </span>
                  {session.duration_minutes && (
                    <span className="session-duration">{session.duration_minutes} min</span>
                  )}
                  <span className="text-dim">{expandedSession === session.id ? '▾' : '▸'}</span>
                </div>
              </div>

              {expandedSession === session.id && session.entries.length > 0 && (
                <div className="session-entries fade-in">
                  {session.entries.map(entry => (
                    <div key={entry.id} className="entry-row">
                      <span className="entry-tune">{entry.tune_title}</span>
                      <span className="entry-focus">{entry.focus || ''}</span>
                      <span className="entry-tempo">
                        {entry.tempo_practiced ? `${entry.tempo_practiced} bpm` : ''}
                      </span>
                      <StarDisplay value={entry.rating} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PracticeLog
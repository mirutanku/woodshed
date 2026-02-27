import { useState, useEffect, useMemo } from 'react'
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

function UpcomingPerformances({ performances, onAdd, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Filter to upcoming (today or later) and sort soonest first
  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return performances
      .filter(p => p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [performances])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !date) return

    setSaving(true)
    try {
      await onAdd({
        title: title.trim(),
        date,
        time: time.trim() || null,
        venue: venue.trim() || null,
        notes: notes.trim() || null,
      })
      setTitle('')
      setDate('')
      setTime('')
      setVenue('')
      setNotes('')
      setShowForm(false)
    } catch (err) {
      console.error('Failed to add performance:', err)
    } finally {
      setSaving(false)
    }
  }

  function formatPerformanceDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  function daysUntil(dateStr) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr + 'T12:00:00')
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    return `in ${diff} days`
  }

  return (
    <div className="summary-section">
      <div className="summary-section-header">
        <h3>Upcoming</h3>
        <button
          className="btn-ghost btn-sm"
          onClick={() => setShowForm(!showForm)}
          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
        >
          {showForm ? '×' : '+'}
        </button>
      </div>

      {showForm && (
        <form className="perf-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Gig name"
            autoFocus
          />
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
          />
          <input
            type="text"
            value={venue}
            onChange={e => setVenue(e.target.value)}
            placeholder="Venue (optional)"
          />
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            <button type="submit" className="btn-primary btn-sm" disabled={saving}>
              {saving ? '...' : 'Add'}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {upcoming.length === 0 && !showForm ? (
        <p className="text-sm text-dim">No upcoming gigs.</p>
      ) : (
        <div className="perf-list">
          {upcoming.map(p => (
            <div key={p.id} className="perf-item">
              <div className="perf-info">
                <span className="perf-title">{p.title}</span>
                <span className="perf-meta">
                  {formatPerformanceDate(p.date)}
                  {p.time && ` at ${p.time}`}
                  {p.venue && ` · ${p.venue}`}
                  <span className="perf-countdown">{daysUntil(p.date)}</span>
                </span>
              </div>
              <button
                className="btn-ghost btn-sm"
                style={{ color: 'var(--color-danger)', padding: '0.1rem 0.4rem', fontSize: '0.75rem' }}
                onClick={() => onDelete(p.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function PracticeSummary({ sessions, performances, onAddPerformance, onDeletePerformance }) {
  const stats = useMemo(() => {
    if (sessions.length === 0) return null

    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)

    const thisWeek = sessions.filter(s => {
      const d = new Date(s.date + 'T12:00:00')
      return d >= startOfWeek
    })

    const weekMinutes = thisWeek.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
    const weekSessions = thisWeek.length

    // Streak
    const sessionDates = new Set(sessions.map(s => s.date))
    let streak = 0
    const checkDate = new Date(now)
    const todayStr = checkDate.toISOString().split('T')[0]
    if (!sessionDates.has(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1)
    }
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0]
      if (sessionDates.has(dateStr)) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }

    // Most practiced tunes
    const tuneCounts = {}
    sessions.forEach(s => {
      s.entries.forEach(e => {
        const title = e.tune_title || 'Unknown'
        if (!tuneCounts[title]) tuneCounts[title] = { count: 0, totalMinutes: 0 }
        tuneCounts[title].count++
        tuneCounts[title].totalMinutes += e.duration_minutes || 0
      })
    })

    const topTunes = Object.entries(tuneCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)

    // Tempo progress
    const tempoByTune = {}
    sessions.forEach(s => {
      s.entries.forEach(e => {
        if (e.tempo_practiced && e.tune_title) {
          if (!tempoByTune[e.tune_title]) tempoByTune[e.tune_title] = []
          tempoByTune[e.tune_title].push({
            date: s.date,
            tempo: e.tempo_practiced,
          })
        }
      })
    })

    const tempoProgress = Object.entries(tempoByTune)
      .filter(([, entries]) => entries.length >= 2)
      .map(([title, entries]) => {
        const sorted = entries.sort((a, b) => a.date.localeCompare(b.date))
        const first = sorted[0].tempo
        const last = sorted[sorted.length - 1].tempo
        const max = Math.max(...sorted.map(e => e.tempo))
        return { title, first, last, max, sessions: sorted.length }
      })
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5)

    return { weekSessions, weekMinutes, streak, topTunes, tempoProgress }
  }, [sessions])

  if (!stats) return null

  return (
    <div className="practice-summary fade-in">
      <div className="summary-stats">
        <div className="summary-stat">
          <span className="summary-number">{stats.weekSessions}</span>
          <span className="summary-label">This Week</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">
            {stats.weekMinutes > 0 ? `${Math.round(stats.weekMinutes / 60 * 10) / 10}h` : '—'}
          </span>
          <span className="summary-label">Hours</span>
        </div>
        <div className="summary-stat">
          <span className="summary-number">{stats.streak > 0 ? `${stats.streak}d` : '—'}</span>
          <span className="summary-label">Streak</span>
        </div>
      </div>

      <div className="summary-details">
        {stats.topTunes.length > 0 && (
          <div className="summary-section">
            <h3>Most Practiced</h3>
            <div className="summary-tune-list">
              {stats.topTunes.map(([title, data]) => (
                <div key={title} className="summary-tune-row">
                  <span className="summary-tune-title">{title}</span>
                  <span className="summary-tune-count">
                    {data.count} session{data.count !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <UpcomingPerformances
          performances={performances}
          onAdd={onAddPerformance}
          onDelete={onDeletePerformance}
        />

        {stats.tempoProgress.length > 0 && (
          <div className="summary-section">
            <h3>Tempo Progress</h3>
            <div className="summary-tune-list">
              {stats.tempoProgress.map(tp => {
                const delta = tp.last - tp.first
                return (
                  <div key={tp.title} className="summary-tune-row">
                    <span className="summary-tune-title">{tp.title}</span>
                    <span className="summary-tempo-range">
                      {tp.first} → {tp.last} bpm
                      {delta !== 0 && (
                        <span className={delta > 0 ? 'tempo-up' : 'tempo-down'}>
                          {delta > 0 ? ' ↑' : ' ↓'}{Math.abs(delta)}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


function PracticeLog() {
  const [sessions, setSessions] = useState([])
  const [tunes, setTunes] = useState([])
  const [performances, setPerformances] = useState([])
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
    fetchPerformances()
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

  async function fetchPerformances() {
    try {
      const res = await api.get('/performances')
      setPerformances(res.data)
    } catch (err) {
      console.error('Failed to fetch performances:', err)
    }
  }

  async function handleAddPerformance(data) {
    await api.post('/performances', data)
    fetchPerformances()
  }

  async function handleDeletePerformance(id) {
    await api.delete(`/performances/${id}`)
    setPerformances(prev => prev.filter(p => p.id !== id))
  }

  function addEntry() {
    setEntries(prev => [
      ...prev,
      {
        id: Date.now(),
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

      {/* Summary dashboard */}
      {!showForm && (sessions.length > 0 || performances.length > 0) && (
        <PracticeSummary
          sessions={sessions}
          performances={performances}
          onAddPerformance={handleAddPerformance}
          onDeletePerformance={handleDeletePerformance}
        />
      )}

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
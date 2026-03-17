import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import { useToast } from './Toast'
import SessionForm from './SessionForm'
import PracticeProfile from './PracticeProfile'
import { FOCUS_OPTIONS } from '../constants'
import { localToday } from '../dateUtils'
import './PracticeLog.css'

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

function UpcomingPerformances({ performances, setlists, onAdd, onDelete, onEdit, onSetlistsChanged }) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  const [time, setTime] = useState('')

  const [notes, setNotes] = useState('')
  const [setlistId, setSetlistId] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  // Filter to upcoming (today or later) and sort soonest first
  const upcoming = useMemo(() => {
    const today = localToday()
    return performances
      .filter(p => p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [performances])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !date) return

    setSaving(true)
    try {
      const perf = await onAdd({
        title: title.trim(),
        date,
        time: time.trim() || null,
        venue: venue.trim() || null,
        notes: notes.trim() || null,
      })
      // If a setlist was selected, link it to this performance
      if (setlistId && perf?.id) {
        await api.patch(`/setlists/${setlistId}`, { performance_id: perf.id })
        if (onSetlistsChanged) onSetlistsChanged()
      }
      setTitle('')
      setDate('')
      setTime('')
      setVenue('')
      setNotes('')
      setSetlistId('')
      setShowForm(false)
    } catch (err) {
      console.error('Failed to add performance:', err)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(p) {
    setEditingId(p.id)
    const linkedSetlist = (setlists || []).find(s => s.performance_id === p.id)
    setEditForm({
      title: p.title,
      date: p.date,
      time: p.time || '',
      venue: p.venue || '',
      notes: p.notes || '',
      setlistId: linkedSetlist ? linkedSetlist.id.toString() : '',
      originalSetlistId: linkedSetlist ? linkedSetlist.id.toString() : '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({})
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editForm.title.trim() || !editForm.date) return

    setSaving(true)
    try {
      await onEdit(editingId, {
        title: editForm.title.trim(),
        date: editForm.date,
        time: editForm.time.trim() || null,
        venue: editForm.venue.trim() || null,
        notes: editForm.notes.trim() || null,
      })

      // Handle setlist link changes
      const newSetlistId = editForm.setlistId
      const oldSetlistId = editForm.originalSetlistId
      if (newSetlistId !== oldSetlistId) {
        // Unlink old setlist
        if (oldSetlistId) {
          await api.patch(`/setlists/${oldSetlistId}`, { performance_id: null })
        }
        // Link new setlist
        if (newSetlistId) {
          await api.patch(`/setlists/${newSetlistId}`, { performance_id: editingId })
        }
        if (onSetlistsChanged) onSetlistsChanged()
      }

      cancelEdit()
    } catch (err) {
      console.error('Failed to edit performance:', err)
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
          className="btn-ghost btn-action"
          onClick={() => setShowForm(!showForm)}
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
          <select
            value={setlistId}
            onChange={e => setSetlistId(e.target.value)}
          >
            <option value="">Link a setlist (optional)</option>
            {(setlists || []).filter(s => !s.performance_id).map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
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
            editingId === p.id ? (
              <form key={p.id} className="perf-form" onSubmit={handleSaveEdit}>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Gig name"
                  autoFocus
                />
                <input
                  type="date"
                  value={editForm.date}
                  onChange={e => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                />
                <input
                  type="time"
                  value={editForm.time}
                  onChange={e => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                />
                <input
                  type="text"
                  value={editForm.venue}
                  onChange={e => setEditForm(prev => ({ ...prev, venue: e.target.value }))}
                  placeholder="Venue"
                />
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Notes"
                />
                <select
                  value={editForm.setlistId || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, setlistId: e.target.value }))}
                >
                  <option value="">No linked setlist</option>
                  {(setlists || [])
                    .filter(s => !s.performance_id || s.id.toString() === editForm.originalSetlistId)
                    .map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                </select>
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                    {saving ? '...' : 'Save'}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={cancelEdit}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div key={p.id} className="perf-item">
                <div className="perf-info" onClick={() => startEdit(p)} style={{ cursor: 'pointer' }}>
                  <span className="perf-title">{p.title}</span>
                  <span className="perf-meta">
                    {formatPerformanceDate(p.date)}
                    {p.time && ` at ${p.time}`}
                    {p.venue && ` · ${p.venue}`}
                    <span className="perf-countdown">{daysUntil(p.date)}</span>
                  </span>
                </div>
                <button
                  className="btn-ghost btn-action"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => onDelete(p.id)}
                >
                  ×
                </button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}


function PracticeSummary({ sessions, performances, setlists, onAddPerformance, onDeletePerformance, onEditPerformance, onSetlistsChanged, onSelectTune }) {
  const [streak, setStreak] = useState(0)
  const [mostPracticed, setMostPracticed] = useState([])

  useEffect(() => {
    api.get(`/streak?client_date=${localToday()}`).then(res => setStreak(res.data.streak)).catch(() => {})
    api.get('/most-practiced').then(res => setMostPracticed(res.data)).catch(() => {})
  }, [sessions])
  
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

    return { weekSessions, weekMinutes, tempoProgress }
  }, [sessions])

  const hasStats = !!stats

  return (
    <div className="practice-summary fade-in">
      <PracticeProfile />

      <div className="summary-stats">
        {hasStats && (
          <>
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
          </>
        )}
        <div className="summary-stat">
          <span className="summary-number">{streak > 0 ? `${streak}d` : '—'}</span>
          <span className="summary-label">Streak</span>
        </div>
      </div>

      <div className="summary-details">
        {mostPracticed.length > 0 && (
          <div className="summary-section">
            <h3>Most Practiced</h3>
            <div className="summary-tune-list">
              {mostPracticed.map(tp => (
                <div key={tp.tune_id} className="summary-tune-row" style={{ cursor: onSelectTune ? 'pointer' : 'default' }} onClick={() => onSelectTune && onSelectTune(tp.tune_id)}>
                  <span className="summary-tune-title">{tp.title}</span>
                  <span className="summary-tune-count">
                    {tp.sessions} session{tp.sessions !== 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <UpcomingPerformances
          performances={performances}
          setlists={setlists}
          onAdd={onAddPerformance}
          onDelete={onDeletePerformance}
          onEdit={onEditPerformance}
          onSetlistsChanged={onSetlistsChanged}
        />

        {hasStats && stats.tempoProgress.length > 0 && (
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


function PracticeLog({ onSelectTune}) {
  const toast = useToast()
  const [sessions, setSessions] = useState([])
  const [tunes, setTunes] = useState([])
  const [performances, setPerformances] = useState([])
  const [setlists, setSetlists] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedSession, setExpandedSession] = useState(null)

  // Form state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editSessionForm, setEditSessionForm] = useState({})
  const [editingEntryId, setEditingEntryId] = useState(null)
  const [editEntryForm, setEditEntryForm] = useState({})
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(null)
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(null)
  const [addingToSessionId, setAddingToSessionId] = useState(null)
  const [newEntryForm, setNewEntryForm] = useState({
    tune_id: '', focus: '', tempo_practiced: '', duration_minutes: '', notes: '', rating: 0,
  })

  useEffect(() => {
    fetchSessions()
    fetchTunes()
    fetchPerformances()
    fetchSetlists()
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

  async function fetchSetlists() {
    try {
      const res = await api.get('/setlists')
      setSetlists(res.data)
    } catch (err) {
      console.error('Failed to fetch setlists:', err)
    }
  }

  async function handleAddPerformance(data) {
    const res = await api.post('/performances', data)
    toast(`Added "${data.title}"`)
    fetchPerformances()
    return res.data
  }

  async function handleDeletePerformance(id) {
    await api.delete(`/performances/${id}`)
    setPerformances(prev => prev.filter(p => p.id !== id))
    toast('Performance removed')
  }

  async function handleEditPerformance(id, data) {
    await api.patch(`/performances/${id}`, data)
    toast('Performance updated')
    fetchPerformances()
  }

  // --- Session editing ---

  function startEditSession(session) {
    setEditingSessionId(session.id)
    setEditSessionForm({
      date: session.date,
      duration_minutes: session.duration_minutes || '',
      notes: session.notes || '',
    })
  }

  function cancelEditSession() {
    setEditingSessionId(null)
    setEditSessionForm({})
  }

  async function handleSaveSession(e) {
    e.preventDefault()
    try {
      await api.patch(`/sessions/${editingSessionId}`, {
        date: editSessionForm.date,
        duration_minutes: editSessionForm.duration_minutes ? parseInt(editSessionForm.duration_minutes, 10) : null,
        notes: editSessionForm.notes.trim() || null,
      })
      toast('Session updated')
      cancelEditSession()
      fetchSessions()
    } catch (err) {
      toast('Failed to update session', 'error')
    }
  }

  async function handleDeleteSession(id) {
    try {
      await api.delete(`/sessions/${id}`)
      setSessions(prev => prev.filter(s => s.id !== id))
      setConfirmDeleteSession(null)
      toast('Session deleted')
    } catch (err) {
      toast('Failed to delete session', 'error')
    }
  }

  // --- Entry editing ---

  function startEditEntry(entry) {
    setEditingEntryId(entry.id)
    setEditEntryForm({
      tune_id: entry.tune_id,
      focus: entry.focus || '',
      tempo_practiced: entry.tempo_practiced || '',
      duration_minutes: entry.duration_minutes || '',
      notes: entry.notes || '',
      rating: entry.rating || 0,
    })
  }

  function cancelEditEntry() {
    setEditingEntryId(null)
    setEditEntryForm({})
  }

  async function handleSaveEntry(sessionId, entryId) {
    try {
      await api.patch(`/sessions/${sessionId}/entries/${entryId}`, {
        tune_id: parseInt(editEntryForm.tune_id, 10),
        focus: editEntryForm.focus || null,
        tempo_practiced: editEntryForm.tempo_practiced ? parseInt(editEntryForm.tempo_practiced, 10) : null,
        duration_minutes: editEntryForm.duration_minutes ? parseInt(editEntryForm.duration_minutes, 10) : null,
        notes: editEntryForm.notes.trim() || null,
        rating: editEntryForm.rating || null,
      })
      toast('Entry updated')
      cancelEditEntry()
      fetchSessions()
    } catch (err) {
      toast('Failed to update entry', 'error')
    }
  }

  async function handleDeleteEntry(sessionId, entryId) {
    try {
      await api.delete(`/sessions/${sessionId}/entries/${entryId}`)
      setConfirmDeleteEntry(null)
      toast('Entry removed')
      fetchSessions()
    } catch (err) {
      toast('Failed to delete entry', 'error')
    }
  }

  async function handleAddEntryToSession(sessionId) {
    if (!newEntryForm.tune_id) return
    try {
      await api.post(`/sessions/${sessionId}/entries`, {
        tune_id: parseInt(newEntryForm.tune_id, 10),
        focus: newEntryForm.focus || null,
        tempo_practiced: newEntryForm.tempo_practiced ? parseInt(newEntryForm.tempo_practiced, 10) : null,
        duration_minutes: newEntryForm.duration_minutes ? parseInt(newEntryForm.duration_minutes, 10) : null,
        notes: newEntryForm.notes.trim() || null,
        rating: newEntryForm.rating || null,
      })
      toast('Entry added')
      setAddingToSessionId(null)
      setNewEntryForm({ tune_id: '', focus: '', tempo_practiced: '', duration_minutes: '', notes: '', rating: 0 })
      fetchSessions()
    } catch (err) {
      toast('Failed to add entry', 'error')
    }
  }

  async function handleSubmit(payload) {
    setError('')
    setSaving(true)
    try {
      await api.post('/sessions', payload)
      setShowForm(false)
      toast('Session logged')
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

  function getWeekLabel(dateStr) {
    const sessionDate = new Date(dateStr + 'T12:00:00')
    const now = new Date()
    now.setHours(12, 0, 0, 0)

    // Start of this week (Sunday)
    const startOfThisWeek = new Date(now)
    startOfThisWeek.setDate(now.getDate() - now.getDay())
    startOfThisWeek.setHours(0, 0, 0, 0)

    // Start of last week
    const startOfLastWeek = new Date(startOfThisWeek)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)

    if (sessionDate >= startOfThisWeek) return 'This Week'
    if (sessionDate >= startOfLastWeek) return 'Last Week'

    // Find the Monday of that session's week
    const weekStart = new Date(sessionDate)
    weekStart.setDate(sessionDate.getDate() - sessionDate.getDay() + 1)
    return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
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
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ Log Session'}
        </button>
      </div>

      {/* Summary dashboard */}
      {!showForm && (
        <PracticeSummary
          sessions={sessions}
          performances={performances}
          setlists={setlists}
          onAddPerformance={handleAddPerformance}
          onDeletePerformance={handleDeletePerformance}
          onEditPerformance={handleEditPerformance}
          onSetlistsChanged={fetchSetlists}
          onSelectTune={onSelectTune}
        />
      )}

      {/* New session form */}
      {showForm && (
        <SessionForm
          tunes={tunes}
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          saving={saving}
          error={error}
        />
      )}

      {/* Session history */}
      {sessions.length === 0 && !showForm ? (
        <div className="empty-state">
          <h3>No sessions logged</h3>
          <p>Log your first practice session to start tracking your progress.</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Log Your First Session
          </button>
        </div>
      ) : (
        <div className="session-list">
          {(() => {
            let lastWeekLabel = null
            return sessions.map(session => {
              const weekLabel = getWeekLabel(session.date)
              const showHeader = weekLabel !== lastWeekLabel
              lastWeekLabel = weekLabel
              return (
                <div key={session.id}>
                  {showHeader && (
                    <div className="session-week-header">{weekLabel}</div>
                  )}
                  <div className="session-card slide-up">
              {editingSessionId === session.id ? (
                <form className="session-edit-form" onSubmit={handleSaveSession}>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Date</label>
                      <input
                        type="date"
                        value={editSessionForm.date}
                        onChange={e => setEditSessionForm(prev => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>Duration (min)</label>
                      <input
                        type="number"
                        value={editSessionForm.duration_minutes}
                        onChange={e => setEditSessionForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input
                      type="text"
                      value={editSessionForm.notes}
                      onChange={e => setEditSessionForm(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                    <button type="submit" className="btn-primary btn-sm">Save</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={cancelEditSession}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="session-card-header">
                  <div
                    style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                    onClick={() =>
                      setExpandedSession(expandedSession === session.id ? null : session.id)
                    }
                  >
                    <span className="session-date">{formatSessionDate(session.date)}</span>
                    {session.notes && (
                      <p className="text-sm text-dim mt-sm">{session.notes}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span className="text-sm text-dim">
                      {session.entries.length} tune{session.entries.length !== 1 ? 's' : ''}
                    </span>
                    {session.duration_minutes && (
                      <span className="session-duration">{session.duration_minutes} min</span>
                    )}
                    <button
                      className="btn-ghost btn-action"
                      onClick={(e) => { e.stopPropagation(); startEditSession(session) }}
                      title="Edit session"
                    >
                      ✎
                    </button>
                    {confirmDeleteSession === session.id ? (
                      <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                        <span className="text-sm text-dim">Delete?</span>
                        <button className="btn-danger btn-sm" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                          onClick={() => handleDeleteSession(session.id)}>Yes</button>
                        <button className="btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                          onClick={() => setConfirmDeleteSession(null)}>No</button>
                      </div>
                    ) : (
                      <button
                        className="btn-ghost btn-action"
                        style={{ color: 'var(--color-danger)' }}
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteSession(session.id) }}
                        title="Delete session"
                      >
                        ×
                      </button>
                    )}
                    <span
                      className="text-dim"
                      style={{ cursor: 'pointer' }}
                      onClick={() =>
                        setExpandedSession(expandedSession === session.id ? null : session.id)
                      }
                    >
                      {expandedSession === session.id ? '▾' : '▸'}
                    </span>
                  </div>
                </div>
              )}

              {expandedSession === session.id && session.entries.length > 0 && editingSessionId !== session.id && (
                <div className="session-entries fade-in">
                  {session.entries.map(entry => (
                    editingEntryId === entry.id ? (
                      <div key={entry.id} className="entry-edit-form">
                        <div className="form-row">
                          <div className="form-group">
                            <label>Tune</label>
                            <select
                              value={editEntryForm.tune_id}
                              onChange={e => setEditEntryForm(prev => ({ ...prev, tune_id: e.target.value }))}
                            >
                              <option value="">Select a tune...</option>
                              {tunes.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.title}{t.composer ? ` (${t.composer})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Focus</label>
                            <select
                              value={editEntryForm.focus}
                              onChange={e => setEditEntryForm(prev => ({ ...prev, focus: e.target.value }))}
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
                            <label>Tempo (BPM)</label>
                            <input
                              type="number"
                              value={editEntryForm.tempo_practiced}
                              onChange={e => setEditEntryForm(prev => ({ ...prev, tempo_practiced: e.target.value }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Duration (min)</label>
                            <input
                              type="number"
                              value={editEntryForm.duration_minutes}
                              onChange={e => setEditEntryForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label>Notes</label>
                          <input
                            type="text"
                            value={editEntryForm.notes}
                            onChange={e => setEditEntryForm(prev => ({ ...prev, notes: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label>Rating</label>
                          <StarRating
                            value={editEntryForm.rating}
                            onChange={val => setEditEntryForm(prev => ({ ...prev, rating: val }))}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                          <button className="btn-primary btn-sm" onClick={() => handleSaveEntry(session.id, entry.id)}>Save</button>
                          <button className="btn-ghost btn-sm" onClick={cancelEditEntry}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div key={entry.id} className="entry-row">
                        <span className="entry-tune">{entry.tune_title}</span>
                        <span className="entry-duration">
                          {entry.duration_minutes ? `${entry.duration_minutes} min` : ''}
                        </span>
                        <button
                          className="btn-ghost btn-action"
                          onClick={() => startEditEntry(entry)}
                          title="Edit entry"
                        >
                          ✎
                        </button>
                        {confirmDeleteEntry === entry.id ? (
                          <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                            <button className="btn-danger btn-sm" style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem' }}
                              onClick={() => handleDeleteEntry(session.id, entry.id)}>Yes</button>
                            <button className="btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem' }}
                              onClick={() => setConfirmDeleteEntry(null)}>No</button>
                          </div>
                        ) : (
                          <button
                            className="btn-ghost btn-action"
                            onClick={() => setConfirmDeleteEntry(entry.id)}
                            title="Delete entry"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  ))}

                  {/* Add entry to existing session */}
                  {addingToSessionId === session.id ? (
                    <div className="entry-edit-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label>Tune *</label>
                          <select
                            value={newEntryForm.tune_id}
                            onChange={e => setNewEntryForm(prev => ({ ...prev, tune_id: e.target.value }))}
                            autoFocus
                          >
                            <option value="">Select a tune...</option>
                            {tunes.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.title}{t.composer ? ` (${t.composer})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Focus</label>
                          <select
                            value={newEntryForm.focus}
                            onChange={e => setNewEntryForm(prev => ({ ...prev, focus: e.target.value }))}
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
                          <label>Tempo (BPM)</label>
                          <input
                            type="number"
                            value={newEntryForm.tempo_practiced}
                            onChange={e => setNewEntryForm(prev => ({ ...prev, tempo_practiced: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label>Duration (min)</label>
                          <input
                            type="number"
                            value={newEntryForm.duration_minutes}
                            onChange={e => setNewEntryForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Notes</label>
                        <input
                          type="text"
                          value={newEntryForm.notes}
                          onChange={e => setNewEntryForm(prev => ({ ...prev, notes: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label>Rating</label>
                        <StarRating
                          value={newEntryForm.rating}
                          onChange={val => setNewEntryForm(prev => ({ ...prev, rating: val }))}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                        <button className="btn-primary btn-sm" onClick={() => handleAddEntryToSession(session.id)}>Add</button>
                        <button className="btn-ghost btn-sm" onClick={() => setAddingToSessionId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost btn-sm"
                      style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem' }}
                      onClick={() => setAddingToSessionId(session.id)}
                    >
                      + Add Entry
                    </button>
                  )}
                </div>
              )}
</div>
                </div>
              )
            })
          })()}
        </div>
      )}
    </div>
  )
}

export default PracticeLog
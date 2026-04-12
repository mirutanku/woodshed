import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import { useToast } from './Toast'
import SessionForm from './SessionForm'
import PracticeProfile from './PracticeProfile'
import TodayView from './TodayView'
import ConfirmDialog from './ConfirmDialog'
import { FOCUS_OPTIONS } from '../constants'
import { FUNDAMENTALS_OPTIONS } from '../constants'
import { localToday } from '../dateUtils'
import './PracticeLog.css'

function StarRating({ value, onChange }: {
  value: number
  onChange: (value: number) => void
}) {
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

function StarDisplay({ value }: { value: number }) {
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

function UpcomingPerformances({ performances, setlists, onAdd, onDelete, onEdit, onSetlistsChanged }: {
  performances: any[]
  setlists: any[]
  onAdd: (data: any) => Promise<any>
  onDelete: (id: number) => void
  onEdit: (id: number, data: any) => Promise<void>
  onSetlistsChanged?: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [venue, setVenue] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [setlistId, setSetlistId] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  // Filter to upcoming (today or later) and sort soonest first
  const upcoming = useMemo(() => {
    const today = localToday()
    return performances
      .filter(p => p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [performances])

  async function handleSubmit(e: React.FormEvent) {
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
    } catch (err: any) {
      console.error('Failed to add performance:', err)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(p: any) {
    setEditingId(p.id)
    const linkedSetlist = (setlists || []).find((s: any) => s.performance_id === p.id)
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

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm.title.trim() || !editForm.date) return

    setSaving(true)
    try {
      await onEdit(editingId!, {
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
        if (oldSetlistId) {
          await api.patch(`/setlists/${oldSetlistId}`, { performance_id: null })
        }
        if (newSetlistId) {
          await api.patch(`/setlists/${newSetlistId}`, { performance_id: editingId })
        }
        if (onSetlistsChanged) onSetlistsChanged()
      }

      cancelEdit()
    } catch (err: any) {
      console.error('Failed to edit performance:', err)
    } finally {
      setSaving(false)
    }
  }

  function formatPerformanceDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  function daysUntil(dateStr: string) {
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const target = new Date(dateStr + 'T12:00:00')
    const diff = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    return `in ${diff} days`
  }

  function googleCalendarUrl(p: any) {
    const dateStr = p.date.replace(/-/g, '')
    const timeStr = p.time ? p.time.replace(':', '') + '00' : ''

    // If we have a time, use datetime format; otherwise all-day event
    let dates
    if (timeStr) {
      const start = `${dateStr}T${timeStr}`
      // Default to 2 hour event
      const startDate = new Date(`${p.date}T${p.time}`)
      const endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000)
      const endStr = endDate.toISOString().replace(/[-:]/g, '').split('.')[0]
      dates = `${start}/${endStr}`
    } else {
      dates = `${dateStr}/${dateStr}`
    }

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: p.title,
      dates,
    })
    if (p.venue) params.set('location', p.venue)
    if (p.notes) params.set('details', p.notes)

    return `https://calendar.google.com/calendar/render?${params.toString()}`
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
            {(setlists || []).filter((s: any) => !s.performance_id).map((s: any) => (
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
          {upcoming.map((p: any) => (
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
                    .filter((s: any) => !s.performance_id || s.id.toString() === editForm.originalSetlistId)
                    .map((s: any) => (
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
                <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                  <a href={googleCalendarUrl(p)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-action" title="Add to Google Calendar" onClick={e => e.stopPropagation()}>
                    📅
                  </a>
                  <button
                    className="btn-ghost btn-action"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => setConfirmDeleteId(p.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    {confirmDeleteId && (
        <ConfirmDialog
          title="Delete Performance"
          message="Are you sure you want to remove this performance?"
          confirmLabel="Delete"
          danger
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}


function PracticeSummary({ sessions, performances, setlists, onAddPerformance, onDeletePerformance, onEditPerformance, onSetlistsChanged, onSelectTune }: {
  sessions: any[]
  performances: any[]
  setlists: any[]
  onAddPerformance: (data: any) => Promise<any>
  onDeletePerformance: (id: number) => void
  onEditPerformance: (id: number, data: any) => Promise<void>
  onSetlistsChanged: () => void
  onSelectTune: (tuneId: number) => void
}) {
  const [mostPracticed, setMostPracticed] = useState<any[]>([])
  const [mostPracticedMode, setMostPracticedMode] = useState('sessions')
  const [weeklyHours, setWeeklyHours] = useState<any>(null)
  const [streakData, setStreakData] = useState({ streak: 0, practiced_today: false })
  const [recentFundamentals, setRecentFundamentals] = useState<any[]>([])
  const [loggedFundamentals, setLoggedFundamentals] = useState<string[]>([])
  const [activeFundamental, setActiveFundamental] = useState<string | null>(null)
  const [fundamentalStartTime, setFundamentalStartTime] = useState<number | null>(null)
  const [fundamentalElapsed, setFundamentalElapsed] = useState(0)
  

  useEffect(() => {
    api.get(`/streak?client_date=${localToday()}`).then(res => setStreakData(res.data)).catch(() => {})
    api.get(`/most-practiced?mode=${mostPracticedMode}`).then(res => setMostPracticed(res.data)).catch(() => {})
    api.get(`/weekly-hours?client_date=${localToday()}`).then(res => setWeeklyHours(res.data)).catch(() => {})
    api.get('/recent-fundamentals').then(res => setRecentFundamentals(res.data)).catch(() => {})
    api.get(`/today?client_date=${localToday()}`).then(res => {
      if (res.data.fundamentals) setLoggedFundamentals(res.data.fundamentals.map((f: { category: string }) => f.category))
    }).catch(() => {})
  }, [sessions, mostPracticedMode])

  useEffect(() => {
    if (!activeFundamental || !fundamentalStartTime) return
    const interval = setInterval(() => {
      setFundamentalElapsed(Math.round((Date.now() - fundamentalStartTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeFundamental, fundamentalStartTime])

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  async function handleToggleFundamental(category: string) {
    const isLogged = loggedFundamentals.includes(category)
    const isActive = activeFundamental === category

    if (isActive) {
      // Stop the timer
      const elapsed = Math.round((Date.now() - (fundamentalStartTime || 0)) / 1000)
      try {
        await api.patch(`/quick-log-fundamental?category=${encodeURIComponent(category)}&duration_seconds=${elapsed}&client_date=${localToday()}`)
      } catch (err) {
        console.error('Failed to save duration:', err)
      }
      setActiveFundamental(null)
      setFundamentalStartTime(null)
      setFundamentalElapsed(0)
      api.get('/recent-fundamentals').then(res => setRecentFundamentals(res.data)).catch(() => {})
    } else if (isLogged) {
      try {
        await api.delete(`/quick-log-fundamental?category=${encodeURIComponent(category)}&client_date=${localToday()}`)
        setLoggedFundamentals(prev => prev.filter(c => c !== category))
      } catch (err) {
        console.error('Failed to toggle fundamental:', err)
      }
      api.get('/recent-fundamentals').then(res => setRecentFundamentals(res.data)).catch(() => {})
    } else {
      try {
        await api.post(`/quick-log-fundamental?category=${encodeURIComponent(category)}&client_date=${localToday()}`)
        setLoggedFundamentals(prev => [...prev, category])
      } catch (err) {
        console.error('Failed to toggle fundamental:', err)
      }
      api.get('/recent-fundamentals').then(res => setRecentFundamentals(res.data)).catch(() => {})
    }
  }

  function startFundamentalTimer(category: string) {
    setActiveFundamental(category)
    setFundamentalStartTime(Date.now())
    setFundamentalElapsed(0)
  }

  return (
    <div className="practice-summary fade-in">
      <PracticeProfile />
      <TodayView onSelectTune={onSelectTune} />

      <div className="summary-stats">
        {weeklyHours && weeklyHours.minutes > 0 && (
          <div className="summary-stat">
            <span className="summary-number">
              {weeklyHours.minutes >= 60
                ? `${weeklyHours.hours}h`
                : `${weeklyHours.minutes}m`
              }
            </span>
            <span className="summary-label">This Week</span>
          </div>
        )}
        <div className="summary-stat">
          <span className="summary-number">
            {streakData.streak > 0
              ? `${streakData.streak}d`
              : '—'
            }
          </span>
          <span className="summary-label">Streak</span>
          {streakData.streak > 0 && !streakData.practiced_today && (
            <span className="streak-nudge">practice today!</span>
          )}
        </div>
      </div>

      <div className="summary-details">
        {mostPracticed.length > 0 && (
          <div className="summary-section">
            <div className="summary-section-header">
              <h3>Most Practiced</h3>
              <div className="toggle-group">
                <button
                  className={`toggle-btn ${mostPracticedMode === 'sessions' ? 'active' : ''}`}
                  onClick={() => setMostPracticedMode('sessions')}
                >
                  Sessions
                </button>
                <button
                  className={`toggle-btn ${mostPracticedMode === 'time' ? 'active' : ''}`}
                  onClick={() => setMostPracticedMode('time')}
                >
                  Time
                </button>
              </div>
            </div>
            <div className="summary-tune-list">
              {mostPracticed.map(tp => (
                <div key={tp.tune_id} className={`summary-tune-row ${tp.archived ? 'archived' : ''}`} style={{ cursor: onSelectTune && !tp.archived ? 'pointer' : 'default' }} onClick={() => onSelectTune && !tp.archived && onSelectTune(tp.tune_id)}>
                  <span className={`summary-tune-title ${tp.archived ? '' : 'entry-tune-link'}`}>{tp.title}</span>
                  <span className="summary-tune-count">
                    {tp.sessions !== undefined
                      ? `${tp.sessions} session${tp.sessions !== 1 ? 's' : ''}`
                      : tp.seconds >= 3600
                        ? `${Math.round(tp.seconds / 360) / 10}h`
                        : `${Math.round(tp.seconds / 60)}m`
                    }
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

        {recentFundamentals.length > 0 && (
          <p className="recent-fundamentals">
            Recent fundamentals: {recentFundamentals.map((f: any, i: number) => (
              <span key={f.category}>
                {i > 0 && ' · '}
                {f.category.charAt(0).toUpperCase() + f.category.slice(1)} ({f.count})
              </span>
            ))}
          </p>
        )}

        <div className="fundamentals-quick-log">
          <span className="fundamentals-quick-log-label">Log fundamentals</span>
          <div className="fundamentals-grid">
            {FUNDAMENTALS_OPTIONS.map(category => {
              const isLogged = loggedFundamentals.includes(category)
              return (
                <button
                  key={category}
                  className={`fundamental-chip ${isLogged ? 'checked' : ''} ${activeFundamental === category ? 'timing' : ''}`}
                  onClick={() => handleToggleFundamental(category)}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                  {activeFundamental === category && (
                    <span className="fundamental-timer"> {formatElapsed(fundamentalElapsed)}</span>
                  )}
                  {isLogged && activeFundamental !== category && (
                    <span
                      className="fundamental-timer-btn"
                      onClick={(e) => { e.stopPropagation(); startFundamentalTimer(category) }}
                      title="Start timer"
                    >
                      ⏱
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}


function PracticeLog({ onSelectTune }: { onSelectTune: (tuneId: number) => void }) {
  const toast = useToast()
  const [sessions, setSessions] = useState<any[]>([])
  const [tunes, setTunes] = useState<any[]>([])
  const [performances, setPerformances] = useState<any[]>([])
  const [setlists, setSetlists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [expandedSession, setExpandedSession] = useState<number | null>(null)

  // Form state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit state
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null)
  const [editSessionForm, setEditSessionForm] = useState<Record<string, any>>({})
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null)
  const [editEntryForm, setEditEntryForm] = useState<Record<string, any>>({})
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<number | null>(null)
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<number | null>(null)
  const [addingToSessionId, setAddingToSessionId] = useState<number | null>(null)
  const [newEntryForm, setNewEntryForm] = useState({
    tune_id: '', focus: '', tempo_practiced: '', notes: '', rating: 0,
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
    } catch (err: any) {
      console.error('Failed to fetch sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTunes() {
    try {
      const res = await api.get('/tunes')
      setTunes(res.data)
    } catch (err: any) {
      console.error('Failed to fetch tunes:', err)
    }
  }

  async function fetchPerformances() {
    try {
      const res = await api.get('/performances')
      setPerformances(res.data)
    } catch (err: any) {
      console.error('Failed to fetch performances:', err)
    }
  }

  async function fetchSetlists() {
    try {
      const res = await api.get('/setlists')
      setSetlists(res.data)
    } catch (err: any) {
      console.error('Failed to fetch setlists:', err)
    }
  }

  async function handleAddPerformance(data: any) {
    const res = await api.post('/performances', data)
    toast(`Added "${data.title}"`)
    fetchPerformances()
    return res.data
  }

  async function handleDeletePerformance(id: number) {
    await api.delete(`/performances/${id}`)
    setPerformances(prev => prev.filter(p => p.id !== id))
    toast('Performance removed')
  }

  async function handleEditPerformance(id: number, data: any) {
    await api.patch(`/performances/${id}`, data)
    toast('Performance updated')
    fetchPerformances()
  }

  // --- Session editing ---

  function startEditSession(session: any) {
    setEditingSessionId(session.id)
    setEditSessionForm({
      date: session.date,
      notes: session.notes || '',
    })
  }

  function cancelEditSession() {
    setEditingSessionId(null)
    setEditSessionForm({})
  }

  async function handleSaveSession(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.patch(`/sessions/${editingSessionId}`, {
        date: editSessionForm.date,
        notes: editSessionForm.notes.trim() || null,
      })
      toast('Session updated')
      cancelEditSession()
      fetchSessions()
    } catch (err: any) {
      toast('Failed to update session', 'error')
    }
  }

  async function handleDeleteSession(id: number) {
    try {
      await api.delete(`/sessions/${id}`)
      setSessions(prev => prev.filter(s => s.id !== id))
      setConfirmDeleteSession(null)
      toast('Session deleted')
    } catch (err: any) {
      toast('Failed to delete session', 'error')
    }
  }

  // --- Entry editing ---

  function startEditEntry(entry: any) {
    setEditingEntryId(entry.id)
    setEditEntryForm({
      tune_id: entry.tune_id,
      focus: entry.focus || '',
      tempo_practiced: entry.tempo_practiced || '',
      notes: entry.notes || '',
      rating: entry.rating || 0,
    })
  }

  function cancelEditEntry() {
    setEditingEntryId(null)
    setEditEntryForm({})
  }

  async function handleSaveEntry(sessionId: number, entryId: number) {
    try {
      await api.patch(`/sessions/${sessionId}/entries/${entryId}`, {
        tune_id: parseInt(editEntryForm.tune_id, 10),
        focus: editEntryForm.focus || null,
        tempo_practiced: editEntryForm.tempo_practiced ? parseInt(editEntryForm.tempo_practiced, 10) : null,
        notes: editEntryForm.notes.trim() || null,
        rating: editEntryForm.rating || null,
      })
      toast('Entry updated')
      cancelEditEntry()
      fetchSessions()
    } catch (err: any) {
      toast('Failed to update entry', 'error')
    }
  }

  async function handleDeleteEntry(sessionId: number, entryId: number) {
    try {
      await api.delete(`/sessions/${sessionId}/entries/${entryId}`)
      setConfirmDeleteEntry(null)
      toast('Entry removed')
      fetchSessions()
    } catch (err: any) {
      toast('Failed to delete entry', 'error')
    }
  }

  async function handleAddEntryToSession(sessionId: number) {
    if (!newEntryForm.tune_id) return
    try {
      await api.post(`/sessions/${sessionId}/entries`, {
        tune_id: parseInt(newEntryForm.tune_id, 10),
        focus: newEntryForm.focus || null,
        tempo_practiced: newEntryForm.tempo_practiced ? parseInt(newEntryForm.tempo_practiced, 10) : null,
        notes: newEntryForm.notes.trim() || null,
        rating: newEntryForm.rating || null,
      })
      toast('Entry added')
      setAddingToSessionId(null)
      setNewEntryForm({ tune_id: '', focus: '', tempo_practiced: '', notes: '', rating: 0 })
      fetchSessions()
    } catch (err: any) {
      toast('Failed to add entry', 'error')
    }
  }

  async function handleSubmit(payload: any) {
    setError('')
    setSaving(true)
    try {
      await api.post('/sessions', payload)
      setShowForm(false)
      toast('Session logged')
      fetchSessions()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to log session')
    } finally {
      setSaving(false)
    }
  }

  function formatSessionDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function getWeekLabel(dateStr: string) {
    const sessionDate = new Date(dateStr + 'T12:00:00')
    const now = new Date()
    now.setHours(12, 0, 0, 0)

    const startOfThisWeek = new Date(now)
    startOfThisWeek.setDate(now.getDate() - now.getDay())
    startOfThisWeek.setHours(0, 0, 0, 0)

    const startOfLastWeek = new Date(startOfThisWeek)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)

    if (sessionDate >= startOfThisWeek) return 'This Week'
    if (sessionDate >= startOfLastWeek) return 'Last Week'

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
        <h1>Practice</h1>
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

      {/* Session history — collapsible */}
      {sessions.length > 0 && !showForm && (
        <>
          <div
            className="session-history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            <span>Session History ({sessions.length})</span>
            <span className="text-dim">{showHistory ? '▾' : '▸'}</span>
          </div>

          {showHistory && (
            <div className="session-list">
              {(() => {
                let lastWeekLabel: string | null = null
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
                              onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
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
                              {session.fundamentals && session.fundamentals.length > 0 && (
                                <span className="text-sm text-dim">
                                  {session.fundamentals.length} fundamental{session.fundamentals.length !== 1 ? 's' : ''}
                                </span>
                              )}
                              <button
                                className="btn-ghost btn-action"
                                onClick={(e) => { e.stopPropagation(); startEditSession(session) }}
                                title="Edit session"
                              >
                                ✎
                              </button>
                              <button
                                className="btn-ghost btn-action"
                                style={{ color: 'var(--color-danger)' }}
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteSession(session.id) }}
                                title="Delete session"
                              >
                                ×
                              </button>
                              <span
                                className="text-dim"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                              >
                                {expandedSession === session.id ? '▾' : '▸'}
                              </span>
                            </div>
                          </div>
                        )}

                        {expandedSession === session.id && (session.entries.length > 0 || (session.fundamentals && session.fundamentals.length > 0)) && editingSessionId !== session.id && (
                          <div className="session-entries fade-in">
                            {session.entries.map((entry: any) => (
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
                                  <button
                                    className="btn-ghost btn-action"
                                    onClick={() => startEditEntry(entry)}
                                    title="Edit entry"
                                  >
                                    ✎
                                  </button>
                                  <button
                                    className="btn-ghost btn-action"
                                    onClick={() => setConfirmDeleteEntry(entry.id)}
                                    title="Delete entry"
                                  >
                                    ×
                                  </button>
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

                            {session.fundamentals && session.fundamentals.length > 0 && (
                              <div className="fundamentals-display">
                                {session.fundamentals.map((f: any) => (
                                  <span key={f.id} className="fundamental-chip checked">
                                    {f.category.charAt(0).toUpperCase() + f.category.slice(1)}
                                  </span>
                                ))}
                              </div>
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
        </>
      )}
    {confirmDeleteSession && (
        <ConfirmDialog
          title="Delete Session"
          message="Are you sure you want to delete this practice session? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteSession(confirmDeleteSession)}
          onCancel={() => setConfirmDeleteSession(null)}
        />
      )}

      {confirmDeleteEntry && (
        <ConfirmDialog
          title="Delete Entry"
          message="Are you sure you want to remove this entry from the session?"
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            const entry = sessions
              .flatMap(s => s.entries.map((e: any) => ({ ...e, sessionId: s.id })))
              .find(e => e.id === confirmDeleteEntry)
            if (entry) handleDeleteEntry(entry.sessionId, confirmDeleteEntry)
          }}
          onCancel={() => setConfirmDeleteEntry(null)}
        />
      )}
    </div>
  )
}

export default PracticeLog

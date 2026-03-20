import { useState, useEffect, useMemo } from 'react'
import api from '../api'
import { useToast } from './Toast'
import SetlistChecklist from './SetlistChecklist'
import ConfirmDialog from './ConfirmDialog'
import { localToday } from '../dateUtils'
import './SetlistManager.css'

function SetlistManager({onSelectTune}) {
  const toast = useToast()
  const [setlists, setSetlists] = useState([])
  const [tunes, setTunes] = useState([])
  const [performances, setPerformances] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expandedSetlist, setExpandedSetlist] = useState(null)

  // Form state
  const [title, setTitle] = useState('')
  const [performanceId, setPerformanceId] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedTuneIds, setSelectedTuneIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState(sessionStorage.getItem('setlistSort') || 'created')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  
  useEffect(() => {
    fetchSetlists()
    fetchTunes()
    fetchPerformances()
  }, [])

  useEffect(() => {
    sessionStorage.setItem('setlistSort', sortBy)
  }, [sortBy])

  async function fetchSetlists() {
    try {
      const res = await api.get('/setlists')
      setSetlists(res.data)
    } catch (err) {
      console.error('Failed to fetch setlists:', err)
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

  const sortedSetlists = useMemo(() => {
    const sorted = [...setlists]
    switch (sortBy) {
      case 'created':
        return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
      case 'oldest':
        return sorted.sort((a, b) => a.created_at.localeCompare(b.created_at))
      case 'performance': {
        const perfDateMap = {}
        performances.forEach(p => { perfDateMap[p.id] = p.date })
        return sorted.sort((a, b) => {
          const aDate = a.performance_id ? perfDateMap[a.performance_id] : null
          const bDate = b.performance_id ? perfDateMap[b.performance_id] : null
          if (!aDate && !bDate) return a.title.localeCompare(b.title)
          if (!aDate) return 1
          if (!bDate) return -1
          return aDate.localeCompare(bDate)
        })
      }
      default:
        return sorted
    }
  }, [setlists, sortBy, performances])

  function resetForm() {
    setTitle('')
    setPerformanceId('')
    setNotes('')
    setSelectedTuneIds([])
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(setlist) {
    setTitle(setlist.title)
    setPerformanceId(setlist.performance_id ? setlist.performance_id.toString() : '')
    setNotes(setlist.notes || '')
    setSelectedTuneIds(setlist.entries.map(entry => entry.tune_id))
    setEditingId(setlist.id)
    setShowForm(true)
    setExpandedSetlist(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!title.trim()) {
      setError('Title is required')
      return
    }

    if (selectedTuneIds.length === 0) {
      setError('Add at least one tune')
      return
    }

    setSaving(true)
    try {
      const entriesPayload = selectedTuneIds.map((tuneId, idx) => ({
        tune_id: tuneId,
        position: idx,
      }))

      if (editingId) {
        // Update metadata
        await api.patch(`/setlists/${editingId}`, {
          title: title.trim(),
          performance_id: performanceId ? parseInt(performanceId, 10) : null,
          notes: notes.trim() || null,
        })
        // Update entries
        await api.put(`/setlists/${editingId}/entries`, entriesPayload)
        toast('Setlist updated')
      } else {
        await api.post('/setlists', {
          title: title.trim(),
          performance_id: performanceId ? parseInt(performanceId, 10) : null,
          notes: notes.trim() || null,
          entries: entriesPayload,
        })
        toast(`Created "${title.trim()}"`)
      }

      resetForm()
      fetchSetlists()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save setlist')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(setlistId) {
    try {
      await api.delete(`/setlists/${setlistId}`)
      setSetlists(prev => prev.filter(s => s.id !== setlistId))
      if (expandedSetlist === setlistId) setExpandedSetlist(null)
      toast('Setlist deleted')
    } catch (err) {
      console.error('Failed to delete setlist:', err)
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  // Tune name helper — shows composer in parens for disambiguation
  function tuneLabel(tune) {
    return tune.composer ? `${tune.title} (${tune.composer})` : tune.title
  }

  // Filter to upcoming performances for the dropdown
  const upcomingPerformances = performances.filter(p => {
    const today = localToday()
    return p.date >= today
  })

  // Find linked performance for display
  function getPerformanceLabel(perfId) {
    const p = performances.find(perf => perf.id === perfId)
    if (!p) return null
    return `${p.title} — ${formatDate(p.date)}${p.venue ? ` at ${p.venue}` : ''}`
  }

  if (loading) {
    return <div className="empty-state"><p>Loading...</p></div>
  }

  return (
    <div className="fade-in">
      <div className="practice-header">
        <h1>Setlists</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <select
            className="sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="created">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="performance">Performance Date</option>
          </select>
          <button
            className="btn-primary"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              if (showForm) {
                resetForm()
              } else {
                setShowForm(true)
              }
            }}
          >
          {showForm ? 'Cancel' : '+ New Setlist'}
          </button>
        </div>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="card mb-lg slide-up">
          <h2 style={{ marginBottom: 'var(--space-lg)' }}>
            {editingId ? 'Edit Setlist' : 'New Setlist'}
          </h2>
          {error && <div className="login-error mb-md">{error}</div>}

          <form onSubmit={handleSubmit}>
            {!editingId && setlists.length > 0 && (
              <div className="form-group mb-md">
                <label>Start from existing</label>
              
                <select
                  onChange={e => {
                    const id = parseInt(e.target.value, 10)
                    const source = setlists.find(s => s.id === id)
                    if (source) {
                      setSelectedTuneIds(source.entries.map(entry => entry.tune_id))
                      if (!title.trim()) {
                        setTitle(`${source.title} (copy)`)
                      }
                    }
                    e.target.value = ''
                  }}
                  value=""
                >
                  <option value="">— Blank setlist —</option>
                  {setlists.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.entries.length} tunes)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-row mb-md">
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Blue Note Tuesday"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Performance</label>
                <select
                  value={performanceId}
                  onChange={e => setPerformanceId(e.target.value)}
                >
                  <option value="">No linked performance</option>
                  {upcomingPerformances.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title} — {formatDate(p.date)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group mb-md">
              <label>Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Trio format, no guitar"
              />
            </div>

            <hr className="divider" />

            <h3 style={{ marginBottom: 'var(--space-md)' }}>
              Tunes
              {selectedTuneIds.length > 0 && (
                <span className="text-sm text-dim" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, marginLeft: 'var(--space-sm)' }}>
                  {selectedTuneIds.length} selected
                </span>
              )}
            </h3>

            <SetlistChecklist
              tunes={tunes}
              selectedTuneIds={selectedTuneIds}
              onSelectionChange={setSelectedTuneIds}
            />

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Setlist'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Setlist list */}
      {setlists.length === 0 && !showForm ? (
        <div className="empty-state">
          <h3>No setlists yet</h3>
          <p>Create a setlist to organize tunes for a gig or practice session.</p>
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            + Create Your First Setlist
          </button>
        </div>
      ) : (
        <div className="session-list">
          {sortedSetlists.map(setlist => {
            const isExpanded = expandedSetlist === setlist.id
            const perfLabel = setlist.performance_id
              ? getPerformanceLabel(setlist.performance_id)
              : null

            return (
              <div key={setlist.id} className="session-card slide-up">
                <div
                  className="session-card-header"
                  onClick={() =>
                    setExpandedSetlist(isExpanded ? null : setlist.id)
                  }
                >
                  <div>
                    <span className="session-date">{setlist.title}</span>
                    {perfLabel && (
                      <p className="text-sm mt-sm" style={{ color: 'var(--color-amber)' }}>
                        {perfLabel}
                      </p>
                    )}
                    {setlist.notes && (
                      <p className="text-sm text-dim mt-sm">{setlist.notes}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <span className="text-sm text-dim">
                      {setlist.entries.length} tune{setlist.entries.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); startEdit(setlist) }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost btn-action"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(setlist.id) }}
                    >
                      ×
                    </button>
                    <span className="text-dim">{isExpanded ? '▾' : '▸'}</span>
                  </div>
                </div>

                {isExpanded && setlist.entries.length > 0 && (
                  <div className="session-entries fade-in">
                    {setlist.entries.map((entry, idx) => (
                      <div key={entry.id} className="setlist-display-item">
                        <span className="setlist-display-number">{idx + 1}</span>
                        <span className="entry-tune entry-tune-link"
                        onClick={(e) => { e.stopPropagation(); onSelectTune(entry.tune_id) }}
                        >
                          {entry.tune_title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    {confirmDeleteId && (
        <ConfirmDialog
          title="Delete Setlist"
          message="Are you sure you want to delete this setlist? This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => { handleDelete(confirmDeleteId); setConfirmDeleteId(null) }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}

export default SetlistManager
import { useState, useEffect } from 'react'
import api from '../api'
import { useToast } from './Toast'

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
  const [items, setItems] = useState([]) // { localId, tune_id }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSetlists()
    fetchTunes()
    fetchPerformances()
  }, [])

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

  function resetForm() {
    setTitle('')
    setPerformanceId('')
    setNotes('')
    setItems([])
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function addItem() {
    setItems(prev => [...prev, { localId: Date.now(), tune_id: '' }])
  }

  function updateItem(localId, field, value) {
    setItems(prev => prev.map(i => i.localId === localId ? { ...i, [field]: value } : i))
  }

  function removeItem(localId) {
    setItems(prev => prev.filter(i => i.localId !== localId))
  }

  function moveItem(index, direction) {
    setItems(prev => {
      const next = [...prev]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= next.length) return prev
      const temp = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = temp
      return next
    })
  }

  function startEdit(setlist) {
    setTitle(setlist.title)
    setPerformanceId(setlist.performance_id ? setlist.performance_id.toString() : '')
    setNotes(setlist.notes || '')
    setItems(setlist.entries.map((entry, idx) => ({
      localId: Date.now() + idx,
      tune_id: entry.tune_id.toString(),
    })))
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

    if (items.length === 0) {
      setError('Add at least one tune')
      return
    }

    const invalidItem = items.find(i => !i.tune_id)
    if (invalidItem) {
      setError('Each item needs a tune selected')
      return
    }

    setSaving(true)
    try {
      const entriesPayload = items.map((item, idx) => ({
        tune_id: parseInt(item.tune_id, 10),
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
    const today = new Date().toISOString().split('T')[0]
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
        <button
          className="btn-primary"
          onClick={() => {
            if (showForm) {
              resetForm()
            } else {
              addItem()
              setShowForm(true)
            }
          }}
        >
          {showForm ? 'Cancel' : '+ New Setlist'}
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="card mb-lg slide-up">
          <h2 style={{ marginBottom: 'var(--space-lg)' }}>
            {editingId ? 'Edit Setlist' : 'New Setlist'}
          </h2>
          {error && <div className="login-error mb-md">{error}</div>}

          <form onSubmit={handleSubmit}>
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

            <h3 style={{ marginBottom: 'var(--space-md)' }}>Tunes</h3>

            {items.map((item, idx) => (
              <div key={item.localId} className="setlist-item-row">
                <span className="setlist-item-number">{idx + 1}</span>
                <div className="setlist-item-fields">
                  <select
                    value={item.tune_id}
                    onChange={e => updateItem(item.localId, 'tune_id', e.target.value)}
                  >
                    <option value="">Select a tune...</option>
                    {tunes.map(t => (
                      <option key={t.id} value={t.id}>{tuneLabel(t)}</option>
                    ))}
                  </select>
                </div>
                <div className="setlist-item-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    title="Move up"
                  >↑</button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === items.length - 1}
                    title="Move down"
                  >↓</button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => removeItem(item.localId)}
                  >×</button>
                </div>
              </div>
            ))}

            <button type="button" className="add-entry-btn" onClick={addItem}>
              + Add Tune
            </button>

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
          <button className="btn-primary" onClick={() => { addItem(); setShowForm(true) }}>
            + Create Your First Setlist
          </button>
        </div>
      ) : (
        <div className="session-list">
          {setlists.map(setlist => {
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
                      className="btn-ghost btn-sm"
                      style={{ color: 'var(--color-danger)' }}
                      onClick={e => { e.stopPropagation(); handleDelete(setlist.id) }}
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
    </div>
  )
}

export default SetlistManager
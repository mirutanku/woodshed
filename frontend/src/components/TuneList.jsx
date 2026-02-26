import { useState, useEffect } from 'react'
import api from '../api'

const STATUS_FILTERS = ['all', 'learning', 'playable', 'polished', 'retired']

function TuneList({ onSelectTune }) {
  const [tunes, setTunes] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchTunes()
  }, [filter])

  async function fetchTunes() {
    setLoading(true)
    try {
      const params = filter !== 'all' ? { status: filter } : {}
      const res = await api.get('/tunes', { params })
      setTunes(res.data)
    } catch (err) {
      console.error('Failed to fetch tunes:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleTuneAdded() {
    setShowAddForm(false)
    fetchTunes()
  }

  return (
    <div className="fade-in">
      <div className="tune-list-header">
        <h1>Tunes</h1>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          <div className="tune-filters">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                className={`filter-btn ${filter === s ? 'active' : ''}`}
                onClick={() => setFilter(s)}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="btn-primary btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? 'Cancel' : '+ Add Tune'}
          </button>
        </div>
      </div>

      {showAddForm && (
        <AddTuneForm
          onCancel={() => setShowAddForm(false)}
          onAdded={handleTuneAdded}
        />
      )}

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : tunes.length === 0 ? (
        <div className="empty-state">
          <h3>No tunes yet</h3>
          <p>Add your first tune to start building your repertoire.</p>
          <button className="btn-primary" onClick={() => setShowAddForm(true)}>
            + Add Your First Tune
          </button>
        </div>
      ) : (
        <div className="tune-grid stagger">
          {tunes.map(tune => (
            <div
              key={tune.id}
              className="tune-row slide-up"
              onClick={() => onSelectTune(tune.id)}
            >
              <div className="tune-row-info">
                <h3>{tune.title}</h3>
                <div className="tune-row-meta">
                  {tune.composer && <span>{tune.composer}</span>}
                  {tune.key && <span>{tune.key}</span>}
                  {tune.tempo && <span>{tune.tempo} bpm</span>}
                </div>
              </div>
              <span className={`status-badge ${tune.status}`}>{tune.status}</span>
              <span className="tune-recording-count">
                {tune.recording_count} rec{tune.recording_count !== 1 ? 's' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function AddTuneForm({ onCancel, onAdded }) {
  const [form, setForm] = useState({
    title: '',
    composer: '',
    key: '',
    tempo: '',
    form: '',
    status: 'learning',
    notes: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('Title is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const payload = {
        title: form.title.trim(),
        composer: form.composer.trim() || null,
        key: form.key.trim() || null,
        tempo: form.tempo ? parseInt(form.tempo, 10) : null,
        form: form.form.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      }
      await api.post('/tunes', payload)
      onAdded()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add tune')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card mb-lg slide-up">
      <h2 style={{ marginBottom: 'var(--space-lg)' }}>Add Tune</h2>
      <form onSubmit={handleSubmit}>
        {error && <div className="login-error mb-md">{error}</div>}

        <div className="form-group mb-md">
          <label>Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => handleChange('title', e.target.value)}
            placeholder="e.g. Giant Steps"
            autoFocus
          />
        </div>

        <div className="form-row mb-md">
          <div className="form-group">
            <label>Composer</label>
            <input
              type="text"
              value={form.composer}
              onChange={e => handleChange('composer', e.target.value)}
              placeholder="e.g. John Coltrane"
            />
          </div>
          <div className="form-group">
            <label>Key</label>
            <input
              type="text"
              value={form.key}
              onChange={e => handleChange('key', e.target.value)}
              placeholder="e.g. B major"
            />
          </div>
        </div>

        <div className="form-row mb-md">
          <div className="form-group">
            <label>Tempo (BPM)</label>
            <input
              type="number"
              value={form.tempo}
              onChange={e => handleChange('tempo', e.target.value)}
              placeholder="e.g. 280"
            />
          </div>
          <div className="form-group">
            <label>Form</label>
            <input
              type="text"
              value={form.form}
              onChange={e => handleChange('form', e.target.value)}
              placeholder="e.g. AABA"
            />
          </div>
        </div>

        <div className="form-group mb-md">
          <label>Status</label>
          <select
            value={form.status}
            onChange={e => handleChange('status', e.target.value)}
          >
            <option value="learning">Learning</option>
            <option value="playable">Playable</option>
            <option value="polished">Polished</option>
            <option value="retired">Retired</option>
          </select>
        </div>

        <div className="form-group mb-md">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            placeholder="Practice notes, things to remember..."
            rows={3}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Add Tune'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default TuneList
import { useState, useMemo } from 'react'

function SetlistChecklist({ tunes, selectedTuneIds, onSelectionChange }) {
  // selectedTuneIds is an ordered array of tune IDs representing the setlist order

  function toggleTune(tuneId) {
    if (selectedTuneIds.includes(tuneId)) {
      // Remove from setlist
      onSelectionChange(selectedTuneIds.filter(id => id !== tuneId))
    } else {
      // Add to end of setlist
      onSelectionChange([...selectedTuneIds, tuneId])
    }
  }

  function moveTune(tuneId, direction) {
    const idx = selectedTuneIds.indexOf(tuneId)
    if (idx === -1) return
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= selectedTuneIds.length) return

    const next = [...selectedTuneIds]
    const temp = next[idx]
    next[idx] = next[targetIdx]
    next[targetIdx] = temp
    onSelectionChange(next)
  }

  // Build the display list: selected tunes in order first, then unselected alphabetically
  const sortedTunes = useMemo(() => {
    const tuneMap = {}
    tunes.forEach(t => { tuneMap[t.id] = t })

    const selected = selectedTuneIds
      .map(id => tuneMap[id])
      .filter(Boolean)

    const unselected = tunes
      .filter(t => !selectedTuneIds.includes(t.id))
      .sort((a, b) => a.title.localeCompare(b.title))

    return { selected, unselected }
  }, [tunes, selectedTuneIds])

  return (
    <div className="session-checklist">
      {sortedTunes.selected.map((tune, idx) => (
        <div key={tune.id} className="checklist-item checked">
          <div className="checklist-row">
            <span
              className="checklist-check on"
              onClick={() => toggleTune(tune.id)}
              style={{ cursor: 'pointer' }}
            >
              ✓
            </span>
            <span className="setlist-checklist-number">{idx + 1}</span>
            <div className="checklist-tune-info" onClick={() => toggleTune(tune.id)} style={{ cursor: 'pointer' }}>
              <span className="checklist-tune-title">{tune.title}</span>
              {tune.composer && <span className="checklist-tune-composer">{tune.composer}</span>}
            </div>
            <div className="setlist-checklist-arrows">
              <button
                type="button"
                className="btn-ghost btn-action"
                onClick={() => moveTune(tune.id, -1)}
                disabled={idx === 0}
                title="Move up"
              >↑</button>
              <button
                type="button"
                className="btn-ghost btn-action"
                onClick={() => moveTune(tune.id, 1)}
                disabled={idx === sortedTunes.selected.length - 1}
                title="Move down"
              >↓</button>
            </div>
          </div>
        </div>
      ))}

      {sortedTunes.selected.length > 0 && sortedTunes.unselected.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border)', margin: 'var(--space-xs) 0' }} />
      )}

      {sortedTunes.unselected.map(tune => (
        <div key={tune.id} className="checklist-item">
          <div className="checklist-row" onClick={() => toggleTune(tune.id)}>
            <span className="checklist-check" />
            <div className="checklist-tune-info">
              <span className="checklist-tune-title">{tune.title}</span>
              {tune.composer && <span className="checklist-tune-composer">{tune.composer}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default SetlistChecklist
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api'
import { useToast } from './Toast'
import RecordingUpload from './RecordingUpload'

function formatTime(seconds) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MobileTuneDetail({ tune, recordings, onBack, onRecordingsChanged, onTuneChanged, onTuneDeleted }) {
  const toast = useToast()
  const audioRef = useRef(null)
  const animFrameRef = useRef(null)

  const [selectedRecording, setSelectedRecording] = useState(null)
  const [segments, setSegments] = useState([])

  // Player state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const [loopSegment, setLoopSegment] = useState(null)
  const [editingSegment, setEditingSegment] = useState(null)
  const [confirmDeleteSegment, setConfirmDeleteSegment] = useState(false)
  const [editSegForm, setEditSegForm] = useState({})
  const [editingTune, setEditingTune] = useState(false)
  const [tuneForm, setTuneForm] = useState({})
  const [confirmDeleteTune, setConfirmDeleteTune] = useState(false)
  const [confirmDeleteRecording, setConfirmDeleteRecording] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const longPressTimer = useRef(null)

  // Auto-ramp state
  const [rampEnabled, setRampEnabled] = useState(false)
  const [rampEnd, setRampEnd] = useState(1.0)
  const [rampStep, setRampStep] = useState(0.05)
  const [rampReachedMax, setRampReachedMax] = useState(false)
  // Ref so the tick callback always sees current speed without re-creating
  const speedRef = useRef(1.0)
  const rampRef = useRef({ enabled: false, end: 1.0, step: 0.05 })

  // Quick mark state
  const [marking, setMarking] = useState(false)
  const [markStart, setMarkStart] = useState(null)
  const [markEnd, setMarkEnd] = useState(null)
  const [markLabel, setMarkLabel] = useState('')
  const [markSaving, setMarkSaving] = useState(false)

  // Auto-select first recording
  useEffect(() => {
    if (recordings.length > 0 && !selectedRecording) {
      selectRecording(recordings[0])
    }
  }, [recordings])

  async function selectRecording(rec) {
    stopPlayback()
    setSelectedRecording(rec)
    setLoopSegment(null)
    setMarking(false)
    try {
      const res = await api.get(`/recordings/${rec.id}/segments`)
      setSegments(res.data)
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    }
  }

  async function fetchSegments() {
    if (!selectedRecording) return
    try {
      const res = await api.get(`/recordings/${selectedRecording.id}/segments`)
      setSegments(res.data)
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    }
  }

  function stopPlayback() {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
  }

  // rAF loop
  const tick = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const time = audio.currentTime
    setCurrentTime(time)

    if (loopSegment && time >= loopSegment.end_time) {
      // Auto-ramp: bump speed before looping back
      const ramp = rampRef.current
      if (ramp.enabled) {
        const currentSpeed = speedRef.current
        if (currentSpeed < ramp.end) {
          const newSpeed = Math.min(currentSpeed + ramp.step, ramp.end)
          const rounded = Math.round(newSpeed * 100) / 100
          setSpeed(rounded)
          speedRef.current = rounded
          audio.playbackRate = rounded
          if (rounded >= ramp.end) {
            setRampReachedMax(true)
          }
        }
      }
      audio.currentTime = loopSegment.start_time
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [loopSegment])

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick)
    } else {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, tick])

  // Fallback loop enforcement for background playback
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !loopSegment) return

    function handleTimeUpdate() {
      if (loopSegment && audio.currentTime >= loopSegment.end_time) {
        // Auto-ramp in background
        const ramp = rampRef.current
        if (ramp.enabled) {
          const currentSpeed = speedRef.current
          if (currentSpeed < ramp.end) {
            const newSpeed = Math.min(currentSpeed + ramp.step, ramp.end)
            const rounded = Math.round(newSpeed * 100) / 100
            setSpeed(rounded)
            speedRef.current = rounded
            audio.playbackRate = rounded
            if (rounded >= ramp.end) {
              setRampReachedMax(true)
            }
          }
        }
        audio.currentTime = loopSegment.start_time
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [loopSegment])

  function handleSegmentPressStart(segment) {
    longPressTimer.current = setTimeout(() => {
      setEditingSegment(segment.id)
      setEditSegForm({
        label: segment.label,
        start_time: segment.start_time,
        end_time: segment.end_time,
      })
    }, 500)
  }

  function handleSegmentPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  async function handleSaveSegment(segmentId) {
    try {
      await api.patch(`/segments/${segmentId}`, {
        label: editSegForm.label.trim(),
        start_time: parseFloat(editSegForm.start_time),
        end_time: parseFloat(editSegForm.end_time),
      })
      toast('Segment updated')
      setEditingSegment(null)
      fetchSegments()
    } catch (err) {
      toast('Failed to update segment', 'error')
    }
  }

  async function handleDeleteSegment(segmentId) {
    try {
      await api.delete(`/segments/${segmentId}`)
      toast('Segment deleted')
      if (loopSegment?.id === segmentId) {
        setLoopSegment(null)
      }
      setEditingSegment(null)
      fetchSegments()
    } catch (err) {
      toast('Failed to delete segment', 'error')
    } finally {
      setConfirmDeleteSegment(false)
    }
  }

  function startEditTune() {
    setEditingTune(true)
    setTuneForm({
      title: tune.title || '',
      composer: tune.composer || '',
      key: tune.key || '',
      tempo: tune.tempo || '',
      form: tune.form || '',
      status: tune.status || 'learning',
      notes: tune.notes || '',
    })
  }

  async function handleSaveTune() {
    if (!tuneForm.title.trim()) return
    try {
      await api.patch(`/tunes/${tune.id}`, {
        title: tuneForm.title.trim(),
        composer: tuneForm.composer.trim() || null,
        key: tuneForm.key.trim() || null,
        tempo: tuneForm.tempo ? parseInt(tuneForm.tempo, 10) : null,
        form: tuneForm.form.trim() || null,
        status: tuneForm.status,
        notes: tuneForm.notes.trim() || null,
      })
      toast('Tune updated')
      setEditingTune(false)
      if (onTuneChanged) onTuneChanged()
    } catch (err) {
      toast('Failed to update tune', 'error')
    }
  }

  async function handleDeleteTune() {
    try {
      await api.delete(`/tunes/${tune.id}`)
      toast('Tune deleted')
      if (onTuneDeleted) onTuneDeleted()
    } catch (err) {
      toast('Failed to delete tune', 'error')
    } finally {
      setConfirmDeleteTune(false)
    }
  }

  async function handleDeleteRecording(recId) {
    try {
      await api.delete(`/recordings/${recId}`)
      toast('Recording deleted')
      setConfirmDeleteRecording(null)
      if (selectedRecording?.id === recId) {
        stopPlayback()
        setSelectedRecording(null)
        setSegments([])
      }
      onRecordingsChanged()
    } catch (err) {
      toast('Failed to delete recording', 'error')
    }
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {})
    }
  }

  function setPlaybackSpeed(newSpeed) {
    const clamped = Math.round(newSpeed * 100) / 100
    setSpeed(clamped)
    speedRef.current = clamped
    if (audioRef.current) audioRef.current.playbackRate = clamped
  }

  // Keep ramp ref in sync
  useEffect(() => {
    rampRef.current = { enabled: rampEnabled, end: rampEnd, step: rampStep }
  }, [rampEnabled, rampEnd, rampStep])

  function handleSegmentTap(segment) {
    const audio = audioRef.current
    if (!audio) return

    if (loopSegment && loopSegment.id === segment.id) {
      setLoopSegment(null)
      setRampReachedMax(false)
    } else {
      setLoopSegment(segment)
      setRampReachedMax(false)
      audio.currentTime = segment.start_time
      setCurrentTime(segment.start_time)
      if (!isPlaying) {
        // Wait for the seek to finish before playing
        function onSeeked() {
          audio.removeEventListener('seeked', onSeeked)
          audio.play().then(() => setIsPlaying(true)).catch(() => {})
        }
        audio.addEventListener('seeked', onSeeked)
      }
    }
  }

  function handleTimelineClick(e) {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    audio.currentTime = fraction * duration
    setCurrentTime(fraction * duration)
  }

  // Quick mark handlers
  function startMarking() {
    setMarking(true)
    setMarkStart(null)
    setMarkEnd(null)
    setMarkLabel('')
  }

  function cancelMarking() {
    setMarking(false)
    setMarkStart(null)
    setMarkEnd(null)
    setMarkLabel('')
  }

  function tapMarkStart() {
    setMarkStart(Math.round(currentTime))
  }

  function tapMarkEnd() {
    setMarkEnd(Math.round(currentTime))
  }

  async function saveQuickSegment() {
    if (markStart === null || markEnd === null || !markLabel.trim()) return
    if (!selectedRecording) return

    setMarkSaving(true)
    try {
      const SEGMENT_COLORS = [
        '#d4a04a', '#5a9e6f', '#6b8ec4', '#c45b4a',
        '#9b7ec4', '#4a9e9e', '#c4884a', '#7a9e5a',
      ]
      await api.post(`/recordings/${selectedRecording.id}/segments`, {
        label: markLabel.trim(),
        start_time: Math.min(markStart, markEnd),
        end_time: Math.max(markStart, markEnd),
        color: SEGMENT_COLORS[segments.length % SEGMENT_COLORS.length],
      })
      toast(`Added "${markLabel.trim()}"`)
      cancelMarking()
      fetchSegments()
    } catch (err) {
      toast('Failed to save segment', 'error')
    } finally {
      setMarkSaving(false)
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) { audio.pause(); audio.src = '' }
    }
  }, [])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="shed-mode fade-in">
      <button className="shed-back-btn" onClick={() => { stopPlayback(); onBack() }}>
        ← Back
      </button>

      {editingTune ? (
        <div className="shed-tune-edit">
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={tuneForm.title}
              onChange={e => setTuneForm(prev => ({ ...prev, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Composer</label>
            <input
              type="text"
              value={tuneForm.composer}
              onChange={e => setTuneForm(prev => ({ ...prev, composer: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Key</label>
              <input
                type="text"
                value={tuneForm.key}
                onChange={e => setTuneForm(prev => ({ ...prev, key: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Tempo</label>
              <input
                type="number"
                value={tuneForm.tempo}
                onChange={e => setTuneForm(prev => ({ ...prev, tempo: e.target.value }))}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Form</label>
              <input
                type="text"
                value={tuneForm.form}
                onChange={e => setTuneForm(prev => ({ ...prev, form: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Status</label>
              <select
                value={tuneForm.status}
                onChange={e => setTuneForm(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="learning">Learning</option>
                <option value="transcribing">Transcribing</option>
                <option value="playable">Playable</option>
                <option value="polished">Polished</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={tuneForm.notes}
              onChange={e => setTuneForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
            />
          </div>
          {/* Recordings management */}
          {recordings.length > 0 && (
            <div className="form-group">
              <label>Recordings</label>
              {recordings.map(rec => (
                <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-xs) 0' }}>
                  <span className="text-sm">{rec.artist || rec.original_name}</span>
                  {confirmDeleteRecording === rec.id ? (
                    <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                      <span className="text-sm text-dim">You sure?</span>
                      <button className="btn-danger btn-sm" onClick={() => handleDeleteRecording(rec.id)}>Yes</button>
                      <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteRecording(null)}>No</button>
                    </div>
                  ) : (
                    <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteRecording(rec.id)}>Delete Recording</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-primary btn-sm" onClick={handleSaveTune}>Save</button>
            <button className="btn-ghost btn-sm" onClick={() => setEditingTune(false)}>Cancel</button>
            {confirmDeleteTune ? (
              <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', marginLeft: 'auto' }}>
                <span className="text-sm text-dim">You sure?</span>
                <button className="btn-danger btn-sm" onClick={handleDeleteTune}>Yes</button>
                <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteTune(false)}>No</button>
              </div>
            ) : (
              <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteTune(true)} style={{ marginLeft: 'auto' }}>Delete Tune</button>
            )}
          </div>
        </div>
      ) : (
        <div className="shed-now-playing" onClick={startEditTune} style={{ cursor: 'pointer' }}>
          <h1 className="shed-tune-now">{tune.title}</h1>
          {tune.composer && (
            <span className="shed-composer-now">{tune.composer}</span>
          )}
          {tune.key && (
            <span className="shed-key-badge">{tune.key}</span>
          )}
        </div>
      )}

      {/* Recording selector (if multiple) */}
      {recordings.length > 0 && !editingTune && (
        <div className="shed-recording-picker">
          {recordings.map(rec => (
            <button
              key={rec.id}
              className={`shed-recording-btn ${selectedRecording?.id === rec.id ? 'active' : ''}`}
              onClick={() => selectRecording(rec)}
            >
              {rec.artist || rec.original_name}
            </button>
          ))}
        </div>
      )}

      {!editingTune && (showUpload ? (
        <div>
          <RecordingUpload tuneId={tune.id} onUploaded={() => { onRecordingsChanged(); setShowUpload(false) }} />
          <button className="btn-ghost btn-sm" onClick={() => setShowUpload(false)} style={{ marginTop: 'var(--space-xs)' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="shed-mark-trigger" onClick={() => setShowUpload(true)} style={{ marginBottom: 'var(--space-sm)' }}>
          + Add Recording
        </button>
      ))}

      {selectedRecording && (
        <>
          <audio
            ref={audioRef}
            src={`/uploads/${selectedRecording.filename}`}
            preload="auto"
            onLoadedMetadata={() => {
              if (audioRef.current) {
                setDuration(audioRef.current.duration)
                audioRef.current.playbackRate = speed
              }
            }}
            onEnded={() => {
              if (loopSegment) {
                audioRef.current.currentTime = loopSegment.start_time
                audioRef.current.play()
              } else {
                setIsPlaying(false)
              }
            }}
          />

          {/* Timeline */}
          <div className="shed-timeline" onClick={handleTimelineClick}>
            {segments.map(seg => {
              const left = (seg.start_time / duration) * 100
              const width = ((seg.end_time - seg.start_time) / duration) * 100
              return (
                <div
                  key={seg.id}
                  className={`shed-timeline-segment ${loopSegment?.id === seg.id ? 'looping' : ''}`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: seg.color || 'var(--color-amber)',
                  }}
                />
              )
            })}
            <div className="shed-timeline-progress" style={{ width: `${progressPercent}%` }} />
            <div className="shed-timeline-playhead" style={{ left: `${progressPercent}%` }} />
          </div>

          <div className="shed-time">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Transport */}
          <div className="shed-transport">
            <button className="shed-play-btn" onClick={togglePlay}>
              {isPlaying ? '❚❚' : '▶'}
            </button>
          </div>

          {/* Speed */}
          <div className="shed-speed">
            {[0.5, 0.75, 1.0, 1.25].map(s => (
              <button
                key={s}
                className={`shed-speed-btn ${speed === s ? 'active' : ''}`}
                onClick={() => setPlaybackSpeed(s)}
              >
                {s === 1.0 ? '1×' : `${s}×`}
              </button>
            ))}
          </div>
          <div className="shed-speed-slider">
            <input
              type="range"
              min="0.25"
              max="1.5"
              step="0.05"
              value={speed}
              onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
            />
            <span className="shed-speed-value">{speed.toFixed(2)}×</span>
          </div>

          {/* Segments */}
          {segments.length > 0 && (
            <div className="shed-segments">
              {segments.map(seg => (
                editingSegment === seg.id ? (
                  <div key={seg.id} className="shed-segment-edit">
                    <input
                      type="text"
                      value={editSegForm.label}
                      onChange={e => setEditSegForm(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="Label"
                    />
                    <div className="shed-segment-edit-times">
                      <div className="shed-segment-edit-field">
                        <label>Start (sec)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editSegForm.start_time}
                          onChange={e => setEditSegForm(prev => ({ ...prev, start_time: e.target.value }))}
                        />
                        <button
                          className="btn-ghost btn-action"
                          onClick={() => setEditSegForm(prev => ({ ...prev, start_time: Math.round(currentTime * 10) / 10 }))}
                        >
                          Now
                        </button>
                      </div>
                      <div className="shed-segment-edit-field">
                        <label>End (sec)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editSegForm.end_time}
                          onChange={e => setEditSegForm(prev => ({ ...prev, end_time: e.target.value }))}
                        />
                        <button
                          className="btn-ghost btn-action"
                          onClick={() => setEditSegForm(prev => ({ ...prev, end_time: Math.round(currentTime * 10) / 10 }))}
                        >
                          Now
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                      <button className="btn-primary btn-sm" onClick={() => handleSaveSegment(seg.id)}>Save</button>
                      <button className="btn-ghost btn-sm" onClick={() => setEditingSegment(null)}>Cancel</button>
                      {confirmDeleteSegment ? (
                        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                          <span className="text-sm text-dim">Sure?</span>
                          <button className="btn-danger btn-sm" onClick={() => handleDeleteSegment(seg.id)}>Yes, Delete</button>
                          <button className="btn-ghost btn-sm" onClick={() => setConfirmDeleteSegment(false)}>No</button>
                        </div>
                      ) : (
                        <button className="btn-danger btn-sm" onClick={() => setConfirmDeleteSegment(true)}>Delete</button>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    key={seg.id}
                    className={`shed-segment-btn ${loopSegment?.id === seg.id ? 'active' : ''}`}
                    onClick={() => handleSegmentTap(seg)}
                    onTouchStart={() => handleSegmentPressStart(seg)}
                    onTouchEnd={handleSegmentPressEnd}
                    onTouchCancel={handleSegmentPressEnd}
                  >
                    <span
                      className="shed-segment-dot"
                      style={{ background: seg.color || 'var(--color-amber)' }}
                    />
                    <span className="shed-segment-label">{seg.label}</span>
                    <span className="shed-segment-time">
                      {formatTime(seg.start_time)}–{formatTime(seg.end_time)}
                    </span>
                  </button>
                )
              ))}
            </div>
          )}

          {/* Loop indicator + auto-ramp */}
          {loopSegment && !marking && (
            <div className="shed-ramp-panel">
              <div className="shed-loop-indicator">
                Looping: {loopSegment.label} at {Math.round(speed * 100)}%
                <button className="shed-loop-clear" onClick={() => { setLoopSegment(null); setRampReachedMax(false) }}>
                  Clear
                </button>
              </div>

              {!rampEnabled ? (
                <button
                  className="shed-ramp-toggle"
                  onClick={() => {
                    setRampEnd(1.0)
                    setRampStep(0.05)
                    setRampReachedMax(false)
                    setRampEnabled(true)
                  }}
                >
                  Auto-Ramp ↗
                </button>
              ) : (
                <div className="shed-ramp-controls">
                  <div className="shed-ramp-header">
                    <span className="shed-mark-title">Auto-Ramp</span>
                    <button className="btn-ghost btn-sm" onClick={() => setRampEnabled(false)}>Off</button>
                  </div>
                  <div className="shed-ramp-fields">
                    <div className="shed-ramp-field">
                      <label>Target</label>
                      <select
                        value={rampEnd}
                        onChange={e => { setRampEnd(parseFloat(e.target.value)); setRampReachedMax(false) }}
                      >
                        {[0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25].map(v => (
                          <option key={v} value={v}>{Math.round(v * 100)}%</option>
                        ))}
                      </select>
                    </div>
                    <div className="shed-ramp-field">
                      <label>Step</label>
                      <select
                        value={rampStep}
                        onChange={e => { setRampStep(parseFloat(e.target.value)); setRampReachedMax(false) }}
                      >
                        <option value={0.01}>1%</option>
                        <option value={0.02}>2%</option>
                        <option value={0.05}>5%</option>
                        <option value={0.1}>10%</option>
                      </select>
                    </div>
                  </div>
                  {rampReachedMax && (
                    <div className="shed-ramp-done">
                      Reached {Math.round(rampEnd * 100)}%!
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick mark segment */}
          {marking ? (
            <div className="shed-mark-panel">
              <div className="shed-mark-header">
                <span className="shed-mark-title">Mark Segment</span>
                <button className="btn-ghost btn-sm" onClick={cancelMarking}>Cancel</button>
              </div>

              <div className="shed-mark-buttons">
                <button
                  className={`shed-mark-btn ${markStart !== null ? 'marked' : ''}`}
                  onClick={tapMarkStart}
                >
                  {markStart !== null ? `Start: ${formatTime(markStart)}` : '● Mark Start'}
                </button>
                <button
                  className={`shed-mark-btn ${markEnd !== null ? 'marked' : ''}`}
                  onClick={tapMarkEnd}
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
                    onClick={saveQuickSegment}
                    disabled={!markLabel.trim() || markSaving}
                  >
                    {markSaving ? '...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="shed-mark-trigger" onClick={startMarking}>
              + Mark Segment
            </button>
          )}
        </>
      )}

      {recordings.length === 0 && (
        <RecordingUpload tuneId={tune.id} onUploaded={onRecordingsChanged} />
      )}
    </div>
  )
}

export default MobileTuneDetail
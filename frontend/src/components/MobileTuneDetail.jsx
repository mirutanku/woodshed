import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api'
import { useToast } from './Toast'

function formatTime(seconds) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MobileTuneDetail({ tune, recordings, onBack, onRecordingsChanged }) {
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

      <div className="shed-now-playing">
        <h1 className="shed-tune-now">{tune.title}</h1>
        {tune.composer && (
          <span className="shed-composer-now">{tune.composer}</span>
        )}
        {tune.key && (
          <span className="shed-key-badge">{tune.key}</span>
        )}
      </div>

      {/* Recording selector (if multiple) */}
      {recordings.length > 1 && (
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

          {/* Segments */}
          {segments.length > 0 && (
            <div className="shed-segments">
              {segments.map(seg => (
                <button
                  key={seg.id}
                  className={`shed-segment-btn ${loopSegment?.id === seg.id ? 'active' : ''}`}
                  onClick={() => handleSegmentTap(seg)}
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
        <div className="empty-state">
          <p>No recordings yet. Add recordings from desktop to start practicing.</p>
        </div>
      )}
    </div>
  )
}

export default MobileTuneDetail
import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../api'
import { useToast } from './Toast'
import MobileTuneEditForm from './MobileTuneEditForm'
import MobileSegmentEditForm from './MobileSegmentEditForm'
import MobileQuickMark from './MobileQuickMark'
import RecordingUpload from './RecordingUpload'

function formatTime(seconds) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MobileTuneDetail({ tune, recordings, onBack, onRecordingsChanged, onTuneChanged, onTuneDeleted }) {
  const toast = useToast()

  // Audio engine
  const audioRef = useRef(null)
  const animFrameRef = useRef(null)
  const speedRef = useRef(1.0)
  const rampRef = useRef({ enabled: false, end: 1.0, step: 0.05, loopsPerStep: 1 })
  const rampLoopCount = useRef(0)

  // Playback
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1.0)

  // Content
  const [selectedRecording, setSelectedRecording] = useState(null)
  const [segments, setSegments] = useState([])

  // Looping and auto-ramp
  const [loopSegment, setLoopSegment] = useState(null)
  const [rampEnabled, setRampEnabled] = useState(false)
  const [rampEnd, setRampEnd] = useState(1.0)
  const [rampStep, setRampStep] = useState(0.05)
  const [rampLoopsPerStep, setRampLoopsPerStep] = useState(1)
  const [rampReachedMax, setRampReachedMax] = useState(false)

  // UI modes — only one active at a time
  const [editingTune, setEditingTune] = useState(false)
  const [editingSegment, setEditingSegment] = useState(null)
  const [marking, setMarking] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const longPressTimer = useRef(null)

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

  function applyRamp(audio) {
    const ramp = rampRef.current
    if (!ramp.enabled) return
    const currentSpeed = speedRef.current
    if (currentSpeed >= ramp.end) return

    rampLoopCount.current += 1
    if (rampLoopCount.current < ramp.loopsPerStep) return

    rampLoopCount.current = 0
    const newSpeed = Math.min(currentSpeed + ramp.step, ramp.end)
    const rounded = Math.round(newSpeed * 100) / 100
    setSpeed(rounded)
    speedRef.current = rounded
    audio.playbackRate = rounded
    if (rounded >= ramp.end) setRampReachedMax(true)
  }

  // rAF loop
  const tick = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const time = audio.currentTime
    setCurrentTime(time)

    if (loopSegment && audio.currentTime >= loopSegment.end_time) {
        applyRamp(audio)
        audio.currentTime = loopSegment.start_time
        setCurrentTime(loopSegment.start_time)
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
        applyRamp(audio)
        audio.currentTime = loopSegment.start_time
        setCurrentTime(loopSegment.start_time)
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate)
  }, [loopSegment])

  function handleSegmentPressStart(segment) {
    longPressTimer.current = setTimeout(() => {
      setEditingSegment(segment.id)
    }, 500)
  }

  function handleSegmentPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
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
    rampRef.current = { enabled: rampEnabled, end: rampEnd, step: rampStep, loopsPerStep: rampLoopsPerStep }
  }, [rampEnabled, rampEnd, rampStep, rampLoopsPerStep])

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
        <MobileTuneEditForm
          tune={tune}
          recordings={recordings}
          onSave={() => { setEditingTune(false); if (onTuneChanged) onTuneChanged() }}
          onDelete={() => { if (onTuneDeleted) onTuneDeleted() }}
          onDeleteRecording={(recId) => {
            if (selectedRecording?.id === recId) {
              stopPlayback()
              setSelectedRecording(null)
              setSegments([])
            }
            onRecordingsChanged()
          }}
          onCancel={() => setEditingTune(false)}
        />
      ) : (
        <div className="shed-now-playing" onClick={() => setEditingTune(true)} style={{ cursor: 'pointer' }}>
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

      {!editingTune && recordings.length > 0 && (showUpload ? (
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
            src={`/api/recordings/${selectedRecording.id}/stream?token=${localStorage.getItem('token')}`}
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
                  <MobileSegmentEditForm
                    key={seg.id}
                    segment={seg}
                    currentTime={currentTime}
                    onSave={() => { setEditingSegment(null); fetchSegments() }}
                    onDelete={(segId) => {
                      if (loopSegment?.id === segId) setLoopSegment(null)
                      setEditingSegment(null)
                      fetchSegments()
                    }}
                    onCancel={() => setEditingSegment(null)}
                  />
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
                    rampLoopCount.current = 0
                    setRampEnabled
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
                    <div className="shed-ramp-field">
                      <label>Reps</label>
                      <select
                        value={rampLoopsPerStep}
                        onChange={e => { setRampLoopsPerStep(parseInt(e.target.value)); setRampReachedMax(false) }}
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                        <option value={5}>5x</option>
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
            <MobileQuickMark
              recordingId={selectedRecording.id}
              segmentCount={segments.length}
              currentTime={currentTime}
              onSaved={() => { setMarking(false); fetchSegments() }}
              onCancel={() => setMarking(false)}
            />
          ) : (
            <button className="shed-mark-trigger" onClick={() => setMarking(true)}>
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
import { useState, useEffect, useRef } from 'react'
import api from '../api'
import { useToast } from './Toast'
import MobileTuneEditForm from './MobileTuneEditForm'
import MobileSegmentEditForm from './MobileSegmentEditForm'
import MobileQuickMark from './MobileQuickMark'
import RecordingUpload from './RecordingUpload'
import { localToday } from '../dateUtils'
import useVisibilityTimer from '../useVisibilityTimer'
import useAudioEngine from '../useAudioEngine'
import './ShedMode.css'

function formatTime(seconds: number) {
  const s = Math.round(seconds)
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function MobileTuneDetail({ tune, recordings, onBack, onRecordingsChanged, onTuneChanged, onTuneDeleted }: {
  tune: any
  recordings: any[]
  onBack: () => void
  onRecordingsChanged: () => void
  onTuneChanged: () => void
  onTuneDeleted: () => void
}) {
  const toast = useToast()

  // Audio engine — shared with the desktop player (see useAudioEngine.ts).
  // Runs playback through Web Audio instead of a plain <audio> element so
  // the volume slider below is a real, independent control on iOS.
  const engine = useAudioEngine()
  const isPlayingRef = useRef(false)
  const speedRef = useRef(1.0)

  // Content
  const [selectedRecording, setSelectedRecording] = useState<any>(null)
  const [segments, setSegments] = useState<any[]>([])
  const [notesValue, setNotesValue] = useState(tune.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)

  // UI modes — only one active at a time
  const [editingTune, setEditingTune] = useState(false)
  const [editingSegment, setEditingSegment] = useState<number | null>(null)
  const [marking, setMarking] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speedHoldTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speedHoldInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const speedHoldActive = useRef(false)

  // Practice tracking
  const hasCheckedIn = useRef(false)
  const hasTrackedPlayback = useRef(false)
  const [quickLogged, setQuickLogged] = useState(false)

  // Display timer — independent from tracking, shows total time on tune today
  const [practiceElapsed, setPracticeElapsed] = useState(0)
  const practiceStartRef = useRef(Date.now())
  const practiceBaseRef = useRef(0)

  useEffect(() => {
    api.get(`/today?client_date=${localToday()}`).then(res => {
      const tuneData = res.data.tunes?.find((t: any) => t.tune_id === tune.id)
      if (tuneData?.play_seconds) {
        practiceBaseRef.current = tuneData.play_seconds
      }
    }).catch(() => {})
  }, [tune.id])

  useEffect(() => {
    const interval = setInterval(() => {
      const sessionSeconds = Math.round((Date.now() - practiceStartRef.current) / 1000)
      setPracticeElapsed(practiceBaseRef.current + sessionSeconds)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Keep ref mirrors in sync — these feed setInterval/timer closures that
  // can't see fresh state directly (see startSpeedHold below).
  useEffect(() => {
    isPlayingRef.current = engine.isPlaying
  }, [engine.isPlaying])

  useEffect(() => {
    speedRef.current = engine.speed
  }, [engine.speed])

  const { flush: flushTimer } = useVisibilityTimer((seconds) => {
    api.post(`/tunes/${tune.id}/play-time?seconds=${seconds}&client_date=${localToday()}`).catch(() => {})
  }, isPlayingRef)

  // Auto-select first recording
  useEffect(() => {
    if (recordings.length > 0 && !selectedRecording) {
      selectRecording(recordings[0])
    }
  }, [recordings])

  // Load the recording's audio into the engine whenever selection changes
  useEffect(() => {
    if (selectedRecording) {
      engine.load(selectedRecording.id)
      hasTrackedPlayback.current = false
      setQuickLogged(false)
    }
  }, [selectedRecording?.id])

  async function selectRecording(rec: any) {
    setSelectedRecording(rec)
    setMarking(false)
    try {
      const res = await api.get(`/recordings/${rec.id}/segments`)
      setSegments(res.data)
    } catch (err: any) {
      console.error('Failed to fetch segments:', err)
    }
  }

  async function fetchSegments() {
    if (!selectedRecording) return
    try {
      const res = await api.get(`/recordings/${selectedRecording.id}/segments`)
      setSegments(res.data)
    } catch (err: any) {
      console.error('Failed to fetch segments:', err)
    }
  }

  function stopPlayback() {
    engine.pause()
  }

  function trackPlaybackIfNeeded() {
    if (!hasCheckedIn.current) {
      hasCheckedIn.current = true
      api.post(`/checkin?client_date=${localToday()}`).then(res => {
        if (!res.data.already_checked_in) {
          toast('Practice streak updated ✓')
        }
      }).catch(() => {})
    }
    if (!hasTrackedPlayback.current) {
      hasTrackedPlayback.current = true
      api.post(`/tunes/${tune.id}/playback?client_date=${localToday()}`).catch(() => {})
    }
  }

  function handleSegmentPressStart(segment: any) {
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
    if (engine.isPlaying) {
      engine.pause()
    } else {
      engine.play().then(trackPlaybackIfNeeded).catch(() => {})
    }
  }

  function setPlaybackSpeed(newSpeed: number) {
    engine.setSpeed(newSpeed)
  }

  function startSpeedHold(direction: 1 | -1) {
    speedHoldActive.current = false
    speedHoldTimeout.current = setTimeout(() => {
      speedHoldActive.current = true
      speedHoldInterval.current = setInterval(() => {
        const next = Math.round(Math.min(1.5, Math.max(0.25, speedRef.current + direction * 0.01)) * 100) / 100
        setPlaybackSpeed(next)
      }, 80)
    }, 400)
  }

  function stopSpeedHold(direction: 1 | -1) {
    if (speedHoldTimeout.current) { clearTimeout(speedHoldTimeout.current); speedHoldTimeout.current = null }
    if (speedHoldInterval.current) { clearInterval(speedHoldInterval.current); speedHoldInterval.current = null }
    if (!speedHoldActive.current) {
      setPlaybackSpeed(Math.round(Math.min(1.5, Math.max(0.25, speedRef.current + direction * 0.05)) * 100) / 100)
    }
    speedHoldActive.current = false
  }

  function cancelSpeedHold() {
    if (speedHoldTimeout.current) { clearTimeout(speedHoldTimeout.current); speedHoldTimeout.current = null }
    if (speedHoldInterval.current) { clearInterval(speedHoldInterval.current); speedHoldInterval.current = null }
    speedHoldActive.current = false
  }

  useEffect(() => {
    return () => { cancelSpeedHold() }
  }, [])

  function handleSegmentTap(segment: any) {
    if (engine.loopSegment?.id === segment.id) {
      // Tapping active loop clears it
      engine.loopOff()
    } else {
      engine.loopOn(segment)
      if (!engine.isPlaying) {
        engine.play().then(trackPlaybackIfNeeded).catch(() => {})
      }
    }
  }

  async function handleQuickLog() {
    try {
      const res = await api.post(`/quick-log?tune_id=${tune.id}&client_date=${localToday()}`)
      if (res.data.already_logged) {
        toast('Already in today\'s log')
      } else {
        toast(`Logged ${tune.title} ✓`)
      }
      setQuickLogged(true)
    } catch (err) {
      toast('Failed to log', 'error')
    }
  }

  async function handleNotesSave() {
    if (notesValue === (tune.notes || '')) return
    setNotesSaving(true)
    try {
      await api.patch(`/tunes/${tune.id}`, { notes: notesValue.trim() || null })
      if (onTuneChanged) onTuneChanged()
    } catch (err) {
      console.error('Failed to save notes:', err)
    } finally {
      setNotesSaving(false)
    }
  }

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
    if (!engine.duration) return
    const rect = (e.target as HTMLElement).closest('.shed-timeline')?.getBoundingClientRect()
    if (!rect) return
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    engine.seek(fraction * engine.duration)
  }

  const progressPercent = engine.duration > 0 ? (engine.currentTime / engine.duration) * 100 : 0

  if (editingTune) {
    return (
      <div className="shed-mode">
        <button className="shed-back-btn" onClick={() => setEditingTune(false)}>
          ← Done
        </button>
        <MobileTuneEditForm
          tune={tune}
          recordings={recordings}
          onSave={() => { setEditingTune(false); onTuneChanged() }}
          onDelete={() => { setEditingTune(false); onTuneDeleted() }}
          onDeleteRecording={(recId: number) => {
            if (selectedRecording?.id === recId) {
              setSelectedRecording(null)
              stopPlayback()
            }
            onRecordingsChanged()
          }}
          onCancel={() => setEditingTune(false)}
        />
      </div>
    )
  }

  return (
    <div className="shed-mode">
      <button className="shed-back-btn" onClick={() => { stopPlayback(); flushTimer(); onBack() }}>
        ← Back
      </button>

      {/* Now Playing header */}
      <div className="shed-now-playing" onClick={() => setEditingTune(true)} style={{ cursor: 'pointer' }}>
        <h1 className="shed-tune-now">{tune.title}</h1>
        {tune.composer && (
          <span className="shed-composer-now">{tune.composer}</span>
        )}
        {tune.key && (
          <span className="shed-key-badge">{tune.key}</span>
        )}
      </div>

      {/* Notes */}
      {!editingTune && (
        <div className="tune-notes-inline" style={{ marginBottom: 'var(--space-md)' }}>
          <textarea
            className="tune-notes-editor"
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            onBlur={handleNotesSave}
            placeholder="What are you working on?"
            spellCheck={false}
            rows={1}
          />
          {notesSaving && <span className="tune-notes-saving">Saving...</span>}
        </div>
      )}

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

      {/* Player */}
      {selectedRecording && (
        <>
          {engine.error && <div className="shed-error">{engine.error}</div>}
          {engine.isLoading && !engine.error && <div className="shed-loading">Loading audio…</div>}

          {/* Timeline */}
          <div
            className="shed-timeline"
            onClick={handleTimelineClick}
            onTouchStart={handleTimelineClick}
          >
            {engine.duration > 0 && segments.map(seg => {
              const left = (seg.start_time / engine.duration) * 100
              const width = ((seg.end_time - seg.start_time) / engine.duration) * 100
              return (
                <div
                  key={seg.id}
                  className={`shed-timeline-segment ${engine.loopSegment?.id === seg.id ? 'looping' : ''}`}
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
            <span>{formatTime(engine.currentTime)}</span>
            <span>{formatTime(engine.duration)}</span>
          </div>

          {/* Practice time display */}
          {practiceElapsed > 0 && (
            <div className="shed-practice-timer">
              {formatTime(practiceElapsed)}
            </div>
          )}

          {/* Transport */}
          <div className="shed-transport">
            <button className="shed-restart-btn" onClick={() => engine.restart()} title="Restart">
              ↺
            </button>
            <button
              className="shed-play-btn"
              onClick={togglePlay}
              disabled={engine.isLoading}
              title={engine.isPlaying ? 'Pause' : 'Play'}
            >
              {engine.isPlaying ? '❚❚' : '▶'}
            </button>
            <div className="shed-speed-control">
              <button
                className="shed-speed-nudge"
                onPointerDown={() => startSpeedHold(-1)}
                onPointerUp={() => stopSpeedHold(-1)}
                onPointerLeave={cancelSpeedHold}
                onPointerCancel={cancelSpeedHold}
                onContextMenu={(e) => e.preventDefault()}
                title="Slow down (hold to fine-tune)"
              >
                −
              </button>
              <button
                className={`shed-speed-current${engine.speed !== 1.0 ? ' off-tempo' : ''}`}
                onClick={() => setPlaybackSpeed(1.0)}
                title="Reset to 100%"
              >
                {Math.round(engine.speed * 100)}%
              </button>
              <button
                className="shed-speed-nudge"
                onPointerDown={() => startSpeedHold(1)}
                onPointerUp={() => stopSpeedHold(1)}
                onPointerLeave={cancelSpeedHold}
                onPointerCancel={cancelSpeedHold}
                onContextMenu={(e) => e.preventDefault()}
                title="Speed up (hold to fine-tune)"
              >
                +
              </button>
            </div>
          </div>

          {/* Volume — independent of the iOS hardware volume, see useAudioEngine.ts */}
          <div className="shed-volume-row">
            <span className="shed-volume-icon" aria-hidden="true">🔊</span>
            <input
              type="range"
              className="shed-volume-slider"
              min="0"
              max="1"
              step="0.01"
              value={engine.volume}
              onChange={e => engine.setVolume(parseFloat(e.target.value))}
            />
            <span className="shed-volume-value">{Math.round(engine.volume * 100)}%</span>
          </div>

          {/* Segments */}
          {segments.length > 0 && (
            <div className="shed-segments">
              {segments.map(seg => (
                editingSegment === seg.id ? (
                  <MobileSegmentEditForm
                    key={seg.id}
                    segment={seg}
                    currentTime={engine.currentTime}
                    onSave={() => { setEditingSegment(null); fetchSegments() }}
                    onDelete={(segId) => {
                      if (engine.loopSegment?.id === segId) engine.loopOff()
                      setEditingSegment(null)
                      fetchSegments()
                    }}
                    onCancel={() => setEditingSegment(null)}
                  />
                ) : (
                  <button
                    key={seg.id}
                    className={`shed-segment-btn ${engine.loopSegment?.id === seg.id ? 'active' : ''}`}
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
          {engine.loopSegment && !marking && (
            <div className="shed-ramp-panel">
              <div className="shed-loop-indicator">
                Looping: {engine.loopSegment.label} at {Math.round(engine.speed * 100)}%
                <button className="shed-loop-clear" onClick={() => engine.loopOff()}>
                  Clear
                </button>
              </div>

              {!engine.rampEnabled ? (
                <button
                  className="shed-ramp-toggle"
                  onClick={() => {
                    engine.setRampEnd(1.0)
                    engine.setRampStep(0.05)
                    engine.setRampReachedMax(false)
                    engine.setRampEnabled(true)
                  }}
                >
                  Auto-Ramp ↗
                </button>
              ) : (
                <div className="shed-ramp-controls">
                  <div className="shed-ramp-header">
                    <span className="shed-mark-title">Auto-Ramp</span>
                    <button className="btn-ghost btn-sm" onClick={() => engine.setRampEnabled(false)}>Off</button>
                  </div>
                  <div className="shed-ramp-fields">
                    <div className="shed-ramp-field">
                      <label>Target</label>
                      <select
                        value={engine.rampEnd}
                        onChange={e => { engine.setRampEnd(parseFloat(e.target.value)); engine.setRampReachedMax(false) }}
                      >
                        {[0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25].map(v => (
                          <option key={v} value={v}>{Math.round(v * 100)}%</option>
                        ))}
                      </select>
                    </div>
                    <div className="shed-ramp-field">
                      <label>Step</label>
                      <select
                        value={engine.rampStep}
                        onChange={e => { engine.setRampStep(parseFloat(e.target.value)); engine.setRampReachedMax(false) }}
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
                        value={engine.rampLoopsPerStep}
                        onChange={e => { engine.setRampLoopsPerStep(parseInt(e.target.value)); engine.setRampReachedMax(false) }}
                      >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                        <option value={5}>5x</option>
                      </select>
                    </div>
                  </div>
                  {engine.rampReachedMax && (
                    <div className="shed-ramp-done">
                      Reached {Math.round(engine.rampEnd * 100)}%!
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
              currentTime={engine.currentTime}
              onSaved={() => { setMarking(false); fetchSegments() }}
              onCancel={() => setMarking(false)}
            />
          ) : (
            <button className="shed-mark-trigger" onClick={() => setMarking(true)}>
              Mark Segment
            </button>
          )}

          {/* Quick log button */}
          <button
            className={`shed-mark-trigger ${quickLogged ? 'logged' : ''}`}
            onClick={handleQuickLog}
            disabled={quickLogged}
          >
            {quickLogged ? `Logged ✓` : `+ Log Tune`}
          </button>
        </>
      )}

      {/* Add Recording */}
      {!editingTune && recordings.length > 0 && (showUpload ? (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <RecordingUpload tuneId={tune.id} onUploaded={() => { onRecordingsChanged(); setShowUpload(false) }} />
          <button className="btn-ghost btn-sm" onClick={() => setShowUpload(false)} style={{ marginTop: 'var(--space-xs)' }}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="shed-mark-trigger" onClick={() => setShowUpload(true)} style={{ marginTop: 'var(--space-md)' }}>
          + Add Recording
        </button>
      ))}

      {recordings.length === 0 && (
        <RecordingUpload tuneId={tune.id} onUploaded={onRecordingsChanged} />
      )}
    </div>
  )
}

export default MobileTuneDetail

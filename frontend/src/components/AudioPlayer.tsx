import { useState, useEffect, useRef } from 'react'
import api from '../api'
import { useToast } from './Toast'
import useAudioEngine from '../useAudioEngine'
import './AudioPlayer.css'
import { localToday } from '../dateUtils'

const SPEED_PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
  { label: '125%', value: 1.25 },
]

function formatTime(seconds: number) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins: number = Math.floor(seconds / 60)
  const secs: number = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function AudioPlayer({ recordingId, tuneId, tuneTitle, segments = [], onTimeUpdate, onPlayingChange }: {
  recordingId: number
  tuneId: number
  tuneTitle: string
  segments?: any[]
  onTimeUpdate: (time: number) => void
  onPlayingChange?: (playing: boolean) => void
}) {
  const engine = useAudioEngine()
  const progressRef = useRef<HTMLDivElement | null>(null)
  const [playError, setPlayError] = useState('')

  // Practice tracking
  const hasCheckedIn = useRef(false)
  const hasTrackedPlayback = useRef(false)
  const [quickLogged, setQuickLogged] = useState(false)

  const toast = useToast()

  // Load whenever the recording changes
  useEffect(() => {
    engine.load(recordingId)
    hasTrackedPlayback.current = false
    setQuickLogged(false)
    setPlayError('')
  }, [recordingId])

  // Notify parent of playing/time changes
  useEffect(() => {
    if (onPlayingChange) onPlayingChange(engine.isPlaying)
  }, [engine.isPlaying, onPlayingChange])

  useEffect(() => {
    if (onTimeUpdate) onTimeUpdate(engine.currentTime)
  }, [engine.currentTime, onTimeUpdate])

  // Spacebar to toggle play/pause
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function trackPlaybackIfNeeded() {
    if (!hasCheckedIn.current) {
      hasCheckedIn.current = true
      api.post(`/checkin?client_date=${localToday()}`).then(res => {
        if (!res.data.already_checked_in) {
          toast('Practice streak updated ✓')
        }
      }).catch(() => {})
    }
    if (!hasTrackedPlayback.current && tuneId) {
      hasTrackedPlayback.current = true
      api.post(`/tunes/${tuneId}/playback?client_date=${localToday()}`).catch(() => {})
    }
  }

  // --- Transport controls ---

  function togglePlay() {
    if (engine.isPlaying) {
      engine.pause()
      return
    }
    setPlayError('')
    engine.play().then(trackPlaybackIfNeeded).catch(() => setPlayError('Playback failed'))
  }

  function restart() {
    engine.restart()
  }

  // --- Progress bar interaction ---

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const bar = progressRef.current
    if (!bar || !engine.duration) return
    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    engine.seek(fraction * engine.duration)
  }

  // --- Segment looping ---

  function handleSegmentLoop(segment: any) {
    if (engine.loopSegment && engine.loopSegment.id === segment.id) {
      engine.loopOff()
    } else {
      engine.loopOn(segment)
      if (!engine.isPlaying) {
        setPlayError('')
        engine.play().then(trackPlaybackIfNeeded).catch(() => setPlayError('Playback failed'))
      }
    }
  }

  // Jump to a segment's start time without looping
  function handleSegmentCue(segment: any) {
    engine.seek(segment.start_time)
  }

  // --- Practice quick log ---
  async function handleQuickLog() {
    if (!tuneId) return
    try {
      const res = await api.post(`/quick-log?tune_id=${tuneId}&client_date=${localToday()}`)
      if (res.data.already_logged) {
        toast('Already in today\'s log')
      } else {
        toast(`Logged '${tuneTitle}' ✓`)
      }
      setQuickLogged(true)
    } catch (err) {
      toast('Failed to log', 'error')
    }
  }

  const progressPercent = engine.duration > 0 ? (engine.currentTime / engine.duration) * 100 : 0
  const displayError = engine.error || playError

  return (
    <div className="audio-player">
      {displayError && <div className="player-error">{displayError}</div>}
      {engine.isLoading && !displayError && <div className="player-loading">Loading audio…</div>}

      {/* Timeline / progress bar */}
      <div className="player-timeline" ref={progressRef} onClick={handleProgressClick}>
        {/* Segment regions */}
        {engine.duration > 0 && segments.map(seg => (
          <div
            key={seg.id}
            className={`timeline-segment ${engine.loopSegment?.id === seg.id ? 'looping' : ''}`}
            style={{
              left: `${(seg.start_time / engine.duration) * 100}%`,
              width: `${((seg.end_time - seg.start_time) / engine.duration) * 100}%`,
              backgroundColor: seg.color || 'var(--color-amber)',
            }}
            title={`${seg.label}: ${formatTime(seg.start_time)} – ${formatTime(seg.end_time)}`}
          />
        ))}
        {/* Playhead */}
        <div className="timeline-progress" style={{ width: `${progressPercent}%` }} />
        <div className="timeline-head" style={{ left: `${progressPercent}%` }} />
      </div>

      {/* Time display */}
      <div className="player-time">
        <span>{formatTime(engine.currentTime)}</span>
        <span className="text-muted">{formatTime(engine.duration)}</span>
      </div>

      {/* Controls row */}
      <div className="player-controls">
        {/* Transport */}
        <div className="player-transport">
          <button className="transport-btn" onClick={restart} title="Restart">
            ↺
          </button>
          <button
            className="transport-btn play-btn"
            onClick={togglePlay}
            disabled={engine.isLoading}
            title={engine.isPlaying ? 'Pause' : 'Play'}
          >
            {engine.isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        {/* Speed control */}
        <div className="player-speed">
          <span className="speed-label">Speed</span>
          <div className="speed-presets">
            {SPEED_PRESETS.map(p => (
              <button
                key={p.value}
                className={`speed-preset ${Math.abs(engine.speed - p.value) < 0.01 ? 'active' : ''}`}
                onClick={() => engine.setSpeed(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            className="speed-slider"
            min="0.25"
            max="2.0"
            step="0.05"
            value={engine.speed}
            onChange={e => engine.setSpeed(parseFloat(e.target.value))}
          />
          <span className="speed-value">{Math.round(engine.speed * 100)}%</span>
        </div>

        {/* Volume control — independent of iOS hardware volume; see useAudioEngine.ts */}
        <div className="player-volume">
          <span className="speed-label">Vol</span>
          <input
            type="range"
            className="speed-slider"
            min="0"
            max="1"
            step="0.01"
            value={engine.volume}
            onChange={e => engine.setVolume(parseFloat(e.target.value))}
          />
          <span className="speed-value">{Math.round(engine.volume * 100)}%</span>
        </div>

        {/* Loop indicator + auto-ramp */}
        {engine.loopSegment && (
          <div className="loop-indicator-wrap">
            <div className="loop-indicator">
              <span
                className="loop-dot"
                style={{ backgroundColor: engine.loopSegment.color || 'var(--color-amber)' }}
              />
              <span className="loop-label">Looping: {engine.loopSegment.label} at {Math.round(engine.speed * 100)}%</span>
              <button
                className="btn-ghost btn-sm"
                onClick={() => engine.loopOff()}
              >
                ×
              </button>
            </div>
            {!engine.rampEnabled ? (
              <button
                className="ramp-toggle"
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
              <div className="ramp-controls">
                <span className="ramp-title">Auto-Ramp</span>
                <div className="ramp-fields">
                  <label>
                    Target
                    <select
                      value={engine.rampEnd}
                      onChange={e => { engine.setRampEnd(parseFloat(e.target.value)); engine.setRampReachedMax(false) }}
                    >
                      {[0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25].map(v => (
                        <option key={v} value={v}>{Math.round(v * 100)}%</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Step
                    <select
                      value={engine.rampStep}
                      onChange={e => { engine.setRampStep(parseFloat(e.target.value)); engine.setRampReachedMax(false) }}
                    >
                      <option value={0.01}>1%</option>
                      <option value={0.02}>2%</option>
                      <option value={0.05}>5%</option>
                      <option value={0.1}>10%</option>
                    </select>
                  </label>
                  <label>
                    Reps
                    <select
                      value={engine.rampLoopsPerStep}
                      onChange={e => { engine.setRampLoopsPerStep(parseInt(e.target.value, 10)); engine.setRampReachedMax(false) }}
                    >
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={5}>5x</option>
                      <option value={10}>10x</option>
                    </select>
                  </label>
                </div>
                {engine.rampReachedMax && (
                  <span className="ramp-done">Reached {Math.round(engine.rampEnd * 100)}%!</span>
                )}
                <button className="btn-ghost btn-sm" onClick={() => engine.setRampEnabled(false)}>Off</button>
              </div>
            )}
          </div>
        )}
        <button
          className={`btn-ghost btn-sm ${quickLogged ? 'text-amber' : ''}`}
          onClick={handleQuickLog}
          disabled={quickLogged || !tuneId}
          style={{ marginLeft: 'auto', whiteSpace: 'nowrap', border: '1px solid var(--color-border)' }}
        >
          {quickLogged ? `Logged ✓` : `+ Log`}
        </button>
      </div>

      {/* Segment quick-access */}
      {segments.length > 0 && (
        <div className="player-segments">
          {segments.map(seg => (
            <div
              key={seg.id}
              className={`player-segment-chip ${engine.loopSegment?.id === seg.id ? 'active' : ''}`}
            >
              <span
                className="segment-chip-color"
                style={{ backgroundColor: seg.color || 'var(--color-amber)' }}
              />
              <button
                className="segment-chip-label"
                onClick={() => handleSegmentCue(seg)}
                title={`Jump to ${formatTime(seg.start_time)}`}
              >
                {seg.label}
              </button>
              <button
                className={`segment-chip-loop ${engine.loopSegment?.id === seg.id ? 'active' : ''}`}
                onClick={() => handleSegmentLoop(seg)}
                title={engine.loopSegment?.id === seg.id ? 'Stop looping' : `Loop ${seg.label}`}
              >
                ↻
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AudioPlayer

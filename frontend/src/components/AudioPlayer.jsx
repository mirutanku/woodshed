import { useState, useEffect, useRef, useCallback } from 'react'

const SPEED_PRESETS = [
  { label: '50%', value: 0.5 },
  { label: '75%', value: 0.75 },
  { label: '100%', value: 1.0 },
  { label: '125%', value: 1.25 },
]

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function AudioPlayer({ filename, segments = [], onTimeUpdate }) {
  const audioRef = useRef(null)
  const progressRef = useRef(null)
  const animFrameRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1.0)
  const [loopSegment, setLoopSegment] = useState(null) // segment object or null
  const [error, setError] = useState('')

  const audioUrl = `${import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:8000'}/uploads/${filename}`

  // --- Animation frame loop for smooth progress updates ---

  const updateProgress = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused) {
      setCurrentTime(audio.currentTime)
      if (onTimeUpdate) onTimeUpdate(audio.currentTime)

      // Loop enforcement — if we're looping a segment and we've passed the end, jump back
      if (loopSegment && audio.currentTime >= loopSegment.end_time) {
        audio.currentTime = loopSegment.start_time
      }

      animFrameRef.current = requestAnimationFrame(updateProgress)
    }
  }, [loopSegment, onTimeUpdate])

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updateProgress)
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, updateProgress])

  // --- Audio event handlers ---

  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (audio) {
      setDuration(audio.duration)
      setError('')
    }
  }

  function handleEnded() {
    // If looping a segment, restart it; otherwise stop
    if (loopSegment) {
      const audio = audioRef.current
      audio.currentTime = loopSegment.start_time
      audio.play()
    } else {
      setIsPlaying(false)
      setCurrentTime(0)
    }
  }

  function handleError() {
    setError('Could not load audio file')
    setIsPlaying(false)
  }

  // --- Transport controls ---

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setError('Playback failed'))
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  function restart() {
    const audio = audioRef.current
    if (!audio) return

    if (loopSegment) {
      audio.currentTime = loopSegment.start_time
    } else {
      audio.currentTime = 0
    }
    setCurrentTime(audio.currentTime)
  }

  // --- Speed control ---

  function handleSpeedChange(newSpeed) {
    const clamped = Math.max(0.25, Math.min(2.0, newSpeed))
    setSpeed(clamped)
    if (audioRef.current) {
      audioRef.current.playbackRate = clamped
    }
  }

  // --- Progress bar interaction ---

  function handleProgressClick(e) {
    const audio = audioRef.current
    const bar = progressRef.current
    if (!audio || !bar || !duration) return

    const rect = bar.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = fraction * duration
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  // --- Segment looping ---

  function handleSegmentLoop(segment) {
    const audio = audioRef.current
    if (!audio) return

    if (loopSegment && loopSegment.id === segment.id) {
      // Clicking the active loop segment toggles it off
      setLoopSegment(null)
    } else {
      setLoopSegment(segment)
      audio.currentTime = segment.start_time
      setCurrentTime(segment.start_time)
      if (!isPlaying) {
        audio.play().then(() => setIsPlaying(true)).catch(() => {})
      }
    }
  }

  // Jump to a segment's start time without looping
  function handleSegmentCue(segment) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = segment.start_time
    setCurrentTime(segment.start_time)
  }

  // --- Cleanup on unmount ---

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.src = ''
      }
    }
  }, [])

  // Reset player state when filename changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setLoopSegment(null)
    setSpeed(1.0)
    setError('')
    if (audioRef.current) {
      audioRef.current.playbackRate = 1.0
    }
  }, [filename])

  // Spacebar to toggle play/pause
  useEffect(() => {
    function handleKeyDown(e) {
      // Only handle spacebar, and not when typing in an input
      if (e.code !== 'Space') return
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      togglePlay()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying])

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
      />

      {error && <div className="player-error">{error}</div>}

      {/* Timeline / progress bar */}
      <div className="player-timeline" ref={progressRef} onClick={handleProgressClick}>
        {/* Segment regions */}
        {duration > 0 && segments.map(seg => (
          <div
            key={seg.id}
            className={`timeline-segment ${loopSegment?.id === seg.id ? 'looping' : ''}`}
            style={{
              left: `${(seg.start_time / duration) * 100}%`,
              width: `${((seg.end_time - seg.start_time) / duration) * 100}%`,
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
        <span>{formatTime(currentTime)}</span>
        <span className="text-muted">{formatTime(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="player-controls">
        {/* Transport */}
        <div className="player-transport">
          <button className="transport-btn" onClick={restart} title="Restart">
            ⏮
          </button>
          <button className="transport-btn play-btn" onClick={togglePlay}>
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        {/* Speed control */}
        <div className="player-speed">
          <span className="speed-label">Speed</span>
          <div className="speed-presets">
            {SPEED_PRESETS.map(p => (
              <button
                key={p.value}
                className={`speed-preset ${Math.abs(speed - p.value) < 0.01 ? 'active' : ''}`}
                onClick={() => handleSpeedChange(p.value)}
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
            value={speed}
            onChange={e => handleSpeedChange(parseFloat(e.target.value))}
          />
          <span className="speed-value">{speed.toFixed(2)}×</span>
        </div>

        {/* Loop indicator */}
        {loopSegment && (
          <div className="loop-indicator">
            <span
              className="loop-dot"
              style={{ backgroundColor: loopSegment.color || 'var(--color-amber)' }}
            />
            <span className="loop-label">Looping: {loopSegment.label}</span>
            <button
              className="btn-ghost btn-sm"
              onClick={() => setLoopSegment(null)}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Segment quick-access */}
      {segments.length > 0 && (
        <div className="player-segments">
          {segments.map(seg => (
            <div
              key={seg.id}
              className={`player-segment-chip ${loopSegment?.id === seg.id ? 'active' : ''}`}
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
                className={`segment-chip-loop ${loopSegment?.id === seg.id ? 'active' : ''}`}
                onClick={() => handleSegmentLoop(seg)}
                title={loopSegment?.id === seg.id ? 'Stop looping' : `Loop ${seg.label}`}
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
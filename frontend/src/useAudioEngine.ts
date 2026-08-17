import { useRef, useState, useCallback, useEffect } from 'react'

// --- Why this exists ---
//
// iOS Safari pins the <audio> element's `.volume` to 1 — Apple doesn't let a
// web page set it, only the hardware volume buttons can. That means a plain
// <audio> element has no independent volume: turning up your headphones to
// hear yourself over a quiet backing track turns the track up by the same
// amount, because you're not actually raising "the track" — you're raising
// the whole device.
//
// The fix is to stop asking the *element* for volume and instead run
// playback through the Web Audio API, where a GainNode's gain is DSP applied
// inside the audio graph — iOS honors that even though it ignores
// `audio.volume`. There are two ways to get audio into that graph:
//
//   1. Wrap the existing <audio> element with createMediaElementSource().
//      Least code, but iOS reports of it are mixed — some setups see the
//      gain (and even the element's own volume) get silently ignored, and
//      there's a documented WebKit conflict between MediaElementSource and
//      playbackRate specifically. Woodshed's tempo/auto-ramp feature leans
//      hard on playbackRate, so that conflict isn't a hypothetical for us.
//   2. Decode the whole file into an AudioBuffer and play it through an
//      AudioBufferSourceNode. More code — no native scrubbing/seeking, the
//      whole file has to download and decode before playback starts, and it
//      sits fully decoded in memory while loaded — but it sidesteps both
//      iOS issues above and gives sample-accurate seeking as a bonus (which
//      also helps the segment-tap-precision problem on the timeline).
//
// This hook takes path 2. It's a bigger lift than wrapping the element, but
// it's the version that doesn't have a known landmine sitting next to the
// one feature (tempo) most likely to trip it.
//
// One consequence worth flagging: nothing here has been run through a real
// iOS device yet. The failure mode to watch for on first test is silence
// with no error — that means `AudioContext.resume()` didn't happen inside a
// user gesture. `play()` below calls `resume()` as the first thing it does,
// specifically so it stays inside the click/tap that triggered it.
//
// --- Backgrounding ---
//
// A second, separate iOS quirk: a raw AudioContext connected straight to
// `ctx.destination` gets suspended/interrupted as soon as Safari itself is
// backgrounded (user switches to another app) — unlike an `<audio>` element,
// which iOS treats as a real background-eligible media session and keeps
// running. The old <audio>-based player had that for free; this engine lost
// it by construction, since there's no element in the graph at all.
//
// The fix is to give iOS a real element to anchor the session to: route the
// graph's final output through `createMediaStreamDestination()` into a
// hidden <audio> element instead of connecting straight to
// `ctx.destination`. The gain has already been applied upstream by the time
// the signal reaches that element, so its own (iOS-locked) `.volume` is
// never touched and stays irrelevant.
//
// This is the standard documented workaround for this exact problem, but
// unlike the rest of this file it is NOT something with strong community
// confirmation — reports on whether it survives backgrounding are thinner
// and older than the volume fix's. It needs to be verified on-device same
// as everything else here, with real expectations: even native <audio>
// elements on iOS are known to lose playback at points where JavaScript has
// to drive a state change (e.g. audiobook apps report chapter-boundary
// drops in the background) because JS itself is throttled while
// backgrounded. Our rAF-driven loop/auto-ramp logic is exactly that kind of
// JS-driven state change — a looped segment will very likely stop
// re-looping (and just play straight through past the loop point) while
// backgrounded, even once plain single-track playback survives. That's a
// known, not-yet-fixed gap, not an oversight.

const VOLUME_STORAGE_KEY = 'woodshed_playback_volume'
const END_EPSILON = 0.02 // seconds of slack for "we've reached the end"

export interface EngineSegment {
  id: number
  start_time: number
  end_time: number
  [key: string]: any
}

function readStoredVolume(): number {
  const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
  const parsed = raw !== null ? parseFloat(raw) : NaN
  return isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1.0
}

export default function useAudioEngine() {
  // Web Audio graph. Construction is safe anytime; only .resume() is gated
  // to a user gesture on iOS, and that happens inside play().
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const mediaElRef = useRef<HTMLAudioElement | null>(null) // background-audio bridge, see note above
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const loadTokenRef = useRef(0) // guards against a stale load() finishing after a newer one started

  // Ref mirrors of state, for stable (empty-deps) callbacks that need live values.
  const isPlayingRef = useRef(false)
  const rateRef = useRef(1.0)
  const volumeRef = useRef(readStoredVolume())
  const loopSegmentRef = useRef<EngineSegment | null>(null)
  const rampRef = useRef({ enabled: false, end: 1.0, step: 0.05, loopsPerStep: 1 })
  const rampLoopCountRef = useRef(0)

  // Simulates `audio.currentTime` on top of a node that doesn't have one:
  // `bufferOffset` is the logical position as of the last anchor point
  // (play / seek / rate change); while playing we add elapsed real time
  // (scaled by rate) on top of it.
  const clockRef = useRef({ contextStart: 0, bufferOffset: 0 })

  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeedState] = useState(1.0)
  const [volume, setVolumeState] = useState(volumeRef.current)
  const [loopSegment, setLoopSegmentState] = useState<EngineSegment | null>(null)
  const [rampEnabled, setRampEnabled] = useState(false)
  const [rampEnd, setRampEnd] = useState(1.0)
  const [rampStep, setRampStep] = useState(0.05)
  const [rampLoopsPerStep, setRampLoopsPerStep] = useState(1)
  const [rampReachedMax, setRampReachedMax] = useState(false)

  useEffect(() => {
    rampRef.current = { enabled: rampEnabled, end: rampEnd, step: rampStep, loopsPerStep: rampLoopsPerStep }
  }, [rampEnabled, rampEnd, rampStep, rampLoopsPerStep])

  function ensureContext(): AudioContext {
    // Recreate if missing OR closed. The "closed" case matters more than it
    // looks: React 18 StrictMode double-invokes effects on mount (setup →
    // cleanup → setup again) against the *same* refs, so the unmount-teardown
    // effect below can call ctx.close() once during that dev-only dance.
    // Without this check, the `if (!ctxRef.current)` guard alone would see a
    // non-null-but-dead context and hand it back forever — silent, since a
    // closed context just freezes `currentTime` rather than throwing.
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext
      const ctx: AudioContext = new Ctor()
      const gain = ctx.createGain()
      gain.gain.value = volumeRef.current

      // Route through a hidden <audio> element instead of ctx.destination
      // directly — see the "Backgrounding" note at the top of this file.
      const mediaStreamDest = ctx.createMediaStreamDestination()
      gain.connect(mediaStreamDest)

      const audioEl = document.createElement('audio')
      audioEl.srcObject = mediaStreamDest.stream
      audioEl.style.display = 'none'
      document.body.appendChild(audioEl)

      ctxRef.current = ctx
      gainRef.current = gain
      mediaElRef.current = audioEl
    }
    return ctxRef.current
  }

  function stopSourceNode() {
    const src = sourceRef.current
    if (src) {
      try { src.stop() } catch { /* already stopped/ended — fine */ }
      try { src.disconnect() } catch { /* no-op */ }
    }
    sourceRef.current = null
  }

  function startSourceAt(offset: number) {
    const ctx = ensureContext()
    const buf = bufferRef.current
    if (!buf || !gainRef.current) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rateRef.current
    src.connect(gainRef.current)
    const clamped = Math.max(0, Math.min(buf.duration, offset))
    src.start(0, clamped)
    sourceRef.current = src
    clockRef.current = { contextStart: ctx.currentTime, bufferOffset: clamped }
  }

  function computeCurrentBufferTime(): number {
    if (!isPlayingRef.current || !ctxRef.current) return clockRef.current.bufferOffset
    const elapsed = ctxRef.current.currentTime - clockRef.current.contextStart
    return clockRef.current.bufferOffset + elapsed * rateRef.current
  }

  // Rebase the clock so playback rate can change mid-flight without
  // restarting the source node — AudioBufferSourceNode.playbackRate is a
  // live AudioParam, unlike HTMLMediaElement's, so this doesn't need a seek.
  function applySpeed(rate: number) {
    if (isPlayingRef.current) {
      clockRef.current = { contextStart: ctxRef.current!.currentTime, bufferOffset: computeCurrentBufferTime() }
    }
    rateRef.current = rate
    if (sourceRef.current) sourceRef.current.playbackRate.value = rate
    setSpeedState(rate)
  }

  function applyRamp() {
    const ramp = rampRef.current
    if (!ramp.enabled) return
    if (rateRef.current >= ramp.end) return
    rampLoopCountRef.current += 1
    if (rampLoopCountRef.current < ramp.loopsPerStep) return
    rampLoopCountRef.current = 0
    const rounded = Math.round(Math.min(rateRef.current + ramp.step, ramp.end) * 100) / 100
    applySpeed(rounded)
    if (rounded >= ramp.end) setRampReachedMax(true)
  }

  function seekTo(time: number) {
    const buf = bufferRef.current
    if (!buf) return
    const clamped = Math.max(0, Math.min(buf.duration, time))
    if (isPlayingRef.current) {
      stopSourceNode()
      startSourceAt(clamped)
    } else {
      clockRef.current.bufferOffset = clamped
    }
    setCurrentTime(clamped)
  }

  // rAF-driven progress loop. Also owns loop-boundary and end-of-track
  // detection, replacing the native `timeupdate`/`ended` events the old
  // <audio>-based players relied on. Reads everything through refs so it
  // never needs to be recreated (and the polling loop never restarts) when
  // loop/ramp state changes.
  const tick = useCallback(() => {
    if (!isPlayingRef.current) return
    const time = computeCurrentBufferTime()
    const dur = bufferRef.current?.duration ?? 0
    const loop = loopSegmentRef.current

    if (loop && time >= loop.end_time) {
      applyRamp()
      seekTo(loop.start_time)
    } else if (!loop && dur > 0 && time >= dur - END_EPSILON) {
      isPlayingRef.current = false
      stopSourceNode()
      clockRef.current.bufferOffset = 0
      setCurrentTime(0)
      setIsPlaying(false)
      return // stopped — don't reschedule
    } else {
      setCurrentTime(time)
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(tick)
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, tick])

  // --- Transport ---

  const play = useCallback(async () => {
    const ctx = ensureContext()
    if (!bufferRef.current) return
    // Kick off both resumes synchronously, before awaiting either — iOS
    // only honors resume()/play() calls made inside the user gesture that
    // triggered this handler, and an `await` yields control, so anything
    // started after one has already run risks falling outside that window.
    const resumePromise = ctx.state !== 'running' ? ctx.resume() : Promise.resolve()
    const elPlayPromise = mediaElRef.current ? mediaElRef.current.play().catch(() => {}) : Promise.resolve()
    await Promise.all([resumePromise, elPlayPromise])
    startSourceAt(clockRef.current.bufferOffset)
    isPlayingRef.current = true
    setIsPlaying(true)
  }, [])

  // If iOS interrupts the context while backgrounded, proactively try to
  // resume both halves of the bridge when the page comes back to the
  // foreground, so returning to Woodshed doesn't require a manual
  // pause/play to un-stick playback.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      if (!isPlayingRef.current || !ctxRef.current) return
      if (ctxRef.current.state !== 'running') {
        ctxRef.current.resume().catch(() => {})
      }
      mediaElRef.current?.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const pause = useCallback(() => {
    const pos = computeCurrentBufferTime()
    isPlayingRef.current = false
    stopSourceNode()
    clockRef.current.bufferOffset = pos
    setCurrentTime(pos)
    setIsPlaying(false)
  }, [])

  const togglePlay = useCallback(async () => {
    if (isPlayingRef.current) {
      pause()
    } else {
      await play()
    }
  }, [play, pause])

  const restart = useCallback(() => {
    seekTo(loopSegmentRef.current ? loopSegmentRef.current.start_time : 0)
  }, [])

  const seek = useCallback((time: number) => {
    seekTo(time)
  }, [])

  const setSpeed = useCallback((rate: number) => {
    const clamped = Math.max(0.25, Math.min(2.0, rate))
    applySpeed(Math.round(clamped * 100) / 100)
  }, [])

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    ensureContext()
    volumeRef.current = clamped
    if (gainRef.current) gainRef.current.gain.value = clamped
    setVolumeState(clamped)
    localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped))
  }, [])

  const loopOn = useCallback((segment: EngineSegment) => {
    loopSegmentRef.current = segment
    setLoopSegmentState(segment)
    setRampReachedMax(false)
    seekTo(segment.start_time)
  }, [])

  const loopOff = useCallback(() => {
    loopSegmentRef.current = null
    setLoopSegmentState(null)
    setRampReachedMax(false)
  }, [])

  // Fetch + decode a recording. Resets transport state exactly like
  // swapping `src` on the old <audio> element did.
  const load = useCallback(async (recordingId: number) => {
    const myToken = ++loadTokenRef.current
    stopSourceNode()
    isPlayingRef.current = false
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setError('')
    setIsLoading(true)
    bufferRef.current = null
    clockRef.current = { contextStart: 0, bufferOffset: 0 }
    loopSegmentRef.current = null
    setLoopSegmentState(null)
    rateRef.current = 1.0
    setSpeedState(1.0)
    setRampEnabled(false)
    setRampReachedMax(false)

    const ctx = ensureContext()
    const token = localStorage.getItem('token')

    try {
      const res = await fetch(`/api/recordings/${recordingId}/stream?token=${token}`)
      if (!res.ok) throw new Error(`stream fetch failed: ${res.status}`)
      const arrayBuffer = await res.arrayBuffer()
      if (loadTokenRef.current !== myToken) return // superseded by a newer load()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      if (loadTokenRef.current !== myToken) return
      bufferRef.current = audioBuffer
      setDuration(audioBuffer.duration)
      setIsLoading(false)
    } catch (err) {
      if (loadTokenRef.current !== myToken) return
      console.error('Failed to load recording audio:', err)
      setError('Could not load audio file')
      setIsLoading(false)
    }
  }, [])

  const unload = useCallback(() => {
    loadTokenRef.current++ // invalidate any in-flight load()
    isPlayingRef.current = false
    stopSourceNode()
    bufferRef.current = null
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  // Full teardown on unmount
  useEffect(() => {
    return () => {
      stopSourceNode()
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
      }
      if (mediaElRef.current) {
        mediaElRef.current.pause()
        mediaElRef.current.srcObject = null
        mediaElRef.current.remove()
      }
    }
  }, [])

  return {
    // state
    isPlaying, isLoading, error, currentTime, duration, speed, volume,
    loopSegment, rampEnabled, rampEnd, rampStep, rampLoopsPerStep, rampReachedMax,
    // transport
    load, unload, play, pause, togglePlay, seek, restart,
    setSpeed, setVolume,
    loopOn, loopOff,
    // ramp config — components wire these straight to their own UI
    setRampEnabled, setRampEnd, setRampStep, setRampLoopsPerStep, setRampReachedMax,
  }
}

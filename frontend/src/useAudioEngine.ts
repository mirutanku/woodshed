import { useRef, useState, useCallback, useEffect } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import soundTouchProcessorUrl from '@soundtouchjs/audio-worklet/processor?url'

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
// This is the standard documented workaround for this exact problem, and
// confirmed working for plain playthrough: playback now survives
// backgrounding.
//
// Looped segments needed a second fix on top of that. The first version of
// this engine drove looping from the rAF polling loop (jump back to
// loopStart every time polled position crossed loopEnd) — but JS, including
// rAF, is throttled while the page is backgrounded, so a loop just played
// straight through the marker and out the far side while the user was away.
// startSourceAt() now configures the source node's native loop/loopStart/
// loopEnd instead, so wrapping happens inside the audio graph and keeps
// working with no JS involved. computeCurrentBufferTime() then has to
// simulate that wrap for its own bookkeeping (display position, detecting
// when a pass completes for auto-ramp), since the graph's real wrap is
// invisible to JS-side clock math otherwise.
//
// The pause path needed a fix too: pause() was stopping the upstream source
// node but never actually pausing the bridge element consuming its stream,
// leaving it "live" and rendering nothing — which surfaced as stutter and
// distortion on pause/resume. pause() now pauses the element explicitly.
//
// --- Pitch ---
//
// AudioBufferSourceNode.playbackRate is raw resampling, with no pitch
// correction — unlike HTMLMediaElement.playbackRate, which browsers
// pitch-correct by default. The old <audio>-based tempo control got that
// correction for free; moving off the element loses it, and there's no
// built-in replacement (confirmed against the Web Audio spec discussion —
// left out on purpose, since there's no one agreed-upon time-stretch
// algorithm to standardize). Left alone, "speed" now also means "key,"
// which is unusable for practicing a tune in its actual key.
//
// Fixed by inserting a SoundTouchNode (from @soundtouchjs/audio-worklet, a
// real-time WSOLA time-stretcher running in an AudioWorklet) between the
// source and the gain node: source -> stNode -> gain -> mediaStreamDest ->
// bridge element. `stNode.pitch` is pinned to 1.0 permanently — we only
// ever want tempo to change, never the key — and `stNode.playbackRate` is
// kept mirrored to the source's own playbackRate on every speed change, per
// the library's documented pattern (it uses the source rate to keep its
// internal buffer fed, and corrects pitch against that).
//
// The worklet processor module has to be registered on an AudioContext
// before a SoundTouchNode can be constructed on it, and that registration
// is asynchronous — the one genuinely new kind of async dependency in this
// file. ensureContext() kicks it off (fire-and-forget) the moment a context
// is created; startSourceAt() awaits it before starting playback, which by
// then has almost always already resolved (module registration is fast;
// load()'s fetch+decode round-trip is typically slower). If registration
// fails for any reason (e.g. a browser without AudioWorklet support),
// startSourceAt() falls back to connecting straight to the gain node —
// audio still plays, just pitch-shifted with speed again, same as before
// this fix existed, rather than going silent.

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
  const soundTouchNodeRef = useRef<SoundTouchNode | null>(null) // pitch-preserving tempo, see "Pitch" note above
  const soundTouchReadyRef = useRef<Promise<SoundTouchNode | null> | null>(null)
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
  const loopPassesRef = useRef(0) // whole loop iterations completed since the last clock anchor, see computeLoopPasses()

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
      soundTouchNodeRef.current = null
      // Fire-and-forget: registers the worklet module and constructs the
      // node, resolving to it (or null on failure — see the "Pitch" note
      // above for the fallback path). startSourceAt() awaits this.
      soundTouchReadyRef.current = setupSoundTouch(ctx, gain)
    }
    return ctxRef.current
  }

  async function setupSoundTouch(ctx: AudioContext, gain: GainNode): Promise<SoundTouchNode | null> {
    try {
      await SoundTouchNode.register(ctx, soundTouchProcessorUrl)
      const stNode = new SoundTouchNode({ context: ctx })
      stNode.pitch.value = 1.0 // never shift key — only ever adjust tempo
      // Widening these (sequenceMs/seekWindowMs/overlapMs) beyond the
      // library's own auto-tuned defaults was tried as an underrun
      // mitigation and reverted: it traded that for a directly-caused,
      // noticeable lag before pitch correction catches up after a speed
      // change (bigger windows = more audio already "in flight" through
      // the algorithm under the old rate before a new one takes over).
      // Left at library defaults — the rAF/UI-update throttle below is a
      // more direct fix for the likely actual cause of the underruns
      // (main-thread contention with the worklet's real-time thread) and
      // doesn't carry this latency cost.
      stNode.connect(gain)
      soundTouchNodeRef.current = stNode
      return stNode
    } catch (err) {
      console.error('SoundTouch worklet failed to register — tempo changes will shift pitch until this is fixed:', err)
      return null
    }
  }

  function stopSourceNode() {
    const src = sourceRef.current
    if (src) {
      try { src.stop() } catch { /* already stopped/ended — fine */ }
      try { src.disconnect() } catch { /* no-op */ }
    }
    sourceRef.current = null
  }

  // Starts a fresh source node. If a loop segment is active, configures
  // native loop/loopStart/loopEnd so the loop runs inside the audio graph
  // instead of being driven by rAF polling — that's what keeps a looped
  // segment actually looping while the page is backgrounded and JS is
  // throttled (see the "Backgrounding" note at the top of this file).
  async function startSourceAt(offset: number) {
    const ctx = ensureContext()
    const buf = bufferRef.current
    if (!buf || !gainRef.current) return
    if (!soundTouchNodeRef.current && soundTouchReadyRef.current) {
      await soundTouchReadyRef.current // resolves fast in practice; see "Pitch" note above
    }
    const stNode = soundTouchNodeRef.current
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rateRef.current
    if (stNode) {
      stNode.playbackRate.value = rateRef.current
    }
    const loop = loopSegmentRef.current
    if (loop) {
      src.loop = true
      src.loopStart = loop.start_time
      src.loopEnd = loop.end_time
    }
    src.connect(stNode ?? gainRef.current)
    const clamped = Math.max(0, Math.min(buf.duration, offset))
    src.start(0, clamped)
    sourceRef.current = src
    clockRef.current = { contextStart: ctx.currentTime, bufferOffset: clamped }
    loopPassesRef.current = 0
  }

  // Raw (unwrapped) position — grows past loop.end_time indefinitely, since
  // the native loop wrapping happens inside the audio graph, invisible to
  // this JS-side clock math.
  function computeRawBufferTime(): number {
    if (!isPlayingRef.current || !ctxRef.current) return clockRef.current.bufferOffset
    const elapsed = ctxRef.current.currentTime - clockRef.current.contextStart
    return clockRef.current.bufferOffset + elapsed * rateRef.current
  }

  // Display/logical position — wraps into the loop segment's range while a
  // loop is active, matching what the audio graph is actually doing.
  function computeCurrentBufferTime(): number {
    const raw = computeRawBufferTime()
    const loop = loopSegmentRef.current
    if (loop) {
      const loopLen = loop.end_time - loop.start_time
      if (loopLen > 0 && raw > loop.start_time) {
        return loop.start_time + ((raw - loop.start_time) % loopLen)
      }
    }
    return raw
  }

  // How many whole loop passes have completed since the current clock
  // anchor — used to fire auto-ramp exactly once per pass. Resets to 0
  // whenever the clock is rebased (new source, seek, or rate change), so
  // this counts "since the anchor," not "since the loop started"; ramp
  // logic doesn't care which, only that it fires once per completed pass.
  function computeLoopPasses(): number {
    const loop = loopSegmentRef.current
    if (!loop || !isPlayingRef.current || !ctxRef.current) return 0
    const loopLen = loop.end_time - loop.start_time
    if (loopLen <= 0) return 0
    const raw = computeRawBufferTime()
    const sinceStart = Math.max(0, raw - loop.start_time)
    return Math.floor(sinceStart / loopLen)
  }

  // Rebase the clock so playback rate can change mid-flight without
  // restarting the source node — AudioBufferSourceNode.playbackRate is a
  // live AudioParam, unlike HTMLMediaElement's, so this doesn't need a seek.
  function applySpeed(rate: number) {
    if (isPlayingRef.current) {
      clockRef.current = { contextStart: ctxRef.current!.currentTime, bufferOffset: computeCurrentBufferTime() }
      loopPassesRef.current = 0 // rebased the anchor, so "passes since anchor" restarts too
    }
    rateRef.current = rate
    if (sourceRef.current) sourceRef.current.playbackRate.value = rate
    if (soundTouchNodeRef.current) soundTouchNodeRef.current.playbackRate.value = rate
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

  async function seekTo(time: number) {
    const buf = bufferRef.current
    if (!buf) return
    const clamped = Math.max(0, Math.min(buf.duration, time))
    if (isPlayingRef.current) {
      stopSourceNode()
      await startSourceAt(clamped)
    } else {
      clockRef.current.bufferOffset = clamped
    }
    setCurrentTime(clamped)
  }

  // rAF-driven progress loop. Loop *wrapping* itself is native now (see
  // startSourceAt) so it keeps working while backgrounded; this loop only
  // needs to update the displayed position, fire auto-ramp once per
  // completed pass, and detect end-of-track for the non-looping case —
  // none of which iOS lets happen while backgrounded anyway, so none of it
  // needs to survive backgrounding. Reads everything through refs so it
  // never needs to be recreated (and the polling loop never restarts) when
  // loop/ramp state changes.
  //
  // Still polls every frame (loop-pass/end-of-track detection wants that
  // precision), but throttles the React state update that drives it —
  // a progress bar doesn't need 60 re-renders/sec, and cutting that down
  // to ~15 leaves more main-thread headroom for the SoundTouch worklet's
  // real-time scheduling, which is one plausible contributor to the
  // intermittent pitch-correction dropouts reported on real iOS hardware
  // (unverified — see the "Pitch" note above; this couldn't be reproduced
  // in desktop testing to confirm it helps, just a reasonable thing to
  // stop doing regardless).
  const UI_UPDATE_INTERVAL_MS = 66
  const lastUiUpdateRef = useRef(0)
  function throttledSetCurrentTime(time: number) {
    const now = performance.now()
    if (now - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL_MS) {
      lastUiUpdateRef.current = now
      setCurrentTime(time)
    }
  }

  const tick = useCallback(() => {
    if (!isPlayingRef.current) return
    const loop = loopSegmentRef.current

    if (loop) {
      const passes = computeLoopPasses()
      if (passes > loopPassesRef.current) {
        const newPasses = passes - loopPassesRef.current
        loopPassesRef.current = passes
        for (let i = 0; i < newPasses; i++) applyRamp()
      }
      throttledSetCurrentTime(computeCurrentBufferTime())
    } else {
      const time = computeCurrentBufferTime()
      const dur = bufferRef.current?.duration ?? 0
      if (dur > 0 && time >= dur - END_EPSILON) {
        isPlayingRef.current = false
        stopSourceNode()
        clockRef.current.bufferOffset = 0
        setCurrentTime(0)
        setIsPlaying(false)
        return // stopped — don't reschedule
      }
      throttledSetCurrentTime(time)
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
    await startSourceAt(clockRef.current.bufferOffset)
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
    // The bridge element (see "Backgrounding" note above) has to be
    // explicitly paused too, not just its upstream source — otherwise it's
    // left "live" trying to render a MediaStream that's gone quiet, which
    // is what caused the stutter/distortion on pause and resume.
    mediaElRef.current?.pause()
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

  const restart = useCallback(async () => {
    await seekTo(loopSegmentRef.current ? loopSegmentRef.current.start_time : 0)
  }, [])

  const seek = useCallback(async (time: number) => {
    await seekTo(time)
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

  const loopOn = useCallback(async (segment: EngineSegment) => {
    loopSegmentRef.current = segment
    setLoopSegmentState(segment)
    setRampReachedMax(false)
    await seekTo(segment.start_time)
  }, [])

  const loopOff = useCallback(() => {
    if (isPlayingRef.current) {
      // Rebase using the still-wrapped position *before* clearing loop
      // state. computeRawBufferTime() never rebases during ordinary
      // looping (by design — see startSourceAt), so it's been counting
      // unwrapped elapsed time this whole loop; without this, clearing
      // loopSegmentRef would make it start reporting that huge unwrapped
      // number as the real position — past the buffer's actual duration
      // after more than a couple of passes, which falsely trips the
      // end-of-track check on the very next tick and silently kills
      // playback (looked like "pause doesn't work" downstream).
      const pos = computeCurrentBufferTime()
      clockRef.current = { contextStart: ctxRef.current!.currentTime, bufferOffset: pos }
    }
    loopSegmentRef.current = null
    setLoopSegmentState(null)
    setRampReachedMax(false)
    // Flip the flag on the live node rather than stopping/restarting it —
    // per spec this just lets the current pass finish and play on past
    // loopEnd instead of wrapping again, no glitch.
    if (sourceRef.current) sourceRef.current.loop = false
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
      soundTouchNodeRef.current = null
      soundTouchReadyRef.current = null
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

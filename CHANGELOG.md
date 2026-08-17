# Changelog

Dated log of completed work, decisions, and open issues. See CLAUDE.md for project context.

## 2026-08-17 — Independent playback volume (Web Audio migration)

**Problem:** iOS Safari pins `<audio>.volume` to 1 — the OS doesn't let a web page set it, only the hardware volume buttons can. Woodshed played recordings through a plain `<audio>` element, so turning up headphone volume to hear a quiet mic/instrument also turned up the backing track by the same amount, with no way to balance the two independently.

**Decision:** Rather than wrap the existing `<audio>` element with `createMediaElementSource()` (the smaller change), went with decoding recordings into an `AudioBuffer` and playing them through `AudioBufferSourceNode` + `GainNode`. Reasoning: Woodshed's tempo/auto-ramp feature depends heavily on `playbackRate`, and `createMediaElementSource` + `playbackRate` + gain has documented iOS reliability issues (WebKit bug #239696; mixed community reports of gain being silently ignored). The buffer approach avoids that combination entirely and gives sample-accurate seeking as a side effect. Trade-off: the whole file downloads and decodes before playback starts (no native range-request streaming), and sits fully decoded in memory while loaded — acceptable for practice-length recordings, worth revisiting if very long recordings become common.

**What changed:**
- New `frontend/src/useAudioEngine.ts` — shared Web Audio playback engine (play/pause/seek/restart/loop-a-segment/auto-ramp/volume), replacing the `<audio>`-element-based transport logic that was previously duplicated between the desktop and mobile players.
- `AudioPlayer.tsx` (desktop) and `MobileTuneDetail.tsx` (mobile) both rewritten to consume the shared hook instead of maintaining their own independent `<audio>` ref + rAF polling logic. This also fixes the pre-existing duplication between the two — previously mobile had a full second copy of the tempo/loop/ramp logic instead of reusing `AudioPlayer`.
- Volume slider added to both players, persisted to `localStorage` (`woodshed_playback_volume`), defaulting to 100% so existing behavior is unchanged until a user touches it.
- Loading state added (`isLoading`/`error` from the engine) since decoding takes a moment for longer files, unlike the old element's near-instant `preload="auto"` start.

**Bug found and fixed during verification:** `ensureContext()` only checked whether the cached `AudioContext` was null before reusing it, not whether it was `closed`. React 18 StrictMode double-invokes effects on mount (setup → cleanup → setup again, against the same refs) — the hook's unmount-teardown effect closed the one-and-only context during that dev-only cycle, and the guard handed back the dead context forever afterward: `ctx.currentTime` frozen at 0, nothing ever visibly played. Fixed by also recreating when `ctx.state === 'closed'`. Caught via a scripted Playwright run against the real dev servers (backend on Postgres, frontend on Vite) — not just `tsc`/`vite build`, which both passed the whole time and caught nothing here.

**Verified (desktop Chrome, scripted):** play/pause/resume-from-position, seek via timeline click, speed change while playing (presets + slider), segment looping with auto-ramp climbing speed across loop passes, volume slider updates gain, switching recordings resets cleanly. No console errors.

**Not yet verified — needs a real device:** the actual point of this change, independent volume on iOS Safari, plus the iOS-specific gesture/`AudioContext.resume()` timing and the previously-flagged `createMediaElementSource`-adjacent bugs this approach was chosen to sidestep. None of that is testable from a desktop browser. Next step is testing on an iPhone against a real audio interface.

**Also touched:** `AudioPlayer.css` / `ShedMode.css` — additive styles for the volume slider and loading/error states, no changes to existing rules.

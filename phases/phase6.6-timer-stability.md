# Phase 6.6 — Timer Stability Fix

> **Author:** Claude (planning), to be implemented by Codex.
> **Status:** Approved spec. Ready to build. Depends on Phase 6.5 having merged (it has, commit `e6aa8eb`).
> **Scope:** Single-bug fix, ~30 lines of real change. No new product features. No API changes.

---

## 1. Context — the bug

User report: "while minimizing and opening the live workout state, the timer isn't really stable. A quick browser refresh fixes it but it's finicky. Quickly minimizing and opening it back up repeatedly, the timer would be stuck on 5m 15s but a quick refresh would update it to what it actually is."

This is a real bug in `useElapsedSeconds`. After Phase 6.5 it manifests in **two places**: the live-workout sticky toolbar and the new floating card.

## 2. Root cause

The `useElapsedSeconds` hook captures the client clock anchor *fresh on every component mount* but pairs it with a `serverNow` prop value that was captured at the moment the session was last fetched.

Current code (identical copies in two files):

- `src/app/workout-app.tsx:1725-1744`
- `src/app/active-workout-card.tsx:117-140`

```ts
useEffect(() => {
  const clientAnchorMs = Date.now();        // re-captured on every mount
  const serverAnchorMs = parseDateOrFallback(serverNow, clientAnchorMs);
  const startedAtMs = parseDateOrFallback(startedAt, serverAnchorMs);
  ...
}, [serverNow, startedAt]);
```

`getElapsedSeconds` then computes:

```ts
estimatedServerNowMs = serverAnchorMs + (Date.now() - clientAnchorMs);
elapsed = Math.floor((estimatedServerNowMs - startedAtMs) / 1000);
```

When `LiveWorkout` (or `ActiveWorkoutCard`) unmounts and remounts — i.e. every minimize/resume cycle, every navigation between `/` and `/profile` — the hook's effect re-runs:

- `clientAnchorMs` resets to the current `Date.now()`.
- `serverAnchorMs` is still the *fetch-time* server time from the prop.
- So `Date.now() - clientAnchorMs ≈ 0` at remount.
- `estimatedServerNowMs ≈ serverAnchorMs` (stale).
- `elapsed ≈ serverAnchorMs - startedAt` — the elapsed value as of the last fetch, **not** now.

The timer then ticks forward only as wall-clock time has passed since the latest remount. A page refresh re-fetches the session, which moves `serverAnchorMs` forward, which is why refresh appears to fix it.

## 3. Fix — capture the offset once in the provider

`ActiveWorkoutProvider` (`src/app/active-workout-context.tsx`, added in Phase 6.5) is the natural home for a stable client/server clock offset. Compute it once when a session is set, expose it via context, and have a single shared `useElapsedSeconds` hook read it.

### 3.1 Add `offsetMs` to the context

In `src/app/active-workout-context.tsx`:

- Add `offsetMs: number | null` to `ActiveWorkoutContextValue`.
- Whenever the provider sets a non-null session (in both `refresh` and `replaceSession`), compute:

  ```ts
  const offsetMs = Date.parse(nextSession.server_now) - Date.now();
  ```

  Store it in a `useState<number | null>(null)`. Reset to `null` when session is set to `null`.

- Recommended refactor: have `refresh` route its successful set through `replaceSession` (currently it calls `setSession(activeSession)` directly on line 70). That way offset computation lives in one place. Functionally equivalent, just avoids drift.

- Expose `offsetMs` on the context value.

### 3.2 Replace the duplicated hook with a single shared one

Add a new exported hook in `src/app/active-workout-context.tsx`:

```ts
export function useElapsedSeconds(startedAt: string): number {
  const { offsetMs } = useActiveWorkout();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAtMs = Date.parse(startedAt);
    if (Number.isNaN(startedAtMs)) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () => {
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() + (offsetMs ?? 0) - startedAtMs) / 1000),
      );
      setElapsedSeconds(elapsed);
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [offsetMs, startedAt]);

  return elapsedSeconds;
}
```

Notes:
- Tick interval stays at 250ms (matches existing behavior).
- Effect re-runs only on `offsetMs` change (rare: once per fetch) and `startedAt` change (rare: only when a different session is loaded). Component remounts no longer reset the math — the offset is held by the provider, which doesn't unmount when child screens navigate.
- The `Math.max(0, ...)` guard handles the brief moment after a workout starts before the first server response lands and offset is still null.

### 3.3 Delete the two existing copies and their helpers

Remove from **`src/app/workout-app.tsx`**:
- `useElapsedSeconds` (lines 1725-1744).
- `parseDateOrFallback` (lines 1788-1792).
- `getElapsedSeconds` (lines 1794-1802).

Remove from **`src/app/active-workout-card.tsx`**:
- `useElapsedSeconds` (lines 117-140).
- `parseDateOrFallback` (line 170 onward).
- `getElapsedSeconds` (line 176 onward).

Both files should `import { useElapsedSeconds } from "./active-workout-context";` instead.

### 3.4 Update call sites

**`src/app/workout-app.tsx:312`** — change:
```ts
const elapsedSeconds = useElapsedSeconds(
  session.started_at,
  session.server_now,
);
```
to:
```ts
const elapsedSeconds = useElapsedSeconds(session.started_at);
```

**`src/app/active-workout-card.tsx:16`** — same change.

`session.server_now` can stay on the API response and on the `ActiveWorkoutSession` type — it's still needed by the provider for offset computation. No backend change.

## 4. Files touched

- `src/app/active-workout-context.tsx` — add `offsetMs` state, expose on context, add shared `useElapsedSeconds` hook export.
- `src/app/workout-app.tsx` — remove local `useElapsedSeconds` + helpers, import from context, drop `serverNow` arg at call site.
- `src/app/active-workout-card.tsx` — same.

No API changes. No Prisma changes. No new components.

## 5. Verification

Run on the real dev stack (`docker compose up`).

**Static checks**
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `git diff --check` clean.

**Reproduction of the original bug — must now fail to reproduce**
- [ ] Start a workout. Confirm timer reads `0s`.
- [ ] Wait 30 seconds in the live view. Timer reads ~`30s`.
- [ ] Tap minimize. Wait another 30 seconds with the floating card visible. Floating-card timer ticks up to ~`1m 0s`.
- [ ] Tap the floating card to reopen the live workout. Live-workout timer reads ~`1m 0s` (not `30s`).
- [ ] Repeat the minimize → resume cycle 5 times rapidly. Timer stays correct each time, no rewind.
- [ ] Refresh the page. Timer reads the same value before and after refresh (no jump).

**Cross-screen consistency**
- [ ] With an active workout running, navigate `/` → `/profile` → `/profile/exercises` → back to `/profile` → back to `/`. Timer values on the floating card and live screen agree throughout (no rewinds, no drift).
- [ ] Compare the live-workout sticky toolbar timer to the floating-card timer side-by-side after several minimize/resume cycles — they should show the same value.

**Clock-skew sanity check (optional but valuable)**
- [ ] Manually set the device clock 2 minutes behind, reload, start a workout. Timer should still read ~`0s` (offset corrects for skew). Set device clock 2 minutes ahead, repeat — same result.

## 6. Out of scope

- Phase 7 autosync work (debounced set saves, retry, "saving"/"saved" indicators). That is its own phase.
- Any visual/UX changes to the floating card or live workout. This is purely a math fix.
- Removing `server_now` from the API response — leave it. Useful for diagnostics and is what the provider reads.

## 7. Hard rules respected

- **Don't store timer ticks** (CLAUDE.md §15) — still computed live on the client; we just stabilize the anchor.
- One active workout, server-enforced — unchanged.

## 8. Hand-off expectations

After merging:
- Append a `## YYYY-MM-DD (Codex)` entry to `HANDOFF.md` with files modified, validation commands run, and any deviations from this spec.
- Push to `origin/main` once validated (per the user-testable-feature push rule — this fixes a user-visible bug).
- Update `PHASE_STATUS.md` if you maintain it locally.

# Silence Success Toasts — Plan for Codex

## Context

Toasts confirm every successful mutation (save workout, delete, edit, reorder, bodyweight CRUD, units change, exercise CRUD). In normal use this feels chatty — most successful actions don't need a banner because the resulting state change is already visible (the workout shows up in history, the row disappears, the value updates). Error toasts, on the other hand, are load-bearing — a silent failure at the gym is the bad outcome.

User-confirmed scope decisions:
- Silence **success toasts only**. Error toasts always show.
- Toggle is global, not per-mutation.
- Default = silenced. The user explicitly said success toasts feel noisy today, so flipping the default is the fix; they can re-enable from Settings.

Out of scope: per-screen toast suppression, success summaries grouped into a single toast, long-form notification preferences.

---

## Schema change

Add a single column to the existing `AppSettings` table (`prisma/schema.prisma:32-39`).

```prisma
model AppSettings {
  id                    Int        @id @default(1)
  defaultWeightUnit     WeightUnit @default(lbs)
  silenceSuccessToasts  Boolean    @default(true)   // NEW
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  @@map("app_settings")
}
```

Migration via `npx prisma migrate dev --name add_silence_success_toasts` per the standard workflow in CLAUDE.md.

Default `true` flips current behavior to address the noise complaint immediately. Single-user app, one row, no backfill concern.

---

## API change

Extend `src/app/api/settings/route.ts`:

- **GET** (line 41-51): include `silence_success_toasts: boolean` in the response shape.
- **PATCH** (line 53-78): accept optional `silence_success_toasts: boolean` in the body. Update `AppSettings.silenceSuccessToasts` when present. Existing `weight_unit` field stays as-is. Both fields can come in the same PATCH or be sent independently.

Validation: simple `typeof body.silence_success_toasts === "boolean"` check; no service-layer helper needed.

---

## Settings UI

Follow the existing `SettingsRow → subpage` pattern used by Units. Add a new subpage rather than an inline toggle to stay consistent with the established navigation style.

**Naming (user-facing):**
- Settings row label: **"Notifications"**, current-value display: "On" or "Off".
- Subpage title: **"Notifications"**.
- Subpage body: a single two-option pick — **"Show success messages"** (On) / **"Silence success messages"** (Off). Sub-text underneath: "Error messages always show, so you'll still know if something fails."

(Avoid the word "toast" in user-facing copy — it's jargon. The internal code can keep `silence_success_toasts`.)

**Files:**
- `src/app/profile/settings/settings-app.tsx` — add a `SettingsRow` for Notifications (`settings-app.tsx:83-109` SettingsRow pattern), linking to `/profile/settings/notifications`. Display "Off" when silenced, "On" when not.
- New `src/app/profile/settings/notifications/page.tsx` — mirrors `units/page.tsx`, renders `NotificationsSettingsApp`.
- New `src/app/profile/settings/notifications/notifications-settings-app.tsx` — copy the structure of `units-settings-app.tsx`. Use the same `UnitOption`-style two-button selector. Optimistic update + PATCH `/api/settings` with `{ silence_success_toasts }`. Error revert + error toast on failure (errors always show, so this is consistent).

---

## Toast wiring

**Goal:** `useToast().success()` becomes a no-op when the setting is on. `error()` is unaffected. No async work in the hot path (toasts fire from inside event handlers, often synchronously after a fetch).

**Approach:** localStorage cache. Single-user, tiny payload, synchronous read.

- New tiny helper `src/app/app-settings-cache.ts`:
  - `readAppSettingsCache(): { silenceSuccessToasts: boolean } | null`
  - `writeAppSettingsCache(settings): void`
  - Wraps `localStorage.getItem("nextrep:app-settings")` / `setItem`. Safe SSR guards (`typeof window !== "undefined"`).

- `src/app/toast.tsx`:
  - Inside the `success` method (currently `success: (msg) => emitToast(msg, "success")` — `toast.tsx:43-51`), read the cache. If `silenceSuccessToasts === true`, return without emitting. Otherwise emit as today.
  - `error` unchanged.

- Cache is populated:
  - On the first GET inside `settings-app.tsx:24` and `units-settings-app.tsx:26` (and the new notifications page) — call `writeAppSettingsCache(response)`.
  - On every successful PATCH from any settings subpage — write the new value through.
  - On AppShell mount, fire a one-shot GET `/api/settings` if no cache exists, and write the response. (Add to `src/app/app-shell.tsx` near the existing client effects.)

- First-load behavior before cache is populated: read returns `null`; `success()` falls back to **the default** (silenced = no emit). Matches the new default.

This keeps toast emission synchronous, avoids a new React context, and ensures changes from the Settings page are picked up the next time anything calls `success()` (no provider remount needed).

---

## Critical files

- `prisma/schema.prisma` — add column.
- `src/app/api/settings/route.ts` — extend GET + PATCH.
- `src/app/profile/settings/settings-app.tsx` — add Notifications row, fetch new field.
- `src/app/profile/settings/notifications/page.tsx` — new.
- `src/app/profile/settings/notifications/notifications-settings-app.tsx` — new (copy units pattern).
- `src/app/profile/settings/units/units-settings-app.tsx` — write through to cache on GET/PATCH.
- `src/app/toast.tsx` — gate `success()` on cache.
- `src/app/app-settings-cache.ts` — new tiny helper.
- `src/app/app-shell.tsx` — one-shot settings hydration on mount.

## Reusable patterns

- `UnitOption` button (`units-settings-app.tsx:123-157`) — copy as-is for the notifications On/Off picker.
- `SettingsRow` (`settings-app.tsx:83-109`) — copy for the new Notifications row.
- Optimistic update + PATCH + revert on error (`units-settings-app.tsx:49-65`) — copy for notifications.
- `useToast().error` (`toast.tsx:43-51`) — keeps working unchanged for the revert path.

## Verification

1. `npx prisma migrate dev --name add_silence_success_toasts` runs cleanly.
2. `npx prisma generate` then `npm run lint` and `npm run build` pass.
3. `git diff --check` passes.
4. Local browser smoke:
   - Open Settings → Notifications. Default reads "Off" (silenced).
   - Save a workout → no toast appears. Workout shows up in history (the implicit confirmation).
   - Trigger a failure (offline, then save) → error toast appears with retry. Confirms errors still fire.
   - Toggle Notifications to "On". Save another workout → success toast appears.
   - Toggle back to "Off". Save another → no toast.
   - Hard refresh the app with the toggle on/off — the setting persists (DB) and the toast behavior matches (cache hydrates from GET on mount).
   - Clear localStorage, hard refresh — first action's success toast is silenced (default-to-silenced fallback) until AppShell's hydration GET completes; from then on, the DB value is authoritative.
5. Append `## YYYY-MM-DD (Codex)` HANDOFF entry.
6. Commit + push as a single change. No phase-doc updates needed (this is a small post-MVP polish item).

## Sequencing

1. Schema migration + Prisma generate.
2. API GET/PATCH update.
3. Cache helper + AppShell hydration.
4. Toast hook gate.
5. Settings UI (settings row + new subpage + write-through on Units page too).
6. Manual smoke + commit + push.

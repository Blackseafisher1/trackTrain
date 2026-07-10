# Short Implementation Plan: Pause Tracking, Supersets, Toasts, Notifications

Use "workout" for templates (the things in the Workouts tab / plans table). "Workout session" for the live logged thing in WorkoutLogger.

Not strict order — logical dependency order so it makes sense to build.

## 1. Settings foundation (item 1 + base for 3)
- Extend `AppSettings` (settings.ts):
  - `pauseTrackingEnabled: boolean` (default true)
  - `defaultRestSeconds: number` (default 180)
- Add simple toggles + number input in Settings.svelte
- Wire the disable: if off, completely skip pause recording, avg pause display, and auto timers
- Make existing manual rest timer respect the global disable too

## 2. Simple toast system (required by 3 + item 4)
- Add minimal toast system (can be a small component or state + fixed div in WorkoutLogger or App)
  - Shows list of active toasts
  - Support live countdown + text ("Rest time — 2:45" / "Pause done")
- Add setting for toast appearance position:
  - e.g. `toastOffsetTop` (px or use env safe-area) or simple "top / middle" choice
  - Goal: user can tune so it never covers header / controls
- Toast auto-dismiss or "done" state when timer reaches 0
- Keep it dead simple, no external lib

## 3. Automatic pause / rest tracking (core of item 3)
- On `toggleSetDone` (when completing a set):
  - If `pauseTrackingEnabled`, auto-start the existing rest timer using the exercise's (or superset's) rest duration
  - Immediately pop a toast showing the countdown
  - When countdown hits 0 → mark toast as "Rest complete", stop timer
- Per-workout-exercise rest time:
  - Default comes from the workout template (new column)
  - Allow quick edit per exercise **in the active workout** (small +/- or input next to the exercise header)
  - Supersets share one rest value
- Continue to record pauseTimes (for avg pause display) when using auto
- On load from workout template, copy the default rest seconds into the session items

## 4. Supersets support (item 2 + affects 3)
- Schema: add `superset_group` (integer or string, nullable) to both:
  - plan_exercises (workout template)
  - workout_exercises (live session)
  - Use ALTER in ensureSchema (safe add)
- In workout editor (Workouts.svelte):
  - In the exercise list for a workout, allow pairing two consecutive exercises into a superset (simple "group" / "pair" button or checkbox)
  - Store same group id for the pair
  - Visual: show them as linked (e.g. "Superset: Bicep + Tricep")
- In WorkoutLogger:
  - Render paired exercises together (visually grouped)
  - Pause / auto-rest logic change:
    - A superset "unit" is considered done only after the current set of **both** exercises in the pair are marked done
    - Only then trigger one shared rest timer + one pause record
  - Per-superset rest time override (one control for the pair)
- Keep adding sets etc. still per exercise, just the *rest after* is shared

## 5. Per-ex / per-superset rest config in templates
- When editing/creating the workout, allow setting rest seconds per exercise (or per superset group)
- Default to the global `defaultRestSeconds` when adding
- Persist on the template row (the new column)
- When starting a workout session, the per-ex values are used for auto

## 6. Notifications + permissions (item 5)
- Add setting: `enableTimerNotifications: boolean`
- When auto rest timer is about to be used (or on toggle), if not asked yet:
  - `Notification.requestPermission()`
- On timer reaching 0:
  - If `document.visibilityState === 'hidden'` and permission granted, fire:
    `new Notification("Rest done", { body: "Time for next set", tag: "rest-timer" })`
- Focus on installed PWA experience
- Note limitations: basic Notification works for hidden tab / background PWA. True "app closed" on iOS/Android web is very limited (no reliable background without real push + server). Start with visibility + permission request only.
- iOS + Android friendly: ask only when feature is actually used

## Cross-cutting / keep simple rules
- All new data in existing tables via ALTER + defaults (no breaking changes)
- Pause tracking + superset grouping only affect the live logger UI and the current session (pauseTimes stay local state for now)
- Reuse/extend the existing timer code + pauseTimes recording as much as possible
- Update WorkoutLogger, Workouts.svelte (editor), settings, and DB client schema
- No new tabs or big architecture — everything stays inside the current workout flow
- Test: manual pause still works when auto disabled, superset pair shares exactly one rest, toast doesn't cover important UI, permission only asked once sensibly

## Suggested build order (makes sense)
1. Settings (1) + schema column for default_rest_seconds
2. Toast component + position setting (4 + prereq for 3)
3. Auto start timer + toast on set done, per-ex rest override (3)
4. Supersets grouping in editor + logger + shared pause logic (2)
5. Notifications permission + background notif on timer done (5)
6. Polish + safe-area for toast + defaults everywhere

Keep everything caveman-simple. One feature at a time, test in logger first.
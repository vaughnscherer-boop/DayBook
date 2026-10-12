# Plan: "Morning Brief / Nightly Wrap-up" Calendar + Task App

## Context
You want a phone app in the spirit of Morgen (calendar + tasks in one place), but with a
different headline feature:
1. **Morning Brief** – the first time you use your phone on a new day, you see today's tasks and events.
2. **Nightly Wrap-up** – in the evening, a checklist to tick off what you finished, roll over what you didn't, and add tasks for tomorrow.

Decisions made: iPhone + Android, beginner-friendly steps, read events from the phone's built-in
calendar (which already syncs Google/iCloud/Outlook), personal use first but architected for a
public release later. The current `helloworld` folder is just scratch files — we'll create a fresh project next to it.

### Important technical reality (shapes the design)
- **iPhone does not let apps detect "phone unlocked."** So on iOS the morning brief is delivered three ways that together feel like "first open of the day":
  1. A **morning notification** at your chosen wake time ("Good morning — 5 tasks, 3 events"). Tapping it opens the Brief.
  2. The **first time you open the app each day**, the Brief screen shows automatically.
  3. A **lock-screen / home-screen widget** showing today's tasks — you see it the moment you pick up the phone (later phase).
  4. Optional power-user trick: an iOS Shortcuts automation "When my alarm is stopped → open app".
- **Android can detect unlock** (`USER_PRESENT` event), so Android can show a true "first unlock of the day" prompt. This needs a small native module, so it comes in a later phase.

## Tech stack (chosen for a beginner, both platforms)
| Need | Choice | Why |
|---|---|---|
| App framework | **Expo (React Native) + TypeScript** | One codebase for iOS & Android; test on your own phone with the Expo Go app; no Xcode needed early on |
| Navigation | Expo Router | File-based screens, simple |
| Local database | `expo-sqlite` (+ Drizzle ORM optional) | Tasks stored on the phone, works offline |
| Phone calendar | `expo-calendar` | Reads events from all calendars synced to the phone |
| Reminders | `expo-notifications` (local, scheduled) | Morning + nightly notifications without a server |
| UI | React Native Paper or Tamagui | Ready-made, good-looking components |
| Later: accounts & sync | Supabase (auth + Postgres) | Free tier, easy, adds cross-device sync for public release |
| Later: widgets | `expo-widgets` / `react-native-android-widget` (dev build) | Home/lock screen widgets |
| Release | EAS Build + EAS Submit | Builds & uploads to App Store / Play Store from the cloud |

## Feature list

### Core (v1 – MVP)
- **Tasks**: create, edit, complete, delete; title, notes, due date, optional time, priority (high/med/low), "estimated minutes".
- **Today view**: today's calendar events (from the phone) + today's tasks in one timeline/list.
- **Morning Brief screen**: greeting, date, weather-free summary: events today, tasks due today, overdue tasks carried over, "top 3 priorities" picker, "Start my day" button.
- **Nightly Wrap-up screen** (checklist flow):
  1. Check off what you finished today.
  2. For each unfinished task: *Move to tomorrow* / *Pick a date* / *Drop it*.
  3. Quick-add tasks for tomorrow.
  4. Preview tomorrow's calendar.
  5. Optional one-line reflection ("How did today go?").
- **Daily trigger logic**: store `lastBriefDate`; when the app opens and today ≠ `lastBriefDate`, show the Brief. Same for `lastWrapUpDate` after the nightly time.
- **Settings**: morning time, nightly time, which calendars to show, turn each ritual on/off, "day starts at" (e.g. 4 AM so late nights count as the previous day).

### v2
- Week / month calendar views (Morgen-like).
- Drag tasks onto the calendar to **time-block** them (creates an event in your phone calendar).
- Recurring tasks (daily, weekdays, weekly…).
- Projects / tags / color-coding.
- Streaks & stats ("Wrap-up done 12 days in a row", completion rate).
- Home & lock-screen **widgets** (today's tasks).
- Android "first unlock of the day" detection.
- Dark mode, haptics, nice animations.

### v3 (public release)
- Sign in (Apple / Google / email) via Supabase; cloud sync across devices.
- Onboarding flow (permissions explained, pick times, pick calendars).
- Privacy policy, App Store / Play Store listings, crash reporting (Sentry).
- Optional: direct Google/Outlook calendar sign-in, AI "plan my day" suggestions, natural-language task entry ("dentist tomorrow 3pm").

## Data model (v1)
- `tasks`: id, title, notes, due_date, due_time, priority, estimate_min, status (open/done/dropped), completed_at, created_at, rolled_over_count
- `daily_logs`: date, brief_seen_at, wrapup_done_at, top_priorities (task ids), reflection
- `settings`: morning_time, night_time, day_start_hour, selected_calendar_ids, brief_enabled, wrapup_enabled

Use UUIDs and `updated_at` columns from day one so cloud sync can be added later without a rewrite.

## Step-by-step build plan

### Phase 0 – Setup (≈1 day)
1. Install Node.js LTS, VS Code, and the **Expo Go** app on your phone.
2. `npx create-expo-app@latest daybook --template` (TypeScript, Expo Router tabs template) in `~/Development/`.
3. `npx expo start` → scan QR code → see the app on your phone. 🎉
4. `git init`, make a GitHub repo.

### Phase 1 – Tasks (≈1 week)
5. Build task list screen, add-task sheet, task detail/edit.
6. Set up `expo-sqlite`, create the `tasks` table, wire CRUD.
7. Group tasks: Overdue / Today / Tomorrow / Later.

### Phase 2 – Calendar (≈1 week)
8. Add `expo-calendar`, request permission, list calendars, let user choose which to show.
9. Today view: merge events + tasks sorted by time.
10. Simple day view (hour grid) for today and tomorrow.

### Phase 3 – The rituals (core feature, ≈1–2 weeks)
11. `daily_logs` table + "what day is it?" helper respecting `day_start_hour`.
12. Morning Brief screen + auto-show on first open of the day (check on app launch and on returning to foreground via `AppState`).
13. Nightly Wrap-up multi-step checklist (finish → roll over → add for tomorrow → preview → reflect).
14. `expo-notifications`: schedule a daily repeating morning and nightly local notification; tapping opens the right screen (deep link). Reschedule when settings change. Make notification text dynamic by rescheduling each night with tomorrow's counts.
15. Settings screen for times, calendars, toggles.

### Phase 4 – Polish & personal use (≈1 week)
16. Onboarding (permissions + times), empty states, dark mode.
17. Create a **development build** with EAS (`eas build --profile development`) so you can use native modules and install it permanently on your phone.
18. Use it daily for 2 weeks; keep a list of annoyances; fix them.

### Phase 5 – v2 features
19. Week/month views, time-blocking, recurring tasks, tags, streaks.
20. Widgets (iOS + Android) and Android unlock detection.

### Phase 6 – Public release
21. Supabase auth + sync (local DB stays the source of truth; sync in background).
22. Apple Developer ($99/yr) & Google Play ($25 once) accounts; TestFlight / internal testing with friends.
23. Privacy policy, store screenshots, `eas submit`.

## Verification (each phase)
- Run `npx expo start` and test on your real phone (notifications and calendar don't fully work in simulators).
- Ritual testing: add a debug menu with "Pretend it's a new day" and "Fire morning/night notification now" buttons so you don't have to wait 24 hours.
- Check: create task → appears in Brief; leave it unfinished → Wrap-up offers roll-over → it shows in tomorrow's Brief.
- Before release: test on at least one iPhone and one Android device, permission-denied paths, and time-zone/daylight-saving changes.

## Suggested first coding session (once approved)
Phase 0 + start of Phase 1: scaffold the Expo project, run it on your phone, and build the basic task list with SQLite storage.

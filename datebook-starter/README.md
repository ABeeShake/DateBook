# Datebook — iPhone-first shared date planner

Starter app: Expo / React Native (TypeScript) + Supabase. Source code provided, **not a compiled iOS app**. This code has not been device-tested in this environment.

## Working scope implemented in source
- Email OTP sign-in (requires Supabase email template setup below)
- Create a private 2-person couple space or join with an invite code
- Shared ideas (manual entry, post URLs, original links, venue, category, price notes)
- Check for duplicate canonical URLs and same title + venue before saving
- Per-person "interested" toggles, with two-person agreement highlighted
- Per-person "seen in Datebook" history when an idea is opened (not Instagram/TikTok view history)
- Scheduling ideas as date plans with overlapping-Datebook-plan warnings
- Pull to refresh, partner invite code copying, mark idea done
- Row-level-security policies and membership-enforcing RPC functions

## Setup (Mac with Node.js; Xcode optional for Expo Go)
1. Create a Supabase project at https://supabase.com/dashboard.
2. Open **SQL Editor** and run `supabase/schema.sql` from this folder on a NEW Supabase project.
3. Under **Authentication > Providers**, enable Email.
4. For the Email "Magic Link" template in **Authentication > Email Templates**, change the body to include the six-digit `{{ .Token }}` as a one-time password. Keep Supabase's email protection/rate limits. See https://supabase.com/docs/guides/auth/auth-email-passwordless#with-otp
5. From this extracted folder, run `bash setup.sh`. This creates a new `datebook/` Expo project with the source and dependencies.
6. `cd datebook && cp .env.example .env`; edit `.env` to contain the Supabase Project URL and **publishable key** (never a secret or service-role key).
7. Run `npx expo start`; open the QR code in Expo Go on your iPhone. Use separate emails on both phones.
8. One person creates a space, copies its 12-character code, and sends it privately to the other; the second person chooses "Join my partner".

For a mobile dev build later, follow https://docs.expo.dev/build/introduction/ .

## Caveats
- New ideas currently require **pasting a link or typing details**. No iOS Share extension, Instagram/TikTok history scraping, or automatic metadata extraction yet.
- Conflicts cover **Datebook plans only**. No external Apple/Google calendar sync yet.
- A synced partner needs to **pull to refresh** to see recent changes. Supabase Realtime can be enabled later.
- Schedule inputs are text (`YYYY-MM-DD`, `HH:MM`) interpreted in the phone's local timezone and stored as UTC. Add a native date/time picker and explicit timezone support before wider release.
- Partner invite codes should be treated like passwords. Rate limiting, code rotation and invitation expiry are not implemented. Do not distribute publicly.
- This is a prototype, not a production-hardened app. Audit RLS, invite abuse prevention and authorization before public deployment.
- No Supabase project, App Store account, Apple signing, or connected calendar was configured automatically.

## Data model
- `couples` — private two-person workspaces and codes
- `couple_members` — two authenticated members and display names
- `ideas` — links and activity details in each workspace
- `idea_interests` — separate interest votes for each user
- `idea_seen` — separate in-app viewing history for each user
- `plans` — scheduled dates, start and end timestamps

## Suggested next steps
1. Test login, invite, duplicate detection, interest toggles and scheduling on two phones.
2. Create iOS Share extension through an Expo dev build and native extension target for received URLs.
3. Add Apple EventKit calendar conflict checks with permission. Keep personal event descriptions private.
4. Add verified event date extraction from post text/screenshots with user review.
5. Add background refresh, notifications, venue geocoding and availability filters.

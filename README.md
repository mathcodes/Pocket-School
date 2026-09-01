# Pool Shark

Pool Shark is a mobile-first billiards strategy trainer with 29 skills, 299 questions, adaptive SmartScore practice, optional player profiles, friends, rankings, and five-question speed battles.

**Live site:** `https://pool-shark.win` (once its Cloudflare DNS record is active)

## Run locally

Requires Node.js 22+.

```bash
nvm use 22
npm install
npm run cf:dev
```

Open the local address reported by Wrangler. This runs Cloudflare Pages Functions with a local D1 database.

For a simple static-server fallback, run `npm start`. The full Player Hub requires `npm run cf:dev` because it uses D1-backed API routes.

## Deployment

The Cloudflare Pages project is named `pocket-school`; the public product name is Pool Shark.

```bash
nvm use 22
npm run cf:d1:remote
npm run cf:d1:social
npm run cf:deploy
```

`schema.sql` creates feedback tables. `social-schema.sql` creates player profiles, progress history, friend requests, active battles, and battle history.

GitHub Actions is configured at `.github/workflows/deploy.yml`. Add a GitHub repository secret named `CLOUDFLARE_API_TOKEN` to enable deployment after pushes to `main`.

## Player Hub and privacy

Player Hub is optional. Creating a profile stores a random credential only in the visitor's browser. A discoverable profile shares only:

- Chosen display name
- Average SmartScore
- Mastered skill count

No email or real name is required. Friends must be accepted before they can send five-question speed-battle invitations. Completed battles move to history; the faster time breaks a tied score.

## Feedback

The Feedback dialog posts to `/api/feedback`, which stores messages in the Cloudflare D1 database. The app uses a local queue and mail/copy fallbacks when the API is unavailable.

## Curriculum sources

Question content is informed by WPA Rules of Play, Dr. Dave Alciatore's Billiards & Pool Principles, Billiards Digest Illustrated Principles, the BCA rules reference, WPBSA and WEPF rules, Michael Ian Shamos's billiards encyclopedia, Robert Byrne, and Philip Capelle. The Resources dialog in the app contains direct links.

## Project structure

```text
css/styles.css                  Mobile-first interface styles
js/data-skills.js               Curriculum map
js/data-questions-*.js          Question bank
js/store.js                     SmartScore and local progress
js/social.js                    Player Hub and speed battle client
functions/api/feedback.js       Feedback Pages Function
functions/api/social/[[path]].js Social Pages Function
schema.sql                      Feedback D1 schema
social-schema.sql               Player Hub D1 schema
wrangler.jsonc                  Cloudflare Pages + D1 configuration
```

# Decimaly daily content automation

Generates 2-3 SEO-researched keyword opportunities per day, turns each into
either a full article or a tool spec, and posts it to WordPress as a
**draft** (never auto-published) for you to review.

## One-time setup (about 10 minutes)

1. **Create a GitHub repo** and push this folder to it (or ask me to package
   it and walk you through `git init` / `git push`).

2. **Add repo secrets** — GitHub repo → Settings → Secrets and variables →
   Actions → New repository secret. Add all four:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com
   - `WP_URL` — `https://decimaly.com`
   - `WP_USER` — your WordPress username
   - `WP_APP_PASSWORD` — from WP Admin → Users → Profile → Application
     Passwords (see setup steps in chat)

3. **That's it.** The workflow in `.github/workflows/daily-content.yml` runs
   automatically every day at 07:00 UTC. You can also trigger it manually
   any time from the repo's **Actions** tab → "Decimaly daily content" →
   "Run workflow".

## Daily routine

Check WordPress → Posts → Drafts. You'll find 2-3 new items:
- Articles: ready to skim, tweak, and publish
- `[TOOL SPEC]` posts: a JSON spec describing a new calculator to build —
  not a live tool. Hand it to a developer, or ask me to turn any spec into
  the actual HTML/JS widget (like the wage calculator built earlier).

## Adjusting frequency or volume

- Change the cron schedule in `daily-content.yml` (currently daily).
- Change the `3` opportunities per run inside the Prompt 1 text in
  `scripts/daily-content.mjs` if you want more or fewer drafts per day.

## Local testing

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export WP_URL=https://decimaly.com
export WP_USER=your-username
export WP_APP_PASSWORD="xxxx xxxx xxxx xxxx xxxx xxxx"
npm run generate
```

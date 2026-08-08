# The Raconteur's Commonplace

Personal library catalogue with **two front ends**, one Supabase database:

| Front end | Path / URL | Audience |
|---|---|---|
| **Kobo / E-Ink (plain HTML)** | Edge Function + GitHub Pages gateway | Kobo Clara & ancient WebKit |
| **Modern UI (later)** | `modern/` | Phone & desktop |

## Why plain HTML for Kobo

Kobo’s experimental browser is roughly **AppleWebKit 538 (~2014)**:

- no ES modules (so Vite apps stay blank)
- often **no `fetch` / `XMLHttpRequest`**
- no flexbox / CSS grid
- full page reloads are fine on E-Ink

So the Kobo app is **server-rendered HTML** with classic **form GET/POST**. Zero client JavaScript.

## Live Kobo URL (bookmark this on the device)

After the Edge Function is deployed:

`https://joctuzargvajerqwxuvn.supabase.co/functions/v1/catalogue`

GitHub Pages serves a tiny gateway that links there, plus a static snapshot.

## Deploy

### 1) GitHub Pages (gateway + snapshot)

Already wired: `.github/workflows/deploy-pages.yml`  
Needs secrets/vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### 2) Edge Function (required for live Kobo catalogue)

1. Create a Supabase access token: https://supabase.com/dashboard/account/tokens  
2. Repo → **Settings → Secrets → Actions** → add `SUPABASE_ACCESS_TOKEN`  
3. Run workflow **Deploy Kobo catalogue Edge Function** (or push this branch)

Or locally:

```bash
npx supabase login
npx supabase functions deploy catalogue --project-ref joctuzargvajerqwxuvn --no-verify-jwt
```

### Local static build

```bash
cp .env.example .env   # fill URL + anon key
npm run build          # writes kobo-dist/
```

### Modern Vite app (desktop experiments)

```bash
cd modern
npm install
npm run dev
```

## Database

Schema: `supabase/migrations/`. Same tables for both UIs.

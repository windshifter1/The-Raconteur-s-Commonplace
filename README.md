https://windshifter1.github.io/The-Raconteur-s-Commonplace/

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

## URL to use (bookmark this)

**https://windshifter1.github.io/The-Raconteur-s-Commonplace/**

That is your website. It renders correctly on PC, phone, and Kobo.

> Note: Supabase Edge Functions refuse to serve HTML on GET requests (they force
> `text/plain`, which looks like “raw code”). So the live search/edit engine is
> reached via **POST forms** from the GitHub Pages site — you do not need to open
> the long `supabase.co/functions/...` URL yourself.

## Deploy

### 1) GitHub Pages (gateway + snapshot)

Already wired: `.github/workflows/deploy-pages.yml`  
Needs secrets/vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

### 2) Edge Function (required for live Kobo catalogue)

1. Create a Supabase access token: https://supabase.com/dashboard/account/tokens  
2. Repo → **Settings → Secrets and variables → Actions → Repository secrets**  
   - Name must be exactly: **`SUPABASE_ACCESS_TOKEN`**
3. Run workflow **Deploy Kobo catalogue Edge Function** (Actions tab → Run workflow)

The workflow **fails** if the secret is missing or the function does not respond.

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

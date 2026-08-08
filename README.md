https://windshifter1.github.io/The-Raconteur-s-Commonplace/

# The Raconteur's Commonplace

A personal library catalogue tuned for E-Ink browsers (Kobo Clara 2E and similar): plain black-and-white, fast, and simple. Shares a Supabase database with the fuller modern UI planned separately.

## Local development

```bash
npm install
cp .env.example .env   # then fill in Supabase values
npm run dev
```

- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build

## GitHub Pages

This Kobo-optimised site deploys via **GitHub Actions** on every push to `main`.

Live URL (after first successful deploy):

`https://windshifter1.github.io/The-Raconteur-s-Commonplace/`

### One-time dashboard setup

1. Repo → **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Repo → **Settings → Secrets and variables → Actions**
   - Prefer the **Repository** tab (not only Environment)
   - **Variable** `VITE_SUPABASE_URL` = `https://joctuzargvajerqwxuvn.supabase.co`
   - **Secret** `VITE_SUPABASE_ANON_KEY` = your publishable / anon key  
     Exact names matter. No quotes around values.
4. Push to `main` (or run the workflow manually under **Actions**)
5. Open the Actions run and confirm **Check Supabase build env** passes

If the site is blank, the build almost always lacked those env values. The workflow now fails instead of deploying an empty config.

Do **not** commit `.env`. The Actions workflow injects env at build time.

### Why Actions (not “Deploy from a branch”)

Vite needs a build step. GitHub Actions runs that build and publishes `dist/`. A branch/`docs` folder deploy would force committing build output and fights a second UI later.

## Two UIs, one database (planned)

| Surface | Purpose | Deploy |
|---|---|---|
| This app (Kobo / E-Ink) | Minimal B&W catalogue | GitHub Pages (this workflow) |
| Future full room | Modern phone/PC UI | Separate path, site, or repo — same Supabase |

Both frontends use the same Supabase project and anon key. Auth / personal shelves can be added later without splitting the database.

Database schema: `supabase/migrations/`.

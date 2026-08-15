# The Raconteur's Commonplace

Plain HTML personal library catalogue for E-Ink (Kobo) and simple browsers.

## Site map

| Page | Purpose |
|---|---|
| **Home** | Two large choices: Find a Book / Browse Library |
| **Find a Book** | Search title, author, genre, keywords, publisher, ISBN |
| **Browse Library** | Filter by first letter & genre; sort by title, author, genre |
| **Book record** | Title card with description, availability, shelf, and details |

Empty searches show a clear “No books found” message — never an error page.

## URL

**https://windshifter1.github.io/The-Raconteur-s-Commonplace/**

Interactive Find / Browse / Book views POST to a Supabase Edge Function (Supabase cannot serve HTML on GET).

## Deploy

### GitHub Pages

`.github/workflows/deploy-pages.yml`  
Secrets/vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`  
Optional: `GOOGLE_BOOKS_API_KEY` — provisioned onto the `book-search` Edge Function (never written into frontend source). Open Library search works without it.

### Edge Function

Secret: `SUPABASE_ACCESS_TOKEN`  
Workflow: **Deploy Kobo catalogue Edge Function**

```bash
npx supabase functions deploy catalogue --project-ref joctuzargvajerqwxuvn --no-verify-jwt
```

### Local build

```bash
cp .env.example .env
npm run build   # writes kobo-dist/
```

## Database

Migrations in `supabase/migrations/`.

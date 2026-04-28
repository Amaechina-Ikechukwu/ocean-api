# Ocean API

Production-oriented Bun + Express backend for a Notion-like collaborative workspace API.

## Scripts

```bash
bun install
bun run dev
bun run typecheck
```

## Security Defaults

- Firebase Auth ID tokens are verified with revocation checks.
- Environment variables are validated at boot with Zod.
- CORS is restricted to `CLIENT_URL`.
- Helmet, compression, body-size limits, and IP-based rate limiting are enabled.
- Workspace/page/block mutations require server-side role checks.
- Firestore rules deny backend-owned documents such as invites, files, public shares, and activity logs from direct client writes.
- Gemini embeddings are created server-side and stored in backend-owned Firestore vector documents.

## Firebase Credentials

Use `FIREBASE_SERVICE_ACCOUNT_PATH` for local development:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=C:\path\to\serviceAccountKey.json
```

Use `FIREBASE_SERVICE_ACCOUNT_JSON` in Cloud Run, preferably mounted from Secret Manager:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

# Secure Terminal

Secure Terminal is a privacy-first 1:1 chat MVP combining a TypeScript Fastify backend, a Vue 3 renderer, and an Electron desktop shell. Conversations are initiated only when a user shares their secret profile ID offline. Messages are encrypted on the client so the server only stores ciphertext.

## Repository layout
- `backend`: Fastify + Prisma API with WebSocket messaging.
- `frontend`: Vue 3 + Vite renderer packaged into the Electron app.
- `desktop`: Electron wrapper and packaging configuration.
- `docker-compose.yml`: Local stack with API and proxy scaffolding.

## Security model overview
- **Authentication**: Username + strong password (min 12 chars with complexity). Passwords hashed with Argon2. JWT access tokens plus long-lived refresh tokens.
- **Secret profile IDs**: Generated per account, only shown to the owner via `/api/users/me` and the Profile screen. Conversations start by submitting another user’s profile ID; the backend never exposes profile IDs in responses.
- **End-to-end encryption**: Clients generate asymmetric key pairs and keep private keys locally. The backend stores public keys and only ever sees ciphertext for messages.
- **Transport**: HTTPS/TLS enforced behind the reverse proxy. WebSocket upgrades flow through the same proxy. Logging excludes sensitive content.

## Local development
1. Install Node.js 20+.
2. Backend
   - `cd backend`
   - `npm install`
   - Set `DATABASE_URL=file:./dev.db` or a custom path.
   - `npm run dev` (uses ts-node-dev).
3. Frontend
   - `cd frontend`
   - `npm install`
   - `npm run dev` (served on `http://localhost:5173`).
4. Electron shell
   - `cd desktop`
   - `npm install`
   - `npm run dev` (loads `http://localhost:5173`).
5. API base URLs
   - Configure `VITE_API_BASE` and `VITE_WS_BASE` env vars for the renderer as needed. Defaults point to `https://api.vendadummydomain.com`.

## Database schema
Prisma schema (`backend/prisma/schema.prisma`) models users, refresh tokens, conversations, and messages. Use `npm run prisma:generate` to create the client and `DATABASE_URL` to point at your SQLite file.

## Docker and reverse proxy
- `docker-compose up --build` starts the API on port 3001 and an nginx proxy on ports 80/443.
- `nginx.conf` forwards `/api` and `/ws` to the API and exposes `/health` for monitoring.
- Supply TLS certificates in production (e.g., via certbot) and mount them into nginx.

## AWS EC2 deployment (manual steps)
1. Provision a small Linux EC2 instance.
2. Install Docker and docker-compose.
3. Clone this repo or copy built images to the server.
4. Configure DNS so `vendadummydomain.com` points to the EC2 public IP.
5. Install certbot and issue a TLS cert for `api.vendadummydomain.com` or `vendadummydomain.com`.
6. Update `nginx.conf` to reference the TLS cert and key, ensuring `/api` and `/ws` proxy rules remain.
7. Set environment variables before `docker-compose up -d`:
   - `JWT_SECRET`
   - `DATABASE_URL` (e.g., `file:/app/data/prod.db`)
   - `ALLOWED_ORIGIN` (Electron app origin)
8. Start services: `docker-compose up -d --build`.
9. Verify with `curl https://api.vendadummydomain.com/health` and run a test login via a packaged Electron build.

## Electron packaging
- The Electron app loads the built renderer from `frontend/dist` (copy to `desktop/renderer` before `npm run build`).
- `desktop/electron-builder.yml` targets macOS `.dmg`; Windows/Linux targets can be added later.
- Place branding assets in `desktop/icons` (provided `logo.svg`).

## Key generation (client outline)
The renderer should generate a long-term asymmetric key pair on first login/registration, store the private key locally (e.g., in the Electron secure store), and upload the public key through `POST /api/users/public-key`. Message bodies must be encrypted with the peer’s public key before sending through the WebSocket or REST APIs.

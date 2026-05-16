# Infrastructure (Docker / Coolify)

## Local: one command, `*.localhost` subdomains

From the **repository root**:

```bash
docker compose up --build
```

Open:

- `http://communicounter.localhost:8080`
- `http://communicolor.localhost:8080`

Override the published edge port: `EDGE_HOST_PORT=30080 docker compose up --build`

Browsers resolve `*.localhost` to `127.0.0.1`; no DNS entries. Each subdomain is a **separate origin** (localStorage, Service Workers, cookies).

The **edge** container ([`Caddyfile`](Caddyfile)) routes by `Host` to each app’s nginx `web` service; each nginx still proxies `/ws` to Bun ([`apps/*/deploy/nginx.conf`](../apps/communicounter/deploy/nginx.conf)).

## Compose files

| File | Purpose |
|------|--------|
| [`docker-compose.yaml`](../docker-compose.yaml) (repo root) | App **server** + **web** services for both apps (Bun + nginx); **Coolify compose path** — apps only, no published edge |
| [`docker-compose.override.yaml`](../docker-compose.override.yaml) (repo root) | Local **edge** (Caddy + `*.localhost` routing). Compose merges this automatically when you run `docker compose up` from the repo root; it is **not** used when the only file is `-f docker-compose.yaml` |

Per-app compose remains for running a **single** stack: `apps/communicounter/docker-compose.yaml`, `apps/communicolor/docker-compose.yaml`.

## One-time Coolify bootstrap (checklist)

1. **Create** a Docker Compose resource pointed at this repo.
2. **Compose file path:** `docker-compose.yaml` at repo root (apps only). Add your own edge in Compose only if the platform does not terminate TLS/route to `*_web:80`.
3. **Connect Git** (provider or deploy key), **production branch** (e.g. `main`), enable **auto-deploy** on push if desired.
4. **Public routing:** Map hostnames to `communicounter_web` / `communicolor_web` (**container port 80**) or place a **wildcard** `*.apps.example.com` in front of a **single** edge proxy that routes by `Host` (see below).
5. **Secrets / env:** Set in Coolify; optional `VITE_WS_URL` build arg only if you do not use same-origin `/ws`.

## DNS: wildcard (no per-app records)

- In your DNS provider, add **`*.apps.example.com`** → **A** / **AAAA** to the server running Coolify.
- New apps under `something.apps.example.com` resolve without extra **DNS** rows.
- **TLS:** Prefer one **wildcard** certificate for `*.apps.example.com` (e.g. Let’s Encrypt **DNS-01**).
- **Edge routing:** Either Coolify’s proxy maps each FQDN to a `*_web` service, **or** one **wildcard** vhost forwards to your **Caddy** service and [Caddyfile](Caddyfile)-style **Host** rules live in git (duplicate `infra/Caddyfile` logic with your real domain names for production).

## Optional: deploy webhook (minimal CI)

See [`.github/workflows/coolify-deploy.yml`](../.github/workflows/coolify-deploy.yml). Add repo secret `COOLIFY_WEBHOOK_URL` from Coolify’s deploy webhook URL; optional second secret for a second resource.

## Path-based URLs (`apps.example.com/communicolor`)

Not enabled in this repo. That layout needs per-app **Vite `base`**, nginx path prefix + **`/communicolor/ws`**, and **`VITE_WS_URL`** (or code changes). Prefer **subdomains** + wildcard DNS with the current images.

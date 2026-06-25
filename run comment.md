# ORATION SPIN HUB - RUNBOOK

This is the practical documentation for:

- Local Docker Desktop development
- GitHub update workflow
- VPS pull and deployment workflow
- Health checks and troubleshooting

---

## 1. Project Environments

### Local (Docker Desktop)

- Uses `compose.yaml`
- Runs three containers:
	- `oration-spin-hub-db` (PostgreSQL)
	- `oration-spin-hub-api` (backend)
	- `oration-spin-hub-web` (frontend)
- Local DB connection is internal compose DNS (`database:5432`)

### VPS (Production-like)

- Uses `compose.live.yaml`
- Runs backend + frontend containers
- Uses host PostgreSQL at:
	- `10.0.6.1:5433`
- Current backend database URL:
	- `postgresql://oration_user:Oratuib-%40wp21@10.0.6.1:5433/oration_spin_hub`

---

## 2. Local Docker Desktop - Start/Restart

From Windows PowerShell:

```powershell
cd "F:\Projects\Spin wheel"
git pull origin main
docker compose down -v
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4000/health`
- API health: `http://localhost:4000/api/health`

Expected health response shape:

```json
{
	"ok": true,
	"service": "oration-spin-hub-api",
	"database": "connected"
}
```

---

## 3. Code Update + Push to GitHub

```powershell
cd "F:\Projects\Spin wheel"
git checkout main
git pull origin main

# edit files

git status
git diff
git add .
git commit -m "Describe your change"
git push origin main
```

Use focused commits when possible:

```powershell
git add backend/src/server.js compose.live.yaml
git commit -m "Fix backend health startup flow"
git push origin main
```

---

## 4. VPS Deploy (Pull + Recreate)

```bash
cd /opt/oration-spin-hub
git checkout main
git pull origin main
docker compose -f compose.live.yaml up -d --build --force-recreate
```

Verify:

```bash
docker ps
docker logs --tail=100 oration-spin-hub-api
curl http://localhost:4000/health
curl http://localhost:4000/api/health
```

---

## 5. Nginx Proxy Manager (Current Working Pattern)

Proxy host for domain `orationarena.urlfactory.website`:

- Main host `/` -> frontend (`5173`)
- Custom location `/api` -> backend (`4000`)

Important when NPM runs inside Docker:

- Do not assume `127.0.0.1` points to host services outside NPM container.
- Use a reachable host target from NPM container network.

---

## 6. Backend Health + DB Behavior

Backend now provides:

- `GET /health`
- `GET /api/health`

Behavior:

- Service does not crash when DB is unavailable.
- Database connection state is reported as `connected` or `disconnected`.
- Startup logs show DB connection failures explicitly.

---

## 7. Common Issues and Fixes

### A) Local not running, server running

Cause: local compose was accidentally pointed to VPS DB.

Fix:

- Use `compose.yaml` for local.
- Ensure DB URL is `postgres://postgres:postgres@database:5432/oration_spin_hub` in local compose.

### B) `502 Bad Gateway` on `/api/auth/login`

Cause: proxy cannot reach backend upstream.

Fix:

- Correct NPM `/api` target to backend container-exposed host/port.

### C) `ERR_SSL_UNRECOGNIZED_NAME_ALERT`

Cause: certificate/domain mismatch in NPM.

Fix:

- Reissue/select proper Let’s Encrypt cert for the exact domain.

### D) Backend DB timeout (`ETIMEDOUT ...:5433`)

Cause: PostgreSQL not listening/reachable from container path.

Checks:

```bash
ss -lntp | grep 5433
docker logs -f oration-spin-hub-api
```

---

## 8. Useful Commands

### Local logs

```powershell
docker compose logs --tail=120 backend
docker compose logs --tail=120 database
docker compose logs --tail=120 frontend
```

### VPS logs

```bash
docker logs -f oration-spin-hub-api
docker logs -f oration-spin-hub-web
```

### Quick restart

```bash
docker compose -f compose.live.yaml restart backend frontend
```

---

## 9. Recommended Commit Message Style

- `fix backend health startup flow`
- `restore local compose postgresql setup`
- `allow vps host in vite`
- `document npm upstream target for vps`

Keep each commit focused on one change area.

# ORATION ARENA

Full-stack gamified spin wheel app for office employee selection, built with Node.js, Express, PostgreSQL, React, and Vite.

## Features

- JWT authentication with Super Admin, Admin, and User roles
- Employee CRUD, search, spoken filters, CSV bulk import, manual spoken reset
- Speaker, coordinator, and custom wheels
- Speaker cycle logic that removes selected employees until everyone has spoken
- Tuesday/Thursday scheduling, rescheduling with notes, and history tracking
- Full-screen projector wheel with countdown, sound toggle, confetti, fireworks-style effects, and winner card
- Email and Webex notification configuration
- Dashboard, history, reports, settings, user management, and leaderboard views
- PostgreSQL schema and seed data

## Quick Start

### Docker Compose

Run the full stack with PostgreSQL, backend, and frontend:

```bash
docker compose up --build
```

Frontend: `http://localhost:5173`
Backend: `http://localhost:4000`
PostgreSQL: internal Compose service `database:5432`

Open a database shell with:

```bash
docker compose exec database psql -U postgres -d oration_spin_hub
```

The database schema is loaded from `database/schema.sql` on first startup, and the backend seeds demo users/employees before starting.

To stop the stack:

```bash
docker compose down
```

To reset the database volume and start fresh:

```bash
docker compose down -v
docker compose up --build
```

### Live VPS With Existing PostgreSQL

If PostgreSQL is already installed on your VPS, use the live compose file. It does not start a Postgres container:

```bash
docker compose -f compose.live.yaml up --build -d
```

Open `http://localhost:5173` during local testing, or `https://orationarena.urlfactory.website` when you proxy the app through your VPS domain. On first run, the UI shows a database setup screen. Enter your VPS PostgreSQL connection URL, test it, then click `Sync Database`.

Example URL:

```text
postgres://db_user:db_password@your-postgres-host:5432/oration_spin_hub
```

The backend stores the connection string in the `backend_data` Docker volume, creates tables, and seeds the default users.

### Local Development

1. Create a PostgreSQL database.
2. Copy environment files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Update `backend/.env` with your PostgreSQL connection details.
4. Install dependencies and initialize the database:

```bash
npm run install:all
psql "$DATABASE_URL" -f database/schema.sql
npm run seed
```

5. Run the app:

```bash
npm run dev
```

Frontend: `http://localhost:5173`
Backend: `http://localhost:4000`

## Seed Logins

All seed users use password `Password@123`.

- Super Admin: `superadmin@oration.local`
- Admin: `admin@oration.local`
- User: `user@oration.local`

## Event Banner And Webhook APIs

Authenticated admins can manage upcoming dashboard event banners and quiz questions:

- `GET /api/events`
- `POST /api/events`
- `PATCH /api/events/:id`
- `DELETE /api/events/:id`
- `POST /api/events/:id/questions`
- `PATCH /api/events/:id/questions/:questionId`
- `DELETE /api/events/:id/questions/:questionId`

Webhook subscriptions can be configured from Settings or through:

- `GET /api/webhooks`
- `POST /api/webhooks`
- `PATCH /api/webhooks/:id`
- `DELETE /api/webhooks/:id`
- `POST /api/webhooks/:id/test`
- `GET /api/webhooks/deliveries/recent`

Webhook payloads include `X-Oration-Event`; if a secret is configured they also include `X-Oration-Signature` as an HMAC SHA-256 signature.

## Production Notes

- Set strong values for `JWT_SECRET` and SMTP/Webex credentials.
- Use HTTPS and a managed PostgreSQL service in production.
- Run `database/schema.sql` through your migration tool before deployment.
- Restrict CORS with `CORS_ORIGIN`. For this deployment, use `http://localhost:5173,https://orationarena.urlfactory.website`.

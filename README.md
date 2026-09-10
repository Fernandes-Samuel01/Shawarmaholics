# SHAWARMAHOLICS Restaurant Management System

Premium single-outlet restaurant technology system with a customer kiosk, live Kitchen Display System, and admin dashboard. The kiosk creates orders directly—there is deliberately no payment screen or multi-branch capability.

## Stack

React + Vite, Express, PostgreSQL, Socket.IO, JWT, and Recharts.

## Setup

1. Install Node.js 20+ and PostgreSQL 15+.
2. Create a database named `shawarmaholics`.
3. Copy `.env.example` to `backend/.env` and set `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_URL`.
4. From the repository root, run `npm install`.
5. Load database structure and demo data:

```powershell
psql $env:DATABASE_URL -f database/schema.sql
psql $env:DATABASE_URL -f database/seed.sql
```

For an existing database, apply the payment-status migration before starting the API:

```powershell
psql $env:DATABASE_URL -f database/migrations/002_payment_status.sql
```

6. Start both applications:

```powershell
npm run dev
```

Open `http://localhost:5173`. The floating environment switcher opens the Kiosk, Kitchen, and Admin presentation interfaces. For protected REST endpoints, log in with `POST /api/auth/login`; the seed admin uses `admin@shawarmaholics.in` and password `admin123` (change it immediately in production).

## API

- `POST /api/auth/login` — JWT login
- `GET /api/menu` — kiosk menu
- `POST /api/orders` — creates an order and emits `order:new`
- `GET /api/orders` — protected kitchen/admin orders
- `PATCH /api/orders/:id/status` — protected status update, emits `order:updated`
- `GET /api/inventory` — live inventory
- `GET /api/analytics/dashboard` — protected dashboard metrics

## Real-time events

Socket.IO broadcasts `order:new` as customer orders arrive and `order:updated` when the kitchen advances an order. The frontend gracefully presents realistic demo data when the backend/database is not yet configured, making design review possible before setup.

## Production notes

Use a strong JWT secret, HTTPS, a managed PostgreSQL backup policy, and restrict CORS to your production frontend origin. Product price and customization snapshots are stored with order items so historical orders remain accurate after menu changes.

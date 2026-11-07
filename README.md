# ResiFix

ResiFix is a web-based maintenance management and accountability platform for university halls of residence and private student hostels, starting with the Makerere University cluster in Kampala.

## Stack

Node.js + Express 5 (ES modules) · PostgreSQL + Prisma · JWT auth with phone + OTP · PWA client (vanilla JS + Vite + Workbox). Chart.js is reserved for the analytics work later.

```
server/   Express API. One folder per feature under src/features/
client/   PWA. Screens under src/screens/, API wrapper in src/api.js
prisma/   schema.prisma, migrations, seed.js
docs/     api-contract.md (shared API contract)
```

## Quick start

```bash
cp .env.example .env
npm install
npm run db:up && npm run migrate && npm run seed
npm run dev        # http://localhost:5173  (OTP in dev: 123456)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for ownership, branching, the Definition of Done and conventions.

# FairShare

FairShare is a depreciation-based cost-sharing calculator designed to split costs for mess/hostel items (or other shared assets) between group members over time.

This project is built with Next.js and uses a local SQLite database (`better-sqlite3`) to persist users, groups, group members, shared items, and member leave dates.

Key features

- Depreciation-aware cost calculations for shared items
- Group management with invite codes and roles (owner/admin/member)
- Persistent local storage using SQLite

Tech stack

- Next.js 14
- React
- TypeScript
- better-sqlite3 (SQLite)

Repository layout (high level)

- `app/` — Next.js app routes and API endpoints
- `src/lib/database.ts` — DB helper that opens `fairshare.db` and creates tables on import
- `scripts/` — helper scripts to initialize / reset the local DB

Getting started — run locally

Prerequisites

- Node.js (v18+) and npm (or Bun if you prefer; package.json uses npm scripts)

Install dependencies

```bash
npm install
# or, if you use bun:
# bun install
```

Start the dev server

```bash
npm run dev
```

Database: initialize and reset

The project uses a local SQLite file `fairshare.db` at the repository root. There are helper scripts to initialize or recreate the DB.

- Initialize DB (creates `fairshare.db` and the required tables if not present):

```bash
npm run init-db
# or
node scripts/init-db.cjs
```

- Reset DB (destructive) — deletes the existing `fairshare.db` and recreates an empty DB with the schema:

```bash
npm run reset-db
# or
node scripts/reset-db.cjs
```

- Seed DB (populates the DB with initial test data):

```bash
npm run seed-db
# or
node scripts/seed-db.cjs
```

### Recent Updates (Member Management)

- **Copy Invite Link**: Owners can copy invite links for pending members directly from Group Settings.
- **Searchable User Dropdown**: Easily find and add existing users to groups by name or email.
- **Signup Updates**: Existing members can update their name and password when accepting an invite.

Notes and safety

- `reset-db` is destructive and will remove all data. Back up your DB file before running if you care about the data.
- The app will also create the DB automatically when `src/lib/database.ts` is imported (for example, when you run the Next.js dev server and hit a server-side route that imports the helper).
- `fairshare.db` is ignored via `.gitignore` by default to avoid committing local databases. If you need a sample DB for CI or demos, create a separate tracked file (e.g., `dev/seed.fairshare.db`) or add a seed script.

Migration and future improvements

- Currently the schema is created imperatively from `src/lib/database.ts` and the `scripts/init-db.cjs` script. For schema evolution in production, consider one of the following:
  - Add a simple migrations runner that stores applied migrations in a table (recommended for small projects)
  - Adopt Prisma or Knex migrations for versioned migrations and stronger tooling

Contributing

- Open issues or PRs for bugs or enhancements.
- If adding DB schema changes, add a migration under `migrations/` or update the `scripts/` tooling so upgrades are reproducible.

License

- (Add your license here) — feel free to add an appropriate license to the repo.

Contact

- For questions, ping the repo owner or open an issue.

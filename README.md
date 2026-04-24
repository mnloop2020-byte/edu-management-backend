# Edu Management Backend

Express and Prisma API for the Edu Management System. It provides authentication, students, teachers, attendance, payments, assignments, calendar, gradebook, communications, audit log, parent access, transcripts, dashboard data, and AI-assisted insights.

Frontend repository: https://github.com/mnloop2020-byte/edu-management-system

## Tech Stack

- Node.js and Express
- PostgreSQL
- Prisma ORM
- JWT authentication
- Railway-ready deployment files

## Requirements

- Node.js 18 or newer
- npm
- PostgreSQL database

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create the environment file:

```bash
cp .env.example .env
```

3. Fill in `.env` with your database URL and a strong `JWT_SECRET`.

4. Generate the Prisma client:

```bash
npm run prisma:generate
```

5. Apply database migrations:

```bash
npm run db:deploy
```

6. Start the API:

```bash
npm run dev
```

The API runs at `http://localhost:5000` by default.

## Health Check

```bash
GET /api/health
```

Expected response:

```json
{
  "status": "ok",
  "message": "EduSystem API is running"
}
```

## Authentication Notes

The first user can register as an admin when the database has no users. After that, public registration is disabled unless `PUBLIC_REGISTRATION_ENABLED=true` or `ALLOW_PUBLIC_REGISTRATION=true` is set.

## Environment Variables

See `.env.example` for all required and optional variables. Never commit real `.env` files or API keys.

## Deployment

This repository includes Railway/Nixpacks configuration. For Railway, set the service root to this backend folder, configure the environment variables, and deploy from `main`.

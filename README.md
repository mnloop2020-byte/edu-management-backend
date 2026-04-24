# Edu Management Backend

This repository contains the API and data layer for the Edu Management System. It powers authentication, user roles, academic workflows, attendance, payments, assignments, communications, dashboards, and transcript-related functionality for the frontend application.

Frontend repository: `https://github.com/mnloop2020-byte/edu-management-system`

## What the API Covers

- Authentication and current-user session lookup
- Student, teacher, and parent management
- Attendance tracking
- Payments, installments, and transaction history
- Assignments and submissions
- Calendar events and academic scheduling
- Gradebook and academic structure management
- Transcript data and academic summaries
- Dashboard metrics and alerts
- Search endpoints
- Communications, templates, and audit logs
- AI-assisted insight endpoints

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Prisma ORM
- JWT authentication
- Helmet, CORS, and rate limiting

## Requirements

- Node.js 18 or newer
- npm
- PostgreSQL database

## Local Development

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
cp .env.example .env
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Apply database migrations:

```bash
npm run db:deploy
```

Start the API:

```bash
npm run dev
```

Default local URL: `http://localhost:5000`

## Available Scripts

- `npm run dev`: start the server with Nodemon
- `npm start`: start the production server
- `npm run prisma:generate`: generate Prisma client
- `npm run db:deploy`: apply committed migrations
- `npm run db:studio`: open Prisma Studio

## Important Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: required signing secret for authentication tokens
- `JWT_EXPIRES_IN`: token lifetime
- `PORT`: server port, defaults to `5000`
- `CORS_ORIGINS`: optional comma-separated allowed origins
- `PUBLIC_REGISTRATION_ENABLED`: enables public sign-up after bootstrap
- `GROQ_API_KEY`: optional key for AI features

See `.env.example` for a documented template without secrets.

## Authentication Behavior

- The first registered account becomes `ADMIN`
- After the first account is created, public registration is disabled by default
- Public registration can be re-enabled with `PUBLIC_REGISTRATION_ENABLED=true`
- Supported roles include `ADMIN`, `TEACHER`, `STUDENT`, and `PARENT`

## Main Route Groups

- `/api/auth`
- `/api/students`
- `/api/teachers`
- `/api/attendance`
- `/api/payments`
- `/api/calendar`
- `/api/assignments`
- `/api/academic`
- `/api/gradebook`
- `/api/communications`
- `/api/parents`
- `/api/transcripts`
- `/api/dashboard`
- `/api/search`
- `/api/audit`
- `/api/ai`

## Data Layer

The project uses Prisma with PostgreSQL. The schema models users, students, teachers, parents, payments, attendance, assignments, calendar events, academic structures, transcript data, communications, templates, and audit logs.

Migrations are committed under `prisma/migrations`, which makes deployment repeatable across environments.

## Health Check

Endpoint:

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

## Security and Runtime Notes

- JWT is required for authenticated routes
- Rate limiting is applied globally and more strictly on login and registration
- CORS allows localhost, configured Vercel domains, and any origins added through `CORS_ORIGINS`
- Request payload size is limited through `JSON_BODY_LIMIT`

## Deployment

This repository includes Railway and Nixpacks configuration. Set the service root to the backend folder, configure the environment variables, and deploy from `main`.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WeChat Mini-Program ecosystem for a table tennis association (浙工大乒协), consisting of three main components:

1. **WeChat Mini-Program** (root directory) - User-facing mobile app
2. **Backend API** (backend/) - Express.js REST API with MySQL
3. **Admin Web Portal** (admin-web/) - Vue 3 management interface

The system manages table tennis events, user registration, match scoring, ratings, announcements, learning materials, and check-ins.

## Architecture

### Three-Tier Application Structure

```
WeChat Mini-Program (Frontend)
         ↓
Express Backend API (business logic, auth, file uploads)
         ↓
MySQL Database (persistent storage)
```

Additionally, an admin web portal connects to the same backend API for administrative tasks.

### Role-Based Access Control

The system implements a sophisticated RBAC system with three admin roles:

- **super_admin**: Full system access across all schools and events
- **school_admin**: Manages specific school(s) and their events
- **event_manager**: Manages specific event(s) only

Authorization logic is in `backend/middleware/adminAuth.js`, which provides:
- `getAdminContext(userId)`: Returns user's role and permission scope
- `requireAdmin`: Middleware enforcing admin access
- `requireSuperAdmin`: Middleware enforcing super admin access
- Permission filtering by school_id and event_id based on roles

### Rating System

The app implements a competitive rating system based on Zhejiang Province's rating league rules (documented in `docs/plans/浙江省等级积分联赛个人积分计算方法.md`).

Key features:
- Initial rating assignment based on group stage performance
- Match-by-match rating adjustments using differential tables
- Automatic score confirmation after timeout (via scheduled task)
- Rating history tracking

Implementation: `backend/utils/ratingCalculator.js`

## Development Commands

### Backend

```bash
cd backend

# Development (with auto-reload)
npm run dev

# Production
npm start

# Run database migrations
npm run migrate

# Testing
node scripts/test-event-flow.js       # Test event workflow
node scripts/test-rating.js           # Test rating calculations
node scripts/seed-test-data.js        # Seed test data
```

### Admin Web Portal

```bash
cd admin-web

# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### WeChat Mini-Program

Open the root directory in WeChat DevTools and click "Compile". No build step required.

### Quick Testing

```bash
# Run automated event flow tests from project root
run-tests.bat    # Windows
```

## Database

### Connection

Database config is in `backend/config/database.js`. Connection parameters are loaded from `backend/.env`:

```
DB_HOST=
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=
```

The connection pool uses:
- Timezone: +08:00 (China Standard Time)
- Date strings instead of Date objects to avoid timezone issues
- Serverless optimizations (keep-alive, connection pooling)

### Migrations

Migration files are in `backend/migrations/`. They run automatically on server startup.

Naming convention: `NNN_description.{sql|js}`
- SQL migrations: Contain raw SQL statements
- JS migrations: Export `up()` function for complex operations

The migration runner in `app.js` executes all migrations in order and handles errors gracefully.

### Schema Overview

Key tables:
- `users`: User profiles (students, teachers, staff)
- `schools`, `colleges`: School and college information
- `roles`, `user_roles`: RBAC system with expiring roles
- `events`: Tournament/event management
- `event_registrations`: User registrations (singles/doubles/team)
- `event_groups`, `event_matches`: Tournament structure and matches
- `rating_history`: Rating changes over time
- `announcements`: System announcements
- `posts`: User-generated content (square/forum)
- `invitations`: Match invitations between users
- `checkin_points`, `checkin_records`: Location-based check-ins
- `learning_resources`: Educational videos
- `captain_applications`: Team captain applications

## API Routes

All routes are mounted under `/api`:

| Route | Purpose |
|-------|---------|
| `/api/auth` | WeChat login, user authentication |
| `/api/user` | User profile management |
| `/api/events` | Event CRUD, registration, match management |
| `/api/announcements` | Announcements |
| `/api/posts` | User posts (forum/square) |
| `/api/invitations` | Match invitations |
| `/api/checkin` | Location-based check-ins |
| `/api/learning` | Learning resources (videos) |
| `/api/rankings` | User rankings |
| `/api/admin` | Admin operations (users, events, scores, schools, etc.) |
| `/api/admin/auth` | Admin authentication |
| `/api/upload` | File uploads (images, videos) |
| `/api/tasks/auto-confirm` | Scheduled task endpoint for score auto-confirmation |

### Authentication Patterns

**WeChat Mini-Program**: Sends `openid` or `user_id` in request body/query params
**Admin Web Portal**: Sends `user_id` in request body/query params, validated via `requireAdmin` middleware

## Key Architectural Decisions

### Mock Mode for Development

The WeChat mini-program has a mock mode controlled by `app.js`:
- `globalData.useMockLogin`: Set to `true` for development (bypasses backend login)
- `mockUser`: Predefined test user data
- **IMPORTANT**: Set `useMockLogin: false` before production deployment

### File Uploads

Files are uploaded to `backend/public/uploads/` and served statically at `/uploads/`.

Upload categories (subdirectories):
- `avatars/`: User avatars
- `announcements/`: Announcement images
- `events/`: Event cover images
- `posts/`: Post images
- `learning/`: Learning resource videos/thumbnails

### Scheduled Tasks

The backend runs an hourly scheduled task that auto-confirms scores when they timeout (24 hours after submission without confirmation). This task is defined in `backend/tasks/autoConfirmScores.js` and can also be triggered via POST to `/api/tasks/auto-confirm`.

### Custom Tab Bar

The WeChat mini-program uses a custom tab bar (`custom-tab-bar/`) to dynamically show/hide the middle tab based on app state.

## Common Workflows

### Adding a New Admin API Endpoint

1. Add route handler in `backend/routes/admin.js`
2. Use `requireAdmin` middleware to enforce auth
3. Access permission context via `req.adminContext`
4. Filter data by `managedSchoolIds` or `managedEventIds` if not super admin
5. Add corresponding frontend code in `admin-web/src/views/`

### Adding a New WeChat Mini-Program Page

1. Create page directory in `pages/`
2. Add page path to `app.json` pages array
3. Implement `.wxml`, `.wxss`, `.js`, `.json` files
4. Call backend API using `wx.request()` with `getApp().globalData.baseUrl`

### Testing Event Flow

Use the automated test script to verify the complete event workflow:

```bash
cd backend
node scripts/test-event-flow.js
```

This tests: event creation, user registration, match creation, score submission, score confirmation, and rating updates.

## Deployment

### Backend Deployment (Auto-Deploy via Git Push)

The backend is deployed to WeChat Cloud Run (Tencent CloudBase) with **automatic deployment**. When code is pushed to the repository, CloudBase automatically builds and deploys the new version.

**Auto-Deploy Flow:**
```
git push → CloudBase detects changes → Docker build → Auto deploy → Migrations run on startup
```

**Manual Steps (if needed):**
1. Build and push Docker image to cloud hosting
2. Set environment variables in cloud console
3. Database migrations run automatically on startup

The `backend/Dockerfile` defines the container image.

### Admin Web Deployment

Build the admin portal and deploy static files to `backend/public/admin/`:

```bash
cd admin-web
npm run build
# Copy dist/ contents to backend/public/admin/
```

The backend serves the admin portal at `/admin`.

### WeChat Mini-Program Deployment

Submit the mini-program code through WeChat DevTools for review.

**Before submission:**
- Set `useMockLogin: false` in `app.js`
- Update `globalData.baseUrl` to production backend URL
- Configure server domain whitelist in WeChat MP console

## Important Notes

- Always use timezone +08:00 for date handling to match China Standard Time
- User phone numbers should be validated and used for authentication in production (currently using openid in mock mode)
- Rating calculations follow official Zhejiang Province rules - do not modify without consulting docs
- Admin permissions are checked both in middleware and in query-building logic for row-level security
- Files uploaded via `/api/upload` are publicly accessible once uploaded

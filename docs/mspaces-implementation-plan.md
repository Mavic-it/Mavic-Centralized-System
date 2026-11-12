# MSPACES Centralized Management System — Implementation Plan

## 1. System design summary

The planning document describes a single centralized platform that serves all Mspaces branches through branch-scoped access instead of separate branch applications. The model is:

- One shared application instance
- Multiple branch records such as Makati and Ortigas
- Branch-aware permissions and data isolation
- Shared PostgreSQL persistence with normalized domain tables
- Role-based access control and audit logging for every sensitive action

## 2. Core modules

- Authentication & User Management
- Employee Management / 201 File
- HR / Manager Portal
- Employee Portal
- Leave Management
- Room / Workspace Management
- Reservations / Booking
- Inquiry / CRM
- Inventory Management
- Asset Management
- Notifications
- Reports & Analytics
- Audit & Security
- System Administration

## 3. Access model

The design uses a permission model shaped as:

User -> Role -> Permission -> Module + Action + Scope

Supported actions:

- VIEW
- CREATE
- UPDATE
- DELETE
- APPROVE
- REJECT
- EXPORT
- IMPORT

Supported scopes:

- OWN
- TEAM
- BRANCH
- ALL

## 4. Roles

- SUPER_ADMIN
- IT_ADMIN
- HR_ADMIN
- BRANCH_MANAGER
- STAFF
- EMPLOYEE

## 5. MVP scope

The document identifies the intended MVP foundation:

- Authentication
- Users
- Roles
- Permissions
- Branches
- Employees
- 201 File
- Leave filing
- Manager approval
- HR approval
- Audit logs

This is the minimum foundation required to support security, database structure, and branch access before operational features are added.

## 6. Technology stack

- Frontend: Next.js + TypeScript + Tailwind CSS + shadcn/ui
- Data/forms: TanStack Query, Axios, React Hook Form, Zod
- Backend: NestJS + TypeScript + REST API
- ORM: TypeORM
- Database: PostgreSQL 18
- Auth: JWT + secure HttpOnly cookies + Passport
- Hashing: Argon2
- Validation: class-validator + class-transformer
- Cache/queue readiness: Redis
- Infrastructure: Nginx + PM2
- Storage: S3-compatible storage or secured server storage
- Email: SMTP provider

## 7. Development phases

1. Phase 1 — Foundation
2. Phase 2 — HR
3. Phase 3 — Operations
4. Phase 4 — CRM
5. Phase 5 — Inventory & IT Assets
6. Phase 6 — Reporting
7. Phase 7 — Advanced

## 8. Architecture implementation pattern

- Keep frontend UI in application/web
- Keep API logic in application/api
- Store shared contracts in packages when reusable
- Enforce authorization in the API, not the UI
- Log sensitive actions and approval transitions
- Treat branch as data, and role as permission
- Use normalized PostgreSQL tables with explicit tenant/branch scopes

## 9. Recommended repository direction

The repository is already aligned with this plan because it is split into the expected and documented service boundaries:

- application/web for the Next.js user experience
- application/api for the NestJS backend and business rules
- packages for reusable contracts and utilities

The implementation should continue from a guarded foundation rather than building one-off branch-specific apps.

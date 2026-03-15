# Reconix - Global Status Tracker

## 🎯 Global Goal
Reconix is a financial automation engine that bridges **Xero** and **PostgreSQL** to provide bulk accounting operations (Invoice Reversals, Overpayment Allocations) with a full audit trail for SOC2 compliance.

---

## 🗺️ High-Level Roadmap
- **Phase 1 (Foundation):** <span style="color:green">**COMPLETE**</span>
- **Phase 2 (Job Engine - Backend):** <span style="color:green">**COMPLETE**</span>
- **Phase 2 (Job Engine - Frontend):** <span style="color:green">**COMPLETE**</span>
- **Phase 3 (RBAC & Approvals):** <span style="color:green">**COMPLETE**</span>
- **Phase 4 (Audit, Security & Polish):** <span style="color:red">**TODO**</span> Production-grade observability & SOC2 Audit Trail.

---

## ✅ Phase 1 — Complete
- [x] Project setup & folder structure (Frontend + Backend)
- [x] Database schema & Prisma configuration (all Xero mirror tables)
- [x] Core Modules: Auth (JWT), User, Company
- [x] RBAC (Role-Based Access Control) middleware
- [x] Xero OAuth 2.0 Integration (PKCE flow, token vault, multi-tenant)
- [x] Xero Data Synchronization Engine (Accounts, Contacts, Invoices, Credit Notes, Overpayments via BullMQ)
- [x] Frontend: Connected Companies page with Sync UI

---

## ✅ Phase 2 — Job Engine (Complete)

### Backend Tasks - ✅ **COMPLETE**

#### 2.1 · Job Creation API
- [x] `POST /api/v1/jobs` — Create a new Job (INVOICE_REVERSAL or OVERPAYMENT_ALLOCATION)
- [x] `GET /api/v1/jobs` — List jobs for the active company (paginated, filterable by status/type)
- [x] `GET /api/v1/jobs/:jobId` — Get job details with all `JobItems`
- [x] `DELETE /api/v1/jobs/:jobId` — Cancel/delete a pending job

#### 2.2 · Job Item API
- [x] `POST /api/v1/jobs/:jobId/items` — Bulk-add items to a job (from frontend selection)
- [x] `PATCH /api/v1/jobs/:jobId/items/:itemId/acknowledge` — Acknowledge amount mismatch for an item
- [x] `DELETE /api/v1/jobs/:jobId/items/:itemId` — Remove a single item from a pending job

#### 2.3 · Job Execution Engine (BullMQ Workers)
- [x] `automation-job-queue` worker in `src/jobs/workers/jobWorker.ts`
- [x] **Invoice Reversal handler**: For each `JobItem`, call `POST /CreditNotes` on Xero API to reverse the invoice
- [x] **Overpayment Allocation handler**: For each `JobItem`, call `PUT /Invoices/:InvoiceID/Allocations` to apply the overpayment
- [x] Update `JobItem.status` to `PROCESSED`, `SKIPPED`, or `FAILED` after each operation
- [x] Update `Job.processedCount`, `skippedCount`, `failedCount` and set final `Job.status`
- [x] Store raw Xero error in `JobItem.failureRawError` for debugging

#### 2.4 · Job Approval Endpoint
- [x] `POST /api/v1/jobs/:jobId/approve` — APPROVER-only: transition job from `PENDING` → `RUNNING` and enqueue in BullMQ
- [x] Validate the requesting user has `APPROVER` or `ADMIN` role for the company

#### 2.5 · Data Query APIs (for frontend job builders)
- [x] `GET /api/v1/xero/invoices` — List AUTHORISED invoices for the active company (paginated + filter by contact, date range, amount)
- [x] `GET /api/v1/xero/overpayments` — List overpayments with `remainingCredit > 0`
- [x] `GET /api/v1/xero/contacts` — List synced contacts (for filter dropdowns)
- [x] `GET /api/v1/xero/accounts` — List synced accounts
- [x] `GET /api/v1/xero/bank-accounts` — List synced bank accounts

---

### Frontend Tasks - ✅ **COMPLETE**

#### 2.6 · Jobs List Page (`/jobs`)
- [x] Connect `Jobs` page to `GET /api/v1/jobs` — replace mock data with live API
- [x] Display job status badges (`PENDING`, `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`)
- [x] Add pagination controls
- [x] Add "New Job" button linking to job builder

#### 2.7 · Job Builder (Create Job Flow)
- [x] **Step 1 - Select Job Type:** Choose `INVOICE_REVERSAL` or `OVERPAYMENT_ALLOCATION`
- [x] **Step 2 - Select Items:** Filterable, sortable table of invoices or overpayments (fetched live from API)
- [x] **Step 3 - Review & Confirm:** Summary of selected items with total amounts before submission
- [x] Submit to `POST /api/v1/jobs` + `POST /api/v1/jobs/:jobId/items`
- [x] Handle amount mismatch acknowledgement UI (checkbox per item)

#### 2.8 · Job Detail Page (Integrated in Modal)
- [x] Fetch and display `Job` metadata (type, status, counts, timestamps)
- [x] Render all `JobItems` in a table with per-item status icons
- [x] Show `failureReason` inline for `FAILED` items
- [x] **Approve button** (visible to APPROVER/ADMIN only) → calls `POST /approve`
- [x] Real-time progress polling while `Job.status === 'RUNNING'`

---

## 🛠️ Current Project State

### Frontend (Reconix-Frontend)
- **Status:** Phase 2 Complete. All core modules connected to live APIs.
- **Implemented:** Connected Companies (live), Job History (live), Invoice Reversal (live), Overpayment Allocation (live), Redux + API layer complete.

### Backend (Reconix-Backend)
- **Status:** Phase 2 Complete. Job Engine & Data APIs fully functional.
- **Implemented:** Auth, RBAC, Xero OAuth, Sync Engine, Job CRUD APIs, Job Approval & Worker (BullMQ).
- **Next:** Phase 3 (Approval Workflows & RBAC Hardening).

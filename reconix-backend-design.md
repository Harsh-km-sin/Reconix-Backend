# Reconix — Complete Backend Design Document
## Phase 4: Production-Grade API, Workers, Security & Infrastructure

---

## 0. What Already Exists (Do Not Rebuild)

Before reading further — Phases 1, 2, and 3 are complete. This document covers
**only what needs to be added or hardened in Phase 4**, layered onto the existing codebase.

**Already built and working:**
- Auth module (JWT), User module, Company module
- RBAC middleware
- Xero OAuth 2.0 (PKCE, token vault, multi-tenant)
- Xero sync engine (BullMQ — Accounts, Contacts, Invoices, Credit Notes, Overpayments)
- Job CRUD APIs (`POST`, `GET`, `DELETE /jobs`)
- Job Item APIs (bulk add, remove, acknowledge)
- Job Approval (`POST /jobs/:id/approve`)
- Invoice Reversal worker handler
- Overpayment Allocation worker handler
- Data Query APIs (invoices, overpayments, contacts, accounts, bank-accounts)
- Swagger/OpenAPI docs

**What Phase 4 adds to the existing backend:**
1. Excel upload + multi-sheet parsing module
2. Validation Engine (pre-flight checks against Xero before job creation)
3. Field mapping template persistence
4. Idempotency layer (Redis + DB)
5. Audit log module (append-only)
6. Security hardening (Helmet, rate limiting, input sanitization)
7. Observability (structured logging, health checks, metrics)
8. Cloud infrastructure (Docker, ECS, RDS, CI/CD)
9. MFA (TOTP)
10. Data corrections from Excel analysis (float precision, duplicate refs, negative amounts)

---

## 1. Folder Structure (Complete — showing new additions to existing)

```
reconix-backend/
├── prisma/
│   ├── schema.prisma                    ← ADD: audit_logs, idempotency_log,
│   │                                          field_mapping_templates tables
│   └── migrations/
│
├── src/
│   ├── config/
│   │   ├── env.ts                       ← HARDEN: add all new env vars with Zod
│   │   ├── logger.ts                    ← ADD: Pino with redaction + request ID
│   │   ├── prisma.ts                    (exists)
│   │   ├── redis.ts                     ← ADD: ioredis singleton
│   │   └── xero.ts                      (exists — token refresh logic)
│   │
│   ├── modules/
│   │   ├── auth/                        (exists — Phase 1)
│   │   │   └── auth.service.ts          ← ADD: MFA (TOTP) methods
│   │   ├── user/                        (exists — Phase 1)
│   │   ├── company/                     (exists — Phase 1)
│   │   ├── xero/                        (exists — Phase 1 & 2)
│   │   ├── jobs/                        (exists — Phase 2)
│   │   │   ├── job.service.ts           ← ADD: four-eyes check on approve
│   │   │   └── job.schema.ts            ← ADD: jobName field
│   │   │
│   │   ├── excel/                       ← ADD NEW MODULE
│   │   │   ├── excel.controller.ts
│   │   │   ├── excel.service.ts
│   │   │   ├── excel.parser.ts          # SheetJS parsing + sheet auto-detection
│   │   │   ├── excel.routes.ts
│   │   │   ├── excel.schema.ts
│   │   │   └── excel.test.ts
│   │   │
│   │   ├── validation/                  ← ADD NEW MODULE
│   │   │   ├── validation.controller.ts
│   │   │   ├── validation.service.ts    # Pre-flight engine
│   │   │   ├── validation.types.ts      # ValidationReport types
│   │   │   ├── validation.routes.ts
│   │   │   └── validation.test.ts
│   │   │
│   │   ├── field-mapping/               ← ADD NEW MODULE
│   │   │   ├── fieldMapping.controller.ts
│   │   │   ├── fieldMapping.service.ts
│   │   │   ├── fieldMapping.routes.ts
│   │   │   └── fieldMapping.test.ts
│   │   │
│   │   └── audit/                       ← ADD NEW MODULE
│   │       ├── audit.controller.ts
│   │       ├── audit.service.ts         # Append-only write + query
│   │       ├── audit.routes.ts
│   │       └── audit.test.ts
│   │
│   ├── workers/
│   │   ├── index.ts                     (exists — worker process entry)
│   │   ├── jobWorker.ts                 (exists — BullMQ consumer)
│   │   ├── handlers/
│   │   │   ├── invoiceReversal.handler.ts    ← HARDEN: idempotency, audit log
│   │   │   ├── overpaymentAllocation.handler.ts  ← HARDEN: idempotency, audit log
│   │   │   └── xeroSync.handler.ts           (exists)
│   │   └── queues.ts                    (exists)
│   │
│   ├── middlewares/
│   │   ├── authenticate.ts              (exists — HARDEN: always DB-verify)
│   │   ├── authorize.ts                 (exists)
│   │   ├── rateLimiter.ts               ← ADD
│   │   ├── requestId.ts                 ← ADD
│   │   ├── sanitize.ts                  ← ADD (xss-clean, hpp)
│   │   ├── errorHandler.ts              ← HARDEN: structured errors, no leaks
│   │   └── auditLogger.ts               ← ADD (HTTP middleware for mutating ops)
│   │
│   ├── utils/
│   │   ├── crypto.ts                    ← ADD: AES-256-GCM for token encryption
│   │   ├── dates.ts                     ← ADD: multi-format date parser
│   │   ├── idempotency.ts               ← ADD: Redis + DB idempotency check
│   │   ├── pagination.ts                (may exist — ensure cursor-based)
│   │   ├── financialMath.ts             ← ADD: float-safe comparison utilities
│   │   └── errors.ts                    ← HARDEN: full AppError hierarchy
│   │
│   ├── types/
│   │   ├── express.d.ts                 (exists — req.user augmentation)
│   │   └── xero.ts                      (exists)
│   │
│   ├── app.ts                           ← HARDEN: Helmet, CORS, rate limits
│   └── server.ts                        (exists)
│
├── tests/
│   ├── unit/
│   │   ├── dates.test.ts
│   │   ├── financialMath.test.ts
│   │   ├── validation.test.ts
│   │   └── idempotency.test.ts
│   ├── integration/
│   │   ├── excel.test.ts
│   │   ├── jobs.test.ts
│   │   └── auth.test.ts
│   └── fixtures/
│       └── Q4_sample.xlsx               # Anonymised test fixture
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── docker-compose.yml                   ← ADD (local dev)
├── Dockerfile                           ← HARDEN (multi-stage, non-root)
├── .env.example                         ← UPDATE (all new vars)
├── jest.config.ts
├── tsconfig.json
└── package.json
```

---

## 2. Database Schema — New & Modified Tables

### 2.1 New Tables (add to schema.prisma)

```prisma
// ─────────────────────────────────────────────
// AUDIT LOG — append only, never update/delete
// ─────────────────────────────────────────────
model AuditLog {
  id            String   @id @default(uuid())
  companyId     String
  userId        String?  // null for worker/system actions
  action        String   // 'JOB_CREATED', 'XERO_CREDIT_NOTE_CREATED', etc.
  resourceType  String   // 'Job', 'JobItem', 'User', 'Company'
  resourceId    String?
  beforeState   Json?    // snapshot before mutation
  afterState    Json?    // snapshot after mutation
  xeroRequest   Json?    // exact payload sent to Xero
  xeroResponse  Json?    // exact response from Xero
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime @default(now())

  company       Company  @relation(fields: [companyId], references: [id])
  user          User?    @relation(fields: [userId], references: [id])

  @@index([companyId, createdAt])
  @@index([companyId, action])
  @@index([resourceId])
  @@map("audit_logs")
  // NO @@updatedAt — this table is append-only
}

// ─────────────────────────────────────────────
// IDEMPOTENCY LOG — prevent duplicate Xero ops
// ─────────────────────────────────────────────
model IdempotencyLog {
  key              String   @id          // SHA256(jobId|itemId|operation)
  status           String                // 'COMPLETED' | 'FAILED'
  responseSnapshot Json?                 // stores result for replay
  createdAt        DateTime @default(now())

  @@map("idempotency_log")
}

// ─────────────────────────────────────────────
// FIELD MAPPING TEMPLATES
// ─────────────────────────────────────────────
model FieldMappingTemplate {
  id          String   @id @default(uuid())
  companyId   String
  name        String                     // "Peter's Standard Format"
  jobType     String                     // 'OVERPAYMENT_ALLOCATION' | 'INVOICE_REVERSAL'
  mapping     Json                       // { overpayments: {...}, bills: {...} }
  usageCount  Int      @default(0)
  lastUsedAt  DateTime?
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company     Company  @relation(fields: [companyId], references: [id])
  createdBy   User     @relation(fields: [createdById], references: [id])

  @@unique([companyId, name])
  @@map("field_mapping_templates")
}

// ─────────────────────────────────────────────
// EXCEL UPLOADS — track uploaded files
// ─────────────────────────────────────────────
model ExcelUpload {
  id           String   @id @default(uuid())
  companyId    String
  uploadedById String
  s3Key        String                    // S3 object key
  originalName String
  sizeBytes    Int
  sheetsFound  String[]                  // sheet names detected
  status       String                    // 'UPLOADED' | 'PARSED' | 'VALIDATED' | 'USED'
  parsedData   Json?                     // cached parsed result (TTL in Redis)
  jobId        String?                   // set when used to create a job
  createdAt    DateTime @default(now())

  company      Company  @relation(fields: [companyId], references: [id])
  uploadedBy   User     @relation(fields: [uploadedById], references: [id])

  @@map("excel_uploads")
}
```

### 2.2 Existing Tables — Additions

```prisma
// Add to existing Job model:
model Job {
  // ... existing fields ...
  name              String?              // ← ADD: "Q4 2025 Payment Allocation Run"
  excelUploadId     String?              // ← ADD: reference to source Excel
  fieldMappingId    String?              // ← ADD: which template was used
  validationReport  Json?                // ← ADD: cached pre-flight result
  rejectedById      String?              // ← ADD: who rejected (four-eyes)
  rejectedAt        DateTime?
  rejectionReason   String?
}

// Add to existing JobItem model:
model JobItem {
  // ... existing fields ...
  xeroRequestPayload  Json?              // ← ADD: exact payload sent
  xeroResponsePayload Json?              // ← ADD: exact response received
  idempotencyKey      String?  @unique   // ← ADD: for dedup
  acknowledgedAt      DateTime?          // ← ADD: when mismatch acknowledged
  acknowledgedById    String?            // ← ADD: who acknowledged
}
```

---

## 3. New API Endpoints (Phase 4)

All existing endpoints from Phase 2 remain unchanged. These are net-new.

### 3.1 Excel Module

```
POST   /api/v1/excel/upload
  Auth: OPERATOR+
  Body: multipart/form-data { file: .xlsx }
  Response: {
    uploadId: string,
    sheets: [{ name, rowCount, detected: 'overpayments'|'bills'|'invoices'|'unknown' }],
    autoMapped: boolean,
    mapping?: FieldMapping
  }
  Notes:
    - Stores file in S3 (key: companies/{companyId}/uploads/{uuid}.xlsx)
    - Runs sheet auto-detection
    - If columns match exactly → returns autoMapped:true with mapping
    - If columns differ → returns autoMapped:false, client shows field mapper

POST   /api/v1/excel/:uploadId/parse
  Auth: OPERATOR+
  Body: { mapping: FieldMapping }
  Response: {
    overpayments: ParsedOverpayment[],
    bills: ParsedBill[],
    parseWarnings: ParseWarning[]
  }
  Notes:
    - Applies the field mapping to the uploaded file
    - Returns parsed + typed data (dates normalized to ISO, amounts as numbers)
    - Cached in Redis for 10 minutes keyed by uploadId
    - ParseWarnings: duplicate refs, zero amounts, negative amounts

GET    /api/v1/excel/:uploadId
  Auth: OPERATOR+
  Response: ExcelUpload record with status
```

### 3.2 Validation Engine

```
POST   /api/v1/validation/run
  Auth: OPERATOR+
  Body: {
    jobType: 'OVERPAYMENT_ALLOCATION' | 'INVOICE_REVERSAL',
    uploadId?: string,       // from Excel upload
    data?: { overpayments, bills }  // from manual builder
  }
  Response: ValidationReport (see Section 5)
  Notes:
    - Fetches from Xero in batches of 100 (avoids rate limit)
    - Cached in Redis for 10 minutes: key = validation:{companyId}:{sha256(invoiceRefs)}
    - Progress streamed via SSE (see Section 6)

GET    /api/v1/validation/:validationId
  Auth: OPERATOR+
  Response: Cached ValidationReport
```

### 3.3 Field Mapping Templates

```
GET    /api/v1/field-mappings
  Auth: OPERATOR+
  Response: FieldMappingTemplate[]

POST   /api/v1/field-mappings
  Auth: OPERATOR+
  Body: { name, jobType, mapping }
  Response: FieldMappingTemplate

PUT    /api/v1/field-mappings/:id
  Auth: OPERATOR+
  Body: { name?, mapping? }

DELETE /api/v1/field-mappings/:id
  Auth: OPERATOR+
```

### 3.4 Audit Log

```
GET    /api/v1/audit
  Auth: ADMIN only
  Query: { page, limit, userId, action, resourceType, resourceId,
           dateFrom, dateTo, jobId }
  Response: { data: AuditLog[], total, page, limit }

GET    /api/v1/audit/export
  Auth: ADMIN only
  Query: same filters + { format: 'csv' | 'json' }
  Response: file download (Content-Disposition: attachment)
  Notes: Streams large exports, does not load all rows into memory
```

### 3.5 Auth — MFA additions

```
POST   /api/v1/auth/mfa/setup
  Auth: Any authenticated user
  Response: { secret, qrCodeUrl, backupCodes }

POST   /api/v1/auth/mfa/verify
  Auth: Any authenticated user
  Body: { token: string }  // 6-digit TOTP
  Response: { verified: true }

POST   /api/v1/auth/mfa/disable
  Auth: ADMIN or self
  Body: { token: string }

POST   /api/v1/auth/login
  // MODIFY existing endpoint:
  // If user has MFA enabled, return { requiresMfa: true, tempToken }
  // Client then calls /auth/mfa/confirm with tempToken + TOTP
  
POST   /api/v1/auth/mfa/confirm
  Body: { tempToken: string, totpToken: string }
  Response: { accessToken, user }
```

### 3.6 Modified Existing Endpoints

```
POST   /api/v1/jobs
  // ADD: accept name, excelUploadId, validationId, fieldMappingId

POST   /api/v1/jobs/:id/approve
  // HARDEN: enforce four-eyes (creator cannot approve own job)
  // ADD: write to audit_log

POST   /api/v1/jobs/:id/reject
  // ADD NEW: APPROVER can reject with reason
  Body: { reason: string }
  Response: Job (status: REJECTED)
```

---

## 4. Excel Module — Technical Implementation

### 4.1 Sheet Auto-Detection Logic

```typescript
// excel.parser.ts

interface SheetDetectionResult {
  overpaymentSheet: string | null   // sheet name
  billsSheet: string | null
  invoiceSheet: string | null       // for Invoice Reversal
  confidence: 'exact' | 'fuzzy' | 'none'
}

const OVERPAYMENT_REQUIRED_COLS = ['SupplierName', 'PaymentDate', 'OverpaymentAmount', 'BankAccount']
const BILLS_REQUIRED_COLS       = ['SupplierName', 'InvoiceDate', 'InvoiceReference', 'PayAmount']
const INVOICE_REQUIRED_COLS     = ['SupplierName', 'InvoiceReference', 'InvoiceDate',
                                   'InvoiceTotal', 'UnitPriceEx', 'TaxAmount']

// Strategy 1: Exact sheet name match (handles Peter's files perfectly)
// Strategy 2: Column header match (handles differently named sheets)
// Strategy 3: Column content heuristics (last resort — detects date cols, amount cols)

// Column normalization before matching:
// - Strip BOM (\uFEFF)
// - Trim whitespace
// - Lowercase comparison
// - Common aliases: 'Supplier' → 'SupplierName', 'Reference' → 'InvoiceReference'
```

### 4.2 Known Column Aliases (from Peter's data)

```typescript
const COLUMN_ALIASES: Record<string, string> = {
  // Overpayments
  'supplier':            'SupplierName',
  'supplier name':       'SupplierName',
  'vendorname':          'SupplierName',
  'payment date':        'PaymentDate',
  'date of payment':     'PaymentDate',
  'overpayment amount':  'OverpaymentAmount',
  'amount':              'OverpaymentAmount',
  'amount usd':          'OverpaymentAmount',
  'bank':                'BankAccount',
  'bank account':        'BankAccount',

  // Bills
  'invoice date':        'InvoiceDate',
  'date':                'InvoiceDate',
  'invoice reference':   'InvoiceReference',
  'reference':           'InvoiceReference',
  'invoice ref':         'InvoiceReference',
  'ref':                 'InvoiceReference',
  'pay amount':          'PayAmount',
  'payment amount':      'PayAmount',
  'amount to pay':       'PayAmount',

  // Invoice Reversal
  'invoice total':       'InvoiceTotal',
  'total':               'InvoiceTotal',
  'unit price ex':       'UnitPriceEx',
  'unit price (ex)':     'UnitPriceEx',
  'unit price (ex) (source)': 'UnitPriceEx',
  'tax':                 'TaxAmount',
  'tax amount':          'TaxAmount',
  'tax (source)':        'TaxAmount',
  'currency':            'CurrencyCode',
  'currency code':       'CurrencyCode',
  'reversal date':       'ReversalDate',
}
```

### 4.3 Data Parsing & Type Coercion

```typescript
// All date fields run through parseFlexibleDate()
// All amount fields:
const parseAmount = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[,$]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null  // 2dp only
}

// Store amounts as DECIMAL(15,4) in DB — never float
// Display amounts with toFixed(2) — never rely on JS float display
```

### 4.4 Duplicate Invoice Reference Detection

**Critical finding from Peter's actual file:** `Si-9073/3` and `Si-9142/1` appear twice.
These are likely the same invoice appearing under two suppliers in the Bills sheet —
possibly a data entry error.

```typescript
interface DuplicateRefWarning {
  code: 'DUPLICATE_INVOICE_REF_IN_FILE'
  invoiceRef: string
  rows: number[]        // row indices where it appears
  suppliers: string[]   // which suppliers claim it
  severity: 'error'     // hard block — cannot have ambiguous refs
}

// Detection:
const refs = bills.map((b, i) => ({ ref: b.invoiceReference, supplier: b.supplierName, i }))
const grouped = groupBy(refs, r => r.ref)
const duplicates = Object.entries(grouped).filter(([, rows]) => rows.length > 1)
// → Block submission until resolved
```

### 4.5 S3 Upload Flow

```typescript
// Flow:
// 1. Client POSTs multipart to /excel/upload
// 2. Multer stores in memory (max 25MB)
// 3. Backend generates: s3Key = companies/{companyId}/uploads/{uuid}.xlsx
// 4. Upload to S3 with server-side encryption (AES-256)
// 5. Store ExcelUpload record in DB (s3Key, originalName, sizeBytes)
// 6. Parse in-memory (do not write to disk)
// 7. Return uploadId to client

// S3 object policy: no public access
// Download via presigned URL only (15min TTL)
// Retention: 90 days, then lifecycle to Glacier

const uploadToS3 = async (buffer: Buffer, key: string): Promise<void> => {
  await s3Client.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ServerSideEncryption: 'AES256',
    ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    Metadata: {
      companyId,
      uploadedBy: userId,
      originalName: file.originalname,
    }
  }))
}
```

---

## 5. Validation Engine — Complete Spec

### 5.1 ValidationReport Type

```typescript
interface ValidationReport {
  id: string                          // UUID, cached in Redis
  companyId: string
  jobType: JobType
  generatedAt: string                 // ISO timestamp
  summary: {
    totalSuppliers: number
    readySuppliers: number
    warningSuppliers: number
    errorSuppliers: number
    totalBills: number
    totalValue: number                // sum of all PayAmounts
    canProceed: boolean               // true if zero errors
  }
  suppliers: SupplierValidation[]
}

interface SupplierValidation {
  supplierName: string
  xeroContactId: string | null
  xeroContactMatchType: 'exact' | 'fuzzy' | 'none'
  xeroContactMatchScore: number       // 0-100 fuzzy match score
  overpayment: {
    paymentDate: string
    amount: number
    bankAccount: string
    xeroOverpaymentId: string | null  // null if needs to be created
    xeroRemainingCredit: number | null
  }
  bills: BillValidation[]
  balanceCheck: {
    billsTotal: number                // SUM(bills.payAmount)
    overpaymentAmount: number
    difference: number                // abs < 0.01 = pass
    pass: boolean
  }
  status: 'ready' | 'warning' | 'error'
  issues: ValidationIssue[]
}

interface BillValidation {
  rowIndex: number
  supplierName: string
  invoiceRef: string
  invoiceDate: string
  payAmount: number
  xeroInvoiceId: string | null
  xeroInvoiceStatus: string | null    // AUTHORISED, PAID, VOIDED, etc.
  xeroAmountDue: number | null
  amountMismatch: boolean             // abs(payAmount - xeroAmountDue) > 0.01
  alreadyAllocated: boolean           // exists in xero overpayment.Allocations
  status: 'ready' | 'warning' | 'error' | 'skip'
  issues: ValidationIssue[]
}

interface ValidationIssue {
  code: ValidationIssueCode
  message: string
  severity: 'error' | 'warning'
  field?: string
  value?: unknown
}

type ValidationIssueCode =
  // Errors (hard blocks)
  | 'BALANCE_MISMATCH'               // SUM(bills) != overpayment amount (>$0.01)
  | 'INVOICE_NOT_FOUND_IN_XERO'     // no matching invoice in Xero
  | 'INVOICE_WRONG_STATUS'           // not AUTHORISED (PAID, VOIDED, DELETED)
  | 'INVOICE_WRONG_TYPE'             // not ACCPAY
  | 'SUPPLIER_NOT_FOUND_IN_XERO'    // no contact match
  | 'OVERPAYMENT_EXHAUSTED'          // RemainingCredit == 0
  | 'DUPLICATE_REF_IN_FILE'          // same InvoiceReference appears twice
  | 'INVALID_DATE'                   // date could not be parsed
  | 'INVALID_AMOUNT'                 // amount is not a valid number
  // Warnings (soft blocks — require acknowledgement)
  | 'NEGATIVE_AMOUNT'               // PayAmount < 0
  | 'AMOUNT_MISMATCH_WITH_XERO'     // payAmount != xero.AmountDue (>$0.01)
  | 'ALREADY_ALLOCATED'             // bill already has this overpayment allocated
  | 'SUPPLIER_FUZZY_MATCH'          // name matched with <100% confidence
  | 'OVERPAYMENT_UNDERFILLED'       // sum < overpayment (partial allocation)
  | 'ZERO_AMOUNT'                   // PayAmount == 0
  | 'INVOICE_HAS_CREDIT_NOTE'       // invoice already has a credit note attached
  | 'FUTURE_PAYMENT_DATE'           // PaymentDate is in the future
```

### 5.2 Validation Execution Flow

```typescript
// validation.service.ts

class ValidationService {
  async validate(params: ValidateParams): Promise<ValidationReport> {
    const { companyId, jobType, overpayments, bills } = params

    // Step 1: Check Redis cache
    const cacheKey = this.buildCacheKey(companyId, bills)
    const cached = await redis.get(cacheKey)
    if (cached) return JSON.parse(cached)

    // Step 2: Group bills by supplier
    const grouped = this.groupBySupplier(overpayments, bills)

    // Step 3: Batch-fetch ALL invoices from Xero in one pass
    // NOT one-by-one — batch by InvoiceNumber in groups of 100
    const allInvoiceRefs = bills.map(b => b.invoiceReference)
    const xeroInvoices = await this.batchFetchInvoices(companyId, allInvoiceRefs)

    // Step 4: Fetch all contacts for supplier matching
    const xeroContacts = await this.fetchContacts(companyId)

    // Step 5: Validate each supplier group
    const supplierValidations = await Promise.all(
      grouped.map(g => this.validateSupplier(g, xeroInvoices, xeroContacts))
    )

    // Step 6: Build report
    const report = this.buildReport(supplierValidations)

    // Step 7: Cache for 10 minutes
    await redis.setex(cacheKey, 600, JSON.stringify(report))

    return report
  }

  private async batchFetchInvoices(
    companyId: string,
    refs: string[]
  ): Promise<Map<string, XeroInvoice>> {
    // Xero allows: where InvoiceNumber IN ["A","B","C"] (not documented but works)
    // Batch size 100 to stay under URL length limits
    const batches = chunk(dedupe(refs), 100)
    const results = new Map<string, XeroInvoice>()

    for (const batch of batches) {
      const whereClause = `Type=="ACCPAY" && Status!="DELETED" && (${
        batch.map(ref => `InvoiceNumber=="${ref}"`).join(' OR ')
      })`
      const invoices = await xeroClient.invoices.list(companyId, { where: whereClause })
      invoices.forEach(inv => results.set(inv.InvoiceNumber, inv))
      await sleep(500) // 500ms between batch calls — stay under 60/min
    }

    return results
  }
}
```

### 5.3 Float Precision Rules

Peter's actual data has float issues: `6575.0199999999995` instead of `6575.02`.

```typescript
// financialMath.ts

// Rule 1: All comparisons use tolerance
export const amountsMatch = (a: number, b: number, tolerance = 0.01): boolean =>
  Math.abs(a - b) < tolerance

// Rule 2: All storage uses rounded values
export const roundCurrency = (n: number): number => Math.round(n * 100) / 100

// Rule 3: Display always uses toFixed(2)
export const formatAmount = (n: number): string => roundCurrency(n).toFixed(2)

// Rule 4: Never add floats directly — accumulate in cents
export const sumAmounts = (amounts: number[]): number => {
  const cents = amounts.reduce((sum, a) => sum + Math.round(a * 100), 0)
  return cents / 100
}
// → sumAmounts([6575.0199999999995]) === 6575.02 ✓
```

---

## 6. Worker Handlers — Hardened Implementation

### 6.1 Overpayment Allocation Handler (rewrite of existing)

```typescript
// handlers/overpaymentAllocation.handler.ts

export const handleOverpaymentAllocation = async (
  jobId: string,
  logger: Logger
): Promise<void> => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { items: true, company: { include: { xeroConnections: true } } }
  })
  if (!job) throw new Error(`Job ${jobId} not found`)

  await prisma.job.update({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date() } })

  for (const item of job.items) {
    await processAllocationItem(job, item, logger)
  }

  // Final job status
  const counts = await prisma.jobItem.groupBy({
    by: ['status'], where: { jobId }, _count: true
  })
  const processed = counts.find(c => c.status === 'PROCESSED')?._count ?? 0
  const skipped   = counts.find(c => c.status === 'SKIPPED')?._count ?? 0
  const failed    = counts.find(c => c.status === 'FAILED')?._count ?? 0

  const finalStatus = failed > 0 && processed === 0 ? 'FAILED'
    : failed > 0 || skipped > 0 ? 'PARTIAL'
    : 'COMPLETED'

  await prisma.job.update({
    where: { id: jobId },
    data: { status: finalStatus, completedAt: new Date(),
            processedCount: processed, skippedCount: skipped, failedCount: failed }
  })
}

const processAllocationItem = async (
  job: Job, item: JobItem, logger: Logger
): Promise<void> => {
  const itemLog = logger.child({ itemId: item.id, invoiceRef: item.invoiceRef })

  // ── Step 1: Idempotency check ──────────────────────────────────────────────
  const idempKey = generateIdempotencyKey(job.id, item.id, 'ALLOCATE')
  const idempCheck = await checkIdempotency(idempKey)
  if (idempCheck.alreadyProcessed) {
    itemLog.info('Skipping — already processed (idempotency)')
    return
  }

  // ── Step 2: Re-verify overpayment still has credit ────────────────────────
  const overpayment = await xeroClient.overpayments.get(
    job.company.xeroConnections[0].tenantId, item.xeroOverpaymentId
  )
  if (!overpayment || overpayment.RemainingCredit <= 0) {
    await markItemSkipped(item.id, 'Overpayment has no remaining credit', itemLog)
    return
  }

  // ── Step 3: Re-verify invoice is still AUTHORISED ─────────────────────────
  const invoice = await xeroClient.invoices.get(
    job.company.xeroConnections[0].tenantId, item.xeroInvoiceId
  )
  if (!invoice || invoice.Status !== 'AUTHORISED') {
    await markItemSkipped(item.id, `Invoice is ${invoice?.Status ?? 'not found'}`, itemLog)
    return
  }

  // ── Step 4: Check not already allocated (double-check at execution time) ──
  const alreadyAllocated = overpayment.Allocations?.some(
    a => a.Invoice?.InvoiceNumber === item.invoiceRef
  )
  if (alreadyAllocated) {
    await markItemSkipped(item.id, 'Already allocated — skipping to prevent duplicate', itemLog)
    return
  }

  // ── Step 5: Build payload ──────────────────────────────────────────────────
  const allocateAmount = Math.min(
    roundCurrency(item.payAmount),
    roundCurrency(overpayment.RemainingCredit),
    roundCurrency(invoice.AmountDue)
  )
  const payload = {
    Allocations: [{
      Invoice: { InvoiceID: invoice.InvoiceID },
      Amount: allocateAmount,
      Date: new Date().toISOString().split('T')[0]
    }]
  }

  // ── Step 6: Call Xero ──────────────────────────────────────────────────────
  let xeroResponse: unknown
  try {
    xeroResponse = await xeroClient.overpayments.allocate(
      job.company.xeroConnections[0].tenantId,
      item.xeroOverpaymentId,
      payload
    )
  } catch (err) {
    const errMsg = extractXeroError(err)
    await markItemFailed(item.id, errMsg, payload, err, itemLog)
    await recordIdempotency(idempKey, { status: 'FAILED', error: errMsg })
    return
  }

  // ── Step 7: Update DB + write audit log ───────────────────────────────────
  await prisma.jobItem.update({
    where: { id: item.id },
    data: {
      status: 'PROCESSED',
      processedAt: new Date(),
      xeroRequestPayload: payload as any,
      xeroResponsePayload: xeroResponse as any,
      idempotencyKey: idempKey
    }
  })

  await writeAuditLog({
    companyId: job.companyId,
    userId: undefined,                // worker action
    action: 'XERO_ALLOCATION_CREATED',
    resourceType: 'JobItem',
    resourceId: item.id,
    xeroRequest: payload,
    xeroResponse: xeroResponse,
  })

  await recordIdempotency(idempKey, { status: 'COMPLETED' })

  itemLog.info({ allocateAmount }, 'Allocation created successfully')

  // ── Step 8: Rate limit — 500ms between calls ──────────────────────────────
  await sleep(500)
}
```

### 6.2 Invoice Reversal Handler (rewrite of existing)

```typescript
// handlers/invoiceReversal.handler.ts
// Key corrections vs n8n workflow:

const processReversalItem = async (job, item, logger) => {
  // CRITICAL FX FIX:
  // n8n was using a form-submitted date as reversalDate
  // Our implementation: always use invoice.Date for FX neutrality
  // Unless operator explicitly overrides with acknowledgement

  const invoice = await xeroClient.invoices.getById(tenantId, item.xeroInvoiceId)

  // Use invoice date → same FX rate as original booking
  const creditNoteDate = item.reversalDateOverride ?? invoice.Date

  // Flag if override creates FX impact
  if (item.reversalDateOverride && item.reversalDateOverride !== invoice.Date) {
    logger.warn({ 
      invoiceDate: invoice.Date, 
      reversalDate: item.reversalDateOverride 
    }, 'FX IMPACT WARNING: reversal date differs from invoice date')
  }

  // Clone line items exactly — preserve account codes, tax types, tracking
  const creditNoteLineItems = invoice.LineItems.map(line => ({
    Description: `Credit reversal: ${invoice.InvoiceNumber}`,
    Quantity: line.Quantity,
    UnitAmount: line.UnitAmount,
    AccountCode: line.AccountCode,
    TaxType: line.TaxType,
    Tracking: line.Tracking ?? [],
  }))

  const creditNotePayload = {
    CreditNotes: [{
      Type: 'ACCPAYCREDIT',
      Contact: { ContactID: invoice.Contact.ContactID },
      Date: creditNoteDate,             // ← Original invoice date
      CurrencyCode: invoice.CurrencyCode,
      CurrencyRate: invoice.CurrencyRate, // ← Lock original rate
      LineAmountTypes: invoice.LineAmountTypes,
      Status: 'AUTHORISED',
      CreditNoteNumber: `CN-${invoice.InvoiceNumber}`,
      Reference: `AUTO-REVERSAL | Job: ${job.id}`,
      LineItems: creditNoteLineItems,
    }]
  }

  // ... rest of idempotency, Xero call, audit log pattern (same as allocation)
}
```

---

## 7. Security Hardening

### 7.1 app.ts — Complete Hardened Setup

```typescript
import helmet from 'helmet'
import cors from 'cors'
import { rateLimit } from 'express-rate-limit'
import RedisStore from 'rate-limit-redis'
import hpp from 'hpp'
import { xssClean } from 'xss-clean'

export const createApp = () => {
  const app = express()

  // ── 1. Security headers (first middleware) ────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'"],
        imgSrc:      ["'self'", 'data:', 'https:'],
        connectSrc:  ["'self'", 'https://api.xero.com'],
        objectSrc:   ["'none'"],
        frameSrc:    ["'none'"],
        upgradeInsecureRequests: [],
      }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }))

  // ── 2. CORS — allowlist only ──────────────────────────────────────────────
  app.use(cors({
    origin: (origin, callback) => {
      const allowed = env.CORS_ORIGIN.split(',').map(o => o.trim())
      if (!origin || allowed.includes(origin)) return callback(null, true)
      callback(new Error(`CORS: ${origin} not allowed`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }))

  // ── 3. Request ID ─────────────────────────────────────────────────────────
  app.use(requestId())

  // ── 4. Body parsing with limits ───────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))

  // ── 5. HTTP Parameter Pollution protection ────────────────────────────────
  app.use(hpp())

  // ── 6. XSS sanitization ───────────────────────────────────────────────────
  app.use(xssClean())

  // ── 7. Rate limiting (Redis-backed for multi-instance) ────────────────────
  const redisStore = new RedisStore({ sendCommand: (...args) => redis.call(...args) })

  // Global: 300 req/min per IP
  app.use(rateLimit({
    windowMs: 60_000, max: 300,
    standardHeaders: true, legacyHeaders: false,
    store: redisStore,
    keyGenerator: (req) => req.ip ?? 'unknown',
  }))

  // Auth endpoints: 20 req/15min per IP
  app.use('/api/v1/auth', rateLimit({
    windowMs: 15 * 60_000, max: 20, store: redisStore
  }))

  // Excel upload: 10 req/hour per user (heavy operation)
  app.use('/api/v1/excel/upload', rateLimit({
    windowMs: 60 * 60_000, max: 10, store: redisStore,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip
  }))

  // Validation: 30 req/hour per user (hits Xero API)
  app.use('/api/v1/validation', rateLimit({
    windowMs: 60 * 60_000, max: 30, store: redisStore,
    keyGenerator: (req) => (req as AuthenticatedRequest).user?.id ?? req.ip
  }))

  // ── 8. Routes ─────────────────────────────────────────────────────────────
  app.use('/api/v1/auth',        authRoutes)
  app.use('/api/v1/users',       authenticate, userRoutes)
  app.use('/api/v1/companies',   authenticate, companyRoutes)
  app.use('/api/v1/jobs',        authenticate, jobRoutes)
  app.use('/api/v1/xero',        authenticate, xeroRoutes)
  app.use('/api/v1/excel',       authenticate, authorize('OPERATOR','APPROVER','ADMIN'), excelRoutes)
  app.use('/api/v1/validation',  authenticate, authorize('OPERATOR','APPROVER','ADMIN'), validationRoutes)
  app.use('/api/v1/field-mappings', authenticate, fieldMappingRoutes)
  app.use('/api/v1/audit',       authenticate, authorize('ADMIN'), auditRoutes)

  // ── 9. Health (no auth — for load balancer / ECS health checks) ──────────
  app.get('/health', (_req, res) => res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }))

  app.get('/health/deep', authenticate, async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then(r => r === 'PONG').catch(() => false)
    ])
    res.json({ db: dbOk, redis: redisOk, xero: 'not-checked' })
  })

  // ── 10. Global error handler (always last) ────────────────────────────────
  app.use(errorHandler)

  return app
}
```

### 7.2 Environment Variables (complete .env.example)

```bash
# Server
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/reconix

# Redis
REDIS_URL=redis://localhost:6379

# JWT (RS256 — generate with: openssl genrsa -out private.pem 2048)
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Encryption (32 bytes hex — generate with: openssl rand -hex 32)
ENCRYPTION_KEY=your_64_char_hex_string_here

# CORS (comma-separated)
CORS_ORIGIN=http://localhost:5173,https://app.reconix.io

# Xero OAuth2
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=http://localhost:3000/api/v1/xero/callback
XERO_SCOPES=openid profile email accounting.transactions accounting.contacts offline_access

# AWS (production only — use IAM role in ECS, not keys)
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=           # local dev only
AWS_SECRET_ACCESS_KEY=       # local dev only
S3_BUCKET=reconix-uploads-prod

# Feature flags
MFA_REQUIRED=false           # set true in production
```

---

## 8. Observability

### 8.1 Structured Logging Convention

```typescript
// Every log entry includes:
// { level, time, requestId, companyId?, userId?, msg, ...context }

// Request log (auto via middleware):
logger.info({ method, url, statusCode, durationMs, requestId }, 'HTTP request')

// Business operation:
logger.info({ jobId, itemId, invoiceRef, allocateAmount }, 'Allocation created')

// Xero API call:
logger.info({ tenantId, endpoint, statusCode, durationMs }, 'Xero API call')

// Error (with full context, no PII):
logger.error({ err, jobId, itemId, xeroErrorCode }, 'Xero API error')

// NEVER log:
// - Access tokens or refresh tokens
// - Full Xero request/response bodies at INFO level (use DEBUG only)
// - User passwords, MFA secrets
// - Invoice amounts in error messages (use IDs)
```

### 8.2 Health Check Endpoints

```
GET /health          → { status: 'ok', uptime, timestamp }
                       Used by: ECS health check, load balancer
                       Auth: none

GET /health/deep     → { db: bool, redis: bool, xero: 'not-checked' }
                       Used by: monitoring dashboards
                       Auth: JWT (any role)

GET /metrics         → Prometheus-format metrics (if using prom-client)
                       Used by: Datadog agent, CloudWatch
                       Auth: internal network only (not exposed publicly)
```

### 8.3 Key Metrics to Track

```
// Business metrics
reconix_jobs_created_total{type, company}
reconix_jobs_completed_total{type, status, company}
reconix_job_items_processed_total{type, status}
reconix_xero_api_calls_total{endpoint, status_code}
reconix_xero_api_duration_ms{endpoint} (histogram)
reconix_excel_uploads_total{company}
reconix_validation_duration_ms (histogram)

// Infrastructure metrics
reconix_http_request_duration_ms{method, route, status} (histogram)
reconix_bullmq_queue_size{queue}
reconix_bullmq_failed_jobs_total{queue}
reconix_db_query_duration_ms (histogram)
```

---

## 9. Error Handling Patterns

### 9.1 AppError Hierarchy

```typescript
// Base
AppError(code, statusCode, message, details?)

// HTTP errors
NotFoundError(resource, id)          → 404
ConflictError(message)               → 409
ForbiddenError(message?)             → 403
UnauthorizedError(message?)          → 401
ValidationError(errors)              → 400
RateLimitError()                     → 429

// Business errors  
JobNotPendingError(jobId, status)    → 409 "Job is in RUNNING status, cannot modify"
SelfApprovalError()                  → 403 "Creator cannot approve their own job"
XeroNotConnectedError(companyId)     → 422 "No Xero connection found for company"
InsufficientOverpaymentError()       → 422 "Overpayment has insufficient remaining credit"
DuplicateInvoiceRefError(refs)       → 422 "Duplicate invoice references in upload"

// Xero errors (wrap Xero API errors)
XeroApiError(statusCode, xeroCode, message, requestPayload)
XeroRateLimitError()                 → triggers automatic retry with backoff
XeroTokenExpiredError()              → triggers automatic token refresh
```

### 9.2 Global Error Handler Response Shape

```typescript
// ALL error responses use this exact shape — no exceptions:
{
  success: false,
  code: string,           // machine-readable: 'NOT_FOUND', 'VALIDATION_ERROR'
  message: string,        // human-readable, safe to show in UI
  errors?: Record<string, string[]>,  // field-level errors for 400s
  requestId: string       // for support/debugging
  // NEVER include: stack, internal IDs, SQL, Xero raw response
}

// ALL success responses:
{
  success: true,
  data: T,
  meta?: {              // for paginated responses
    total: number,
    page: number,
    limit: number,
    hasMore: boolean
  }
}
```

---

## 10. Testing Strategy

### 10.1 Test Structure

```
tests/
├── unit/
│   ├── dates.test.ts             # parseFlexibleDate — all formats including serials
│   ├── financialMath.test.ts     # sumAmounts, amountsMatch — float precision
│   ├── validation.test.ts        # ValidationEngine with mocked Xero responses
│   ├── idempotency.test.ts       # checkIdempotency, recordIdempotency
│   └── excelParser.test.ts       # Sheet auto-detection, column alias mapping
│
├── integration/
│   ├── auth.test.ts              # Login, refresh, MFA flow
│   ├── jobs.test.ts              # Job CRUD, approve, four-eyes check
│   ├── excel.test.ts             # Upload, parse, field mapping
│   ├── validation.test.ts        # Full validation with test DB + Xero mocks
│   └── audit.test.ts             # Audit log writes and queries
│
└── fixtures/
    ├── Q4_sample.xlsx            # Anonymised version of Peter's file
    ├── wrongColumns.xlsx         # File needing field mapper
    └── duplicateRefs.xlsx        # File with duplicate invoice refs
```

### 10.2 Critical Test Cases (must have 100% coverage)

```typescript
// dates.test.ts
describe('parseFlexibleDate', () => {
  it('parses Excel serial 45874 → 2025-08-05')
  it('parses ISO string 2025-08-05')
  it('parses DD/MM/YYYY string 05/08/2025')
  it('parses DD-Mon-YY string 05-Aug-25')
  it('parses DD Mon YYYY string 05 August 2025')
  it('returns null for null input')
  it('returns null for unparseable string')
  it('handles Python datetime object (from openpyxl)')
})

// financialMath.test.ts  
describe('sumAmounts', () => {
  it('6575.0199999999995 rounds to 6575.02')
  it('sum of bills matches overpayment within tolerance')
  it('negative amounts handled correctly')
})

// validation.test.ts
describe('ValidationEngine', () => {
  it('passes when bills sum exactly equals overpayment')
  it('passes with 0.009 difference (within tolerance)')
  it('errors when bills sum differs by more than 0.01')
  it('errors when invoice not found in Xero')
  it('errors when invoice status is PAID')
  it('warns on negative PayAmount row')
  it('errors on duplicate invoice ref in file')
  it('warns on fuzzy supplier name match')
  it('skips already-allocated bills')
  it('uses batch Xero fetching not individual calls')
})

// jobs.test.ts
describe('Job approval', () => {
  it('blocks creator from approving their own job')
  it('allows APPROVER to approve another user\'s job')
  it('blocks OPERATOR from approving any job')
  it('writes audit log entry on approval')
})
```

### 10.3 Test Coverage Gates

```
# jest.config.ts
coverageThreshold: {
  global: {
    lines: 85,
    branches: 80,
    functions: 85,
  },
  // 100% required on critical business logic:
  './src/workers/handlers/**': { lines: 100, branches: 100 },
  './src/modules/validation/**': { lines: 100, branches: 95 },
  './src/utils/financialMath.ts': { lines: 100, branches: 100 },
  './src/utils/dates.ts': { lines: 100, branches: 100 },
}
```

---

## 11. Docker & Local Development

### 11.1 Dockerfile (multi-stage, hardened)

```dockerfile
# ── Stage 1: Dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ── Stage 2: Build ────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: Runtime (minimal attack surface) ─────────────────────
FROM node:20-alpine AS runtime

# Security: non-root user
RUN addgroup -g 1001 -S appgroup \
 && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Only copy what's needed
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/prisma       ./prisma

# Security: no write access to app files
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

### 11.2 docker-compose.yml (local dev)

```yaml
version: '3.9'
services:
  api:
    build: .
    ports: ["3000:3000"]
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://reconix:reconix@postgres:5432/reconix
      REDIS_URL: redis://redis:6379
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    volumes:
      - ./src:/app/src   # hot reload in dev

  worker:
    build: .
    command: ["node", "dist/workers/index.js"]
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://reconix:reconix@postgres:5432/reconix
      REDIS_URL: redis://redis:6379
    env_file: .env
    depends_on: [postgres, redis, api]

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: reconix
      POSTGRES_PASSWORD: reconix
      POSTGRES_DB: reconix
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reconix"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --save 60 1 --loglevel warning
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

---

## 12. CI/CD Pipeline

### 12.1 GitHub Actions — CI (ci.yml)

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_DB: reconix_test, POSTGRES_PASSWORD: test }
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run type-check

      - name: Lint
        run: npm run lint

      - name: Generate Prisma client
        run: npm run db:generate

      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/reconix_test

      - name: Run tests with coverage
        run: npm run test:coverage
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://postgres:test@localhost:5432/reconix_test
          REDIS_URL: redis://localhost:6379
          JWT_PRIVATE_KEY: ${{ secrets.TEST_JWT_PRIVATE_KEY }}
          JWT_PUBLIC_KEY: ${{ secrets.TEST_JWT_PUBLIC_KEY }}
          ENCRYPTION_KEY: ${{ secrets.TEST_ENCRYPTION_KEY }}

      - name: Coverage gate (85% minimum)
        run: |
          LINES=$(node -e "
            const r = require('./coverage/coverage-summary.json');
            console.log(r.total.lines.pct)
          ")
          echo "Line coverage: $LINES%"
          node -e "if (parseFloat('$LINES') < 85) { console.error('Coverage below 85%'); process.exit(1) }"

      - name: Build
        run: npm run build

      - name: Security audit
        run: npm audit --audit-level=high
```

### 12.2 GitHub Actions — Deploy (deploy.yml)

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []   # CI must pass first (branch protection rule)
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1

      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        run: |
          IMAGE=${{ secrets.ECR_REGISTRY }}/reconix-backend:${{ github.sha }}
          docker build -t $IMAGE .
          docker push $IMAGE
          echo "IMAGE=$IMAGE" >> $GITHUB_ENV

      - name: Run DB migrations
        run: |
          # Run migrations via ECS one-off task before deploy
          aws ecs run-task \
            --cluster reconix-prod \
            --task-definition reconix-migrate \
            --overrides '{"containerOverrides":[{"name":"migrate","command":["npx","prisma","migrate","deploy"]}]}' \
            --wait

      - name: Deploy API service
        run: |
          aws ecs update-service \
            --cluster reconix-prod \
            --service reconix-api \
            --force-new-deployment \
            --task-definition reconix-api

      - name: Deploy Worker service
        run: |
          aws ecs update-service \
            --cluster reconix-prod \
            --service reconix-worker \
            --force-new-deployment \
            --task-definition reconix-worker

      - name: Wait for stability
        run: |
          aws ecs wait services-stable \
            --cluster reconix-prod \
            --services reconix-api reconix-worker

      - name: Smoke test
        run: |
          curl -f https://api.reconix.io/health || exit 1
```

---

## 13. Phase 4 Build Order

Given the existing codebase, this is the recommended sequence to avoid
rework and unblock the frontend at each step:

```
Week 1:
  Day 1-2:  financialMath.ts + dates.ts utilities + full unit tests
            (these are foundational — everything else depends on them)
  Day 3-4:  Excel module (upload to S3, sheet auto-detection, parsing)
  Day 5:    Field mapping templates (CRUD + save/apply)

Week 2:
  Day 1-3:  Validation Engine (the biggest piece — batch Xero fetching,
            all validation rules, ValidationReport type)
  Day 4-5:  Wire validation into Job creation flow
            (POST /jobs now requires a validationId or inline data)

Week 3:
  Day 1-2:  Harden existing worker handlers (idempotency, audit log,
            four-eyes on approve, FX fix in reversal handler)
  Day 3-4:  Audit log module (append-only writes, query API, export)
  Day 5:    MFA (TOTP setup, verify, login flow modification)

Week 4:
  Day 1-2:  app.ts security hardening (Helmet, rate limiting, HPP, XSS)
  Day 3:    Docker + docker-compose + CI/CD pipeline
  Day 4-5:  Integration tests for all new modules
            Coverage gate enforcement
```

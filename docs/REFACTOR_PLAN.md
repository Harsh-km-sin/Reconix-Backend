# Reconix Refactor Plan — Modularity, Component Library & Structure

> **Goal:** a single source of truth for UI, types, and structure — change one place,
> it applies everywhere. Smaller bundles are an *outcome*, not the objective.

**Branches**
- Backend: `feat/code_refractor`
- Frontend: `feat/ui_ux_enhancements`

**Ground rules**
1. **Single source of truth** — design tokens, types, components, formatters.
2. **Moves ≠ edits.** The restructure lands as a pure `git mv` commit so the diff is
   reviewable and `git log --follow` still works.
3. **Guardrails over conventions.** ESLint enforces structure; conventions rot
   (see `AuthenticatedRequest` copy-pasted 11×).
4. **Never mix repos** in one commit.
5. **Gate every phase:** `tsc --noEmit` + `npm run build` green → commit.

---

## 1. Audit findings (why this plan exists)

Measured on the current `main` of both repos.

| Signal | Count |
|---|---|
| Frontend files importing `@/components/ui/*` | **2 of 17** — the 54-primitive shadcn layer is effectively unused |
| Hand-rolled raw `<table>` | **7** |
| Hand-rolled modal overlays (`dialog.tsx` unused) | **3** |
| Status badges, each with its own colour map | **12** across 5 files |
| `animate-spin` loading spinners | **28** |
| Pagination reimplemented | 2 pages (AuditLog, JobHistory) |
| Currency formatting reimplemented | 4 files |
| **Hardcoded hex colours** | **1,060** — while `index.css` already defines the full token set |
| Types declared inside frontend **pages** | **7** (should be 0) |
| Types declared inside frontend components / services | 6 / 11 (incl. `ListResponse<T>` declared **twice**) |
| `AuthenticatedRequest` re-declared in backend controllers | **11×**, identical |
| Largest files | `JobHistory.tsx` 827 · `ConnectedCompanies.tsx` 563 · `Settings.tsx` 498 · `Layout.tsx` 406 |

**Two things that are already true and just unused:**
- `index.css` defines `--xero-blue`, `--error-red`, `--text-dark`, … and `--primary: 195 83% 50%` **is** `#13B5EA`.
  The tokens exist; `tailwind.config.js` simply never exposes them as utilities.
- The backend `excel` module already exposes `POST /excel/upload` (multer, 25 MB) and
  `GET /excel/:uploadId/metadata` — the frontend duplicates this with a client-side `xlsx` import.

**On bundle size (important):** unused `ui/*.tsx` files cost **0 bytes** — Rollup only bundles
what's reachable from the entry. Deduplicating JSX is a *maintainability* win. The real chunk
drivers are the static `xlsx` import in `JobUploadBuilder.tsx` and **zero route code-splitting**
(`lazy`/`Suspense` count in `App.tsx` = 0).

---

## 2. Target structure

### Frontend
```
src/
├── ui_library/                 # reusable + domain-agnostic. MUST NOT import from modules/
│   ├── primitives/             # the 54 shadcn files (from components/ui)
│   ├── components/             # DataTable, Modal, PageHeader, StatusBadge, StatCard,
│   │                           # ActionCard, SearchInput, DatePicker, DateRangePicker,
│   │                           # FilterBar, Pagination, FormField, ConfirmDialog,
│   │                           # DetailList, Money
│   ├── feedback/               # ErrorState, EmptyState, LoadingState, Skeleton, ToastContainer
│   ├── hooks/                  # useDebounce, usePolling, useTableState, useMobile
│   └── index.ts                # barrel (side-effect free)
│
├── modules/                    # one folder per feature; mirrors the backend modules
│   ├── auth/       pages/{Login,Register,SetPassword}  components/MFALoginChallenge
│   │               services/  hooks/useAuth  types.ts
│   ├── dashboard/  pages/Dashboard
│   ├── jobs/       pages/{JobHistory,JobBuilderSelection,JobUploadBuilder,JobManualBuilder}
│   │               components/{JobReviewScreen,ExcelColumnMapper,JobDetailModal}
│   │               services/{jobService,validationService}  types.ts
│   ├── xero/       pages/ConnectedCompanies  components/{SyncModal,SyncLogsModal}
│   │               services/xeroService  types.ts
│   ├── rbac/       pages/RolesPermissions  services/roleService  types.ts
│   ├── audit/      pages/AuditLog  services/auditService  types.ts
│   └── settings/   pages/Settings  types.ts
│
├── app/            App.tsx  routes.tsx  navigation.ts
│                   layout/{Layout,Sidebar,Topbar,CompanySwitcher,UserMenu,NotificationsMenu}
│
├── lib/            api  errors  format  status  permissions  utils  types/api.ts
├── store/  types/  constants/
```

**Dependency direction:** `modules → ui_library → primitives`, and `modules → lib`. Never backwards.

### Backend (unchanged shape, tightened types)
```
src/
├── modules/<feature>/  *.controller.ts  *.service.ts  *.routes.ts  *.interface.ts  *.validation.ts
├── middlewares/  jobs/  config/  utils/
└── types/        express.ts (shared AuthenticatedRequest), api.types.ts, permissions.ts
```

---

## 3. Conventions

### Types
```
modules/<feature>/types.ts     # domain models, API DTOs, filter/state shapes, page props
ui_library/<Component>/
      index.tsx
      <Component>.types.ts     # that component's props
lib/types/api.ts               # ApiResponse<T>, ListResponse<T>, Paginated<T>
```
- **Pages declare zero types.** They import from their module's `types.ts`.
- **Services declare zero types.** DTOs live in `types.ts`; shared envelopes in `lib/types/api.ts`.
- **Backend:** keep the `*.interface.ts` convention per module; one shared
  `src/types/express.ts` for `AuthenticatedRequest`.

**Allowed exceptions**
1. `z.infer<typeof schema>` stays beside its Zod schema (moving it creates a circular import).
2. Private, **non-exported** implementation types (e.g. a cache entry) may stay local.
   Anything exported, or representing a domain/API shape, moves.

### Enforcement (so it can't rot)
- ESLint: ban `TSInterfaceDeclaration` / `TSTypeAliasDeclaration` in `**/pages/**` and `**/*.controller.ts`.
- ESLint: forbid imports from `modules/**` inside `ui_library/**`.
- Both fail CI.

---

## 4. Track A — Frontend (`feat/ui_ux_enhancements`)

| Phase | Work | Size |
|---|---|---|
| **F0** | **Unblock build.** Remove invalid `ignoreDeprecations: "6.0"` from `tsconfig.app.json` (TS 5.9 rejects it); delete `Settings.tsx` dead code (27 unused-var errors from a never-rendered invite modal); add `rollup-plugin-visualizer` and capture a **baseline bundle**. | S |
| **F1** | **Restructure** — pure `git mv` into the tree above. Zero logic change; only import paths. `lib/nav.ts` *splits*: `navItems` → `app/navigation.ts`, `jobBuilderPath`/`parseJobType` → `modules/jobs`. | L |
| **F2** | **Types consolidation + guardrails.** Move 7 page types, 6 component types, 11 service DTOs into module `types.ts`. Dedupe `ListResponse<T>`. Add the two ESLint rules. | M |
| **F3** | **Design tokens.** Expose the existing CSS vars as semantic Tailwind utilities (`brand`, `ink`, `line`, `surface`, `page`, `success/warning/danger` + `-light`). Codemod the 1,060 hexes. Align shadcn `--primary` to brand. | M |
| **F4** | `lib/format.ts` (currency, date, datetime, duration, shortId) · `lib/status.ts` (one `status → {label,tone}` map for all 5 status kinds) · hooks `useDebounce`, `usePolling`, `useTableState`. | S |
| **F5** | Feedback family (`EmptyState`, `LoadingState`, `Skeleton` alongside existing `ErrorState`) → replaces 28 spinners + ad-hoc empties. Plus `Modal` (wraps `primitives/dialog`), `PageHeader`, `ConfirmDialog`, `Tabs`. | M |
| **F6** | **`DataTable`** ⭐ — columns`<T>`, `rowKey`, sort, **server *and* client pagination**, search, sticky header, h-scroll, row click, loading/empty/error slots. Migrate all 7 tables. | L |
| **F7** | Inputs & cards: `SearchInput` (debounced), `Select`, `DatePicker`, `DateRangePicker`, `FilterBar`, `Pagination`, `FormField`, `StatCard`, `ActionCard`, `StatusBadge`, `Money`, `DetailList`. Decompose `Layout` (406 LOC). | L |
| **F8** | **Chunk size.** Drop client-side `xlsx` in favour of the backend excel API; route-level `React.lazy` + `Suspense`; remove unused deps (`recharts`; `papaparse` moves server-side). Re-run visualizer, report before/after. | M |

### Tables to migrate in F6
`AuditLog.tsx:131` · `Dashboard.tsx:289` · `JobHistory.tsx:308` and `:600` ·
`JobManualBuilder.tsx:283` · `JobReviewScreen.tsx:297` · `SyncLogsModal.tsx:118`

### Not extracting (deliberate)
`Login`, `Register`, `SetPassword`, `MFALoginChallenge`, `JobBuilderSelection` — single-use
screens. Abstracting them buys nothing and adds indirection.

---

## 5. Track B — Backend (`feat/code_refractor`)

| Phase | Work | Size |
|---|---|---|
| **B1** | **Types consolidation + guardrail.** `src/types/express.ts` → one `AuthenticatedRequest`, delete 11 copies. Move into `*.interface.ts`: `RoleWithPermissions`, `ValidationItem`/`ValidationReport`, `RoleWithCompany`/`SessionContext`/`MfaPendingClaims`, `CreateAuditLogParams`, `UserContext`, `XeroInvoiceRawJson`. ESLint: no type declarations in `*.controller.ts`. | M |
| **B2** | **Excel contract** (unblocks F8). Confirm/extend `POST /excel/upload` + `GET /excel/:uploadId/metadata` to return sheets, parsed rows and header detection. Add `papaparse` **server-side** for CSV. Document in `openapi/spec.ts`. | S |
| **B3** | **Housekeeping.** `openapi/spec.ts` still documents the removed `Role` enum and only 4 endpoints — refresh for `roleId` plus `/permissions`, `/roles`, `/xero/sync/history`. Remove dead `PARTIAL_SYNC`. `syncTaxRates` is an empty stub — implement or delete. | S |

---

## 6. Sequencing

```
B1 ───────────────┐                         (parallel: different repo)
F0 → F1 → F2 → F3 → F4 → F5 → F6 → F7 ──┐
                                 B2 ─────┴→ F8 → B3
```
Start with **F0 + B1**: cheap, independent, in different repos, and they unblock everything.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| F1 touches every import | One atomic, pure-move commit; `tsc` gate; no interleaved edits |
| F3 codemod across 1,060 hexes | Review **by class name**, not by file; skip inline SVG/gradients |
| **F6 semantics differ per table** — JobHistory is *server*-paginated, JobReviewScreen is *client*-side | Support both modes in `DataTable` from day one |
| F8 changes upload UX (network round-trip) | Upload progress + `ErrorState` on failure |
| Barrel exports can hurt HMR / tree-shaking | Keep `ui_library/index.ts` side-effect-free; allow deep imports in hot paths |

---

## 8. Verification gate (every phase)

```bash
# backend
npx tsc --noEmit

# frontend  (after F0 the --ignoreDeprecations workaround is no longer needed)
npx tsc --noEmit -p tsconfig.app.json
npm run build
```
One commit per phase, per repo. Prefix: `refactor(fe):` / `refactor(be):`.

---

## 9. Progress

- [ ] F0 · Unblock build + baseline bundle
- [ ] B1 · Backend types consolidation + ESLint guard
- [ ] F1 · Frontend restructure (pure moves)
- [ ] F2 · Frontend types consolidation + guardrails
- [ ] F3 · Design tokens
- [ ] F4 · format / status / hooks
- [ ] F5 · Feedback family + Modal + PageHeader
- [ ] F6 · DataTable + migrate 7 tables
- [ ] F7 · Inputs, cards, Layout decomposition
- [ ] B2 · Excel contract
- [ ] F8 · Drop xlsx, lazy routes, re-measure
- [ ] B3 · OpenAPI refresh + dead-code removal

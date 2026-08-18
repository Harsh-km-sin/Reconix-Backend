/**
 * OpenAPI 3.0 specification for Reconix API.
 * Structured for industry-standard API documentation and SOC2-aligned practices:
 * - Explicit authentication and security schemes
 * - Documented error responses and validation rules
 * - No sensitive data in examples; security and audit considerations noted
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Reconix API",
    description: `
API for the Reconix Xero Automation platform. All authentication endpoints use secure practices:
passwords are hashed at rest (bcrypt), tokens are JWT and must be sent in the Authorization header for protected routes.
Sensitive data (passwords, tokens) are never logged or returned in responses. API design supports
audit and access control requirements (SOC2-aligned).
    `.trim(),
    version: "1.0.0",
    contact: {
      name: "Reconix",
    },
    license: {
      name: "Proprietary",
      url: "",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "API base path (relative to host)",
    },
  ],
  tags: [
    { name: "Health", description: "Service health and readiness" },
    { name: "Authentication", description: "Login and set-password (invite flow); returns JWT for protected endpoints" },
    { name: "Users", description: "User management; admin invites users and assigns roles/companies" },
    { name: "Excel", description: "Spreadsheet upload and parsing. The server owns parsing; clients do not read files themselves." },
    { name: "RBAC", description: "Roles and the permission catalog. All endpoints require the roles:manage permission." },
    { name: "Xero", description: "Xero connection and synchronisation" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Returns service health status. All responses use envelope: success: true/false, data or error.",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/auth/set-password": {
      post: {
        tags: ["Authentication"],
        summary: "Set password from invite",
        description: "Accepts invite token from email link and sets the user's password. User can then log in. Returns JWT on success. 401 if token invalid or expired.",
        operationId: "setPassword",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SetPasswordRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Password set; returns auth payload (token, user, permissions, companies)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSuccessEnvelope" },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "401": { description: "Invalid or expired invite token", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Log in",
        description: "Authenticates with email and password. Users must have set a password via invite link first. Returns JWT with role, companyId, and permissions (module read/write). Use token in Authorization: Bearer for protected endpoints. 401 if credentials invalid or password not yet set.",
        operationId: "login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
              example: { email: "user@example.com", password: "securePassword123" },
            },
          },
        },
        responses: {
          "200": {
            description: "Authentication successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSuccessEnvelope" },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "401": { description: "Invalid email or password, or password not set (use invite link)", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/users/invite": {
      post: {
        tags: ["Users"],
        summary: "Invite a user (admin)",
        description: "Creates a user by invite: no password until they use the email link. Caller must have users:write (e.g. ADMIN). Assignments: array of { companyId, role }; can be empty. Sends invite email; user sets password via POST /auth/set-password. Returns 403 if caller lacks write permission.",
        operationId: "inviteUser",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InviteUserRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "User invited; invite email sent",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/InviteSuccessEnvelope" },
              },
            },
          },
          "400": { description: "Validation error (e.g. company not found)", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "401": { description: "Missing or invalid JWT", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "403": { description: "No permission to invite users (users:write required)", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": { description: "User with this email already exists", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/excel/upload": {
      post: {
        tags: ["Excel"],
        summary: "Upload a spreadsheet",
        description:
          "Accepts .xlsx, .xls or .csv up to 25 MB as multipart/form-data field 'file'. " +
          "The file is parsed on upload, so the response already carries the sheet list, " +
          "each sheet's headers and its row count — a client never needs to parse the file itself. " +
          "A CSV is presented as a single sheet named 'Sheet1' so clients have one code path. " +
          "Returns 400 if the file cannot be read or has no sheets.",
        operationId: "uploadSpreadsheet",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "File stored and parsed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true }, data: { $ref: "#/components/schemas/UploadMetadata" } },
                },
              },
            },
          },
          "400": { description: "No file, unreadable file, or no sheets", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "401": { description: "Missing or invalid JWT", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/excel/{uploadId}/metadata": {
      get: {
        tags: ["Excel"],
        summary: "Describe an upload",
        description: "Re-read the sheet list, headers and detected layouts for an upload. Same payload as POST /excel/upload.",
        operationId: "getUploadMetadata",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "uploadId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Upload metadata",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true }, data: { $ref: "#/components/schemas/UploadMetadata" } },
                },
              },
            },
          },
          "404": { description: "Upload not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/excel/{uploadId}/sheet/{sheetName}": {
      get: {
        tags: ["Excel"],
        summary: "Read one sheet",
        description:
          "The parsed rows of a single sheet. Each row is an object keyed by the sheet's raw header text, " +
          "so 'headers' lines up exactly with the keys in 'rows'. Empty cells are returned as \"\", not omitted. " +
          "For a CSV the sheet name is always 'Sheet1'.",
        operationId: "getSheetData",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "uploadId", in: "path", required: true, schema: { type: "string" } },
          { name: "sheetName", in: "path", required: true, schema: { type: "string" }, description: "URL-encoded sheet name." },
        ],
        responses: {
          "200": {
            description: "Sheet contents",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { success: { type: "boolean", example: true }, data: { $ref: "#/components/schemas/SheetData" } },
                },
              },
            },
          },
          "404": { description: "Upload or sheet not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/permissions": {
      get: {
        tags: ["RBAC"],
        summary: "List the permission catalog",
        description: "Every permission key that can be granted to a role. Requires roles:manage.",
        operationId: "listPermissions",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Assignable permissions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "array", items: { $ref: "#/components/schemas/PermissionDef" } },
                  },
                },
              },
            },
          },
          "403": { description: "roles:manage required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/roles": {
      get: {
        tags: ["RBAC"],
        summary: "List roles",
        description: "All roles with their resolved permission keys. Requires roles:manage.",
        operationId: "listRoles",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Roles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "array", items: { $ref: "#/components/schemas/Role" } },
                  },
                },
              },
            },
          },
          "403": { description: "roles:manage required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
      post: {
        tags: ["RBAC"],
        summary: "Create a role",
        operationId: "createRole",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "permissionKeys"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string", nullable: true },
                  permissionKeys: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Role created", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean", example: true }, data: { $ref: "#/components/schemas/Role" } } } } } },
          "403": { description: "roles:manage required", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/roles/{id}/permissions": {
      put: {
        tags: ["RBAC"],
        summary: "Replace a role's permissions",
        description:
          "Sets the role's grants to exactly this list. System roles cannot be edited. " +
          "Takes effect for a user on their next token issue (login or company switch).",
        operationId: "setRolePermissions",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["permissionKeys"],
                properties: { permissionKeys: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated role", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean", example: true }, data: { $ref: "#/components/schemas/Role" } } } } } },
          "403": { description: "roles:manage required, or role is a system role", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "404": { description: "Role not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/xero/sync/history/{tenantId}": {
      get: {
        tags: ["Xero"],
        summary: "Recent sync runs",
        description: "Sync runs for a Xero tenant, most recent first. Used by the sync log viewer.",
        operationId: "getSyncHistory",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "tenantId", in: "path", required: true, schema: { type: "string" }, description: "Xero tenant id." }],
        responses: {
          "200": {
            description: "Sync runs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { type: "array", items: { $ref: "#/components/schemas/SyncLog" } },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid JWT", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT from POST /auth/login or /auth/set-password. Contains permissions; protected routes check module read/write. Send: Authorization: Bearer <token>",
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: "object",
        required: ["success", "data"],
        properties: { success: { type: "boolean", example: true }, data: {} },
      },
      ErrorEnvelope: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: ["VALIDATION_ERROR", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR"] },
              message: { type: "string" },
            },
          },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      SetPasswordRequest: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string", description: "Invite token from email link." },
          password: { type: "string", minLength: 8, maxLength: 128 },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", description: "User email." },
          password: { type: "string", description: "User password." },
        },
      },
      AuthSuccessEnvelope: {
        type: "object",
        required: ["token", "user"],
        properties: {
          token: {
            type: "string",
            description: "JWT for Authorization header. Permissions are included as claims in the token; decode the payload to read them. Do not log or expose in client-side URLs.",
          },
          user: {
            type: "object",
            required: ["id", "email"],
            properties: {
              id: { type: "string", description: "Unique user ID." },
              email: { type: "string", format: "email" },
              name: { type: "string", nullable: true },
            },
          },
          roleId: {
            type: "string",
            description: "Id of the role active for this session. Roles are rows in the Role table, not a fixed enum.",
          },
          role: {
            type: "string",
            description:
              "Display name of the active role, e.g. \"Administrator\". For display and coarse checks only — " +
              "authorization is driven by the permissions[] claim inside the JWT, never by this string.",
          },
          companyId: {
            type: "string",
            description: "Present when user has at least one company; first role’s company.",
          },
          companies: {
            type: "array",
            items: { type: "object", properties: { companyId: { type: "string" }, companyName: { type: "string" }, role: { type: "string" } } },
            description: "Companies the user can access (for company switcher).",
          },
        },
      },
      PermissionDef: {
        type: "object",
        required: ["id", "key"],
        properties: {
          id: { type: "string" },
          key: { type: "string", description: "e.g. \"jobs:write\", \"roles:manage\"." },
          category: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
        },
      },
      Role: {
        type: "object",
        required: ["id", "name", "isSystem", "permissionKeys"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          isSystem: { type: "boolean", description: "System roles cannot be edited or deleted." },
          permissionKeys: { type: "array", items: { type: "string" } },
        },
      },
      SyncLog: {
        type: "object",
        required: ["id", "syncType", "status", "startedAt"],
        properties: {
          id: { type: "string" },
          syncType: { type: "string", enum: ["FULL", "INCREMENTAL", "CONTACTS", "INVOICES", "OVERPAYMENTS"] },
          status: { type: "string", enum: ["RUNNING", "COMPLETED", "FAILED"] },
          recordsFetched: { type: "integer", nullable: true },
          startedAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time", nullable: true },
          errorMessage: { type: "string", nullable: true },
        },
      },
      Paginated: {
        type: "object",
        required: ["items", "total", "page", "limit"],
        properties: {
          items: { type: "array", items: {} },
          total: { type: "integer" },
          page: { type: "integer" },
          limit: { type: "integer" },
          totalPages: { type: "integer" },
        },
        description: "The envelope every list endpoint returns as its data payload.",
      },
      SheetMeta: {
        type: "object",
        required: ["name", "rowCount", "headers", "normalizedHeaders", "isAutoDetected"],
        properties: {
          name: { type: "string" },
          rowCount: { type: "integer", description: "Data rows, excluding the header row." },
          headers: {
            type: "array",
            items: { type: "string" },
            description: "Header cells exactly as written in the file. These are the keys of each object in SheetData.rows.",
          },
          normalizedHeaders: {
            type: "array",
            items: { type: "string" },
            description: "Headers run through the alias table (e.g. 'Supplier Name' -> 'SupplierName'). Mapping hints only; never row keys.",
          },
          isAutoDetected: { type: "boolean", description: "True when the sheet matched a known layout." },
        },
      },
      UploadMetadata: {
        type: "object",
        required: ["uploadId", "fileName", "sizeBytes", "kind", "sheets", "autoMappings"],
        properties: {
          uploadId: { type: "string" },
          fileName: { type: "string" },
          sizeBytes: { type: "integer" },
          kind: { type: "string", enum: ["excel", "csv"] },
          sheets: { type: "array", items: { $ref: "#/components/schemas/SheetMeta" } },
          autoMappings: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Detected layout to sheet name, e.g. { bills: 'Sheet1' }.",
          },
        },
      },
      SheetData: {
        type: "object",
        required: ["sheetName", "headers", "rowCount", "rows"],
        properties: {
          sheetName: { type: "string" },
          headers: { type: "array", items: { type: "string" } },
          rowCount: { type: "integer" },
          rows: {
            type: "array",
            items: { type: "object", additionalProperties: true },
            description: "Objects keyed by raw header text.",
          },
        },
      },
      InviteUserRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string", maxLength: 100 },
          assignments: {
            type: "array",
            items: {
              type: "object",
              required: ["companyId", "roleId"],
              properties: {
                companyId: { type: "string" },
                roleId: { type: "string", description: "Id of a role from GET /roles." },
              },
            },
            default: [],
          },
        },
      },
      InviteSuccessEnvelope: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: { userId: { type: "string" }, email: { type: "string" }, inviteLink: { type: "string" } },
          },
        },
      },
    },
  },
} as const;

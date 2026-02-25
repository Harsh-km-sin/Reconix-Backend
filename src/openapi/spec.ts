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
          role: {
            type: "string",
            enum: ["ADMIN", "APPROVER", "OPERATOR"],
            description: "Present when user has at least one company role.",
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
      InviteUserRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string", maxLength: 100 },
          assignments: {
            type: "array",
            items: { type: "object", required: ["companyId", "role"], properties: { companyId: { type: "string" }, role: { type: "string", enum: ["ADMIN", "APPROVER", "OPERATOR"] } } },
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

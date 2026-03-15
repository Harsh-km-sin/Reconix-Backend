import "dotenv/config";

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: parseInt(optional("PORT", "3000"), 10),
  databaseUrl: required("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  redisHost: optional("REDIS_HOST", "localhost"),
  redisPort: parseInt(optional("REDIS_PORT", "6379"), 10),
  frontendOrigin: optional("FRONTEND_ORIGIN", "http://localhost:5173"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: optional("JWT_EXPIRES_IN", "7d"),
  // Xero Config
  xeroClientId: required("XERO_CLIENT_ID"),
  xeroClientSecret: required("XERO_CLIENT_SECRET"),
  xeroRedirectUri: required("XERO_REDIRECT_URI"),
  // SMTP Email
  smtpHost: optional("SMTP_HOST", ""), // e.g. smtp.sendgrid.net
  smtpPort: parseInt(optional("SMTP_PORT", "587"), 10),
  smtpUser: optional("SMTP_USER", ""),
  smtpPass: optional("SMTP_PASS", ""),
  emailFrom: optional("EMAIL_FROM", "no-reply@reconix.com"),
  // Security
  tokenEncryptionKey: required("TOKEN_ENCRYPTION_KEY"), // 64 char hex string for AES-256
} as const;

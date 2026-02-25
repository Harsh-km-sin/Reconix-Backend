import { logger, env } from "../config/index.js";

/**
 * Placeholder email service. In development logs the invite link; in production
 * plug in SendGrid, SES, or another provider via env (e.g. SENDGRID_API_KEY).
 */
export const emailService = {
  async sendInvite(to: string, inviteLink: string, inviterName?: string): Promise<void> {
    const message = `You have been invited to Reconix${inviterName ? ` by ${inviterName}` : ""}. Set your password: ${inviteLink}`;
    if (env.nodeEnv === "development" || !process.env.SMTP_HOST) {
      logger.info("Invite email (placeholder)", { to, inviteLink, message });
      return;
    }
    // TODO: send via SMTP or SendGrid/SES when configured
    logger.info("Invite email would be sent", { to, inviteLink });
  },
};

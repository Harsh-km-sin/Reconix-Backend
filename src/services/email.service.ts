import nodemailer from "nodemailer";
import { logger, env } from "../config/index.js";

// Initialize the SMTP transporter based on configuration
const createTransporter = () => {
  if (!env.smtpHost) return null;

  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });
};

const transporter = createTransporter();

/**
 * Sends a password setup invite link to newly invited users.
 * In development (or if SMTP_HOST is not provided), it logs the invite link to the console.
 */
export const emailService = {
  async sendInvite(to: string, inviteLink: string, inviterName?: string): Promise<void> {
    const subject = `You have been invited to Reconix`;
    const textContent = `You have been invited to Reconix${inviterName ? ` by ${inviterName}` : ""}.\n\nPlease set your password to activate your account: ${inviteLink}\n\nThis link will expire in 24 hours.`;
    const htmlContent = `
      <p>You have been invited to Reconix${inviterName ? ` by <strong>${inviterName}</strong>` : ""}.</p>
      <p>Please click the link below to set your password and activate your account:</p>
      <p><a href="${inviteLink}">${inviteLink}</a></p>
      <p><em>This link will expire in 24 hours.</em></p>
    `;

    // Bypass actual sending in development or when SMTP is not configured
    if (env.nodeEnv === "development" || !transporter) {
      logger.info("Invite email (development mode/unconfigured SMTP)", {
        to,
        subject,
        inviteLink
      });
      return;
    }

    try {
      await transporter.sendMail({
        from: env.emailFrom,
        to,
        subject,
        text: textContent,
        html: htmlContent,
      });

      logger.info("Invite email sent successfully via SMTP", { to });
    } catch (error) {
      logger.error("Failed to send invite email", { error, to });
      throw new Error(`Email delivery failed: ${(error as Error).message}`);
    }
  },
};

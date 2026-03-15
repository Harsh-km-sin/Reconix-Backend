import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { env, logger, prisma } from "../../../config/index.js";
import { cryptoUtils } from "../../../utils/crypto.js";
import { syncQueue } from "../../../jobs/queues.js";
import { SyncJobType } from "../../../jobs/workers/syncWorker.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";

interface AuthenticatedRequest extends Request {
    user: AuthUser;
}

export const authController = {
    /**
     * GET /api/v1/xero/connect
     * Generates Xero authorize URL with PKCE and state.
     */
    async connect(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user) {
                sendError(res, ErrorCode.UNAUTHORIZED, "Unauthorized");
                return;
            }

            const state = uuidv4();
            const { verifier, challenge } = cryptoUtils.generatePKCE();

            const scopes = [
                "openid",
                "profile",
                "email",
                "accounting.transactions",
                "accounting.contacts",
                "accounting.settings",
                "accounting.attachments",
                "offline_access",
            ].join(" ");

            const params = new URLSearchParams({
                response_type: "code",
                client_id: env.xeroClientId,
                redirect_uri: env.xeroRedirectUri,
                scope: scopes,
                state: state,
                code_challenge: challenge,
                code_challenge_method: "S256",
            });

            const authUrl = `https://login.xero.com/identity/connect/authorize?${params.toString()}`;

            sendSuccess(res, { authUrl, verifier, state });
        } catch (err) {
            logger.error("Xero connect failed", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to initialize Xero connection");
        }
    },

    /**
     * GET /api/v1/xero/callback
     * Exchange code for tokens and upsert connection.
     */
    async callback(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            const { code, state, verifier } = req.query;

            if (!code || !state || !verifier) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Missing code, state, or verifier", HttpStatus.BAD_REQUEST);
                return;
            }

            // 1. Exchange code for tokens
            const clientAuth = Buffer.from(`${env.xeroClientId}:${env.xeroClientSecret}`).toString("base64");
            const tokenResponse = await axios.post(
                "https://identity.xero.com/connect/token",
                new URLSearchParams({
                    grant_type: "authorization_code",
                    code: code as string,
                    redirect_uri: env.xeroRedirectUri,
                    code_verifier: verifier as string,
                }),
                {
                    headers: {
                        Authorization: `Basic ${clientAuth}`,
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );

            const { access_token, refresh_token, expires_in, scope: scopesString } = tokenResponse.data;
            const expiresAt = new Date(Date.now() + expires_in * 1000);
            const scopes = scopesString ? scopesString.split(" ") : [];

            // 2. Fetch approved tenants
            const connectionsResponse = await axios.get("https://api.xero.com/connections", {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    "Content-Type": "application/json",
                },
            });

            const tenants = connectionsResponse.data;

            if (!tenants || tenants.length === 0) {
                sendError(res, ErrorCode.INTERNAL_ERROR, "No Xero organisations found in this connection");
                return;
            }

            if (!authedReq.user) {
                sendError(res, ErrorCode.UNAUTHORIZED, "Unauthorized");
                return;
            }

            const encryptedAccessToken = cryptoUtils.encrypt(access_token, env.tokenEncryptionKey);
            const encryptedRefreshToken = cryptoUtils.encrypt(refresh_token, env.tokenEncryptionKey);

            // Process each tenant (usually just one, but Xero allows multiple)
            for (const tenant of tenants) {
                // 3. Ensure Company record exists
                await prisma.company.upsert({
                    where: { xeroTenantId: tenant.tenantId },
                    update: { name: tenant.tenantName },
                    create: {
                        name: tenant.tenantName,
                        xeroTenantId: tenant.tenantId,
                    },
                });

                // 4. Upsert XeroConnection
                await prisma.xeroConnection.upsert({
                    where: { tenantId: tenant.tenantId },
                    update: {
                        userId: authedReq.user.userId,
                        tenantName: tenant.tenantName,
                        tenantType: tenant.tenantType || "ORGANISATION",
                        accessToken: encryptedAccessToken,
                        refreshToken: encryptedRefreshToken,
                        expiresAt,
                        scopes,
                        isActive: true,
                    },
                    create: {
                        userId: authedReq.user.userId,
                        tenantId: tenant.tenantId,
                        tenantName: tenant.tenantName,
                        tenantType: tenant.tenantType || "ORGANISATION",
                        accessToken: encryptedAccessToken,
                        refreshToken: encryptedRefreshToken,
                        expiresAt,
                        scopes,
                    },
                });

                // 5. Trigger Initial Sync
                await syncQueue.add(`sync-full-${tenant.tenantId}`, {
                    type: SyncJobType.FULL_SYNC,
                    tenantId: tenant.tenantId,
                });
            }

            // Redirect to frontend
            const firstTenantName = tenants[0].tenantName;
            res.redirect(
                `${env.frontendOrigin}/companies?connected=true&tenant=${encodeURIComponent(firstTenantName)}`
            );
        } catch (err) {
            logger.error("Xero callback failed", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to complete Xero connection");
        }
    },

    /**
     * GET /api/v1/xero/connections
     */
    async getConnections(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user) {
                sendError(res, ErrorCode.UNAUTHORIZED, "Unauthorized");
                return;
            }

            const connections = await prisma.xeroConnection.findMany({
                where: { userId: authedReq.user.userId, isActive: true },
                select: {
                    tenantId: true,
                    tenantName: true,
                    tenantType: true,
                    connectedAt: true,
                    lastSyncedAt: true,
                    isActive: true,
                },
            });

            sendSuccess(res, connections);
        } catch (err) {
            logger.error("Failed to fetch Xero connections", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to fetch connections");
        }
    },

    /**
     * DELETE /api/v1/xero/connections/:tenantId
     */
    async disconnect(req: Request, res: Response): Promise<void> {
        const authedReq = req as AuthenticatedRequest;
        try {
            if (!authedReq.user) {
                sendError(res, ErrorCode.UNAUTHORIZED, "Unauthorized");
                return;
            }

            const { tenantId } = req.params;
            const connection = await prisma.xeroConnection.findUnique({
                where: { tenantId },
            });

            if (!connection || connection.userId !== authedReq.user.userId) {
                sendError(res, ErrorCode.NOT_FOUND, "Connection not found or access denied", HttpStatus.NOT_FOUND);
                return;
            }

            try {
                const accessToken = cryptoUtils.decrypt(connection.accessToken, env.tokenEncryptionKey);
                await axios.delete(`https://api.xero.com/connections/${tenantId}`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                });
            } catch (revError) {
                logger.warn("Failed to revoke Xero connection on Xero side", { tenantId });
            }

            await prisma.xeroConnection.delete({ where: { tenantId } });
            sendSuccess(res, { message: "Disconnected successfully" });
        } catch (err) {
            logger.error("Failed to disconnect Xero organization", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to disconnect");
        }
    },
};

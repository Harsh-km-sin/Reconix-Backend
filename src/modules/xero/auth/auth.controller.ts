import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { env, logger, prisma, redis } from "../../../config/index.js";
import { cryptoUtils } from "../../../utils/crypto.js";
import { getXeroClient } from "../../../config/xeroClient.js";
import { ADMIN_ROLE_NAME } from "../../../types/permissions.js";
import { syncQueue } from "../../../jobs/queues.js";
import { SyncJobType } from "../../../jobs/workers/syncWorker.js";
import { sendSuccess, sendError, ErrorCode, HttpStatus } from "../../../types/api.types.js";
import { AuthUser } from "../../../types/express.js";
import { auditService } from "../../audit/audit.service.js";

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

            // Store verifier and userId in Redis (expires in 10 mins)
            await redis.set(
                `xero:state:${state}`,
                JSON.stringify({ verifier, userId: authedReq.user.userId }),
                "EX",
                600
            );

            sendSuccess(res, { authUrl, state });
        } catch (err) {
            logger.error("Xero connect failed", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to initialize Xero connection");
        }
    },

    /**
     * GET /api/v1/xero/callback
     * Exchange code for tokens and upsert connection.
     * NOTE: This is a public route (no JWT). User is identified via Redis state key.
     */
    async callback(req: Request, res: Response): Promise<void> {
        try {
            const { code, state } = req.query;

            if (!code || !state) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Missing code or state", HttpStatus.BAD_REQUEST);
                return;
            }

            // 1. Retrieve verifier + userId from Redis
            const storedDataStr = await redis.get(`xero:state:${state as string}`);
            if (!storedDataStr) {
                sendError(res, ErrorCode.VALIDATION_ERROR, "Invalid or expired state", HttpStatus.BAD_REQUEST);
                return;
            }
            const { verifier, userId } = JSON.parse(storedDataStr);
            await redis.del(`xero:state:${state as string}`);

            // 2. Exchange code for tokens
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

            // 3. Fetch approved tenants
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

            const encryptedAccessToken = cryptoUtils.encrypt(access_token, env.tokenEncryptionKey);
            const encryptedRefreshToken = cryptoUtils.encrypt(refresh_token, env.tokenEncryptionKey);

            // The connecting user becomes an Administrator of each connected company.
            const adminRole = await prisma.role.findUnique({ where: { name: ADMIN_ROLE_NAME } });
            if (!adminRole) {
                throw new Error("Administrator role not found — run the RBAC seed");
            }

            // Process each tenant (usually just one, but Xero allows multiple)
            for (const tenant of tenants) {
                // 4. Ensure Company record exists
                const dbCompany = await prisma.company.upsert({
                    where: { xeroTenantId: tenant.tenantId },
                    update: { name: tenant.tenantName },
                    create: {
                        name: tenant.tenantName,
                        xeroTenantId: tenant.tenantId,
                    },
                });

                // Grant admin role to the user for this new company
                await prisma.userCompanyRole.upsert({
                    where: {
                        userId_companyId: {
                            userId,
                            companyId: dbCompany.id,
                        },
                    },
                    update: {},
                    create: {
                        userId,
                        companyId: dbCompany.id,
                        roleId: adminRole.id,
                    },
                });

                // 5. Upsert XeroConnection
                await prisma.xeroConnection.upsert({
                    where: { tenantId: tenant.tenantId },
                    update: {
                        userId: userId,
                        tenantName: tenant.tenantName,
                        tenantType: tenant.tenantType || "ORGANISATION",
                        accessToken: encryptedAccessToken,
                        refreshToken: encryptedRefreshToken,
                        expiresAt,
                        scopes,
                        isActive: true,
                    },
                    create: {
                        userId: userId,
                        tenantId: tenant.tenantId,
                        tenantName: tenant.tenantName,
                        tenantType: tenant.tenantType || "ORGANISATION",
                        accessToken: encryptedAccessToken,
                        refreshToken: encryptedRefreshToken,
                        expiresAt,
                        scopes,
                    },
                });

                // 6. Trigger Initial Sync
                await syncQueue.add(`sync-full-${tenant.tenantId}`, {
                    type: SyncJobType.FULL_SYNC,
                    tenantId: tenant.tenantId,
                });

                await auditService.record({
                    companyId: tenant.tenantId, // Using tenantId as companyId prefix for mapping or find existing
                    userId: userId,
                    action: "XERO_CONNECTED",
                    resourceType: "XeroConnection",
                    resourceId: tenant.tenantId,
                    afterState: { tenantName: tenant.tenantName, tenantType: tenant.tenantType },
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

            // Include INACTIVE connections too. A connection is deactivated when
            // Xero rejects its refresh token; hiding it would leave the user with
            // no way to see the breakage or reconnect. The UI renders isActive.
            const connections = await prisma.xeroConnection.findMany({
                where: { userId: authedReq.user.userId },
                select: {
                    tenantId: true,
                    tenantName: true,
                    tenantType: true,
                    connectedAt: true,
                    lastSyncedAt: true,
                    isActive: true,
                    company: {
                        select: {
                            id: true,
                            _count: {
                                select: {
                                    xeroInvoices: true,
                                    xeroContacts: true,
                                    xeroOverpayments: true,
                                },
                            },
                            // Latest sync run, for a "last sync result" summary.
                            syncLogs: {
                                orderBy: { startedAt: "desc" },
                                take: 1,
                                select: {
                                    syncType: true,
                                    status: true,
                                    recordsFetched: true,
                                    startedAt: true,
                                    completedAt: true,
                                    errorMessage: true,
                                },
                            },
                        },
                    },
                },
            });

            // Map to include counts at the top level for cleaner frontend consumption
            const mappedConnections = connections.map(c => ({
                companyId: c.company?.id,
                tenantId: c.tenantId,
                tenantName: c.tenantName,
                tenantType: c.tenantType,
                connectedAt: c.connectedAt,
                lastSyncedAt: c.lastSyncedAt,
                isActive: c.isActive,
                invoiceCount: c.company?._count.xeroInvoices || 0,
                contactCount: c.company?._count.xeroContacts || 0,
                overpaymentCount: c.company?._count.xeroOverpayments || 0,
                lastSync: c.company?.syncLogs[0] ?? null,
            }));

            sendSuccess(res, mappedConnections);
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

            // Revoke on Xero's side so the app disappears from the org's connected
            // apps (Xero Developer → Connection management).
            //
            // IMPORTANT: Xero's disconnect endpoint takes the CONNECTION id, not the
            // tenantId — they are different GUIDs. We resolve it from GET /connections.
            // getXeroClient is used so an expiring access token is refreshed first.
            let revoked = false;
            let revokeError: string | null = null;

            if (!connection.isActive) {
                revokeError = "Connection was already inactive in Xero; nothing to revoke";
            } else {
                try {
                    const xero = await getXeroClient(tenantId);
                    // Absolute URL: /connections lives outside the api.xro/2.0 base path.
                    const { data } = await xero.get("https://api.xero.com/connections");
                    const match = Array.isArray(data)
                        ? data.find((c: any) => c.tenantId === tenantId)
                        : null;

                    if (match?.id) {
                        await xero.delete(`https://api.xero.com/connections/${match.id}`);
                        revoked = true;
                    } else {
                        // Already gone from Xero (revoked there, or never present).
                        revoked = true;
                        revokeError = "Connection was no longer present in Xero";
                    }
                } catch (revError: any) {
                    revokeError =
                        revError?.response?.data?.Detail ??
                        revError?.message ??
                        "Failed to revoke connection in Xero";
                    logger.warn("Failed to revoke Xero connection on Xero side", { tenantId, revokeError });
                }
            }

            await prisma.xeroConnection.delete({ where: { tenantId } });

            await auditService.record({
                companyId: connection.tenantId,
                userId: authedReq.user.userId,
                action: "XERO_DISCONNECTED",
                resourceType: "XeroConnection",
                resourceId: tenantId,
                beforeState: { tenantName: connection.tenantName },
                afterState: { revokedInXero: revoked, revokeError },
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
            });

            sendSuccess(res, {
                message: revoked
                    ? "Disconnected from Xero"
                    : "Removed from Reconix, but the connection could not be revoked in Xero — remove it manually under Connection management.",
                revoked,
                revokeError,
            });
        } catch (err) {
            logger.error("Failed to disconnect Xero organization", { err });
            sendError(res, ErrorCode.INTERNAL_ERROR, "Failed to disconnect");
        }
    },
};

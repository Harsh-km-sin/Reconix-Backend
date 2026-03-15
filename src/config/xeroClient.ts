import axios, { AxiosInstance } from "axios";
import { prisma, env, redis, logger } from "./index.js";
import { cryptoUtils } from "../utils/crypto.js";

/**
 * Custom error for expired/invalid Xero tokens.
 */
export class XeroTokenExpiredError extends Error {
    constructor(message: string = "Xero token expired or invalid") {
        super(message);
        this.name = "XeroTokenExpiredError";
    }
}

/**
 * Factory to get a pre-configured Axios instance for a specific Xero tenant.
 * Includes automatic token refresh logic with Redis mutex locking.
 */
export async function getXeroClient(tenantId: string): Promise<AxiosInstance> {
    const connection = await prisma.xeroConnection.findUnique({
        where: { tenantId },
    });

    if (!connection || !connection.isActive) {
        throw new Error("Xero connection not found or inactive");
    }

    const client = axios.create({
        baseURL: "https://api.xero.com/api.xro/2.0",
        headers: {
            "Xero-Tenant-Id": tenantId,
            "Content-Type": "application/json",
        },
    });

    // Request Interceptor: Check and refresh token if expires within 5 minutes
    client.interceptors.request.use(async (config) => {
        const freshConnection = await prisma.xeroConnection.findUnique({
            where: { tenantId },
        });

        if (!freshConnection) throw new Error("Connection lost during request");

        const bufferMs = 5 * 60 * 1000; // 5 minute buffer
        const isExpiringSoon = freshConnection.expiresAt.getTime() - Date.now() < bufferMs;

        if (isExpiringSoon) {
            await refreshXeroTokens(tenantId);

            // Fetch the updated token
            const updated = await prisma.xeroConnection.findUnique({ where: { tenantId } });
            if (!updated) throw new Error("Failed to retrieve updated tokens");

            const decryptedToken = cryptoUtils.decrypt(updated.accessToken, env.tokenEncryptionKey);
            config.headers.Authorization = `Bearer ${decryptedToken}`;
        } else {
            const decryptedToken = cryptoUtils.decrypt(freshConnection.accessToken, env.tokenEncryptionKey);
            config.headers.Authorization = `Bearer ${decryptedToken}`;
        }

        return config;
    });

    // Response Interceptor: Handle 401s and retry once after refresh
    client.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;

            if (error.response?.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;

                try {
                    await refreshXeroTokens(tenantId);
                    const updated = await prisma.xeroConnection.findUnique({ where: { tenantId } });
                    if (!updated) throw new Error("Token refresh returned null");

                    const decryptedToken = cryptoUtils.decrypt(updated.accessToken, env.tokenEncryptionKey);
                    originalRequest.headers.Authorization = `Bearer ${decryptedToken}`;
                    return client(originalRequest);
                } catch (refreshError) {
                    // If second 401 or refresh fails, mark as inactive
                    await prisma.xeroConnection.update({
                        where: { tenantId },
                        data: { isActive: false },
                    });
                    logger.error("Xero token refresh failed permanently", { tenantId, err: refreshError });
                    throw new XeroTokenExpiredError();
                }
            }

            return Promise.reject(error);
        }
    );

    return client;
}

/**
 * Core refresh logic with Redis mutex to prevent race conditions.
 */
async function refreshXeroTokens(tenantId: string): Promise<void> {
    const lockKey = `lock:refresh:${tenantId}`;

    // Attempt to acquire lock for 10 seconds
    const acquired = await redis.set(lockKey, "locked", "EX", 10, "NX");

    if (!acquired) {
        // If lock exists, wait and assume another instance is refreshing
        // We poll briefly then exit, the interceptor will then pick up the new token from DB
        let retries = 0;
        while (retries < 5) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const lockExists = await redis.exists(lockKey);
            if (!lockExists) return; // Refresh likely finished
            retries++;
        }
        return;
    }

    try {
        const conn = await prisma.xeroConnection.findUnique({ where: { tenantId } });
        if (!conn) throw new Error("Connection not found");

        const refreshToken = cryptoUtils.decrypt(conn.refreshToken, env.tokenEncryptionKey);

        const clientAuth = Buffer.from(`${env.xeroClientId}:${env.xeroClientSecret}`).toString("base64");
        const response = await axios.post(
            "https://identity.xero.com/connect/token",
            new URLSearchParams({
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
            {
                headers: {
                    Authorization: `Basic ${clientAuth}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        const { access_token, refresh_token, expires_in } = response.data;
        const expiresAt = new Date(Date.now() + expires_in * 1000);

        await prisma.xeroConnection.update({
            where: { tenantId },
            data: {
                accessToken: cryptoUtils.encrypt(access_token, env.tokenEncryptionKey),
                refreshToken: cryptoUtils.encrypt(refresh_token, env.tokenEncryptionKey),
                expiresAt,
                isActive: true,
            },
        });

        logger.info("Successfully refreshed Xero tokens", { tenantId });
    } finally {
        await redis.del(lockKey);
    }
}

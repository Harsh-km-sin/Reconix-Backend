import { Request, Response, NextFunction } from "express";
import { auditService } from "../modules/audit/audit.service.js";

/**
 * Middleware to translate API actions into Audit Log entries automatically.
 * Capture POST, PUT, PATCH, DELETE and log them.
 */
export const auditLogger = (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    // We hook into the response send to ensure we only log if the request was at least attempted
    // Note: This is an async operation but we don't await it to keep the API responsive
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        res.send = function (body: any) {
            const user = (req as any).user;
            const companyId = user?.companyId;

            if (companyId) {
                // Extract resource from path e.g. /api/v1/jobs -> jobs
                const pathParts = req.originalUrl.split('?')[0].split('/');
                const resourceType = pathParts[3] || "resource"; // v1/resource
                
                // If it's a specific resource ID /v1/jobs/123 -> 123
                const resourceId = req.params.id || req.body?.id || (body && typeof body === 'object' ? body.id : undefined);

                auditService.record({
                    companyId,
                    userId: user.userId,
                    action: `${req.method}_${resourceType.toUpperCase()}`,
                    resourceType,
                    resourceId: resourceId?.toString(),
                    afterState: req.body,
                    ipAddress: req.ip,
                    userAgent: req.headers["user-agent"]
                });
            }
            return originalSend.call(this, body);
        };
    }
    next();
};

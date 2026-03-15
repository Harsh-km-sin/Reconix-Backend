import { Request, Response, NextFunction } from "express";

/**
 * Recursively sanitizes any strings in an object by removing HTML tags.
 * This provides a baseline protection against XSS and HTML injection.
 */
function sanitizeValue(value: any): any {
    if (typeof value === "string") {
        // Strip HTML tags using a basic regex
        return value.replace(/<[^>]*>?/gm, "").trim();
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === "object") {
        const sanitized: any = {};
        for (const key in value) {
            sanitized[key] = sanitizeValue(value[key]);
        }
        return sanitized;
    }
    return value;
}

export const sanitizeMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    if (req.body) {
        req.body = sanitizeValue(req.body);
    }
    if (req.query) {
        req.query = sanitizeValue(req.query);
    }
    if (req.params) {
        req.params = sanitizeValue(req.params);
    }
    next();
};

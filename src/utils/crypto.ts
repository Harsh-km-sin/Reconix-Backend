import * as crypto from "node:crypto";

/**
 * AES-256-GCM encryption/decryption for sensitive tokens.
 */
export const cryptoUtils = {
    /**
     * Encrypt a string using AES-256-GCM.
     * Returns a colon-separated string: iv:authTag:ciphertext
     */
    encrypt(text: string, key: string): string {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);

        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");

        const authTag = cipher.getAuthTag().toString("hex");

        return `${iv.toString("hex")}:${authTag}:${encrypted}`;
    },

    /**
     * Decrypt a string using AES-256-GCM.
     */
    decrypt(encryptedData: string, key: string): string {
        const [ivHex, authTagHex, ciphertextHex] = encryptedData.split(":");

        if (!ivHex || !authTagHex || !ciphertextHex) {
            throw new Error("Invalid encrypted data format");
        }

        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);

        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    },

    /**
     * Generates PKCE code_verifier and code_challenge.
     */
    generatePKCE(): { verifier: string; challenge: string } {
        const verifier = crypto.randomBytes(32).toString("base64url");
        const challenge = crypto
            .createHash("sha256")
            .update(verifier)
            .digest("base64url");

        return { verifier, challenge };
    },
};

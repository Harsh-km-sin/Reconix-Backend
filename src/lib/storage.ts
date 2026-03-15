import fs from "fs/promises";
import path from "path";
import { logger } from "../config/index.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export const storage = {
  /**
   * Mock storage to local disk.
   */
  async saveFile(fileName: string, buffer: Buffer): Promise<string> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filePath = path.join(UPLOAD_DIR, fileName);
    await fs.writeFile(filePath, buffer);
    return filePath;
  },

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  },

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      logger.error("Failed to delete local file", { filePath, err });
    }
  }
};

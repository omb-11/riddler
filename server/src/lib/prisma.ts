import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function bootstrapWritableSqlite() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || !databaseUrl.startsWith("file:/tmp/")) {
    return;
  }

  const targetPath = databaseUrl.replace("file:", "");
  const templatePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../prisma/prisma/dev.db"
  );

  if (!fs.existsSync(templatePath)) {
    return;
  }

  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(templatePath, targetPath);
  }
}

bootstrapWritableSqlite();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

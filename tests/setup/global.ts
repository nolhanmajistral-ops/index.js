import { execSync } from "node:child_process";

/** Synchronise le schéma Prisma sur la base de test dédiée (jamais la base de dev). */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/nolhan_os_test?schema=public";
  if (!/test/.test(url)) throw new Error("TEST_DATABASE_URL doit pointer vers une base de test");
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
    stdio: "pipe",
  });
}

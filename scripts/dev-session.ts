/** DEV ONLY: prints a session cookie for a seeded user so local tooling can fetch protected routes. */
import { PrismaClient } from "@prisma/client";
import { createSessionRecord } from "../src/server/services/auth";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev only");
  const db = new PrismaClient();
  const u = await db.user.findUniqueOrThrow({ where: { email: process.argv[2]! } });
  const { token } = await createSessionRecord(db, u.id, { ip: "dev-script", userAgent: "dev-session" });
  console.log(token);
  await db.$disconnect();
}
void main();

import { execSync } from "node:child_process";
import { loadTestEnv } from "./load-env";

export default function setup() {
  loadTestEnv();
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" },
  });
}

import { parseSalla, verifySalla } from "@/integrations/stores/salla";
import { handleStoreWebhook } from "@/server/webhook-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  return handleStoreWebhook(req, (raw) => verifySalla(raw, req.headers, process.env.SALLA_WEBHOOK_SECRET), parseSalla);
}

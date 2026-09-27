import { parseZid, verifyZid } from "@/integrations/stores/zid";
import { handleStoreWebhook } from "@/server/webhook-handler";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  return handleStoreWebhook(req, () => verifyZid(new URL(req.url), req.headers, process.env.ZID_WEBHOOK_TOKEN), parseZid);
}

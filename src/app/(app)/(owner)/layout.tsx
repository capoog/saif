import { requireUser } from "@/server/auth/session";

/** كل الصفحات هنا للمالك بس (رأس المال، الحسابات، الأرباح…). المندوب والمستقل يتحولوا لصفحاتهم. */
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  await requireUser(["owner"]);
  return children;
}

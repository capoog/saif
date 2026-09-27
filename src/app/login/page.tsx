import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <h1 className="text-2xl font-bold">كشف رأس المال</h1>
      <p className="mb-6 mt-1 text-sm text-muted">من 20,000 إلى 1,000,000 — الحقيقة بالأرقام كل أسبوع.</p>
      <LoginForm />
    </main>
  );
}

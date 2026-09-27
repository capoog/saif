import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-sm px-5 py-20 text-center">
      <h1 className="text-xl font-bold">مش مسموح</h1>
      <p className="mt-2 text-sm text-muted">صلاحياتك متسمحش بفتح الصفحة دي.</p>
      <Link href="/login" className="mt-6 inline-block text-primary">رجوع</Link>
    </main>
  );
}

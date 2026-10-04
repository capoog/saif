import { MessageCircle } from "lucide-react";
import { cn } from "./ui";

/** زر يفتح واتساب برسالة جاهزة — المستخدم يراجعها ويضغط إرسال */
export function WhatsAppButton({ href, label = "أرسل واتساب", className }: { href: string; label?: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn("inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1fa855] px-3 text-sm font-semibold text-white hover:opacity-90", className)}>
      <MessageCircle className="size-4" />
      {label}
    </a>
  );
}

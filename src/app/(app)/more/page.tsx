import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MORE_LINKS } from "@/components/nav-links";
import { Card, PageHeader } from "@/components/ui";

export default function MorePage() {
  return (
    <div className="space-y-2">
      <PageHeader title="المزيد" />
      {MORE_LINKS.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="block">
          <Card className="flex items-center justify-between p-3.5 hover:border-primary/50">
            <span className="flex items-center gap-3 font-medium">
              <Icon className="size-5 text-primary" />
              {label}
            </span>
            <ChevronLeft className="size-5 text-muted" />
          </Card>
        </Link>
      ))}
    </div>
  );
}

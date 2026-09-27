"use client";

import { Moon, Sun } from "lucide-react";

/** يتنفذ قبل الرسم عشان ما فيه وميض: الوضع المحفوظ أو وضع الجهاز */
export const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="تبديل الوضع الداكن"
      className="grid size-10 place-items-center rounded-xl text-muted hover:bg-subtle"
      onClick={() => {
        const dark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", dark);
        try {
          localStorage.setItem("theme", dark ? "dark" : "light");
        } catch {}
      }}
    >
      <Sun className="hidden size-5 dark:block" />
      <Moon className="size-5 dark:hidden" />
    </button>
  );
}

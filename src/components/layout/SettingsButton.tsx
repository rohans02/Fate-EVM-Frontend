"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsButton() {
  const pathname = usePathname();
  const isActive = pathname.startsWith("/settings");

  return (
    <Link
      href="/settings"
      aria-label="Settings"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex h-9 w-12 items-center justify-center rounded-full border-2 transition-colors",
        isActive
          ? "border-black bg-black text-white hover:bg-neutral-800 dark:border-white dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          : "border-black bg-white text-black hover:bg-neutral-100 dark:border-white dark:bg-black dark:text-white dark:hover:bg-neutral-900"
      )}
    >
      <Settings className="h-[1.2rem] w-[1.5rem]" />
    </Link>
  );
}

export default SettingsButton;

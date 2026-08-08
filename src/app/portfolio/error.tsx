"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function PortfolioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Portfolio route error:", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        Something went wrong loading your portfolio
      </h2>
      <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
        A read failed while loading your positions. This is usually a temporary RPC issue.
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}

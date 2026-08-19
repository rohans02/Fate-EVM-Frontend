"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { exportPortfolioBackup } from "@/lib/backup/portfolioBackup";
import { logger } from "@/lib/logger";

const SECTION_CARD_CLASS =
  "border-black dark:border-neutral-700/60 dark:bg-gradient-to-br dark:from-neutral-800/50 dark:to-neutral-900/50 backdrop-blur-sm shadow-xl";

export default function SettingsPage() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { rows, filename } = await exportPortfolioBackup();
      if (rows === 0) {
        toast.info(
          "Nothing to export yet. Visit the portfolio page once so your positions and trades are cached locally."
        );
        return;
      }
      toast.success(`Exported ${rows.toLocaleString()} records to ${filename}`);
    } catch (error) {
      logger.error(
        "Settings: portfolio export failed",
        error instanceof Error ? error : new Error(String(error))
      );
      toast.error(
        "Export failed. Your browser may be blocking local storage, or there is no cached portfolio data yet."
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="pt-28 min-h-screen transition-colors duration-500 bg-gradient-to-b from-gray-100 to-gray-200 dark:from-[#1a1b1f] dark:to-[#1a1b1f]">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-black dark:text-white tracking-tight mb-3">
            Settings
          </h1>
          <p className="text-lg md:text-xl font-medium text-gray-500 dark:text-gray-400 max-w-2xl">
            Fate keeps your portfolio history in this browser, not on a server. It does not follow
            you to another device, and clearing site data erases it.
          </p>
        </div>

        <Card className={SECTION_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-xl text-neutral-900 dark:text-neutral-100">
              Backup and restore
            </CardTitle>
            <CardDescription className="text-neutral-600 dark:text-neutral-400">
              Export your positions, trade history and portfolio cache to a JSON file you keep.
              Pool and token data is left out, since it is re-read from the chain anyway.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                onClick={handleExport}
                disabled={isExporting}
                className="bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {isExporting ? "Exporting..." : "Export portfolio data"}
              </Button>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Downloads a single JSON file. Nothing is uploaded anywhere.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

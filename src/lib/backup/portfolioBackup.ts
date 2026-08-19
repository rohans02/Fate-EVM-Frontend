import {
  assertBrowser,
  downloadJSON,
  exportDB,
  type ExportFormat,
} from "@aossie-org/idb-backup";
import { DATABASE_CONFIG } from "@/lib/indexeddb/config";
import { logger } from "@/lib/logger";

// The only three stores holding data the user owns. The other six are RPC caches, where refetching is strictly better than restoring a stale copy.
export const BACKUP_STORE_NAMES = [
  "portfolioPositions",
  "portfolioTransactions",
  "portfolioCache",
] as const;

export const countBackupRows = (backup: ExportFormat): number =>
  BACKUP_STORE_NAMES.reduce(
    (total, store) => total + (backup.stores[store]?.length ?? 0),
    0
  );

const backupFilename = (): string =>
  `fate-portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;

export interface ExportResult {
  rows: number;
  filename: string;
}

export const exportPortfolioBackup = async (): Promise<ExportResult> => {
  assertBrowser("exportPortfolioBackup");

  const backup = await exportDB({
    dbName: DATABASE_CONFIG.name,
    storeNames: [...BACKUP_STORE_NAMES],
  });

  const rows = countBackupRows(backup);
  const filename = backupFilename();

  logger.debug("exportPortfolioBackup: built backup", {
    rows,
    databaseVersion: backup.databaseVersion,
    stores: Object.keys(backup.stores),
  });

  downloadJSON(backup, filename);
  return { rows, filename };
};

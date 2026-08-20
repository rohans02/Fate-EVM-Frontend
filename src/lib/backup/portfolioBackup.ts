import {
  assertBrowser,
  BACKUP_VERSION,
  downloadJSON,
  exportDB,
  importDB,
  readFileAsJSON,
  type ExportFormat,
} from "@aossie-org/idb-backup";
import { isAddress, isAddressEqual, type Address } from "viem";
import { DATABASE_CONFIG } from "@/lib/indexeddb/config";
import { logger } from "@/lib/logger";

// Only these three hold data the user owns. The other six are RPC caches, where refetching from
// the chain beats restoring a stale copy.
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

// The next two helpers exist only because ImportOptions has neither `storeNames` nor
// `onBeforeImport`. Both are filed upstream (#67, #68); delete them once those ship.

// TODO(#67). Filter `schema` as well as `stores`: merge creates whatever the schema declares, so a
// full nine-store backup would otherwise rebuild the six cache stores we just excluded.
const keepOnlyBackupStores = (backup: ExportFormat): ExportFormat => {
  const keep = <T,>(source: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      BACKUP_STORE_NAMES.filter((name) => name in source).map((name) => [
        name,
        source[name],
      ])
    );

  return { ...backup, schema: keep(backup.schema), stores: keep(backup.stores) };
};

// TODO(#68). Reading straight out of record values is the envelope coupling that hook removes.
export const backupWalletAddresses = (backup: ExportFormat): Address[] => {
  const seen = new Map<string, Address>();
  for (const store of BACKUP_STORE_NAMES) {
    for (const record of backup.stores[store] ?? []) {
      const address = (record.value as { userAddress?: unknown } | null)?.userAddress;
      if (typeof address === "string" && isAddress(address)) {
        seen.set(address.toLowerCase(), address as Address);
      }
    }
  }
  return [...seen.values()];
};

export interface BackupSummary {
  backup: ExportFormat;
  exportedAt: string;
  databaseVersion: number;
  rowsByStore: Record<string, number>;
  totalRows: number;
  wallets: Address[];
}

const isExportFormat = (value: unknown): value is ExportFormat =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ExportFormat).databaseName === "string" &&
  typeof (value as ExportFormat).stores === "object";

// All of this runs before the first write, so a bad file is rejected outright rather than merged
// halfway into a state nobody can reason about.
export const readBackupFile = async (file: File): Promise<BackupSummary> => {
  assertBrowser("readBackupFile");

  let parsed: unknown;
  try {
    parsed = await readFileAsJSON<unknown>(file);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  if (!isExportFormat(parsed)) {
    throw new Error("That file is not a Fate backup.");
  }

  if (parsed.databaseName !== DATABASE_CONFIG.name) {
    throw new Error(
      `This backup is for a different database (${parsed.databaseName}), not ${DATABASE_CONFIG.name}.`
    );
  }

  if (typeof parsed.backupVersion !== "number" || parsed.backupVersion > BACKUP_VERSION) {
    throw new Error(
      `This backup uses format version ${parsed.backupVersion}, newer than this app supports (${BACKUP_VERSION}).`
    );
  }

  // Older schemas merge fine. A newer one may carry stores and fields this build cannot interpret.
  if (parsed.databaseVersion > DATABASE_CONFIG.version) {
    throw new Error(
      `This backup came from a newer version of Fate (database v${parsed.databaseVersion}, this app is v${DATABASE_CONFIG.version}). Update the app before restoring it.`
    );
  }

  const present = BACKUP_STORE_NAMES.filter((name) => name in parsed.stores);
  if (present.length === 0) {
    throw new Error("This backup contains no portfolio data to restore.");
  }

  const rowsByStore = Object.fromEntries(
    BACKUP_STORE_NAMES.map((name) => [name, parsed.stores[name]?.length ?? 0])
  );

  return {
    backup: parsed,
    exportedAt: parsed.exportedAt,
    databaseVersion: parsed.databaseVersion,
    rowsByStore,
    totalRows: countBackupRows(parsed),
    wallets: backupWalletAddresses(parsed),
  };
};

export const walletMismatch = (
  summary: BackupSummary,
  connected: Address | undefined
): Address[] => {
  if (!connected) return summary.wallets;
  return summary.wallets.filter((address) => !isAddressEqual(address, connected));
};

// Blocking beats warning here: every store is keyed by address, merge never deletes, and there is
// no undo, so a restore of someone else's data can only be cleaned by wiping the portfolio. An
// unreadable wallet is refused too, so a hand-edited file cannot pass by yielding no address.
export const restorePortfolioBackup = async (
  summary: BackupSummary,
  connected: Address | undefined
): Promise<number> => {
  assertBrowser("restorePortfolioBackup");

  if (!connected) {
    throw new Error("Connect the wallet this backup belongs to before restoring.");
  }

  if (summary.wallets.length === 0) {
    throw new Error(
      "This backup does not say which wallet it belongs to, so it cannot be matched to yours. Restoring it could mix another wallet's history into your portfolio."
    );
  }

  const foreign = walletMismatch(summary, connected);
  if (foreign.length > 0) {
    throw new Error(
      `This backup belongs to ${foreign[0]}, not the connected wallet ${connected}. Restoring it would report balances and returns that are not yours.`
    );
  }

  // Never overwrite: that drops and recreates the database, taking the six cache stores with it.
  await importDB({
    dbName: DATABASE_CONFIG.name,
    backupData: keepOnlyBackupStores(summary.backup),
    strategy: "merge",
  });

  logger.debug("restorePortfolioBackup: merged backup", {
    rows: summary.totalRows,
    rowsByStore: summary.rowsByStore,
  });

  return summary.totalRows;
};

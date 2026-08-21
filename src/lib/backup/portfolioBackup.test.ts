import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, type ExportFormat } from "@aossie-org/idb-backup";
import { DATABASE_CONFIG } from "@/lib/indexeddb/config";
import {
  BACKUP_STORE_NAMES,
  backupWalletAddresses,
  countBackupRows,
  keepOnlyBackupStores,
  readBackupFile,
  walletMismatch,
  type BackupSummary,
} from "@/lib/backup/portfolioBackup";

const WALLET = "0xfCe7b36EE2bdB5907D3857c16f4dd86CA47E813b" as const;
const OTHER = "0x8a39E019edbE3c095E42e505Aef21bc328c6403d" as const;

const CACHE_STORES = [
  "poolDetails",
  "tokenDetails",
  "bullTokens",
  "bearTokens",
  "chainStatus",
  "cacheMetadata",
];

const row = (value: unknown) => ({ key: "k", value });

const makeBackup = (overrides: Partial<ExportFormat> = {}): ExportFormat => ({
  backupVersion: BACKUP_VERSION,
  databaseName: DATABASE_CONFIG.name,
  databaseVersion: DATABASE_CONFIG.version,
  exportedAt: "2026-08-20T07:34:15.366Z",
  schema: Object.fromEntries(
    BACKUP_STORE_NAMES.map((name) => [
      name,
      { keyPath: "id", autoIncrement: false, indexes: [] },
    ])
  ),
  stores: {
    portfolioPositions: [row({ userAddress: WALLET })],
    portfolioTransactions: [row({ userAddress: WALLET }), row({ userAddress: WALLET })],
    portfolioCache: [row({ userAddress: `${WALLET}-11155111` })],
  },
  ...overrides,
});

const asFile = (contents: unknown, name = "backup.json"): File =>
  new File([typeof contents === "string" ? contents : JSON.stringify(contents)], name, {
    type: "application/json",
  });

const withoutField = (backup: ExportFormat, field: keyof ExportFormat): unknown => {
  const copy: Record<string, unknown> = { ...backup };
  delete copy[field];
  return copy;
};

const summaryOf = (wallets: string[]): BackupSummary =>
  ({ wallets } as unknown as BackupSummary);

describe("countBackupRows", () => {
  it("counts only the three portfolio stores", () => {
    const backup = makeBackup();
    backup.stores.poolDetails = [row({}), row({}), row({})];
    expect(countBackupRows(backup)).toBe(4);
  });

  it("tolerates missing stores", () => {
    expect(countBackupRows(makeBackup({ stores: {} }))).toBe(0);
  });
});

describe("keepOnlyBackupStores", () => {
  it("strips cache stores from both stores and schema", () => {
    const full = makeBackup();
    for (const name of CACHE_STORES) {
      full.stores[name] = [row({})];
      full.schema[name] = { keyPath: "id", autoIncrement: false, indexes: [] };
    }

    const filtered = keepOnlyBackupStores(full);

    expect(Object.keys(filtered.stores).sort()).toEqual([...BACKUP_STORE_NAMES].sort());
    // The schema half is the one that matters: merge recreates any store the schema declares.
    expect(Object.keys(filtered.schema).sort()).toEqual([...BACKUP_STORE_NAMES].sort());
  });

  it("leaves the envelope metadata untouched", () => {
    const filtered = keepOnlyBackupStores(makeBackup());
    expect(filtered.databaseName).toBe(DATABASE_CONFIG.name);
    expect(filtered.databaseVersion).toBe(DATABASE_CONFIG.version);
    expect(filtered.exportedAt).toBe("2026-08-20T07:34:15.366Z");
  });

  it("does not invent stores the backup never had", () => {
    const partial = makeBackup({ stores: { portfolioPositions: [row({})] } });
    expect(Object.keys(keepOnlyBackupStores(partial).stores)).toEqual(["portfolioPositions"]);
  });
});

describe("backupWalletAddresses", () => {
  it("collapses case variants of the same address to one entry", () => {
    const backup = makeBackup({
      stores: {
        portfolioPositions: [row({ userAddress: WALLET })],
        portfolioTransactions: [row({ userAddress: WALLET.toLowerCase() })],
        portfolioCache: [],
      },
    });
    expect(backupWalletAddresses(backup)).toHaveLength(1);
  });

  it("ignores values that are not addresses", () => {
    // portfolioCache stores `${address}-${chainId}` as its key, so this is real data, not a fixture.
    const backup = makeBackup({
      stores: {
        portfolioPositions: [row({ userAddress: `${WALLET}-11155111` })],
        portfolioTransactions: [row({ userAddress: "not-an-address" })],
        portfolioCache: [row({ userAddress: 42 })],
      },
    });
    expect(backupWalletAddresses(backup)).toEqual([]);
  });

  it("skips records with no userAddress at all", () => {
    const backup = makeBackup({
      stores: {
        portfolioPositions: [row({}), row(null)],
        portfolioTransactions: [row({ userAddress: WALLET })],
        portfolioCache: [],
      },
    });
    expect(backupWalletAddresses(backup)).toEqual([WALLET]);
  });

  it("returns an empty list for empty stores", () => {
    expect(backupWalletAddresses(makeBackup({ stores: {} }))).toEqual([]);
  });

  it("reports every distinct wallet it finds", () => {
    const backup = makeBackup({
      stores: {
        portfolioPositions: [row({ userAddress: WALLET })],
        portfolioTransactions: [row({ userAddress: OTHER })],
        portfolioCache: [],
      },
    });
    expect(backupWalletAddresses(backup).sort()).toEqual([WALLET, OTHER].sort());
  });
});

describe("walletMismatch", () => {
  it("does not flag the same address in different casing", () => {
    expect(walletMismatch(summaryOf([WALLET.toLowerCase()]), WALLET)).toEqual([]);
  });

  it("flags a different address", () => {
    expect(walletMismatch(summaryOf([OTHER]), WALLET)).toEqual([OTHER]);
  });

  it("treats every address as foreign when no wallet is connected", () => {
    expect(walletMismatch(summaryOf([WALLET, OTHER]), undefined)).toEqual([WALLET, OTHER]);
  });
});

describe("readBackupFile", () => {
  it("accepts a well-formed backup and summarises it", async () => {
    const summary = await readBackupFile(asFile(makeBackup()));

    expect(summary.totalRows).toBe(4);
    expect(summary.rowsByStore).toEqual({
      portfolioPositions: 1,
      portfolioTransactions: 2,
      portfolioCache: 1,
    });
    expect(summary.wallets).toEqual([WALLET]);
  });

  it("rejects a file that is not JSON", async () => {
    await expect(readBackupFile(asFile("{not json"))).rejects.toThrow(/not valid JSON/i);
  });

  it("rejects JSON that is not a backup envelope", async () => {
    await expect(readBackupFile(asFile({ hello: "world" }))).rejects.toThrow(
      /not a Fate backup/i
    );
  });

  it("rejects a backup for a different database", async () => {
    const backup = makeBackup({ databaseName: "SomeOtherDB" });
    await expect(readBackupFile(asFile(backup))).rejects.toThrow(/different database/i);
  });

  it("rejects a newer backup format version", async () => {
    const backup = makeBackup({ backupVersion: BACKUP_VERSION + 1 });
    await expect(readBackupFile(asFile(backup))).rejects.toThrow(/format version/i);
  });

  it("rejects a newer database version", async () => {
    const backup = makeBackup({ databaseVersion: DATABASE_CONFIG.version + 1 });
    await expect(readBackupFile(asFile(backup))).rejects.toThrow(/newer version of Fate/i);
  });

  it("accepts an older database version", async () => {
    const backup = makeBackup({ databaseVersion: DATABASE_CONFIG.version - 1 });
    await expect(readBackupFile(asFile(backup))).resolves.toBeTruthy();
  });

  it("rejects a backup with no portfolio stores", async () => {
    const backup = makeBackup({ stores: { poolDetails: [row({})] } });
    await expect(readBackupFile(asFile(backup))).rejects.toThrow(/no portfolio data/i);
  });
});

// Malformed envelopes, as opposed to well-formed ones carrying wrong values. Each of these reached past the type guard before it was tightened.
describe("readBackupFile envelope validation", () => {
  const rejected = (backup: unknown) =>
    expect(readBackupFile(asFile(backup))).rejects.toThrow(/not a Fate backup/i);

  it("rejects null stores rather than throwing a raw TypeError", async () => {
    // typeof null === "object", so this used to pass and then die on `name in parsed.stores`.
    await rejected({ ...makeBackup(), stores: null });
  });

  it("rejects a missing databaseVersion", async () => {
    // `undefined > DATABASE_CONFIG.version` is false, so omitting the field skipped the
    // newer-schema guard entirely.
    await rejected(withoutField(makeBackup(), "databaseVersion"));
  });

  it("rejects a non-numeric databaseVersion", async () => {
    await rejected({ ...makeBackup(), databaseVersion: "4" });
  });

  it("rejects a store whose value is not an array", async () => {
    const backup = makeBackup();
    await rejected({ ...backup, stores: { ...backup.stores, portfolioPositions: {} } });
  });

  it("rejects a missing exportedAt", async () => {
    // The settings page renders this straight into toLocaleDateString().
    await rejected(withoutField(makeBackup(), "exportedAt"));
  });

  it("still accepts a well-formed envelope", async () => {
    await expect(readBackupFile(asFile(makeBackup()))).resolves.toBeTruthy();
  });
});

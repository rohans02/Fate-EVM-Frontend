import type { AbiEvent, Address, Log, PublicClient } from "viem";
import { logger } from "@/lib/logger";
import { getScanChunkSize, isRangeOrResultCapError, isRateLimitError } from "@/utils/rpcTransport";

export type ScanDirection = "forward" | "backward";

export type ScannedLog<TEvent extends AbiEvent> = Log<bigint, number, false, TEvent, true>;

export interface ScanLogsChunkedParams<TEvent extends AbiEvent> {
  client: PublicClient;
  chainId: number;
  address: Address;
  // Passing several events fetches them in one call, but then the node cannot filter by an
  // indexed arg: viem cannot express a filter whose param name differs per event.
  event: TEvent | readonly TEvent[];
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize?: bigint;
  direction?: ScanDirection;
  stopOnFirstMatch?: boolean;
  maxChunks?: number;
  concurrency?: number;
  label?: string;
}

export interface ScanLogsChunkedResult<TEvent extends AbiEvent> {
  logs: ScannedLog<TEvent>[];
  // Only the unbroken run from the start edge. Blocks after a failed chunk were never read,
  // so saving past that point would skip them forever.
  scannedSpan: { from: bigint; to: bigint } | null;
  scanFailed: boolean;
  requests: number;
  reachedEnd: boolean;
}

const DEFAULT_CONCURRENCY = 3;
const MIN_CHUNK_SIZE = BigInt(100);
const RATE_LIMIT_BACKOFF_MS = 1_500;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Always read events from the ABI. A hand-written copy that is missing a param gets a
// different topic hash and silently matches nothing.
export const getAbiEvent = (abi: readonly unknown[], name: string): AbiEvent => {
  const found = (abi as AbiEvent[]).find((item) => item?.type === "event" && item.name === name);
  if (!found) {
    throw new Error(`getAbiEvent: no event named "${name}" in the supplied ABI`);
  }
  return found;
};

interface ChunkRange {
  from: bigint;
  to: bigint;
}

const buildChunks = (
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint,
  direction: ScanDirection
): ChunkRange[] => {
  const chunks: ChunkRange[] = [];
  if (direction === "forward") {
    for (let from = fromBlock; from <= toBlock; from += chunkSize) {
      const to = from + chunkSize - BigInt(1);
      chunks.push({ from, to: to > toBlock ? toBlock : to });
    }
  } else {
    for (let to = toBlock; to >= fromBlock; to -= chunkSize) {
      const from = to - chunkSize + BigInt(1);
      chunks.push({ from: from < fromBlock ? fromBlock : from, to });
      if (to < fromBlock + chunkSize) break; // next step would underflow past fromBlock
    }
  }
  return chunks;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};

export async function scanLogsChunked<TEvent extends AbiEvent>({
  client,
  chainId,
  address,
  event,
  args,
  fromBlock,
  toBlock,
  chunkSize,
  direction = "forward",
  stopOnFirstMatch = false,
  maxChunks,
  concurrency = DEFAULT_CONCURRENCY,
  label,
}: ScanLogsChunkedParams<TEvent>): Promise<ScanLogsChunkedResult<TEvent>> {
  const eventList = (Array.isArray(event) ? event : [event]) as readonly TEvent[];
  const eventSelector = eventList.length === 1 ? { event: eventList[0] } : { events: eventList };
  const scanLabel = label ?? eventList.map((e) => e.name).join("+");
  const empty: ScanLogsChunkedResult<TEvent> = {
    logs: [],
    scannedSpan: null,
    scanFailed: false,
    requests: 0,
    reachedEnd: true,
  };

  if (fromBlock > toBlock) return empty;

  const effectiveChunkSize = chunkSize ?? getScanChunkSize(chainId);
  if (effectiveChunkSize <= BigInt(0)) {
    logger.error("scanLogsChunked: chunkSize must be positive", undefined, {
      label: scanLabel,
      chunkSize: effectiveChunkSize.toString(),
    });
    return { ...empty, scanFailed: true, reachedEnd: false };
  }
  const workers = Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 1;
  let chunks = buildChunks(fromBlock, toBlock, effectiveChunkSize, direction);
  const truncated = maxChunks !== undefined && chunks.length > maxChunks;
  if (truncated) chunks = chunks.slice(0, maxChunks);

  let requests = 0;

  const fetchChunk = async (
    range: ChunkRange,
    depth = 0,
    rateLimitRetried = false
  ): Promise<{ logs: ScannedLog<TEvent>[]; ok: boolean }> => {
    try {
      requests++;
      const logs = await client.getLogs({
        address,
        ...eventSelector,
        ...(args ? { args } : {}),
        fromBlock: range.from,
        toBlock: range.to,
        strict: true,
      } as Parameters<PublicClient["getLogs"]>[0]);
      return { logs: logs as unknown as ScannedLog<TEvent>[], ok: true };
    } catch (error) {
      const span = range.to - range.from + BigInt(1);
      const splittable =
        isRangeOrResultCapError(error) && depth < 4 && span > MIN_CHUNK_SIZE;

      if (splittable) {
        const mid = range.from + span / BigInt(2) - BigInt(1);
        logger.debug("scanLogsChunked: provider cap hit, splitting chunk", {
          label: scanLabel,
          from: range.from.toString(),
          to: range.to.toString(),
          depth,
        });
        // Sequential on purpose: a parallel split escapes the concurrency limit.
        const left = await fetchChunk({ from: range.from, to: mid }, depth + 1);
        const right = await fetchChunk({ from: mid + BigInt(1), to: range.to }, depth + 1);
        return {
          logs: [...left.logs, ...right.logs],
          ok: left.ok && right.ok,
        };
      }

      // One retry only. Retrying more is what made the old scan send ~10x the requests.
      if (isRateLimitError(error) && !rateLimitRetried) {
        await sleep(RATE_LIMIT_BACKOFF_MS);
        return fetchChunk(range, depth, true);
      }

      logger.warn("scanLogsChunked: chunk failed", {
        label: scanLabel,
        chainId,
        from: range.from.toString(),
        to: range.to.toString(),
        message: (error as { shortMessage?: string; message?: string })?.shortMessage
          ?? (error as { message?: string })?.message,
      });
      return { logs: [], ok: false };
    }
  };

  const outcomes: Array<{ logs: ScannedLog<TEvent>[]; ok: boolean } | undefined> =
    new Array(chunks.length);
  let earlyExit = false;

  if (stopOnFirstMatch) {
    for (let i = 0; i < chunks.length; i++) {
      const outcome = await fetchChunk(chunks[i]);
      outcomes[i] = outcome;
      if (outcome.ok && outcome.logs.length > 0) {
        earlyExit = true;
        break;
      }
    }
  } else {
    const settled = await mapWithConcurrency(chunks, workers, (range) => fetchChunk(range));
    settled.forEach((outcome, i) => {
      outcomes[i] = outcome;
    });
  }

  let contiguous = 0;
  while (contiguous < outcomes.length && outcomes[contiguous]?.ok) contiguous++;

  const attempted = outcomes.filter(Boolean).length;
  const scanFailed = outcomes.some((outcome) => outcome && !outcome.ok);

  let scannedSpan: { from: bigint; to: bigint } | null = null;
  if (contiguous > 0) {
    const first = chunks[0];
    const last = chunks[contiguous - 1];
    scannedSpan =
      direction === "forward"
        ? { from: first.from, to: last.to }
        : { from: last.from, to: first.to };
  }

  const logs = outcomes.flatMap((outcome) => outcome?.logs ?? []);
  logs.sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
    return a.logIndex - b.logIndex;
  });

  logger.debug("scanLogsChunked: done", {
    label: scanLabel,
    chainId,
    direction,
    fromBlock: fromBlock.toString(),
    toBlock: toBlock.toString(),
    chunkSize: effectiveChunkSize.toString(),
    chunksPlanned: chunks.length,
    chunksAttempted: attempted,
    requests,
    logs: logs.length,
    scanFailed,
  });

  return {
    logs,
    scannedSpan,
    scanFailed,
    requests,
    reachedEnd: !earlyExit && !truncated && !scanFailed,
  };
}

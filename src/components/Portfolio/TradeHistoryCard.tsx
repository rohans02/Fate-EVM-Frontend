"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink, History, TrendingDown, TrendingUp } from "lucide-react";
import { useFatePoolsStorage } from "@/lib/fatePoolHook";
import { PortfolioTransaction, SupportedChainId } from "@/lib/indexeddb/config";
import { getExplorerUrl } from "@/utils/explorer";
import { logger } from "@/lib/logger";

// Only the pool fields a row label needs, so this component does not depend on the
// portfolio page's much larger PoolData.
export interface TradeHistoryPool {
  id: string;
  name: string;
  baseTokenSymbol: string;
  bullTokenSymbol: string;
  bearTokenSymbol: string;
}

const PAGE_SIZE = 10;

// Amounts arrive already scaled by the writer (`value`/`fees` in base-token decimals,
// `amount` in the coin's 18). Formatting here is display only — never re-scale.
const formatAmount = (value: number, maximumFractionDigits = 6): string => {
  if (!isFinite(value)) return "0";
  if (value !== 0 && Math.abs(value) < 0.000001) return "< 0.000001";
  return value.toLocaleString(undefined, { maximumFractionDigits });
};

const formatWhen = (timestamp: number): string => {
  if (!timestamp || !isFinite(timestamp)) return "Unknown";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Synthetic hashes are minted when a log carried none, and those cannot be opened on an explorer.
const isRealTxHash = (hash: string): hash is `0x${string}` =>
  /^0x[0-9a-fA-F]{64}$/.test(hash);

const explorerLink = (hash: string, chainId: number): string | null => {
  if (!isRealTxHash(hash)) return null;
  try {
    return getExplorerUrl(hash, chainId);
  } catch {
    return null;
  }
};

export const TradeHistoryCard = ({
  pools,
  userAddress,
  chainId,
  historyIncomplete,
  reloadKey,
}: {
  pools: TradeHistoryPool[];
  userAddress?: string;
  chainId?: number;
  historyIncomplete: boolean;
  reloadKey?: string | number;
}) => {
  const { getPortfolioTransactions, isInitialized } = useFatePoolsStorage();
  // null = not read yet, so a first paint is a skeleton rather than a false "no trades".
  const [transactions, setTransactions] = useState<PortfolioTransaction[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!userAddress || !chainId || !isInitialized) return;
    let cancelled = false;

    const load = async () => {
      const rows = await getPortfolioTransactions(userAddress, chainId as SupportedChainId);
      if (cancelled) return;
      logger.debug("TradeHistoryCard: loaded cached trades", { count: rows.length, chainId });
      setTransactions(rows);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [userAddress, chainId, isInitialized, getPortfolioTransactions, reloadKey]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [userAddress, chainId]);

  const poolsByAddress = useMemo(() => {
    const map = new Map<string, TradeHistoryPool>();
    for (const pool of pools) map.set(pool.id.toLowerCase(), pool);
    return map;
  }, [pools]);

  const sorted = useMemo(() => {
    if (!transactions) return [];
    // Newest first. Block number is the reliable ordering key; id only breaks ties within a
    // block so the order does not shuffle between renders.
    return [...transactions].sort(
      (a, b) => b.blockNumber - a.blockNumber || a.id.localeCompare(b.id)
    );
  }, [transactions]);

  const showMore = useCallback(() => setVisibleCount((count) => count + PAGE_SIZE), []);

  const visible = sorted.slice(0, visibleCount);
  const remaining = sorted.length - visible.length;

  const header = (
    <CardHeader>
      <CardTitle className="text-xl text-neutral-900 dark:text-neutral-100 mb-2 flex items-center gap-2">
        <History className="h-5 w-5" />
        Trade History
      </CardTitle>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Every buy and sell this wallet made, newest first
      </p>
    </CardHeader>
  );

  if (transactions === null) {
    return (
      <Card className="border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800">
        {header}
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-14 bg-gray-200 dark:bg-neutral-700 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // An empty list and an unread list mean opposite things to the user, so they never share a message.
  if (sorted.length === 0) {
    return (
      <Card className="border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800">
        {header}
        <CardContent>
          {historyIncomplete ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Trade history could not be read
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  The RPC did not return the event logs for this wallet, so this list is empty
                  because nothing could be read, not because you have no trades. Reload to try again.
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 py-6 text-center">
              No trades yet. Buys and sells appear here once you trade a pool.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-neutral-200 dark:border-neutral-700 dark:bg-neutral-800">
      {header}
      <CardContent>
        {historyIncomplete && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-3 mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Some event logs could not be read, so trades may be missing from this list.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
                <th className="py-2 pr-4 font-medium">When</th>
                <th className="py-2 pr-4 font-medium">Action</th>
                <th className="py-2 pr-4 font-medium">Pool</th>
                <th className="py-2 pr-4 font-medium text-right">Coins</th>
                <th className="py-2 pr-4 font-medium text-right">Paid / Received</th>
                <th className="py-2 pr-4 font-medium text-right">Fee</th>
                <th className="py-2 pr-4 font-medium text-right">Price</th>
                <th className="py-2 font-medium text-right">Tx</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((tx) => {
                const pool = poolsByAddress.get(tx.poolAddress.toLowerCase());
                const baseSymbol = pool?.baseTokenSymbol ?? "";
                const coinSymbol =
                  tx.tokenType === "bull" ? pool?.bullTokenSymbol : pool?.bearTokenSymbol;
                const isBuy = tx.action === "buy";
                const link = chainId !== undefined ? explorerLink(tx.transactionHash, chainId) : null;

                return (
                  <tr
                    key={tx.id}
                    className="border-b border-neutral-100 dark:border-neutral-700/60 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors"
                  >
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <div className="text-neutral-900 dark:text-neutral-100">
                        {formatWhen(tx.timestamp)}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        Block {tx.blockNumber.toLocaleString()}
                      </div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                          isBuy
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {isBuy ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {isBuy ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="text-neutral-900 dark:text-neutral-100">
                        {pool?.name ?? `Pool ${tx.poolAddress.slice(0, 6)}...`}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 capitalize">
                        {tx.tokenType}
                        {coinSymbol ? ` · ${coinSymbol}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap text-neutral-900 dark:text-neutral-100">
                      {formatAmount(tx.amount)}
                    </td>
                    <td
                      className="py-3 pr-4 text-right whitespace-nowrap text-neutral-900 dark:text-neutral-100"
                      title={
                        isBuy
                          ? "Total paid, fee included"
                          : "Amount received, fee already deducted"
                      }
                    >
                      {formatAmount(tx.value)} {baseSymbol}
                    </td>
                    <td className="py-3 pr-4 text-right whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                      {formatAmount(tx.fees)} {baseSymbol}
                    </td>
                    <td
                      className="py-3 pr-4 text-right whitespace-nowrap text-neutral-600 dark:text-neutral-400"
                      title={
                        isBuy
                          ? "Paid per coin, fee included"
                          : "Received per coin, fee already deducted"
                      }
                    >
                      {formatAmount(tx.price)}
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400 hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {tx.transactionHash.slice(0, 6)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-neutral-400 dark:text-neutral-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {remaining > 0 && (
          <div className="flex justify-center mt-6">
            <Button
              onClick={showMore}
              variant="outline"
              className="border-neutral-300 dark:border-neutral-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/30 transition-all duration-200"
            >
              Show More ({remaining} remaining)
            </Button>
          </div>
        )}

        <p className="mt-6 pt-4 border-t border-neutral-200 dark:border-neutral-600 text-xs text-neutral-500 dark:text-neutral-400">
          Built from Buy and Sell events. Coins received by transfer or from a pool&apos;s initial
          supply emit neither, so they do not appear here. Keeps the 30 most recent trades per
          position.
        </p>
      </CardContent>
    </Card>
  );
};

export default TradeHistoryCard;

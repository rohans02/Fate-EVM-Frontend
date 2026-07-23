import { http, fallback, type Transport } from "viem";

// Keyless public RPC lists per chain.
const DEFAULT_RPC_URLS: Record<number, string[]> = {
  11155111: [
    "https://sepolia.drpc.org",
    "https://sepolia.gateway.tenderly.co",
  ],
  61: [
    "https://etc.rivet.link",
    "https://etc.drpc.org",
  ],
};

// User RPCs (prepended, take priority); filled later by the settings page.
const USER_RPC_URLS: Record<number, string[]> = {};
const getUserRpcUrls = (chainId: number): string[] => USER_RPC_URLS[chainId] ?? [];

// fallback() covers node outages, not getLogs range-cap rejections.
export const getTransport = (chainId: number): Transport => {
  const urls = [...getUserRpcUrls(chainId), ...(DEFAULT_RPC_URLS[chainId] ?? [])];
  if (urls.length === 0) {
    return http(); // unknown chain: viem's built-in default
  }
  return fallback(urls.map((url) => http(url)));
};

// Client-side quote for Coin.buy(), kept in bigint end to end: Solidity and bigint both
// truncate on division, so the port matches the chain exactly and a single Number() would not.
// Mirrors Coin.sol / PredictionPool.sol; the ES2017 target rules out 0n literals.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TEN = BigInt(10);
const WAD_DECIMALS = BigInt(18);

export const DENOMINATOR = BigInt(100000);

// Warn when the rounded fee runs more than 10% above the nominal one, which only happens on dust.
const ROUNDING_WARN_NUM = BigInt(11);
const ROUNDING_WARN_DEN = BigInt(10);

// Coin.sol:335
function divUp(a: bigint, b: bigint): bigint {
  return (a + b - ONE) / b;
}

// Coin.sol:326
function scaleUp(a: bigint, baseDecimals: bigint): bigint {
  return a * TEN ** (WAD_DECIMALS - baseDecimals);
}

export type RebalanceTargets = {
  bull: bigint;
  bear: bigint;
};

// Reserves each coin holds after rebalance(), mirroring PredictionPool.sol:140-222 branch for
// branch. Supply is untouched, so reserves are the only thing an oracle move changes. Returns
// null where the real rebalance() reverts, so callers surface that instead of a fake number.
export function simulateRebalance(
  bull: bigint,
  bear: bigint,
  oldPrice: bigint,
  newPrice: bigint,
): RebalanceTargets | null {
  if (newPrice === ZERO || oldPrice === ZERO) return { bull, bear };

  const total = bull + bear;
  if (total === ZERO) return { bull: ZERO, bear: ZERO };

  if (newPrice === oldPrice) return { bull, bear };

  const adjustedBull = (bull * newPrice) / oldPrice;
  const adjustedBear = (bear * oldPrice) / newPrice;
  const denominator = adjustedBull + adjustedBear;
  if (denominator === ZERO) return null; // PredictionPool.sol:190 require; a real buy() reverts here too

  const targetBull = (total * adjustedBull) / denominator;
  // rebalance() conserves total reserve, so the far side is the remainder.
  return { bull: targetBull, bear: total - targetBull };
}

export type BuyQuoteInput = {
  amountIn: bigint;
  isBull: boolean;
  bullReserve: bigint;
  bearReserve: bigint;
  totalSupply: bigint;       // supply of the coin being bought
  previousPrice: bigint;     // oracle price at the pool's last rebalance
  oraclePrice: bigint;       // current oracle price the pending rebalance settles at
  mintFee: bigint;
  treasuryFee: bigint;
  creatorFee: bigint;
  baseDecimals: number;
};

export type BuyQuote = {
  amountIn: bigint;
  vaultAmount: bigint;
  treasuryAmount: bigint;
  creatorAmount: bigint;
  totalFees: bigint;
  amountAfterFees: bigint;
  coinsOut: bigint;          // WAD
  effectivePrice: bigint;    // paid per coin incl. fees, scaled by DENOMINATOR
  nominalFeeRate: bigint;    // the pool's three fees summed, DENOMINATOR terms
  effectiveFeeRate: bigint;  // what this amount actually pays, DENOMINATOR terms
  feeRoundingInflated: boolean;
};

// Each case is a real buy() revert.
export type BuyQuoteFailure =
  | 'rebalance-reverts'
  | 'empty-reserve'
  | 'amount-below-fees'
  | 'unsupported-decimals';

export type BuyQuoteResult =
  | { ok: true; quote: BuyQuote }
  | { ok: false; reason: BuyQuoteFailure };

// buy() rebalances before snapshotting the price (Coin.sol:160 then :166), so this prices off
// the post-rebalance reserve; reading priceBuy() directly would use the stale one.
export function estimateBuy(input: BuyQuoteInput): BuyQuoteResult {
  const {
    amountIn, isBull, bullReserve, bearReserve, totalSupply,
    previousPrice, oraclePrice, mintFee, treasuryFee, creatorFee, baseDecimals,
  } = input;

  if (baseDecimals < 0 || baseDecimals > 18) return { ok: false, reason: 'unsupported-decimals' };
  const decimals = BigInt(baseDecimals);

  const targets = simulateRebalance(bullReserve, bearReserve, previousPrice, oraclePrice);
  if (targets === null) return { ok: false, reason: 'rebalance-reverts' };
  const reserve = isBull ? targets.bull : targets.bear;

  // calculateFees (Coin.sol:274-282): each fee rounds up independently, so small amounts can
  // owe more than they carry.
  const vaultAmount = divUp(amountIn * mintFee, DENOMINATOR);
  const treasuryAmount = divUp(amountIn * treasuryFee, DENOMINATOR);
  const creatorAmount = divUp(amountIn * creatorFee, DENOMINATOR);
  const totalFees = vaultAmount + treasuryAmount + creatorAmount;
  if (totalFees > amountIn) return { ok: false, reason: 'amount-below-fees' }; // Coin.sol:234 underflow-reverts

  const amountAfterFees = amountIn - totalFees;

  // Cross-multiplied, not divided: dividing first would discard the precision being measured.
  const nominalFeeRate = mintFee + treasuryFee + creatorFee;
  const effectiveFeeRate =
    amountIn === ZERO ? ZERO : (totalFees * DENOMINATOR) / amountIn;
  const feeRoundingInflated =
    amountIn > ZERO &&
    nominalFeeRate > ZERO &&
    totalFees * DENOMINATOR * ROUNDING_WARN_DEN >
      amountIn * nominalFeeRate * ROUNDING_WARN_NUM;

  // priceBuy() (Coin.sol:148) off the post-rebalance reserve.
  const price =
    totalSupply === ZERO
      ? DENOMINATOR
      : divUp(scaleUp(reserve, decimals) * DENOMINATOR, totalSupply);
  if (price === ZERO) return { ok: false, reason: 'empty-reserve' };

  const coinsOut = divUp(DENOMINATOR * scaleUp(amountAfterFees, decimals), price); // _mintCoins (Coin.sol:238)
  const effectivePrice =
    coinsOut === ZERO ? ZERO : divUp(scaleUp(amountIn, decimals) * DENOMINATOR, coinsOut);

  return {
    ok: true,
    quote: {
      amountIn, vaultAmount, treasuryAmount, creatorAmount,
      totalFees, amountAfterFees, coinsOut, effectivePrice,
      nominalFeeRate, effectiveFeeRate, feeRoundingInflated,
    },
  };
}

export const SATOSHIS_PER_FCBTC = 100_000_000;
export const MAX_FCBTC = 21_000_000;
export const MAX_MONEY_SUPPLY_SATS = MAX_FCBTC * SATOSHIS_PER_FCBTC;

export const DEFAULT_GENESIS_BALANCE_SATS = 100_000_000; // 1 FC-BTC per initial agent

export function assertSafePositiveSats(amountSats: number) {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new Error('Amount must be a positive safe integer number of satoshis.');
  }
}

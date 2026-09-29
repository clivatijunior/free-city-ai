import { v } from 'convex/values';
import { query } from '../_generated/server';

const SAMPLE_LIMIT = 1_000;

export const worldSnapshot = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const [accounts, assets, listings, contracts, disputes, transactions] = await Promise.all([
      ctx.db
        .query('economyAccounts')
        .withIndex('world', (q) => q.eq('worldId', args.worldId))
        .take(SAMPLE_LIMIT),
      ctx.db
        .query('assets')
        .withIndex('world_owner', (q) => q.eq('worldId', args.worldId))
        .take(SAMPLE_LIMIT),
      ctx.db
        .query('marketListings')
        .withIndex('world_status', (q) => q.eq('worldId', args.worldId))
        .take(SAMPLE_LIMIT),
      ctx.db
        .query('voluntaryContracts')
        .withIndex('world_status', (q) => q.eq('worldId', args.worldId))
        .take(SAMPLE_LIMIT),
      ctx.db
        .query('disputes')
        .withIndex('world_contract', (q) => q.eq('worldId', args.worldId))
        .take(SAMPLE_LIMIT),
      ctx.db
        .query('economyTransactions')
        .withIndex('world_createdAt', (q) => q.eq('worldId', args.worldId))
        .order('desc')
        .take(100),
    ]);

    const totalBalanceSats = accounts.reduce((sum, account) => sum + account.balanceSats, 0);
    const transferredSats = transactions
      .filter((transaction) => transaction.fromPlayerId !== undefined)
      .reduce((sum, transaction) => sum + transaction.amountSats, 0);
    const assetUnitsByType = assets.reduce<Record<string, number>>((totals, asset) => {
      totals[asset.type] = (totals[asset.type] ?? 0) + asset.quantity;
      return totals;
    }, {});

    return {
      capturedAt: Date.now(),
      accounts: accounts.length,
      totalBalanceSats,
      assets: assets.length,
      assetUnitsByType,
      openListings: listings.filter((listing) => listing.status === 'open').length,
      filledListings: listings.filter((listing) => listing.status === 'filled').length,
      proposedContracts: contracts.filter((contract) => contract.status === 'proposed').length,
      executedContracts: contracts.filter((contract) => contract.status === 'executed').length,
      openDisputes: disputes.filter((dispute) => dispute.status === 'open').length,
      resolvedDisputes: disputes.filter((dispute) => dispute.status === 'resolved').length,
      recentTransactionCount: transactions.length,
      recentTransferredSats: transferredSats,
      sampleLimit: SAMPLE_LIMIT,
      truncated:
        accounts.length === SAMPLE_LIMIT ||
        assets.length === SAMPLE_LIMIT ||
        listings.length === SAMPLE_LIMIT ||
        contracts.length === SAMPLE_LIMIT ||
        disputes.length === SAMPLE_LIMIT,
    };
  },
});


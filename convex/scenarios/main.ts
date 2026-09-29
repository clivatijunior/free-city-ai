import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { ensurePlayerEconomy } from '../economy/bootstrap';
import { currentSupply, getAccount, transferSats } from '../economy/service';
import { calculateTotalPrice } from '../market/domain';
import { transferOwnedAsset } from '../property/service';

export const runMarketTradeSmoke = mutation({
  args: {
    worldId: v.id('worlds'),
    scenarioKey: v.string(),
    sellerPlayerId: playerId,
    buyerPlayerId: playerId,
  },
  handler: async (ctx, args) => {
    const scenarioKey = args.scenarioKey.trim();
    if (!scenarioKey || scenarioKey.length > 100) {
      throw new ConvexError({
        kind: 'invalidScenarioKey',
        message: 'Scenario key must contain 1 to 100 characters.',
      });
    }
    if (args.sellerPlayerId === args.buyerPlayerId) {
      throw new ConvexError({
        kind: 'sameParty',
        message: 'Scenario requires two different players.',
      });
    }
    const existing = await ctx.db
      .query('simulationRuns')
      .withIndex('world_scenarioKey', (q) =>
        q.eq('worldId', args.worldId).eq('scenarioKey', scenarioKey),
      )
      .unique();
    if (existing) return existing;

    await ensurePlayerEconomy(ctx, args.worldId, args.sellerPlayerId);
    await ensurePlayerEconomy(ctx, args.worldId, args.buyerPlayerId);
    const sourceAsset = await ctx.db
      .query('assets')
      .withIndex('world_owner_type', (q) =>
        q.eq('worldId', args.worldId).eq('ownerPlayerId', args.sellerPlayerId).eq('type', 'food'),
      )
      .first();
    if (!sourceAsset || sourceAsset.quantity < 1 || !sourceAsset.divisible) {
      throw new ConvexError({
        kind: 'scenarioAssetMissing',
        message: 'Seller needs at least one divisible food unit.',
      });
    }

    const quantity = 1;
    const unitPriceSats = 1_000;
    const totalPriceSats = calculateTotalPrice(quantity, unitPriceSats);
    const sellerBefore = await getAccount(ctx, args.worldId, args.sellerPlayerId);
    const buyerBefore = await getAccount(ctx, args.worldId, args.buyerPlayerId);
    if (!sellerBefore || !buyerBefore) throw new Error('Scenario bootstrap failed.');
    const totalSupplyBeforeSats = await currentSupply(ctx, args.worldId);
    const now = Date.now();
    const listingId = crypto.randomUUID();
    const listingDocId = await ctx.db.insert('marketListings', {
      worldId: args.worldId,
      listingId,
      sellerPlayerId: args.sellerPlayerId,
      assetId: sourceAsset.assetId,
      quantity,
      unitPriceSats,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    const transactionId = await transferSats(ctx, {
      worldId: args.worldId,
      fromPlayerId: args.buyerPlayerId,
      toPlayerId: args.sellerPlayerId,
      amountSats: totalPriceSats,
      type: 'purchase',
      memo: `Simulation ${scenarioKey}`,
    });
    const transfer = await transferOwnedAsset(ctx, {
      worldId: args.worldId,
      fromPlayerId: args.sellerPlayerId,
      toPlayerId: args.buyerPlayerId,
      assetId: sourceAsset.assetId,
      quantity,
      reason: 'sale',
      linkedTransactionId: transactionId,
    });
    await ctx.db.patch(listingDocId, {
      status: 'filled',
      buyerPlayerId: args.buyerPlayerId,
      transactionId,
      resultingAssetId: transfer.resultingAssetId,
      updatedAt: Date.now(),
    });

    const sellerAfter = await getAccount(ctx, args.worldId, args.sellerPlayerId);
    const buyerAfter = await getAccount(ctx, args.worldId, args.buyerPlayerId);
    const totalSupplyAfterSats = await currentSupply(ctx, args.worldId);
    if (
      !sellerAfter ||
      !buyerAfter ||
      sellerAfter.balanceSats !== sellerBefore.balanceSats + totalPriceSats ||
      buyerAfter.balanceSats !== buyerBefore.balanceSats - totalPriceSats ||
      totalSupplyAfterSats !== totalSupplyBeforeSats
    ) {
      throw new ConvexError({
        kind: 'scenarioInvariantFailed',
        message: 'Trade accounting invariant failed.',
      });
    }

    const runId = await ctx.db.insert('simulationRuns', {
      worldId: args.worldId,
      scenarioKey,
      scenarioType: 'marketTradeSmoke',
      sellerPlayerId: args.sellerPlayerId,
      buyerPlayerId: args.buyerPlayerId,
      listingId,
      transactionId,
      sourceAssetId: sourceAsset.assetId,
      resultingAssetId: transfer.resultingAssetId,
      quantity,
      totalPriceSats,
      totalSupplyBeforeSats,
      totalSupplyAfterSats,
      status: 'passed',
      createdAt: Date.now(),
    });
    return (await ctx.db.get(runId))!;
  },
});

export const recentRuns = query({
  args: { worldId: v.id('worlds'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 20), 100));
    return await ctx.db
      .query('simulationRuns')
      .withIndex('world_createdAt', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(limit);
  },
});

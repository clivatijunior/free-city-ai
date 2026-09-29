import { ConvexError, v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';

export const snapshot = internalQuery({
  args: { worldId: v.id('worlds'), playerId },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query('economyAccounts')
      .withIndex('world_player', (q) =>
        q.eq('worldId', args.worldId).eq('playerId', args.playerId),
      )
      .unique();
    const assets = await ctx.db
      .query('assets')
      .withIndex('world_owner', (q) =>
        q.eq('worldId', args.worldId).eq('ownerPlayerId', args.playerId),
      )
      .take(100);
    const listings = await ctx.db
      .query('marketListings')
      .withIndex('world_status', (q) => q.eq('worldId', args.worldId).eq('status', 'open'))
      .take(100);
    const contractsAsSeller = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_seller', (q) =>
        q.eq('worldId', args.worldId).eq('sellerPlayerId', args.playerId),
      )
      .order('desc')
      .take(20);
    const contractsAsBuyer = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_buyer', (q) =>
        q.eq('worldId', args.worldId).eq('buyerPlayerId', args.playerId),
      )
      .order('desc')
      .take(20);
    const reputation = await ctx.db
      .query('reputationProfiles')
      .withIndex('world_player', (q) =>
        q.eq('worldId', args.worldId).eq('playerId', args.playerId),
      )
      .unique();
    return {
      balanceSats: account?.balanceSats ?? 0,
      assets: assets.map(({ assetId, type, quantity, divisible }) => ({ assetId, type, quantity, divisible })),
      openListings: listings.map(
        ({ listingId, sellerPlayerId, assetId, quantity, unitPriceSats }) => ({
          listingId,
          sellerPlayerId,
          assetId,
          quantity,
          unitPriceSats,
        }),
      ),
      recentContracts: [...contractsAsSeller, ...contractsAsBuyer]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map(({ contractId, sellerPlayerId, buyerPlayerId, paymentSats, status }) => ({
          contractId,
          sellerPlayerId,
          buyerPlayerId,
          paymentSats,
          status,
        })),
      reputation: reputation
        ? {
            score: reputation.score,
            completedContracts: reputation.completedContracts,
            adverseRulings: reputation.adverseRulings,
          }
        : { score: 0, completedContracts: 0, adverseRulings: 0 },
    };
  },
});

export const recordPlan = internalMutation({
  args: {
    worldId: v.id('worlds'),
    playerId,
    goal: v.string(),
    proposalJson: v.string(),
    provider: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const planId = crypto.randomUUID();
    await ctx.db.insert('economicPlans', {
      ...args,
      planId,
      status: 'proposed',
      createdAt: Date.now(),
    });
    return planId;
  },
});

export const recentPlans = query({
  args: { worldId: v.id('worlds'), playerId, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 10), 50));
    return await ctx.db
      .query('economicPlans')
      .withIndex('world_player_createdAt', (q) =>
        q.eq('worldId', args.worldId).eq('playerId', args.playerId),
      )
      .order('desc')
      .take(limit);
  },
});

export const dismissPlan = mutation({
  args: { worldId: v.id('worlds'), planId: v.string(), playerId },
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query('economicPlans')
      .withIndex('world_plan', (q) => q.eq('worldId', args.worldId).eq('planId', args.planId))
      .unique();
    if (!plan || plan.playerId !== args.playerId) {
      throw new ConvexError({ kind: 'planMissing', message: 'Plan does not belong to this player.' });
    }
    await ctx.db.patch(plan._id, { status: 'dismissed' });
    return { dismissed: true };
  },
});

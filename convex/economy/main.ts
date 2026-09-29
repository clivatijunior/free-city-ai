import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { MAX_MONEY_SUPPLY_SATS } from './constants';
import {
  assertPositiveSats,
  createGenesisAccount as createGenesisAccountRecord,
  currentSupply,
  getAccount,
  transferSats,
} from './service';

export const createGenesisAccount = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId,
    initialBalanceSats: v.number(),
  },
  handler: async (ctx, args) => {
    assertPositiveSats(args.initialBalanceSats);

    if (await getAccount(ctx, args.worldId, args.playerId)) {
      throw new ConvexError({
        kind: 'accountExists',
        message: 'This player already has an economy account.',
      });
    }

    const accountId = await createGenesisAccountRecord(
      ctx,
      args.worldId,
      args.playerId,
      args.initialBalanceSats,
    );
    return { accountId };
  },
});

export const balance = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
  },
  handler: async (ctx, args) => {
    return await getAccount(ctx, args.worldId, args.playerId);
  },
});

export const transfer = mutation({
  args: {
    worldId: v.id('worlds'),
    fromPlayerId: playerId,
    toPlayerId: playerId,
    amountSats: v.number(),
    memo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertPositiveSats(args.amountSats);

    if (args.fromPlayerId === args.toPlayerId) {
      throw new ConvexError({
        kind: 'sameAccount',
        message: 'Sender and receiver must be different.',
      });
    }

    const txId = await transferSats(ctx, {
      worldId: args.worldId,
      fromPlayerId: args.fromPlayerId,
      toPlayerId: args.toPlayerId,
      amountSats: args.amountSats,
      type: 'transfer',
      memo: args.memo,
    });
    return { txId };
  },
});

export const auditSupply = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const totalSats = await currentSupply(ctx, args.worldId);
    return {
      totalSats,
      maxSupplySats: MAX_MONEY_SUPPLY_SATS,
      remainingIssuableSats: MAX_MONEY_SUPPLY_SATS - totalSats,
      withinCap: totalSats <= MAX_MONEY_SUPPLY_SATS,
    };
  },
});

export const recentTransactions = query({
  args: {
    worldId: v.id('worlds'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('economyTransactions')
      .withIndex('world_createdAt', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(Math.min(args.limit ?? 50, 200));
  },
});

export const recentForPlayer = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 10), 50));
    const sent = await ctx.db
      .query('economyTransactions')
      .withIndex('world_from', (q) =>
        q.eq('worldId', args.worldId).eq('fromPlayerId', args.playerId),
      )
      .order('desc')
      .take(limit);
    const received = await ctx.db
      .query('economyTransactions')
      .withIndex('world_to', (q) => q.eq('worldId', args.worldId).eq('toPlayerId', args.playerId))
      .order('desc')
      .take(limit);
    return [...sent, ...received]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((transaction) => ({
        ...transaction,
        direction:
          transaction.fromPlayerId === args.playerId ? ('sent' as const) : ('received' as const),
      }));
  },
});


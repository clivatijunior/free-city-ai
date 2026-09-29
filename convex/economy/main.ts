import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { MAX_MONEY_SUPPLY_SATS } from './constants';

function assertPositiveSats(amountSats: number) {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new ConvexError({
      kind: 'invalidAmount',
      message: 'Amount must be a positive safe integer number of satoshis.',
    });
  }
}

async function getAccount(ctx: any, worldId: any, playerIdValue: string) {
  return await ctx.db
    .query('economyAccounts')
    .withIndex('world_player', (q: any) =>
      q.eq('worldId', worldId).eq('playerId', playerIdValue),
    )
    .unique();
}

async function currentSupply(ctx: any, worldId: any) {
  const accounts = await ctx.db
    .query('economyAccounts')
    .withIndex('world', (q: any) => q.eq('worldId', worldId))
    .collect();
  return accounts.reduce((sum: number, account: any) => sum + account.balanceSats, 0);
}

export const createGenesisAccount = mutation({
  args: {
    worldId: v.id('worlds'),
    playerId,
    initialBalanceSats: v.number(),
  },
  handler: async (ctx, args) => {
    assertPositiveSats(args.initialBalanceSats);

    const existing = await getAccount(ctx, args.worldId, args.playerId);
    if (existing) {
      throw new ConvexError({
        kind: 'accountExists',
        message: 'This player already has an economy account.',
      });
    }

    const supply = await currentSupply(ctx, args.worldId);
    if (supply + args.initialBalanceSats > MAX_MONEY_SUPPLY_SATS) {
      throw new ConvexError({
        kind: 'supplyCapExceeded',
        message: 'Genesis allocation would exceed the fixed monetary cap.',
      });
    }

    const now = Date.now();
    const accountId = await ctx.db.insert('economyAccounts', {
      worldId: args.worldId,
      playerId: args.playerId,
      balanceSats: args.initialBalanceSats,
      createdAt: now,
      updatedAt: now,
    });

    const txId = crypto.randomUUID();
    await ctx.db.insert('economyTransactions', {
      worldId: args.worldId,
      txId,
      toPlayerId: args.playerId,
      amountSats: args.initialBalanceSats,
      type: 'genesis',
      memo: 'Free City genesis allocation',
      createdAt: now,
    });

    return { accountId, txId };
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

    const from = await getAccount(ctx, args.worldId, args.fromPlayerId);
    const to = await getAccount(ctx, args.worldId, args.toPlayerId);

    if (!from || !to) {
      throw new ConvexError({
        kind: 'accountMissing',
        message: 'Both accounts must exist.',
      });
    }

    if (from.balanceSats < args.amountSats) {
      throw new ConvexError({
        kind: 'insufficientFunds',
        message: 'Insufficient balance.',
      });
    }

    const now = Date.now();

    await ctx.db.patch(from._id, {
      balanceSats: from.balanceSats - args.amountSats,
      updatedAt: now,
    });
    await ctx.db.patch(to._id, {
      balanceSats: to.balanceSats + args.amountSats,
      updatedAt: now,
    });

    const txId = crypto.randomUUID();
    await ctx.db.insert('economyTransactions', {
      worldId: args.worldId,
      txId,
      fromPlayerId: args.fromPlayerId,
      toPlayerId: args.toPlayerId,
      amountSats: args.amountSats,
      type: 'transfer',
      memo: args.memo,
      createdAt: now,
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

import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const economyTables = {
  economyAccounts: defineTable({
    worldId: v.id('worlds'),
    playerId,
    balanceSats: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('world_player', ['worldId', 'playerId'])
    .index('world', ['worldId']),

  economyTransactions: defineTable({
    worldId: v.id('worlds'),
    txId: v.string(),
    fromPlayerId: v.optional(playerId),
    toPlayerId: v.optional(playerId),
    amountSats: v.number(),
    type: v.union(
      v.literal('genesis'),
      v.literal('transfer'),
      v.literal('purchase'),
      v.literal('refund'),
      v.literal('awardPayment'),
    ),
    memo: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('world_tx', ['worldId', 'txId'])
    .index('world_createdAt', ['worldId', 'createdAt'])
    .index('world_from', ['worldId', 'fromPlayerId', 'createdAt'])
    .index('world_to', ['worldId', 'toPlayerId', 'createdAt']),
};

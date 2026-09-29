import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const scenarioTables = {
  simulationRuns: defineTable({
    worldId: v.id('worlds'),
    scenarioKey: v.string(),
    scenarioType: v.literal('marketTradeSmoke'),
    sellerPlayerId: playerId,
    buyerPlayerId: playerId,
    listingId: v.string(),
    transactionId: v.string(),
    sourceAssetId: v.string(),
    resultingAssetId: v.string(),
    quantity: v.number(),
    totalPriceSats: v.number(),
    totalSupplyBeforeSats: v.number(),
    totalSupplyAfterSats: v.number(),
    status: v.literal('passed'),
    createdAt: v.number(),
  })
    .index('world_scenarioKey', ['worldId', 'scenarioKey'])
    .index('world_createdAt', ['worldId', 'createdAt']),
};

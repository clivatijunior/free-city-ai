import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const plannerTables = {
  economicPlans: defineTable({
    worldId: v.id('worlds'),
    planId: v.string(),
    playerId,
    goal: v.string(),
    proposalJson: v.string(),
    provider: v.string(),
    model: v.string(),
    status: v.union(v.literal('proposed'), v.literal('dismissed')),
    createdAt: v.number(),
  })
    .index('world_plan', ['worldId', 'planId'])
    .index('world_player_createdAt', ['worldId', 'playerId', 'createdAt']),
};


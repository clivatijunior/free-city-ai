import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { agentTables } from './agent/schema';
import { aiTownTables } from './aiTown/schema';
import { conversationId, playerId } from './aiTown/ids';
import { economyTables } from './economy/schema';
import { engineTables } from './engine/schema';
import { propertyTables } from './property/schema';
import { marketTables } from './market/schema';
import { contractTables } from './contracts/schema';
import { arbitrationTables } from './arbitration/schema';
import { plannerTables } from './planner/schema';
import { scenarioTables } from './scenarios/schema';

export default defineSchema({
  music: defineTable({
    storageId: v.string(),
    type: v.union(v.literal('background'), v.literal('player')),
  }),

  messages: defineTable({
    conversationId,
    messageUuid: v.string(),
    author: playerId,
    text: v.string(),
    worldId: v.optional(v.id('worlds')),
  })
    .index('conversationId', ['worldId', 'conversationId'])
    .index('messageUuid', ['conversationId', 'messageUuid']),

  ...agentTables,
  ...aiTownTables,
  ...economyTables,
  ...engineTables,
  ...propertyTables,
  ...marketTables,
  ...contractTables,
  ...arbitrationTables,
  ...plannerTables,
  ...scenarioTables,
});

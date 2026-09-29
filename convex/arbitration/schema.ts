import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const arbitrationTables = {
  disputes: defineTable({
    worldId: v.id('worlds'),
    disputeId: v.string(),
    contractId: v.string(),
    claimantPlayerId: playerId,
    respondentPlayerId: playerId,
    arbitratorPlayerId: playerId,
    claim: v.string(),
    status: v.union(v.literal('open'), v.literal('resolved')),
    ruling: v.optional(v.string()),
    liablePlayerId: v.optional(playerId),
    awardSats: v.optional(v.number()),
    awardTransactionId: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index('world_dispute', ['worldId', 'disputeId'])
    .index('world_contract', ['worldId', 'contractId'])
    .index('world_arbitrator_status', ['worldId', 'arbitratorPlayerId', 'status']),

  reputationProfiles: defineTable({
    worldId: v.id('worlds'),
    playerId,
    score: v.number(),
    completedContracts: v.number(),
    disputesOpened: v.number(),
    adverseRulings: v.number(),
    updatedAt: v.number(),
  }).index('world_player', ['worldId', 'playerId']),

  reputationEvents: defineTable({
    worldId: v.id('worlds'),
    eventId: v.string(),
    playerId,
    contractId: v.optional(v.string()),
    disputeId: v.optional(v.string()),
    delta: v.number(),
    reason: v.union(
      v.literal('contractCompleted'),
      v.literal('disputeOpened'),
      v.literal('rulingUpheld'),
      v.literal('adverseRuling'),
    ),
    createdAt: v.number(),
  })
    .index('world_player_createdAt', ['worldId', 'playerId', 'createdAt'])
    .index('world_event', ['worldId', 'eventId']),
};


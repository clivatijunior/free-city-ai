import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const assetType = v.union(
  v.literal('food'),
  v.literal('wood'),
  v.literal('stone'),
  v.literal('land'),
  v.literal('building'),
  v.literal('tool'),
);

export const propertyTables = {
  assets: defineTable({
    worldId: v.id('worlds'),
    assetId: v.string(),
    type: assetType,
    ownerPlayerId: playerId,
    quantity: v.number(),
    divisible: v.boolean(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('world_asset', ['worldId', 'assetId'])
    .index('world_owner', ['worldId', 'ownerPlayerId'])
    .index('world_owner_type', ['worldId', 'ownerPlayerId', 'type']),

  assetTransfers: defineTable({
    worldId: v.id('worlds'),
    transferId: v.string(),
    sourceAssetId: v.string(),
    resultingAssetId: v.string(),
    fromPlayerId: playerId,
    toPlayerId: playerId,
    quantity: v.number(),
    reason: v.union(
      v.literal('gift'),
      v.literal('sale'),
      v.literal('contract'),
      v.literal('inheritance'),
    ),
    linkedTransactionId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('world_source_asset', ['worldId', 'sourceAssetId', 'createdAt'])
    .index('world_transfer', ['worldId', 'transferId']),

  propertyAuthorizations: defineTable({
    worldId: v.id('worlds'),
    authorizationId: v.string(),
    ownerPlayerId: playerId,
    granteePlayerId: playerId,
    assetId: v.string(),
    maxQuantity: v.number(),
    purpose: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('world_asset_grantee', ['worldId', 'assetId', 'granteePlayerId'])
    .index('world_owner', ['worldId', 'ownerPlayerId']),

  institutionalEvents: defineTable({
    worldId: v.id('worlds'),
    eventId: v.string(),
    actorPlayerId: playerId,
    targetPlayerId: v.optional(playerId),
    assetId: v.optional(v.string()),
    kind: v.union(
      v.literal('propertyViolationAttempt'),
      v.literal('authorizationGranted'),
      v.literal('authorizationRevoked'),
      v.literal('assetTransfer'),
    ),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('world_createdAt', ['worldId', 'createdAt'])
    .index('world_actor', ['worldId', 'actorPlayerId', 'createdAt']),
};

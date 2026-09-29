import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const contractStatus = v.union(
  v.literal('proposed'),
  v.literal('executed'),
  v.literal('rejected'),
  v.literal('cancelled'),
  v.literal('disputed'),
  v.literal('resolved'),
);

export const contractTables = {
  voluntaryContracts: defineTable({
    worldId: v.id('worlds'),
    contractId: v.string(),
    proposerPlayerId: playerId,
    sellerPlayerId: playerId,
    buyerPlayerId: playerId,
    arbitratorPlayerId: v.optional(playerId),
    assetId: v.optional(v.string()),
    assetQuantity: v.optional(v.number()),
    paymentSats: v.number(),
    terms: v.string(),
    status: contractStatus,
    transactionId: v.optional(v.string()),
    resultingAssetId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    executedAt: v.optional(v.number()),
  })
    .index('world_contract', ['worldId', 'contractId'])
    .index('world_status', ['worldId', 'status'])
    .index('world_seller', ['worldId', 'sellerPlayerId'])
    .index('world_buyer', ['worldId', 'buyerPlayerId']),

  contractSignatures: defineTable({
    worldId: v.id('worlds'),
    contractId: v.string(),
    signerPlayerId: playerId,
    decision: v.union(v.literal('accepted'), v.literal('rejected')),
    createdAt: v.number(),
  }).index('world_contract_signer', ['worldId', 'contractId', 'signerPlayerId']),
};


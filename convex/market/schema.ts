import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { playerId } from '../aiTown/ids';

export const listingStatus = v.union(
  v.literal('open'),
  v.literal('filled'),
  v.literal('cancelled'),
);

export const marketTables = {
  marketListings: defineTable({
    worldId: v.id('worlds'),
    listingId: v.string(),
    sellerPlayerId: playerId,
    buyerPlayerId: v.optional(playerId),
    assetId: v.string(),
    quantity: v.number(),
    unitPriceSats: v.number(),
    status: listingStatus,
    transactionId: v.optional(v.string()),
    resultingAssetId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('world_listing', ['worldId', 'listingId'])
    .index('world_status', ['worldId', 'status'])
    .index('world_seller_status', ['worldId', 'sellerPlayerId', 'status']),
};

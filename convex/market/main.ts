import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { transferSats } from '../economy/service';
import { getAsset, transferOwnedAsset } from '../property/service';
import { calculateTotalPrice } from './domain';

export const createListing = mutation({
  args: {
    worldId: v.id('worlds'),
    sellerPlayerId: playerId,
    assetId: v.string(),
    quantity: v.number(),
    unitPriceSats: v.number(),
  },
  handler: async (ctx, args) => {
    calculateTotalPrice(args.quantity, args.unitPriceSats);
    const asset = await getAsset(ctx, args.worldId, args.assetId);
    if (!asset || asset.ownerPlayerId !== args.sellerPlayerId) {
      throw new ConvexError({
        kind: 'notOwner',
        message: 'Only the current owner may list an asset.',
      });
    }
    if (args.quantity > asset.quantity || (!asset.divisible && args.quantity !== asset.quantity)) {
      throw new ConvexError({
        kind: 'invalidQuantity',
        message: 'Listing quantity is not transferable.',
      });
    }
    const now = Date.now();
    const listingId = crypto.randomUUID();
    await ctx.db.insert('marketListings', {
      worldId: args.worldId,
      listingId,
      sellerPlayerId: args.sellerPlayerId,
      assetId: args.assetId,
      quantity: args.quantity,
      unitPriceSats: args.unitPriceSats,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    return { listingId };
  },
});

export const purchase = mutation({
  args: { worldId: v.id('worlds'), listingId: v.string(), buyerPlayerId: playerId },
  handler: async (ctx, args) => {
    const listing = await ctx.db
      .query('marketListings')
      .withIndex('world_listing', (q) =>
        q.eq('worldId', args.worldId).eq('listingId', args.listingId),
      )
      .unique();
    if (!listing || listing.status !== 'open') {
      throw new ConvexError({ kind: 'listingUnavailable', message: 'Listing is not open.' });
    }
    if (listing.sellerPlayerId === args.buyerPlayerId) {
      throw new ConvexError({
        kind: 'selfPurchase',
        message: 'Seller cannot buy their own listing.',
      });
    }
    const amountSats = calculateTotalPrice(listing.quantity, listing.unitPriceSats);
    const transactionId = await transferSats(ctx, {
      worldId: args.worldId,
      fromPlayerId: args.buyerPlayerId,
      toPlayerId: listing.sellerPlayerId,
      amountSats,
      type: 'purchase',
      memo: `Market purchase ${listing.listingId}`,
    });
    const transfer = await transferOwnedAsset(ctx, {
      worldId: args.worldId,
      fromPlayerId: listing.sellerPlayerId,
      toPlayerId: args.buyerPlayerId,
      assetId: listing.assetId,
      quantity: listing.quantity,
      reason: 'sale',
      linkedTransactionId: transactionId,
    });
    await ctx.db.patch(listing._id, {
      status: 'filled',
      buyerPlayerId: args.buyerPlayerId,
      transactionId,
      resultingAssetId: transfer.resultingAssetId,
      updatedAt: Date.now(),
    });
    return { transactionId, ...transfer };
  },
});

export const cancelListing = mutation({
  args: { worldId: v.id('worlds'), listingId: v.string(), sellerPlayerId: playerId },
  handler: async (ctx, args) => {
    const listing = await ctx.db
      .query('marketListings')
      .withIndex('world_listing', (q) =>
        q.eq('worldId', args.worldId).eq('listingId', args.listingId),
      )
      .unique();
    if (!listing || listing.status !== 'open') {
      throw new ConvexError({ kind: 'listingUnavailable', message: 'Listing is not open.' });
    }
    if (listing.sellerPlayerId !== args.sellerPlayerId) {
      throw new ConvexError({ kind: 'notSeller', message: 'Only the seller may cancel.' });
    }
    await ctx.db.patch(listing._id, { status: 'cancelled', updatedAt: Date.now() });
    return { cancelled: true };
  },
});

export const openListings = query({
  args: { worldId: v.id('worlds'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 100));
    return await ctx.db
      .query('marketListings')
      .withIndex('world_status', (q) => q.eq('worldId', args.worldId).eq('status', 'open'))
      .order('desc')
      .take(limit);
  },
});


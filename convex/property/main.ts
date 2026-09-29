import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { assetType } from './schema';

function assertPositiveQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new ConvexError({
      kind: 'invalidQuantity',
      message: 'Quantity must be a positive safe integer.',
    });
  }
}

async function getAsset(ctx: any, worldId: any, assetId: string) {
  return await ctx.db
    .query('assets')
    .withIndex('world_asset', (q: any) =>
      q.eq('worldId', worldId).eq('assetId', assetId),
    )
    .unique();
}

export const getOwnedAssets = query({
  args: {
    worldId: v.id('worlds'),
    ownerPlayerId: playerId,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('assets')
      .withIndex('world_owner', (q) =>
        q.eq('worldId', args.worldId).eq('ownerPlayerId', args.ownerPlayerId),
      )
      .collect();
  },
});

export const createGenesisAsset = mutation({
  args: {
    worldId: v.id('worlds'),
    ownerPlayerId: playerId,
    type: assetType,
    quantity: v.number(),
    divisible: v.boolean(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    assertPositiveQuantity(args.quantity);

    const now = Date.now();
    const assetId = crypto.randomUUID();

    await ctx.db.insert('assets', {
      worldId: args.worldId,
      assetId,
      type: args.type,
      ownerPlayerId: args.ownerPlayerId,
      quantity: args.quantity,
      divisible: args.divisible,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    return { assetId };
  },
});

export const authorizeUse = mutation({
  args: {
    worldId: v.id('worlds'),
    ownerPlayerId: playerId,
    granteePlayerId: playerId,
    assetId: v.string(),
    maxQuantity: v.number(),
    purpose: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertPositiveQuantity(args.maxQuantity);

    const asset = await getAsset(ctx, args.worldId, args.assetId);
    if (!asset) {
      throw new ConvexError({ kind: 'assetMissing', message: 'Asset does not exist.' });
    }
    if (asset.ownerPlayerId !== args.ownerPlayerId) {
      throw new ConvexError({
        kind: 'notOwner',
        message: 'Only the owner may grant authorization.',
      });
    }
    if (args.maxQuantity > asset.quantity) {
      throw new ConvexError({
        kind: 'quantityTooLarge',
        message: 'Authorization exceeds owned quantity.',
      });
    }

    const authorizationId = crypto.randomUUID();
    const now = Date.now();

    await ctx.db.insert('propertyAuthorizations', {
      worldId: args.worldId,
      authorizationId,
      ownerPlayerId: args.ownerPlayerId,
      granteePlayerId: args.granteePlayerId,
      assetId: args.assetId,
      maxQuantity: args.maxQuantity,
      purpose: args.purpose,
      expiresAt: args.expiresAt,
      createdAt: now,
    });

    await ctx.db.insert('institutionalEvents', {
      worldId: args.worldId,
      eventId: crypto.randomUUID(),
      actorPlayerId: args.ownerPlayerId,
      targetPlayerId: args.granteePlayerId,
      assetId: args.assetId,
      kind: 'authorizationGranted',
      createdAt: now,
    });

    return { authorizationId };
  },
});

export const transferAsset = mutation({
  args: {
    worldId: v.id('worlds'),
    fromPlayerId: playerId,
    toPlayerId: playerId,
    assetId: v.string(),
    quantity: v.number(),
    reason: v.union(
      v.literal('gift'),
      v.literal('sale'),
      v.literal('contract'),
      v.literal('inheritance'),
    ),
    linkedTransactionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertPositiveQuantity(args.quantity);

    if (args.fromPlayerId === args.toPlayerId) {
      throw new ConvexError({
        kind: 'sameOwner',
        message: 'Source and destination must be different.',
      });
    }

    const asset = await getAsset(ctx, args.worldId, args.assetId);
    if (!asset) {
      throw new ConvexError({ kind: 'assetMissing', message: 'Asset does not exist.' });
    }
    if (asset.ownerPlayerId !== args.fromPlayerId) {
      throw new ConvexError({
        kind: 'notOwner',
        message: 'Only the owner may transfer this asset.',
      });
    }
    if (args.quantity > asset.quantity) {
      throw new ConvexError({
        kind: 'insufficientAsset',
        message: 'Insufficient asset quantity.',
      });
    }
    if (!asset.divisible && args.quantity !== asset.quantity) {
      throw new ConvexError({
        kind: 'indivisibleAsset',
        message: 'Indivisible assets must be transferred in full.',
      });
    }

    const now = Date.now();
    let resultingAssetId = asset.assetId;

    if (args.quantity === asset.quantity) {
      await ctx.db.patch(asset._id, {
        ownerPlayerId: args.toPlayerId,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(asset._id, {
        quantity: asset.quantity - args.quantity,
        updatedAt: now,
      });

      resultingAssetId = crypto.randomUUID();
      await ctx.db.insert('assets', {
        worldId: args.worldId,
        assetId: resultingAssetId,
        type: asset.type,
        ownerPlayerId: args.toPlayerId,
        quantity: args.quantity,
        divisible: asset.divisible,
        metadata: asset.metadata,
        createdAt: now,
        updatedAt: now,
      });
    }

    const transferId = crypto.randomUUID();

    await ctx.db.insert('assetTransfers', {
      worldId: args.worldId,
      transferId,
      sourceAssetId: asset.assetId,
      resultingAssetId,
      fromPlayerId: args.fromPlayerId,
      toPlayerId: args.toPlayerId,
      quantity: args.quantity,
      reason: args.reason,
      linkedTransactionId: args.linkedTransactionId,
      createdAt: now,
    });

    await ctx.db.insert('institutionalEvents', {
      worldId: args.worldId,
      eventId: crypto.randomUUID(),
      actorPlayerId: args.fromPlayerId,
      targetPlayerId: args.toPlayerId,
      assetId: resultingAssetId,
      kind: 'assetTransfer',
      createdAt: now,
    });

    return { transferId, resultingAssetId };
  },
});

export const attemptUse = mutation({
  args: {
    worldId: v.id('worlds'),
    actorPlayerId: playerId,
    assetId: v.string(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    assertPositiveQuantity(args.quantity);

    const asset = await getAsset(ctx, args.worldId, args.assetId);
    if (!asset) {
      throw new ConvexError({ kind: 'assetMissing', message: 'Asset does not exist.' });
    }

    if (asset.ownerPlayerId === args.actorPlayerId) {
      return { allowed: true, basis: 'ownership' as const };
    }

    const now = Date.now();
    const grants = await ctx.db
      .query('propertyAuthorizations')
      .withIndex('world_asset_grantee', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('assetId', args.assetId)
          .eq('granteePlayerId', args.actorPlayerId),
      )
      .collect();

    const validGrant = grants.find(
      (grant) =>
        !grant.revokedAt &&
        (!grant.expiresAt || grant.expiresAt >= now) &&
        grant.maxQuantity >= args.quantity,
    );

    if (validGrant) {
      return {
        allowed: true,
        basis: 'authorization' as const,
        authorizationId: validGrant.authorizationId,
      };
    }

    const eventId = crypto.randomUUID();

    await ctx.db.insert('institutionalEvents', {
      worldId: args.worldId,
      eventId,
      actorPlayerId: args.actorPlayerId,
      targetPlayerId: asset.ownerPlayerId,
      assetId: args.assetId,
      kind: 'propertyViolationAttempt',
      detail: `Attempted use of ${args.quantity} unit(s) without ownership or authorization.`,
      createdAt: now,
    });

    return {
      allowed: false,
      basis: 'PNA_PROPERTY_VIOLATION' as const,
      eventId,
    };
  },
});

import { ConvexError } from 'convex/values';
import { Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx } from '../_generated/server';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
export type TransferReason = 'gift' | 'sale' | 'contract' | 'inheritance';

export function assertPositiveQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new ConvexError({ kind: 'invalidQuantity', message: 'Quantity must be a positive safe integer.' });
  }
}

export async function getAsset(ctx: ReadCtx, worldId: Id<'worlds'>, assetId: string) {
  return await ctx.db
    .query('assets')
    .withIndex('world_asset', (q) => q.eq('worldId', worldId).eq('assetId', assetId))
    .unique();
}

export async function transferOwnedAsset(
  ctx: MutationCtx,
  args: {
    worldId: Id<'worlds'>;
    fromPlayerId: string;
    toPlayerId: string;
    assetId: string;
    quantity: number;
    reason: TransferReason;
    linkedTransactionId?: string;
  },
) {
  assertPositiveQuantity(args.quantity);
  if (args.fromPlayerId === args.toPlayerId) {
    throw new ConvexError({ kind: 'sameOwner', message: 'Source and destination must differ.' });
  }
  const asset = await getAsset(ctx, args.worldId, args.assetId);
  if (!asset) throw new ConvexError({ kind: 'assetMissing', message: 'Asset does not exist.' });
  if (asset.ownerPlayerId !== args.fromPlayerId) {
    throw new ConvexError({ kind: 'notOwner', message: 'Only the owner may transfer this asset.' });
  }
  if (args.quantity > asset.quantity) {
    throw new ConvexError({ kind: 'insufficientAsset', message: 'Insufficient asset quantity.' });
  }
  if (!asset.divisible && args.quantity !== asset.quantity) {
    throw new ConvexError({ kind: 'indivisibleAsset', message: 'Indivisible assets transfer in full.' });
  }

  const now = Date.now();
  let resultingAssetId = asset.assetId;
  if (args.quantity === asset.quantity) {
    await ctx.db.patch(asset._id, { ownerPlayerId: args.toPlayerId, updatedAt: now });
  } else {
    await ctx.db.patch(asset._id, { quantity: asset.quantity - args.quantity, updatedAt: now });
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
}


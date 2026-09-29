import { v } from 'convex/values';
import { MutationCtx, mutation } from '../_generated/server';
import { Id } from '../_generated/dataModel';
import { playerId } from '../aiTown/ids';
import { DEFAULT_GENESIS_BALANCE_SATS } from './constants';
import { createGenesisAccount } from './service';

export async function ensurePlayerEconomy(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  playerIdValue: string,
) {
  await createGenesisAccount(ctx, worldId, playerIdValue, DEFAULT_GENESIS_BALANCE_SATS);
  const now = Date.now();
  for (const asset of [
    { type: 'food' as const, quantity: 10 },
    { type: 'wood' as const, quantity: 10 },
  ]) {
    const existingAsset = await ctx.db
      .query('assets')
      .withIndex('world_owner_type', (q) =>
        q.eq('worldId', worldId).eq('ownerPlayerId', playerIdValue).eq('type', asset.type),
      )
      .first();
    if (!existingAsset) {
      await ctx.db.insert('assets', {
        worldId,
        assetId: crypto.randomUUID(),
        type: asset.type,
        ownerPlayerId: playerIdValue,
        quantity: asset.quantity,
        divisible: true,
        metadata: { origin: 'free-city-genesis' },
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

export const ensurePlayer = mutation({
  args: { worldId: v.id('worlds'), playerId },
  handler: async (ctx, args) => {
    await ensurePlayerEconomy(ctx, args.worldId, args.playerId);
    return { initialized: true };
  },
});

export const bootstrapWorld = mutation({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const descriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .take(100);
    for (const description of descriptions) {
      await ensurePlayerEconomy(ctx, args.worldId, description.playerId);
    }
    return { initializedPlayers: descriptions.length };
  },
});


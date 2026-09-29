import { Id } from '../_generated/dataModel';
import { MutationCtx } from '../_generated/server';

type ReputationReason =
  | 'contractCompleted'
  | 'disputeOpened'
  | 'rulingUpheld'
  | 'adverseRuling';

export async function applyReputationEvent(
  ctx: MutationCtx,
  args: {
    worldId: Id<'worlds'>;
    playerId: string;
    delta: number;
    reason: ReputationReason;
    contractId?: string;
    disputeId?: string;
  },
) {
  if (!Number.isSafeInteger(args.delta)) throw new Error('Reputation delta must be an integer.');
  const existing = await ctx.db
    .query('reputationProfiles')
    .withIndex('world_player', (q) =>
      q.eq('worldId', args.worldId).eq('playerId', args.playerId),
    )
    .unique();
  const now = Date.now();
  const increments = {
    completedContracts: args.reason === 'contractCompleted' ? 1 : 0,
    disputesOpened: args.reason === 'disputeOpened' ? 1 : 0,
    adverseRulings: args.reason === 'adverseRuling' ? 1 : 0,
  };
  if (existing) {
    await ctx.db.patch(existing._id, {
      score: existing.score + args.delta,
      completedContracts: existing.completedContracts + increments.completedContracts,
      disputesOpened: existing.disputesOpened + increments.disputesOpened,
      adverseRulings: existing.adverseRulings + increments.adverseRulings,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert('reputationProfiles', {
      worldId: args.worldId,
      playerId: args.playerId,
      score: args.delta,
      ...increments,
      updatedAt: now,
    });
  }
  await ctx.db.insert('reputationEvents', {
    worldId: args.worldId,
    eventId: crypto.randomUUID(),
    playerId: args.playerId,
    contractId: args.contractId,
    disputeId: args.disputeId,
    delta: args.delta,
    reason: args.reason,
    createdAt: now,
  });
}


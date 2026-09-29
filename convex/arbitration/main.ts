import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { transferSats } from '../economy/service';
import { applyReputationEvent } from './reputation';

export const openDispute = mutation({
  args: {
    worldId: v.id('worlds'),
    contractId: v.string(),
    claimantPlayerId: playerId,
    claim: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.claim.trim() || args.claim.length > 4_000) {
      throw new ConvexError({ kind: 'invalidClaim', message: 'Claim must contain 1 to 4,000 characters.' });
    }
    const contract = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_contract', (q) =>
        q.eq('worldId', args.worldId).eq('contractId', args.contractId),
      )
      .unique();
    if (!contract || contract.status !== 'executed' || !contract.arbitratorPlayerId) {
      throw new ConvexError({ kind: 'notArbitrable', message: 'Executed contract has no agreed arbitrator.' });
    }
    if (args.claimantPlayerId !== contract.sellerPlayerId && args.claimantPlayerId !== contract.buyerPlayerId) {
      throw new ConvexError({ kind: 'notParty', message: 'Only a contract party may open a dispute.' });
    }
    const existing = await ctx.db
      .query('disputes')
      .withIndex('world_contract', (q) =>
        q.eq('worldId', args.worldId).eq('contractId', args.contractId),
      )
      .first();
    if (existing) throw new ConvexError({ kind: 'disputeExists', message: 'Contract already has a dispute.' });

    const respondentPlayerId =
      args.claimantPlayerId === contract.sellerPlayerId
        ? contract.buyerPlayerId
        : contract.sellerPlayerId;
    const disputeId = crypto.randomUUID();
    await ctx.db.insert('disputes', {
      worldId: args.worldId,
      disputeId,
      contractId: args.contractId,
      claimantPlayerId: args.claimantPlayerId,
      respondentPlayerId,
      arbitratorPlayerId: contract.arbitratorPlayerId,
      claim: args.claim,
      status: 'open',
      createdAt: Date.now(),
    });
    await ctx.db.patch(contract._id, { status: 'disputed', updatedAt: Date.now() });
    await applyReputationEvent(ctx, {
      worldId: args.worldId,
      playerId: args.claimantPlayerId,
      contractId: args.contractId,
      disputeId,
      delta: 0,
      reason: 'disputeOpened',
    });
    return { disputeId };
  },
});

export const rule = mutation({
  args: {
    worldId: v.id('worlds'),
    disputeId: v.string(),
    arbitratorPlayerId: playerId,
    liablePlayerId: playerId,
    ruling: v.string(),
    awardSats: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.ruling.trim() || args.ruling.length > 4_000) {
      throw new ConvexError({ kind: 'invalidRuling', message: 'Ruling must contain 1 to 4,000 characters.' });
    }
    const dispute = await ctx.db
      .query('disputes')
      .withIndex('world_dispute', (q) =>
        q.eq('worldId', args.worldId).eq('disputeId', args.disputeId),
      )
      .unique();
    if (!dispute || dispute.status !== 'open') {
      throw new ConvexError({ kind: 'disputeUnavailable', message: 'Dispute is not open.' });
    }
    if (dispute.arbitratorPlayerId !== args.arbitratorPlayerId) {
      throw new ConvexError({ kind: 'notArbitrator', message: 'Only the agreed arbitrator may rule.' });
    }
    if (args.liablePlayerId !== dispute.claimantPlayerId && args.liablePlayerId !== dispute.respondentPlayerId) {
      throw new ConvexError({ kind: 'invalidLiableParty', message: 'Liable player must be a dispute party.' });
    }
    const beneficiary =
      args.liablePlayerId === dispute.claimantPlayerId
        ? dispute.respondentPlayerId
        : dispute.claimantPlayerId;
    let awardTransactionId: string | undefined;
    if (args.awardSats !== undefined && args.awardSats > 0) {
      awardTransactionId = await transferSats(ctx, {
        worldId: args.worldId,
        fromPlayerId: args.liablePlayerId,
        toPlayerId: beneficiary,
        amountSats: args.awardSats,
        type: 'awardPayment',
        memo: `Voluntary arbitration award ${dispute.disputeId}`,
      });
    } else if (args.awardSats !== undefined && args.awardSats !== 0) {
      throw new ConvexError({ kind: 'invalidAward', message: 'Award must be a non-negative integer.' });
    }
    const now = Date.now();
    await ctx.db.patch(dispute._id, {
      status: 'resolved',
      ruling: args.ruling,
      liablePlayerId: args.liablePlayerId,
      awardSats: args.awardSats,
      awardTransactionId,
      resolvedAt: now,
    });
    const contract = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_contract', (q) =>
        q.eq('worldId', args.worldId).eq('contractId', dispute.contractId),
      )
      .unique();
    if (contract) await ctx.db.patch(contract._id, { status: 'resolved', updatedAt: now });
    await applyReputationEvent(ctx, {
      worldId: args.worldId,
      playerId: args.liablePlayerId,
      contractId: dispute.contractId,
      disputeId: dispute.disputeId,
      delta: -10,
      reason: 'adverseRuling',
    });
    await applyReputationEvent(ctx, {
      worldId: args.worldId,
      playerId: beneficiary,
      contractId: dispute.contractId,
      disputeId: dispute.disputeId,
      delta: 1,
      reason: 'rulingUpheld',
    });
    return { resolved: true, awardTransactionId };
  },
});

export const reputation = query({
  args: { worldId: v.id('worlds'), playerId },
  handler: async (ctx, args) =>
    await ctx.db
      .query('reputationProfiles')
      .withIndex('world_player', (q) =>
        q.eq('worldId', args.worldId).eq('playerId', args.playerId),
      )
      .unique(),
});

export const openForArbitrator = query({
  args: { worldId: v.id('worlds'), arbitratorPlayerId: playerId },
  handler: async (ctx, args) =>
    await ctx.db
      .query('disputes')
      .withIndex('world_arbitrator_status', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('arbitratorPlayerId', args.arbitratorPlayerId)
          .eq('status', 'open'),
      )
      .take(100),
});


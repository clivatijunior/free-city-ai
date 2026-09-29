import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { playerId } from '../aiTown/ids';
import { applyReputationEvent } from '../arbitration/reputation';
import { assertPositiveSats, transferSats } from '../economy/service';
import { assertPositiveQuantity, getAsset, transferOwnedAsset } from '../property/service';

function assertTerms(terms: string) {
  const trimmed = terms.trim();
  if (!trimmed || trimmed.length > 4_000) {
    throw new ConvexError({ kind: 'invalidTerms', message: 'Terms must contain 1 to 4,000 characters.' });
  }
}

export const propose = mutation({
  args: {
    worldId: v.id('worlds'),
    proposerPlayerId: playerId,
    sellerPlayerId: playerId,
    buyerPlayerId: playerId,
    arbitratorPlayerId: v.optional(playerId),
    assetId: v.optional(v.string()),
    assetQuantity: v.optional(v.number()),
    paymentSats: v.number(),
    terms: v.string(),
  },
  handler: async (ctx, args) => {
    assertTerms(args.terms);
    if (args.sellerPlayerId === args.buyerPlayerId) {
      throw new ConvexError({ kind: 'sameParty', message: 'Contract parties must differ.' });
    }
    if (args.proposerPlayerId !== args.sellerPlayerId && args.proposerPlayerId !== args.buyerPlayerId) {
      throw new ConvexError({ kind: 'notParty', message: 'Only a contract party may propose it.' });
    }
    if (args.arbitratorPlayerId === args.sellerPlayerId || args.arbitratorPlayerId === args.buyerPlayerId) {
      throw new ConvexError({ kind: 'biasedArbitrator', message: 'Arbitrator must be a third party.' });
    }
    if (!Number.isSafeInteger(args.paymentSats) || args.paymentSats < 0) {
      throw new ConvexError({ kind: 'invalidAmount', message: 'Payment must be a non-negative integer.' });
    }
    if ((args.assetId === undefined) !== (args.assetQuantity === undefined)) {
      throw new ConvexError({ kind: 'invalidAssetTerms', message: 'Asset and quantity must be provided together.' });
    }
    if (args.assetId && args.assetQuantity !== undefined) {
      assertPositiveQuantity(args.assetQuantity);
      const asset = await getAsset(ctx, args.worldId, args.assetId);
      if (!asset || asset.ownerPlayerId !== args.sellerPlayerId || args.assetQuantity > asset.quantity) {
        throw new ConvexError({ kind: 'assetUnavailable', message: 'Seller cannot fulfill the asset obligation.' });
      }
    }
    if (!args.assetId && args.paymentSats === 0) {
      throw new ConvexError({ kind: 'emptyContract', message: 'Contract must include an obligation.' });
    }
    const now = Date.now();
    const contractId = crypto.randomUUID();
    await ctx.db.insert('voluntaryContracts', {
      ...args,
      contractId,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('contractSignatures', {
      worldId: args.worldId,
      contractId,
      signerPlayerId: args.proposerPlayerId,
      decision: 'accepted',
      createdAt: now,
    });
    return { contractId };
  },
});

export const acceptAndExecute = mutation({
  args: { worldId: v.id('worlds'), contractId: v.string(), signerPlayerId: playerId },
  handler: async (ctx, args) => {
    const contract = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_contract', (q) =>
        q.eq('worldId', args.worldId).eq('contractId', args.contractId),
      )
      .unique();
    if (!contract || contract.status !== 'proposed') {
      throw new ConvexError({ kind: 'contractUnavailable', message: 'Contract is not awaiting consent.' });
    }
    const expectedSigner =
      contract.proposerPlayerId === contract.sellerPlayerId
        ? contract.buyerPlayerId
        : contract.sellerPlayerId;
    if (args.signerPlayerId !== expectedSigner) {
      throw new ConvexError({ kind: 'invalidSigner', message: 'The other party must accept this proposal.' });
    }
    const existing = await ctx.db
      .query('contractSignatures')
      .withIndex('world_contract_signer', (q) =>
        q
          .eq('worldId', args.worldId)
          .eq('contractId', args.contractId)
          .eq('signerPlayerId', args.signerPlayerId),
      )
      .unique();
    if (existing) throw new ConvexError({ kind: 'alreadySigned', message: 'Party already responded.' });

    const now = Date.now();
    await ctx.db.insert('contractSignatures', {
      worldId: args.worldId,
      contractId: args.contractId,
      signerPlayerId: args.signerPlayerId,
      decision: 'accepted',
      createdAt: now,
    });

    let transactionId: string | undefined;
    if (contract.paymentSats > 0) {
      assertPositiveSats(contract.paymentSats);
      transactionId = await transferSats(ctx, {
        worldId: args.worldId,
        fromPlayerId: contract.buyerPlayerId,
        toPlayerId: contract.sellerPlayerId,
        amountSats: contract.paymentSats,
        type: 'transfer',
        memo: `Voluntary contract ${contract.contractId}`,
      });
    }
    let resultingAssetId: string | undefined;
    if (contract.assetId && contract.assetQuantity !== undefined) {
      const transfer = await transferOwnedAsset(ctx, {
        worldId: args.worldId,
        fromPlayerId: contract.sellerPlayerId,
        toPlayerId: contract.buyerPlayerId,
        assetId: contract.assetId,
        quantity: contract.assetQuantity,
        reason: 'contract',
        linkedTransactionId: transactionId,
      });
      resultingAssetId = transfer.resultingAssetId;
    }
    await ctx.db.patch(contract._id, {
      status: 'executed',
      transactionId,
      resultingAssetId,
      executedAt: now,
      updatedAt: now,
    });
    await applyReputationEvent(ctx, {
      worldId: args.worldId,
      playerId: contract.sellerPlayerId,
      contractId: contract.contractId,
      delta: 1,
      reason: 'contractCompleted',
    });
    await applyReputationEvent(ctx, {
      worldId: args.worldId,
      playerId: contract.buyerPlayerId,
      contractId: contract.contractId,
      delta: 1,
      reason: 'contractCompleted',
    });
    return { executed: true, transactionId, resultingAssetId };
  },
});

export const reject = mutation({
  args: { worldId: v.id('worlds'), contractId: v.string(), signerPlayerId: playerId },
  handler: async (ctx, args) => {
    const contract = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_contract', (q) =>
        q.eq('worldId', args.worldId).eq('contractId', args.contractId),
      )
      .unique();
    if (!contract || contract.status !== 'proposed') {
      throw new ConvexError({ kind: 'contractUnavailable', message: 'Contract is not awaiting consent.' });
    }
    if (args.signerPlayerId !== contract.sellerPlayerId && args.signerPlayerId !== contract.buyerPlayerId) {
      throw new ConvexError({ kind: 'notParty', message: 'Only a party may reject.' });
    }
    await ctx.db.insert('contractSignatures', {
      worldId: args.worldId,
      contractId: args.contractId,
      signerPlayerId: args.signerPlayerId,
      decision: 'rejected',
      createdAt: Date.now(),
    });
    await ctx.db.patch(contract._id, { status: 'rejected', updatedAt: Date.now() });
    return { rejected: true };
  },
});

export const forPlayer = query({
  args: { worldId: v.id('worlds'), playerId, limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 100));
    const asSeller = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_seller', (q) =>
        q.eq('worldId', args.worldId).eq('sellerPlayerId', args.playerId),
      )
      .order('desc')
      .take(limit);
    const asBuyer = await ctx.db
      .query('voluntaryContracts')
      .withIndex('world_buyer', (q) =>
        q.eq('worldId', args.worldId).eq('buyerPlayerId', args.playerId),
      )
      .order('desc')
      .take(limit);
    return [...asSeller, ...asBuyer]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  },
});

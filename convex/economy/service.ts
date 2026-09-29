import { ConvexError } from 'convex/values';
import { Doc, Id } from '../_generated/dataModel';
import { MutationCtx, QueryCtx } from '../_generated/server';
import { GameId } from '../aiTown/ids';
import { MAX_MONEY_SUPPLY_SATS } from './constants';

type ReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;

export function assertPositiveSats(amountSats: number) {
  if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
    throw new ConvexError({
      kind: 'invalidAmount',
      message: 'Amount must be a positive safe integer number of satoshis.',
    });
  }
}

export async function getAccount(
  ctx: ReadCtx,
  worldId: Id<'worlds'>,
  playerId: GameId<'players'> | string,
) {
  return await ctx.db
    .query('economyAccounts')
    .withIndex('world_player', (q) => q.eq('worldId', worldId).eq('playerId', playerId))
    .unique();
}

export async function currentSupply(ctx: ReadCtx, worldId: Id<'worlds'>) {
  const accounts = await ctx.db
    .query('economyAccounts')
    .withIndex('world', (q) => q.eq('worldId', worldId))
    .take(10_000);
  return accounts.reduce((sum, account) => sum + account.balanceSats, 0);
}

export async function createGenesisAccount(
  ctx: MutationCtx,
  worldId: Id<'worlds'>,
  playerId: string,
  initialBalanceSats: number,
) {
  assertPositiveSats(initialBalanceSats);
  const existing = await getAccount(ctx, worldId, playerId);
  if (existing) return existing._id;

  const supply = await currentSupply(ctx, worldId);
  if (supply + initialBalanceSats > MAX_MONEY_SUPPLY_SATS) {
    throw new ConvexError({
      kind: 'supplyCapExceeded',
      message: 'Genesis allocation would exceed the fixed monetary cap.',
    });
  }

  const now = Date.now();
  const accountId = await ctx.db.insert('economyAccounts', {
    worldId,
    playerId,
    balanceSats: initialBalanceSats,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert('economyTransactions', {
    worldId,
    txId: crypto.randomUUID(),
    toPlayerId: playerId,
    amountSats: initialBalanceSats,
    type: 'genesis',
    memo: 'Free City genesis allocation',
    createdAt: now,
  });
  return accountId;
}

export async function transferSats(
  ctx: MutationCtx,
  args: {
    worldId: Id<'worlds'>;
    fromPlayerId: string;
    toPlayerId: string;
    amountSats: number;
    type: Doc<'economyTransactions'>['type'];
    memo?: string;
  },
) {
  assertPositiveSats(args.amountSats);
  if (args.fromPlayerId === args.toPlayerId) {
    throw new ConvexError({ kind: 'sameAccount', message: 'Sender and receiver must differ.' });
  }
  const from = await getAccount(ctx, args.worldId, args.fromPlayerId);
  const to = await getAccount(ctx, args.worldId, args.toPlayerId);
  if (!from || !to) {
    throw new ConvexError({ kind: 'accountMissing', message: 'Both accounts must exist.' });
  }
  if (from.balanceSats < args.amountSats) {
    throw new ConvexError({ kind: 'insufficientFunds', message: 'Insufficient balance.' });
  }
  if (!Number.isSafeInteger(to.balanceSats + args.amountSats)) {
    throw new ConvexError({ kind: 'unsafeBalance', message: 'Destination balance is unsafe.' });
  }

  const now = Date.now();
  await ctx.db.patch(from._id, { balanceSats: from.balanceSats - args.amountSats, updatedAt: now });
  await ctx.db.patch(to._id, { balanceSats: to.balanceSats + args.amountSats, updatedAt: now });
  const txId = crypto.randomUUID();
  await ctx.db.insert('economyTransactions', {
    worldId: args.worldId,
    txId,
    fromPlayerId: args.fromPlayerId,
    toPlayerId: args.toPlayerId,
    amountSats: args.amountSats,
    type: args.type,
    memo: args.memo,
    createdAt: now,
  });
  return txId;
}

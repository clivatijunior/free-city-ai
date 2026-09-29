import { ConvexError, v } from 'convex/values';
import { action } from '../_generated/server';
import { internal } from '../_generated/api';
import { playerId } from '../aiTown/ids';
import { chatCompletion, getLLMConfig } from '../util/llm';
import { parseEconomicPlan } from './domain';

type Snapshot = {
  balanceSats: number;
  assets: Array<{ assetId: string; type: string; quantity: number; divisible: boolean }>;
  openListings: Array<{
    listingId: string;
    sellerPlayerId: string;
    assetId: string;
    quantity: number;
    unitPriceSats: number;
  }>;
  recentContracts: Array<{
    contractId: string;
    sellerPlayerId: string;
    buyerPlayerId: string;
    paymentSats: number;
    status: string;
  }>;
  reputation: { score: number; completedContracts: number; adverseRulings: number };
};

export const proposeEconomicPlan = action({
  args: { worldId: v.id('worlds'), playerId, goal: v.string() },
  handler: async (ctx, args) => {
    const goal = args.goal.trim();
    if (!goal || goal.length > 1_000) {
      throw new ConvexError({
        kind: 'invalidGoal',
        message: 'Goal must contain 1 to 1,000 characters.',
      });
    }
    const snapshot: Snapshot = await ctx.runQuery(internal.planner.main.snapshot, {
      worldId: args.worldId,
      playerId: args.playerId,
    });
    const config = getLLMConfig();
    let content: string;
    try {
      ({ content } = await chatCompletion({
        messages: [
          {
            role: 'system',
            content:
              'You are an economic planner in Free City. Respect private property, the non-aggression principle, voluntary contracts, and FC-BTC denominated in satoshis. You may only propose actions; you cannot move money, transfer property, mint currency, sign for another party, or impose arbitration. Return JSON only: {"actions":[{"type":"create_listing|purchase|propose_contract|wait","reason":"...","listingId?":"...","assetId?":"...","counterpartyPlayerId?":"...","quantity?":1,"unitPriceSats?":1,"paymentSats?":1}]}. At most 5 actions.',
          },
          {
            role: 'user',
            content: `Player ${args.playerId} goal: ${goal}\nAuthoritative snapshot: ${JSON.stringify(snapshot)}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      }));
    } catch (error) {
      throw new ConvexError({
        kind: 'plannerUnavailable',
        message:
          config.provider === 'ollama'
            ? 'Ollama is unreachable from Convex. Configure OLLAMA_HOST with a reachable HTTPS endpoint.'
            : 'The configured planner provider is unavailable.',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    let plan;
    try {
      plan = parseEconomicPlan(content);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError({
        kind: 'invalidPlannerResponse',
        message: error instanceof Error ? error.message : 'Planner returned an invalid action.',
      });
    }
    const proposalJson = JSON.stringify(plan);
    const planId: string = await ctx.runMutation(internal.planner.main.recordPlan, {
      worldId: args.worldId,
      playerId: args.playerId,
      goal,
      proposalJson,
      provider: config.provider,
      model: config.chatModel,
    });
    return { planId, plan, authority: 'proposal_only' as const };
  },
});


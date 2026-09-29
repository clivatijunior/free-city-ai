import { ConvexError } from 'convex/values';

export type ProposedAction = {
  type: 'create_listing' | 'purchase' | 'propose_contract' | 'wait';
  reason: string;
  listingId?: string;
  assetId?: string;
  counterpartyPlayerId?: string;
  quantity?: number;
  unitPriceSats?: number;
  paymentSats?: number;
};

export function parseEconomicPlan(raw: string) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new ConvexError({
      kind: 'invalidPlannerResponse',
      message: 'Ollama did not return valid JSON.',
    });
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { actions?: unknown }).actions)
  ) {
    throw new ConvexError({
      kind: 'invalidPlannerResponse',
      message: 'Plan must contain an actions array.',
    });
  }

  const rawActions = (value as { actions: unknown[] }).actions.slice(0, 5);
  const allowed = new Set(['create_listing', 'purchase', 'propose_contract', 'wait']);
  const actions: ProposedAction[] = rawActions.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new Error('Invalid action.');
    const actionValue = candidate as Record<string, unknown>;
    if (typeof actionValue.type !== 'string' || !allowed.has(actionValue.type)) {
      throw new Error('Unsupported action type.');
    }
    if (
      typeof actionValue.reason !== 'string' ||
      !actionValue.reason.trim() ||
      actionValue.reason.length > 500
    ) {
      throw new Error('Action reason is invalid.');
    }
    const action: ProposedAction = {
      type: actionValue.type as ProposedAction['type'],
      reason: actionValue.reason.trim(),
    };
    for (const key of ['listingId', 'assetId', 'counterpartyPlayerId'] as const) {
      const candidateValue = actionValue[key];
      if (candidateValue !== undefined) {
        if (typeof candidateValue !== 'string' || !candidateValue.trim()) {
          throw new Error(`${key} must be a non-empty string.`);
        }
        action[key] = candidateValue.trim();
      }
    }
    for (const key of ['quantity', 'unitPriceSats', 'paymentSats'] as const) {
      if (actionValue[key] !== undefined) {
        if (!Number.isSafeInteger(actionValue[key]) || (actionValue[key] as number) <= 0) {
          throw new Error(`${key} must be a positive safe integer.`);
        }
        action[key] = actionValue[key] as number;
      }
    }
    return action;
  });
  return { actions };
}


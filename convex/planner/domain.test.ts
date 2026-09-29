import { parseEconomicPlan } from './domain';

describe('parseEconomicPlan', () => {
  it('accepts JSON and fenced JSON from Ollama', () => {
    expect(
      parseEconomicPlan('```json\n{"actions":[{"type":"wait","reason":" Preserve cash "}]}\n```'),
    ).toEqual({ actions: [{ type: 'wait', reason: 'Preserve cash' }] });
  });

  it('limits a proposal to five actions', () => {
    const actions = Array.from({ length: 7 }, (_, index) => ({
      type: 'wait',
      reason: `Wait ${index}`,
    }));
    expect(parseEconomicPlan(JSON.stringify({ actions })).actions).toHaveLength(5);
  });

  it.each([
    'not json',
    '{}',
    '{"actions":[{"type":"steal","reason":"No"}]}',
    '{"actions":[{"type":"purchase","reason":"Buy","quantity":0}]}',
    '{"actions":[{"type":"wait","reason":""}]}',
  ])('rejects malformed or unauthorized plans', (raw) => {
    expect(() => parseEconomicPlan(raw)).toThrow();
  });
});


# Free City development guide

Free City extends AI Town with an auditable economy and voluntary institutions. The current branch
keeps the simulation engine intact and adds transactional Convex modules around each player.

## Implemented vertical slices

- **Money:** one FC-BTC equals 100,000,000 sats. Genesis accounts are idempotent and total issuance
  is capped at 21,000,000 FC-BTC.
- **Property:** divisible and indivisible assets have explicit owners, transfer history, and
  optional use authorizations.
- **Market:** owners can list assets; a purchase atomically transfers sats and property. A failed
  property transfer rolls back the payment in the same Convex transaction.
- **Contracts:** either party may propose terms, the other party must accept, and payment/property
  obligations execute atomically.
- **Arbitration and reputation:** contracts may name an independent arbitrator. Rulings can transfer
  a voluntary award and append reputation events.
- **Economic planner:** Ollama receives an authoritative snapshot and may return at most five
  validated proposals. Plans cannot execute transactions, sign contracts, or rule on disputes.
- **UI:** selecting a character shows liquid sats, reputation, physical holdings, and recent money
  movements. Physical assets are deliberately not assigned an official price.
- **Telemetry:** `telemetry/main:worldSnapshot` reports supply, assets, listings, contracts,
  disputes, and recent transaction volume.
- **Simulation:** `scenarios/main:runMarketTradeSmoke` performs an idempotent one-unit market trade
  and aborts unless balances and total monetary supply satisfy their invariants.

## Initialization behavior

`init` and new-player persistence call `ensurePlayerEconomy`. Every player receives an account with
1 FC-BTC plus 10 food and 10 wood units. Re-running initialization does not mint another balance or
duplicate an asset type already present.

The seed file now defines eight Free City roles with different incentives and risk tolerances:
farmer, builder, merchant, toolmaker, arbitrator, entrepreneur, mutual-aid organizer, and property
protection provider. Existing worlds retain their current characters. Apply the new seed only when
creating a fresh world; never wipe a deployment merely to update names.

## Local validation

```text
npm test -- --runInBand
npm run lint
npm run build
npx convex codegen
```

The test command is cross-platform and works in Windows PowerShell or Command Prompt.

## Operational checks

Obtain the active world identifier:

```text
npx convex run world:defaultWorldStatus
```

Initialize missing economy records without overwriting balances or holdings:

```text
npx convex run economy/bootstrap:bootstrapWorld '{"worldId":"WORLD_ID"}'
```

Capture aggregate telemetry:

```text
npx convex run telemetry/main:worldSnapshot '{"worldId":"WORLD_ID"}'
```

Run the market scenario once. `scenarioKey` is the idempotency key, so retries return the recorded
run rather than trading twice:

```text
npx convex run scenarios/main:runMarketTradeSmoke \
  '{"worldId":"WORLD_ID","scenarioKey":"market-smoke-001","sellerPlayerId":"p:6","buyerPlayerId":"p:8"}'
```

## Ollama planner

Convex cloud cannot call `127.0.0.1` on the developer's computer. For cloud development,
`OLLAMA_HOST` must be a reachable HTTPS endpoint supplied by a tunnel or hosted Ollama-compatible
service. This is an operator choice because it affects network exposure and possibly cost.

```text
npx convex env set OLLAMA_HOST https://YOUR-REACHABLE-ENDPOINT
```

Do not schedule the planner until the endpoint is stable. Even when connected, the planner remains
proposal-only; execution requires a separate, explicit authorization design.

## Known boundaries

- Public mutations identify simulated players by game ID. Human authentication/authorization is a
  separate security milestone before exposing write operations to untrusted clients.
- A monetary balance is not total wealth. Asset valuation must emerge from market prices or an
  explicitly chosen accounting rule; the UI does not fabricate one.
- The aggregate telemetry query is intentionally bounded and returns `truncated: true` when a
  collection reaches its sample limit.
- Seed changes affect new worlds only.

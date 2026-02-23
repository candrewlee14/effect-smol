# Effect Atom + Lit 3 Re-Evaluation

Date: 2026-02-23
Status: Accepted

Canonical running record: `ATOM_LIT3_PROJECT_RECORD.md`

## Scope

- Framework targets: React, React Native, Lit 3.
- No cross-framework interop requirement.
- Goal: keep public API Effect-Atom-first.

## Findings

1. Current `@effect/atom-lit` API shape is a natural extension of Effect Atom.
2. Lifecycle behavior is now correct for the scoped requirement:
   - mount intent survives reconnect
   - tracked subscriptions are pruned across render cycles
   - manual subscriptions survive reconnect
   - owned registry uses delayed disconnect disposal
3. Compared to upstream React adapter, one intentional difference remains:
   - Lit adapter does not depend on React scheduler primitives.
   - Idle policy parity is maintained via `defaultIdleTTL: 400`.

## Remaining Non-Ideal Areas

1. `value()` can be called outside render cycles, so tracked subscriptions are not
   as tightly scoped as React's `useSyncExternalStore` model.
2. Lit tests currently focus on controller-level lifecycle simulation, not a full
   `LitElement` integration harness.

## Decision

- Keep current `@effect/atom-lit` direction for this scope.
- Proceed with Step 2: add `@effect/atom-devtools-lit` as a Lit controller bridge
  on top of `@effect/atom-devtools` core.

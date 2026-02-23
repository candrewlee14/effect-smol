# Effect Atom + Lit 3 Decision Record

Date: 2026-02-23
Status: Accepted

Canonical running record: `ATOM_LIT3_PROJECT_RECORD.md`

## Scope

Supported framework targets for this work:
- React
- React Native
- Lit 3

Requirement clarification:
- React/Lit interop is **not** required.
- Correctness is required **within each adapter** independently.

## Decision

`@effect/atom-lit` is **Effect-Atom-first**.

- Public API is defined using Effect Atom primitives (`Atom`, `AtomRegistry`, and registry operations).
- TC39/Lit signal types are **not** part of the public contract.
- Lit/TC39 signals may be used internally as an implementation detail.

## Rationale

- Keeps one consistent state model across React, React Native, and Lit 3.
- Preserves full Effect Atom semantics across frameworks.
- Avoids locking public API to signal-specific details that are not needed for React/RN.
- Allows internal Lit implementation to evolve without public breaking changes.

## Lit Runtime Requirements

For `@effect/atom-lit`, host lifecycle behavior must satisfy:

1. Mounted atom intent survives disconnect/reconnect.
2. Tracked atom subscriptions are pruned across render cycles to avoid stale listeners.
3. Owned registries are disposed after disconnect delay and recreated on reconnect when needed.
4. External registries are never disposed by the controller.
5. Manual controller subscriptions (`subscribe`) survive reconnect until explicitly unsubscribed or controller `dispose()`.
6. Default registry policy matches React idle semantics (`defaultIdleTTL: 400`) unless explicitly overridden.

## Non-Goals

- Exposing a generic signal API from `@effect/atom-lit`.
- Committing to public TC39 signal interop as the primary surface.

## Delivery Plan (Updated)

1. Build `@effect/atom-lit` first with Effect-Atom-first API and parity tests.
2. Build `@effect/atom-devtools-lit` second on top of `@effect/atom-devtools` core.
3. Validate behavior parity against Atom semantics (not signal semantics).

Current status:
- Step 1 complete (`@effect/atom-lit`).
- Step 2 complete (`@effect/atom-devtools-lit`).

# Effect Atom + Lit3 Project Record

Date: 2026-02-23
Status: In Progress (Step 1 + Step 2 complete)

## 1) Requirement Baseline

Project scope for this branch:

- Primary frameworks: React, React Native, Lit 3
- No cross-framework interop requirement
- Effect-Atom-first public API
- TC39/Lit signals can be internal implementation detail only
- No additional UI-library support work in this scope

## 2) Core Decisions

1. `@effect/atom-lit` is the Lit adapter surface and stays Effect-Atom-first.
2. Public API avoids signal-first naming/contracts.
3. Lifecycle behavior should be parity-oriented with React adapter semantics where relevant to Atom behavior.
4. Devtools for Lit should be implemented as a Lit controller bridge on top of `@effect/atom-devtools` core (not a separate devtools engine).

Authoritative decision docs:

- `ATOM_LIT3_DECISION.md`
- `ATOM_LIT3_REEVALUATION.md`

## 3) Delivered Step 1: `@effect/atom-lit`

Package added:

- `packages/atom/lit/package.json`
- `packages/atom/lit/src/index.ts`
- `packages/atom/lit/src/Operations.ts`
- `packages/atom/lit/src/Controller.ts`
- `packages/atom/lit/test/index.test.ts`
- `packages/atom/lit/docgen.json`
- `packages/atom/lit/tsconfig.json`
- `packages/atom/lit/vitest.config.ts`

Monorepo wiring:

- `tsconfig.packages.json` reference added for `packages/atom/lit`
- `tsconfig.json` path aliases for `@effect/atom-lit`

Changeset:

- `.changeset/atom-lit.md`

Key API surface:

- Registry ops: `createRegistry`, `getAtom`, `setAtom`, `refreshAtom`, `subscribeAtom`, `mountAtom`
- Async result helpers: `setAtomPromise`, `setAtomPromiseExit`
- AtomRef helpers: `readAtomRef`, `subscribeAtomRef`, `atomRefProp`
- Lit lifecycle bridge: `createAtomController`, `EffectAtomController`

Lifecycle behavior implemented:

1. Mount intent survives disconnect/reconnect
2. Tracked subscriptions are pruned across render cycles
3. Manual subscriptions survive reconnect and remain explicit-unsubscribe driven
4. Owned registry uses delayed disconnect dispose and lazy recreation
5. External registry is never disposed by the controller
6. Controller removes itself from host on `dispose()`

Default policy:

- `createRegistry` defaults `defaultIdleTTL` to `400` unless overridden

## 4) Delivered Step 2: `@effect/atom-devtools-lit`

Package added:

- `packages/atom/devtools-lit/package.json`
- `packages/atom/devtools-lit/src/index.ts`
- `packages/atom/devtools-lit/src/Controller.ts`
- `packages/atom/devtools-lit/test/index.test.ts`
- `packages/atom/devtools-lit/docgen.json`
- `packages/atom/devtools-lit/tsconfig.json`
- `packages/atom/devtools-lit/vitest.config.ts`

Monorepo wiring:

- `tsconfig.packages.json` reference added for `packages/atom/devtools-lit`
- `tsconfig.json` path aliases for `@effect/atom-devtools-lit`

Changeset:

- `.changeset/atom-devtools-lit.md`

Design:

- Lit controller bridge over `@effect/atom-devtools/DevtoolsState`
- Accepts one of:
  - `registry`
  - `atomController`
  - existing `controller`
- Exposes:
  - `state`, `nodes`, `selectedAtom`, `searchQuery`
  - actions: `setSelectedAtom`, `setSearchQuery`, `filteredEntries`
  - `controller`, `registry`, `dispose`

Ownership semantics:

- If controller is created internally, `dispose()` disposes it
- If controller is provided externally, `dispose()` does not dispose external controller
- Controller removes itself from host on `dispose()`

## 5) Verification Summary

Executed in this branch:

- `pnpm --filter @effect/atom-lit check` -> pass
- `pnpm --filter @effect/atom-lit test -- --run` -> pass (`19/19`)
- `pnpm --filter @effect/atom-devtools-lit check` -> pass
- `pnpm --filter @effect/atom-devtools-lit test -- --run` -> pass (`7/7`)
- `pnpm --filter @effect/atom-devtools-lit build` -> pass
- `pnpm --filter @effect/atom-devtools check` -> pass
- `pnpm --filter @effect/atom-devtools test -- --run` -> pass (`33/33`)
- `pnpm --filter @effect/atom-devtools-react check` -> pass

Known branch-wide unrelated signal:

- `@effect/atom-react` tests were previously observed failing in this PR branch for pre-existing reasons unrelated to Lit adapter changes.

## 6) Re-Evaluation vs Upstream React Reference

Outcome:

- Current approach is a natural extension for this restricted requirement.
- Adapter is behaviorally aligned where needed for Atom semantics.
- Intentional divergence retained:
  - no React scheduler dependency in Lit adapter
  - policy parity preserved via default idle TTL behavior

## 7) Remaining Improvements (Specific, No Extra Scope)

These are the only targeted improvements identified for this scope:

1. Restrict tracked read subscriptions to render cycle reads only in `@effect/atom-lit`
2. Add strict source-consistency validation in `@effect/atom-devtools-lit` when multiple sources are passed
3. Add one real `LitElement` integration test for lifecycle semantics
4. Consolidate docs into one canonical record (this file) to reduce drift

## 8) Out of Scope (Explicit)

- Signal-first public API
- TC39 signal interop commitment as public contract
- React <-> Lit interop
- Additional UI framework adapters beyond current scope
- Lit-specific devtools UI package in this step

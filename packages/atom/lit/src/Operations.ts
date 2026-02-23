/**
 * @since 1.0.0
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRef from "effect/unstable/reactivity/AtomRef"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"

/**
 * @since 1.0.0
 * @category models
 */
export type RegistryOptions = Parameters<typeof AtomRegistry.make>[0]

/**
 * @since 1.0.0
 * @category constructors
 */
export const createRegistry = (options?: RegistryOptions): AtomRegistry.AtomRegistry =>
  AtomRegistry.make({
    ...options,
    defaultIdleTTL: options?.defaultIdleTTL ?? 400
  })

/**
 * @since 1.0.0
 * @category operations
 */
export const getAtom = <A>(registry: AtomRegistry.AtomRegistry, atom: Atom.Atom<A>): A =>
  registry.get(atom)

/**
 * @since 1.0.0
 * @category operations
 */
export const setAtom = <R, W>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Writable<R, W>,
  value: W | ((value: R) => W)
): void => {
  registry.set(atom, typeof value === "function" ? (value as (value: R) => W)(registry.get(atom)) : value)
}

/**
 * @since 1.0.0
 * @category operations
 */
export const refreshAtom = <A>(registry: AtomRegistry.AtomRegistry, atom: Atom.Atom<A>): void => {
  registry.refresh(atom)
}

/**
 * @since 1.0.0
 * @category operations
 */
export const subscribeAtom = <A>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<A>,
  f: (_: A) => void,
  options?: {
    readonly immediate?: boolean
  }
): (() => void) => registry.subscribe(atom, f, options)

/**
 * @since 1.0.0
 * @category operations
 */
export const mountAtom = <A>(registry: AtomRegistry.AtomRegistry, atom: Atom.Atom<A>): (() => void) =>
  registry.mount(atom)

const flattenExit = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}

/**
 * @since 1.0.0
 * @category operations
 */
export const setAtomPromiseExit = <R extends AsyncResult.AsyncResult<any, any>, W>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Writable<R, W>,
  value: W
): Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>> => {
  registry.set(atom, value)
  return Effect.runPromiseExit(
    AtomRegistry.getResult(registry, atom as Atom.Atom<AsyncResult.AsyncResult<any, any>>, {
      suspendOnWaiting: true
    })
  ) as Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
}

/**
 * @since 1.0.0
 * @category operations
 */
export const setAtomPromise = <R extends AsyncResult.AsyncResult<any, any>, W>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Writable<R, W>,
  value: W
): Promise<AsyncResult.AsyncResult.Success<R>> =>
  setAtomPromiseExit(registry, atom, value).then(flattenExit)

/**
 * @since 1.0.0
 * @category operations
 */
export const readAtomRef = <A>(ref: AtomRef.ReadonlyRef<A>): A => ref.value

/**
 * @since 1.0.0
 * @category operations
 */
export const subscribeAtomRef = <A>(ref: AtomRef.ReadonlyRef<A>, f: (_: A) => void): (() => void) =>
  ref.subscribe(f)

/**
 * @since 1.0.0
 * @category operations
 */
export const atomRefProp = <A, K extends keyof A>(ref: AtomRef.AtomRef<A>, prop: K): AtomRef.AtomRef<A[K]> =>
  ref.prop(prop)

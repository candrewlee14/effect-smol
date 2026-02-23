/**
 * @since 1.0.0
 */
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type * as Exit from "effect/Exit"
import type { ReactiveController, ReactiveControllerHost } from "lit"
import {
  createRegistry,
  getAtom,
  mountAtom,
  refreshAtom,
  setAtom,
  setAtomPromise,
  setAtomPromiseExit,
  subscribeAtom,
  type RegistryOptions
} from "./Operations.ts"

/**
 * @since 1.0.0
 * @category models
 */
export interface AtomControllerOptions {
  readonly registry?: AtomRegistry.AtomRegistry | undefined
  readonly registryOptions?: RegistryOptions | undefined
}

/**
 * @since 1.0.0
 * @category models
 */
export interface AtomController extends ReactiveController {
  readonly registry: AtomRegistry.AtomRegistry
  readonly value: <A>(atom: Atom.Atom<A>) => A
  readonly set: <R, W>(atom: Atom.Writable<R, W>, value: W | ((value: R) => W)) => void
  readonly setPromise: <R extends AsyncResult.AsyncResult<any, any>, W>(
    atom: Atom.Writable<R, W>,
    value: W
  ) => Promise<AsyncResult.AsyncResult.Success<R>>
  readonly setPromiseExit: <R extends AsyncResult.AsyncResult<any, any>, W>(
    atom: Atom.Writable<R, W>,
    value: W
  ) => Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>>
  readonly refresh: <A>(atom: Atom.Atom<A>) => void
  readonly mount: <A>(atom: Atom.Atom<A>) => () => void
  readonly subscribe: <A>(
    atom: Atom.Atom<A>,
    f: (_: A) => void,
    options?: { readonly immediate?: boolean }
  ) => () => void
  readonly dispose: () => void
}

interface ManualSubscription {
  readonly atom: Atom.Atom<any>
  readonly listener: (_: any) => void
  readonly options: { readonly immediate?: boolean } | undefined
  unsubscribe: (() => void) | undefined
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const createAtomController = (host: ReactiveControllerHost, options?: AtomControllerOptions): AtomController =>
  new EffectAtomController(host, options)

/**
 * @since 1.0.0
 * @category constructors
 */
export class EffectAtomController implements AtomController {
  readonly #host: ReactiveControllerHost
  readonly #trackedUnsubscribes = new Map<Atom.Atom<any>, () => void>()
  readonly #desiredMountCounts = new Map<Atom.Atom<any>, number>()
  readonly #activeMountUnsubscribes = new Map<Atom.Atom<any>, () => void>()
  readonly #manualSubscriptions = new Set<ManualSubscription>()
  readonly #renderTrackedAtoms = new Set<Atom.Atom<any>>()
  readonly #ownsRegistry: boolean
  readonly #registryOptions: RegistryOptions | undefined
  #registry: AtomRegistry.AtomRegistry
  #disposed = false
  #connected = false
  #renderCycleActive = false
  #registryDisposedOnDisconnect = false
  #registryDisposeTimeout: ReturnType<typeof setTimeout> | undefined

  constructor(host: ReactiveControllerHost, options?: AtomControllerOptions) {
    this.#host = host
    this.#ownsRegistry = options?.registry === undefined
    this.#registryOptions = options?.registryOptions
    this.#registry = options?.registry ?? createRegistry(options?.registryOptions)
    host.addController(this)
  }

  get registry(): AtomRegistry.AtomRegistry {
    return this.#ensureRegistry()
  }

  value = <A>(atom: Atom.Atom<A>): A => {
    if (this.#renderCycleActive) {
      this.#renderTrackedAtoms.add(atom)
    }
    this.#track(atom)
    return getAtom(this.#ensureRegistry(), atom)
  }

  set = <R, W>(atom: Atom.Writable<R, W>, value: W | ((value: R) => W)): void => {
    setAtom(this.#ensureRegistry(), atom, value)
  }

  setPromise = <R extends AsyncResult.AsyncResult<any, any>, W>(
    atom: Atom.Writable<R, W>,
    value: W
  ): Promise<AsyncResult.AsyncResult.Success<R>> => setAtomPromise(this.#ensureRegistry(), atom, value)

  setPromiseExit = <R extends AsyncResult.AsyncResult<any, any>, W>(
    atom: Atom.Writable<R, W>,
    value: W
  ): Promise<Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>> =>
    setAtomPromiseExit(this.#ensureRegistry(), atom, value)

  refresh = <A>(atom: Atom.Atom<A>): void => {
    refreshAtom(this.#ensureRegistry(), atom)
  }

  mount = <A>(atom: Atom.Atom<A>): (() => void) => {
    if (this.#disposed) {
      return () => {
        // no-op once disposed
      }
    }
    const count = this.#desiredMountCounts.get(atom) ?? 0
    this.#desiredMountCounts.set(atom, count + 1)
    if (this.#connected && !this.#activeMountUnsubscribes.has(atom)) {
      this.#activeMountUnsubscribes.set(atom, mountAtom(this.#ensureRegistry(), atom))
    }
    return () => this.#releaseMount(atom)
  }

  subscribe = <A>(
    atom: Atom.Atom<A>,
    f: (_: A) => void,
    options?: {
      readonly immediate?: boolean
    }
  ): (() => void) => {
    if (this.#disposed) {
      return () => {
        // no-op once disposed
      }
    }
    const subscription: ManualSubscription = {
      atom,
      listener: f as (_: unknown) => void,
      options,
      unsubscribe: undefined
    }
    this.#manualSubscriptions.add(subscription)
    if (this.#connected) {
      subscription.unsubscribe = subscribeAtom(this.#ensureRegistry(), atom, f, options)
    }
    return () => {
      if (this.#manualSubscriptions.delete(subscription)) {
        subscription.unsubscribe?.()
        subscription.unsubscribe = undefined
      }
    }
  }

  hostConnected(): void {
    if (this.#disposed) {
      return
    }
    this.#connected = true
    if (this.#registryDisposeTimeout !== undefined) {
      clearTimeout(this.#registryDisposeTimeout)
      this.#registryDisposeTimeout = undefined
    }
    this.#ensureRegistry()
    for (const [atom] of this.#desiredMountCounts) {
      if (!this.#activeMountUnsubscribes.has(atom)) {
        this.#activeMountUnsubscribes.set(atom, mountAtom(this.#registry, atom))
      }
    }
    this.#activateManualSubscriptions()
  }

  hostUpdate(): void {
    if (!this.#disposed && this.#connected) {
      this.#renderCycleActive = true
      this.#renderTrackedAtoms.clear()
    }
  }

  hostUpdated(): void {
    if (this.#disposed || !this.#connected || !this.#renderCycleActive) {
      return
    }
    this.#renderCycleActive = false
    for (const [atom, unsubscribe] of this.#trackedUnsubscribes) {
      if (!this.#renderTrackedAtoms.has(atom)) {
        unsubscribe()
        this.#trackedUnsubscribes.delete(atom)
      }
    }
  }

  hostDisconnected(): void {
    if (!this.#disposed) {
      this.#connected = false
      this.#renderCycleActive = false
      this.#renderTrackedAtoms.clear()
      this.#cleanupTrackedSubscriptions()
      this.#deactivateManualSubscriptions()
      this.#cleanupActiveMounts()
      this.#scheduleRegistryDisposeOnDisconnect()
    }
  }

  dispose = (): void => {
    if (this.#disposed) {
      return
    }
    this.#connected = false
    this.#renderCycleActive = false
    this.#renderTrackedAtoms.clear()
    if (this.#registryDisposeTimeout !== undefined) {
      clearTimeout(this.#registryDisposeTimeout)
      this.#registryDisposeTimeout = undefined
    }
    this.#cleanupTrackedSubscriptions()
    this.#cleanupManualSubscriptions()
    this.#cleanupActiveMounts()
    this.#desiredMountCounts.clear()
    if (this.#ownsRegistry && !this.#registryDisposedOnDisconnect) {
      this.#registry.dispose()
      this.#registryDisposedOnDisconnect = true
    }
    this.#disposed = true
    this.#host.removeController(this)
  }

  #track<A>(atom: Atom.Atom<A>): void {
    if (this.#disposed || !this.#connected || this.#trackedUnsubscribes.has(atom)) {
      return
    }

    const unsubscribe = subscribeAtom(this.#ensureRegistry(), atom, () => {
      this.#host.requestUpdate()
    })

    this.#trackedUnsubscribes.set(atom, unsubscribe)
  }

  #releaseMount(atom: Atom.Atom<any>): void {
    const currentCount = this.#desiredMountCounts.get(atom)
    if (currentCount === undefined || currentCount === 0) {
      return
    }
    const nextCount = currentCount - 1
    if (nextCount === 0) {
      this.#desiredMountCounts.delete(atom)
      const unsubscribe = this.#activeMountUnsubscribes.get(atom)
      if (unsubscribe !== undefined) {
        this.#activeMountUnsubscribes.delete(atom)
        unsubscribe()
      }
    } else {
      this.#desiredMountCounts.set(atom, nextCount)
    }
  }

  #cleanupTrackedSubscriptions(): void {
    for (const unsubscribe of this.#trackedUnsubscribes.values()) {
      unsubscribe()
    }
    this.#trackedUnsubscribes.clear()
  }

  #cleanupActiveMounts(): void {
    for (const unsubscribe of this.#activeMountUnsubscribes.values()) {
      unsubscribe()
    }
    this.#activeMountUnsubscribes.clear()
  }

  #cleanupManualSubscriptions(): void {
    this.#deactivateManualSubscriptions()
    this.#manualSubscriptions.clear()
  }

  #deactivateManualSubscriptions(): void {
    for (const subscription of this.#manualSubscriptions) {
      subscription.unsubscribe?.()
      subscription.unsubscribe = undefined
    }
  }

  #activateManualSubscriptions(): void {
    for (const subscription of this.#manualSubscriptions) {
      if (subscription.unsubscribe === undefined) {
        subscription.unsubscribe = subscribeAtom(
          this.#registry,
          subscription.atom,
          subscription.listener,
          subscription.options
        )
      }
    }
  }

  #scheduleRegistryDisposeOnDisconnect(): void {
    if (!this.#ownsRegistry || this.#registryDisposedOnDisconnect || this.#registryDisposeTimeout !== undefined) {
      return
    }
    // Match react adapter policy: allow brief reconnects before disposing.
    this.#registryDisposeTimeout = setTimeout(() => {
      this.#registryDisposeTimeout = undefined
      if (this.#disposed || this.#connected || this.#registryDisposedOnDisconnect) {
        return
      }
      this.#registry.dispose()
      this.#registryDisposedOnDisconnect = true
    }, 500)
  }

  #ensureRegistry(): AtomRegistry.AtomRegistry {
    if (this.#disposed) {
      return this.#registry
    }
    if (this.#registryDisposedOnDisconnect) {
      this.#registry = createRegistry(this.#registryOptions)
      this.#registryDisposedOnDisconnect = false
    }
    return this.#registry
  }
}

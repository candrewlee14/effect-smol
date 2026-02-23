/**
 * @since 1.0.0
 */
import type * as DevtoolsState from "@effect/atom-devtools/DevtoolsState"
import * as DevtoolsStateImpl from "@effect/atom-devtools/DevtoolsState"
import type { AtomController } from "@effect/atom-lit/Controller"
import type * as Atom from "effect/unstable/reactivity/Atom"
import type * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactiveController, ReactiveControllerHost } from "lit"

/**
 * @since 1.0.0
 * @category models
 */
export interface AtomDevtoolsControllerOptions {
  readonly registry?: AtomRegistry.AtomRegistry | undefined
  readonly atomController?: AtomController | undefined
  readonly controller?: DevtoolsState.DevtoolsController | undefined
}

/**
 * @since 1.0.0
 * @category models
 */
export interface AtomDevtoolsController extends ReactiveController {
  readonly registry: AtomRegistry.AtomRegistry
  readonly controller: DevtoolsState.DevtoolsController
  readonly state: DevtoolsState.DevtoolsState
  readonly nodes: ReadonlyMap<Atom.Atom<any>, DevtoolsState.NodeSnapshot>
  readonly selectedAtom: Atom.Atom<any> | null
  readonly searchQuery: string
  readonly setSelectedAtom: (atom: Atom.Atom<any> | null) => void
  readonly setSearchQuery: (query: string) => void
  readonly filteredEntries: () => ReadonlyArray<readonly [Atom.Atom<any>, DevtoolsState.NodeSnapshot]>
  readonly dispose: () => void
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const createAtomDevtoolsController = (
  host: ReactiveControllerHost,
  options?: AtomDevtoolsControllerOptions
): AtomDevtoolsController => new EffectAtomDevtoolsController(host, options)

/**
 * @since 1.0.0
 * @category constructors
 */
export class EffectAtomDevtoolsController implements AtomDevtoolsController {
  readonly #host: ReactiveControllerHost
  readonly #ownsController: boolean
  readonly #registry: AtomRegistry.AtomRegistry
  readonly #controller: DevtoolsState.DevtoolsController
  #state: DevtoolsState.DevtoolsState
  #unsubscribe: (() => void) | undefined
  #disposed = false
  #connected = false

  constructor(host: ReactiveControllerHost, options?: AtomDevtoolsControllerOptions) {
    const provided = options?.controller
    const registry = options?.registry ?? options?.atomController?.registry ?? provided?.registry

    if (registry === undefined) {
      throw new Error(
        "createAtomDevtoolsController requires one of: options.registry, options.atomController, or options.controller"
      )
    }

    this.#host = host
    this.#registry = registry
    this.#ownsController = provided === undefined
    this.#controller = provided ?? DevtoolsStateImpl.make(registry)
    this.#state = this.#controller.getState()
    this.#unsubscribe = this.#controller.subscribe(() => {
      this.#state = this.#controller.getState()
      if (!this.#disposed && this.#connected) {
        this.#host.requestUpdate()
      }
    })
    host.addController(this)
  }

  get registry(): AtomRegistry.AtomRegistry {
    return this.#registry
  }

  get controller(): DevtoolsState.DevtoolsController {
    return this.#controller
  }

  get state(): DevtoolsState.DevtoolsState {
    return this.#state
  }

  get nodes(): ReadonlyMap<Atom.Atom<any>, DevtoolsState.NodeSnapshot> {
    return this.#state.nodes
  }

  get selectedAtom(): Atom.Atom<any> | null {
    return this.#state.selectedAtom
  }

  get searchQuery(): string {
    return this.#state.searchQuery
  }

  setSelectedAtom = (atom: Atom.Atom<any> | null): void => {
    this.#controller.setSelectedAtom(atom)
  }

  setSearchQuery = (query: string): void => {
    this.#controller.setSearchQuery(query)
  }

  filteredEntries = (): ReadonlyArray<readonly [Atom.Atom<any>, DevtoolsState.NodeSnapshot]> =>
    this.#controller.filteredEntries()

  hostConnected(): void {
    if (!this.#disposed) {
      this.#connected = true
    }
  }

  hostDisconnected(): void {
    this.#connected = false
  }

  dispose = (): void => {
    if (this.#disposed) {
      return
    }
    this.#connected = false
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    if (this.#ownsController) {
      this.#controller.dispose()
    }
    this.#disposed = true
    this.#host.removeController(this)
  }
}

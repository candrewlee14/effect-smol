import * as DevtoolsState from "@effect/atom-devtools/DevtoolsState"
import { createAtomDevtoolsController } from "@effect/atom-devtools-lit"
import { createAtomController } from "@effect/atom-lit"
import { assert, describe, it } from "@effect/vitest"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactiveController, ReactiveControllerHost } from "lit"
import { afterEach, beforeEach, vi } from "vitest"

class TestHost implements ReactiveControllerHost {
  controllers: Array<ReactiveController> = []
  updates = 0

  addController(controller: ReactiveController): void {
    this.controllers.push(controller)
  }

  removeController(controller: ReactiveController): void {
    const index = this.controllers.indexOf(controller)
    if (index !== -1) {
      this.controllers.splice(index, 1)
    }
  }

  requestUpdate(): void {
    this.updates++
  }

  connect() {
    for (const controller of this.controllers) {
      controller.hostConnected?.()
    }
  }

  disconnect() {
    for (const controller of this.controllers) {
      controller.hostDisconnected?.()
    }
  }
}

describe("atom-devtools-lit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("requires a registry source when no controller source is provided", () => {
    const host = new TestHost()
    assert.throws(() => createAtomDevtoolsController(host))
  })

  it("syncs devtools state and requests host updates while connected", () => {
    const host = new TestHost()
    const registry = AtomRegistry.make()
    const controller = createAtomDevtoolsController(host, { registry })
    const atom = Atom.make(1).pipe(Atom.withLabel("counter"))

    host.connect()
    registry.mount(atom)
    vi.advanceTimersByTime(1000)

    assert.strictEqual(controller.nodes.get(atom)?.value, 1)
    assert.strictEqual(host.updates > 0, true)

    controller.dispose()
  })

  it("uses atom controller registry when provided", () => {
    const atomHost = new TestHost()
    const atomController = createAtomController(atomHost)
    const host = new TestHost()
    const devtoolsController = createAtomDevtoolsController(host, { atomController })

    assert.strictEqual(devtoolsController.registry, atomController.registry)

    devtoolsController.dispose()
    atomController.dispose()
  })

  it("supports search and selection operations", () => {
    const host = new TestHost()
    const registry = AtomRegistry.make()
    const controller = createAtomDevtoolsController(host, { registry })
    const alpha = Atom.make(1).pipe(Atom.withLabel("alpha"))
    const beta = Atom.make(2).pipe(Atom.withLabel("beta"))

    host.connect()
    registry.mount(alpha)
    registry.mount(beta)
    vi.advanceTimersByTime(1000)

    controller.setSearchQuery("alp")
    const entries = controller.filteredEntries()
    assert.strictEqual(entries.length, 1)
    assert.strictEqual(entries[0][0], alpha)

    controller.setSelectedAtom(alpha)
    assert.strictEqual(controller.selectedAtom, alpha)
    assert.strictEqual(controller.searchQuery, "alp")

    controller.dispose()
  })

  it("does not request host updates while disconnected", () => {
    const host = new TestHost()
    const registry = AtomRegistry.make()
    const controller = createAtomDevtoolsController(host, { registry })

    host.connect()
    const updatesBeforeDisconnect = host.updates
    host.disconnect()
    controller.setSearchQuery("value")

    assert.strictEqual(host.updates, updatesBeforeDisconnect)

    controller.dispose()
  })

  it("dispose removes controller from host and disposes owned devtools controller", () => {
    const host = new TestHost()
    const registry = AtomRegistry.make()
    const controller = createAtomDevtoolsController(host, { registry })
    const disposeSpy = vi.spyOn(controller.controller, "dispose")

    controller.dispose()
    controller.dispose()

    assert.strictEqual(disposeSpy.mock.calls.length, 1)
    assert.strictEqual(host.controllers.length, 0)
  })

  it("dispose does not dispose externally provided devtools controller", () => {
    const host = new TestHost()
    const registry = AtomRegistry.make()
    const externalController = DevtoolsState.make(registry)
    const disposeSpy = vi.spyOn(externalController, "dispose")
    const controller = createAtomDevtoolsController(host, {
      controller: externalController
    })

    controller.dispose()

    assert.strictEqual(disposeSpy.mock.calls.length, 0)
    assert.strictEqual(host.controllers.length, 0)

    externalController.dispose()
  })
})

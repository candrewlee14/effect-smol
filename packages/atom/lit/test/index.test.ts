import {
  atomRefProp,
  createAtomController,
  createRegistry,
  getAtom,
  mountAtom,
  readAtomRef,
  refreshAtom,
  setAtom,
  setAtomPromise,
  setAtomPromiseExit,
  subscribeAtom,
  subscribeAtomRef
} from "@effect/atom-lit"
import { assert, describe, it } from "@effect/vitest"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRef from "effect/unstable/reactivity/AtomRef"
import { LitElement, html } from "lit"
import type { ReactiveController, ReactiveControllerHost } from "lit"
import { vi } from "vitest"

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

  update(render: () => void) {
    for (const controller of this.controllers) {
      controller.hostUpdate?.()
    }
    render()
    for (const controller of this.controllers) {
      controller.hostUpdated?.()
    }
  }
}

describe("atom-lit", () => {
  it("createRegistry uses react-like default idle TTL and allows override", () => {
    const registryDefault = createRegistry() as any
    const registryCustom = createRegistry({ defaultIdleTTL: 123 }) as any

    assert.strictEqual(registryDefault.defaultIdleTTL, 400)
    assert.strictEqual(registryCustom.defaultIdleTTL, 123)
  })

  it("reads and writes atom values via registry helpers", () => {
    const registry = createRegistry()
    const atom = Atom.make(1)

    assert.strictEqual(getAtom(registry, atom), 1)

    setAtom(registry, atom, 2)
    assert.strictEqual(getAtom(registry, atom), 2)

    setAtom(registry, atom, (current) => current + 1)
    assert.strictEqual(getAtom(registry, atom), 3)
  })

  it("refreshes derived atoms", () => {
    const registry = createRegistry()
    let runs = 0
    const source = Atom.make(10)
    const derived = Atom.make((get) => {
      runs++
      return get(source) * 2
    })

    assert.strictEqual(getAtom(registry, derived), 20)
    assert.strictEqual(runs, 1)

    refreshAtom(registry, derived)

    assert.strictEqual(getAtom(registry, derived), 20)
    assert.strictEqual(runs, 2)
  })

  it("subscribes to atom updates", () => {
    const registry = createRegistry()
    const atom = Atom.make(0)
    const values: Array<number> = []

    const unsubscribe = subscribeAtom(registry, atom, (value) => {
      values.push(value)
    }, { immediate: true })

    setAtom(registry, atom, 1)
    setAtom(registry, atom, 2)
    unsubscribe()
    setAtom(registry, atom, 3)

    assert.deepStrictEqual(values, [0, 1, 2])
  })

  it("mounts atom and releases on unmount", async () => {
    const registry = createRegistry()
    const atom = Atom.make(0)

    const release = mountAtom(registry, atom)
    const node = registry.getNodes().get(atom)

    assert.ok(node)
    assert.strictEqual(node.listenerCount, 1)

    release()

    await Promise.resolve()
    await Promise.resolve()

    const after = registry.getNodes().get(atom)
    assert.ok(after === undefined || after.listenerCount === 0)
  })

  it("setAtomPromise resolves success for async-result atoms", async () => {
    const registry = createRegistry()
    const atom = Atom.make(AsyncResult.initial<number, never>())

    const result = await setAtomPromise(registry, atom, AsyncResult.success(123))

    assert.strictEqual(result, 123)
  })

  it("setAtomPromiseExit resolves failure exits", async () => {
    const registry = createRegistry()
    const atom = Atom.make(AsyncResult.initial<number, Error>())

    const exit = await setAtomPromiseExit(registry, atom, AsyncResult.fail(new Error("boom")))

    assert.strictEqual(Exit.isFailure(exit), true)
  })

  it("controller tracks atom reads and requests host updates", () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const atom = Atom.make(0)

    host.connect()

    assert.strictEqual(controller.value(atom), 0)

    controller.set(atom, 1)
    assert.strictEqual(host.updates > 0, true)

    const updatesBeforeDisconnect = host.updates
    host.disconnect()
    controller.set(atom, 2)

    assert.strictEqual(host.updates, updatesBeforeDisconnect)

    host.connect()
    controller.value(atom)
    controller.set(atom, 3)

    assert.strictEqual(host.updates > updatesBeforeDisconnect, true)
  })

  it("controller mount is cleaned up on disconnect", async () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const atom = Atom.make(1)

    host.connect()
    controller.mount(atom)

    const node = controller.registry.getNodes().get(atom)
    assert.ok(node)
    assert.strictEqual(node.listenerCount > 0, true)

    host.disconnect()

    await Promise.resolve()
    await Promise.resolve()

    const after = controller.registry.getNodes().get(atom)
    assert.ok(after === undefined || after.listenerCount === 0)
  })

  it("controller mount uses reference counting per atom", async () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const atom = Atom.make(1)

    host.connect()
    const release1 = controller.mount(atom)
    const release2 = controller.mount(atom)

    const node = controller.registry.getNodes().get(atom)
    assert.ok(node)
    assert.strictEqual(node.listenerCount, 1)

    release1()

    const afterFirstRelease = controller.registry.getNodes().get(atom)
    assert.ok(afterFirstRelease)
    assert.strictEqual(afterFirstRelease.listenerCount, 1)

    release2()
    await Promise.resolve()
    await Promise.resolve()

    const afterSecondRelease = controller.registry.getNodes().get(atom)
    assert.ok(afterSecondRelease === undefined || afterSecondRelease.listenerCount === 0)
  })

  it("controller remounts mounted atoms on reconnect", async () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const atom = Atom.make(1)

    host.connect()
    const release = controller.mount(atom)

    const beforeDisconnect = controller.registry.getNodes().get(atom)
    assert.ok(beforeDisconnect)
    assert.strictEqual(beforeDisconnect.listenerCount, 1)

    host.disconnect()
    await Promise.resolve()
    await Promise.resolve()

    const afterDisconnect = controller.registry.getNodes().get(atom)
    assert.ok(afterDisconnect === undefined || afterDisconnect.listenerCount === 0)

    host.connect()
    const afterReconnect = controller.registry.getNodes().get(atom)
    assert.ok(afterReconnect)
    assert.strictEqual(afterReconnect.listenerCount, 1)

    release()
  })

  it("controller prunes tracked atom subscriptions across render cycles", () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const a = Atom.make(1)
    const b = Atom.make(2)

    host.connect()
    host.update(() => {
      controller.value(a)
    })

    const nodeA1 = controller.registry.getNodes().get(a)
    assert.ok(nodeA1)
    assert.strictEqual(nodeA1.listenerCount, 1)

    host.update(() => {
      controller.value(b)
    })

    const nodeA2 = controller.registry.getNodes().get(a)
    assert.ok(nodeA2 === undefined || nodeA2.listenerCount === 0)
    const nodeB = controller.registry.getNodes().get(b)
    assert.ok(nodeB)
    assert.strictEqual(nodeB.listenerCount, 1)
  })

  it("controller manual subscriptions survive reconnect", () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const atom = Atom.make(0)
    const seen: Array<number> = []

    const unsubscribe = controller.subscribe(atom, (value) => {
      seen.push(value)
    }, { immediate: true })

    host.connect()
    controller.set(atom, 1)
    host.disconnect()
    controller.set(atom, 2)
    host.connect()
    controller.set(atom, 3)
    unsubscribe()
    controller.set(atom, 4)

    assert.deepStrictEqual(seen, [0, 1, 2, 3])
  })

  it("controller manual unsubscribe while disconnected prevents reconnect resubscribe", () => {
    const host = new TestHost()
    const controller = createAtomController(host)
    const atom = Atom.make(0)
    const seen: Array<number> = []

    host.connect()
    const unsubscribe = controller.subscribe(atom, (value) => {
      seen.push(value)
    })
    controller.set(atom, 1)

    host.disconnect()
    unsubscribe()
    host.connect()
    controller.set(atom, 2)

    assert.deepStrictEqual(seen, [1])
  })

  it("dispose releases owned registry", () => {
    const host = new TestHost()
    const controller = createAtomController(host)

    controller.dispose()

    assert.throws(() => controller.registry.get(Atom.make(0)))
    assert.strictEqual(host.controllers.length, 0)
  })

  it("dispose does not close external registry", () => {
    const host = new TestHost()
    const registry = createRegistry()
    const controller = createAtomController(host, { registry })

    controller.dispose()

    assert.strictEqual(registry.get(Atom.make(0)), 0)
  })

  it("owned registry is disposed after disconnect delay and recreated on reconnect", async () => {
    vi.useFakeTimers()
    try {
      const host = new TestHost()
      const controller = createAtomController(host)
      const atom = Atom.make(1)

      host.connect()
      controller.value(atom)
      host.disconnect()

      vi.advanceTimersByTime(500)
      await Promise.resolve()

      host.connect()
      assert.strictEqual(controller.value(atom), 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("atom ref helpers expose effect atom ref semantics", () => {
    const ref = AtomRef.make({ count: 0, label: "a" })
    const countRef = atomRefProp(ref, "count")
    const seen: Array<number> = []

    assert.strictEqual(readAtomRef(countRef), 0)

    const unsubscribe = subscribeAtomRef(countRef, (value) => {
      seen.push(value)
    })

    ref.set({ count: 1, label: "a" })
    ref.set({ count: 2, label: "b" })
    unsubscribe()
    ref.set({ count: 3, label: "c" })

    assert.deepStrictEqual(seen, [1, 2])
  })

  it("public exports do not expose signal-specific names", async () => {
    const module = await import("../src/index.ts") as Record<string, unknown>
    const keys = Object.keys(module).map((_) => _.toLowerCase())

    assert.strictEqual(keys.some((key) => key.includes("signal")), false)
  })

  it("integrates with real LitElement lifecycle across connect/disconnect/update", async () => {
    const atom = Atom.make(0)
    const tag = `x-atom-lit-${Math.random().toString(36).slice(2)}`

    class TestElement extends LitElement {
      readonly atomController = createAtomController(this)

      render() {
        return html`<span>${this.atomController.value(atom)}</span>`
      }
    }

    customElements.define(tag, TestElement)
    const element = document.createElement(tag) as TestElement

    document.body.appendChild(element)
    await element.updateComplete
    assert.strictEqual(element.shadowRoot?.textContent?.trim(), "0")

    const before = element.atomController.registry.getNodes().get(atom)
    assert.ok(before)
    assert.strictEqual(before.listenerCount, 1)

    element.atomController.set(atom, 1)
    await element.updateComplete
    assert.strictEqual(element.shadowRoot?.textContent?.trim(), "1")

    document.body.removeChild(element)
    await Promise.resolve()
    await Promise.resolve()

    const afterDisconnect = element.atomController.registry.getNodes().get(atom)
    assert.ok(afterDisconnect === undefined || afterDisconnect.listenerCount === 0)

    document.body.appendChild(element)
    await element.updateComplete
    element.requestUpdate()
    await element.updateComplete
    const afterReconnect = element.atomController.registry.getNodes().get(atom)
    assert.ok(afterReconnect)
    assert.strictEqual(afterReconnect.listenerCount, 1)

    element.atomController.set(atom, 2)
    await element.updateComplete
    assert.strictEqual(element.shadowRoot?.textContent?.trim(), "2")

    document.body.removeChild(element)
  })
})

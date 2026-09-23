import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAsyncResource, useAsyncResource } from '../src/shared/data/useAsyncResource.js'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('reload is awaitable and publishes the loaded data', async () => {
  const resource = createAsyncResource(async () => ['synthetic'])
  const before = resource.getSnapshot()
  assert.equal(before, resource.getSnapshot())
  assert.equal(before.loading, true)
  assert.deepEqual(await resource.reload(), ['synthetic'])
  assert.deepEqual(resource.getSnapshot(), { data: ['synthetic'], loading: false, loaded: true, error: null })
})

test('an older response cannot overwrite a newer request', async () => {
  const first = deferred(), second = deferred()
  let calls = 0
  const resource = createAsyncResource(() => ++calls === 1 ? first.promise : second.promise)
  const oldRequest = resource.reload(), currentRequest = resource.reload()
  second.resolve(['new'])
  await currentRequest
  first.resolve(['old'])
  await oldRequest
  assert.deepEqual(resource.getSnapshot().data, ['new'])
})

test('a stale failure cannot replace a successful result', async () => {
  const first = deferred()
  const resource = createAsyncResource(() => first.promise)
  const stale = resource.reload()
  resource.setLoader(async () => ['current'])
  await resource.reload()
  first.reject(new Error('synthetic failure'))
  await stale
  assert.equal(resource.getSnapshot().error, null)
  assert.deepEqual(resource.getSnapshot().data, ['current'])
})

test('cancel ignores pending results and permits a StrictMode-style restart', async () => {
  const pending = deferred()
  const resource = createAsyncResource(() => pending.promise)
  const old = resource.reload()
  resource.cancel()
  resource.setLoader(async () => ['restart'])
  await resource.reload()
  pending.resolve(['cancelled'])
  await old
  assert.deepEqual(resource.getSnapshot().data, ['restart'])
})

test('failed reload ends loading and keeps the last successful result', async () => {
  const resource = createAsyncResource(async () => ['previous'])
  await resource.reload()
  const failure = new Error('synthetic error')
  resource.setLoader(() => { throw failure })
  assert.equal(await resource.reload(), undefined)
  assert.equal(resource.getSnapshot().loading, false)
  assert.equal(resource.getSnapshot().error, failure)
  assert.deepEqual(resource.getSnapshot().data, ['previous'])
  resource.setLoader(async () => [])
  await resource.reload()
  assert.equal(resource.getSnapshot().error, null)
})

test('unsubscribe stops notifications and independent consumers do not share data', async () => {
  const a = createAsyncResource(async () => ['a']), b = createAsyncResource(async () => ['b'])
  let notifications = 0
  const unsubscribe = a.subscribe(() => { notifications += 1 })
  await a.reload()
  assert.equal(notifications, 2)
  unsubscribe()
  await a.reload()
  await b.reload()
  assert.equal(notifications, 2)
  assert.deepEqual(a.getSnapshot().data, ['a'])
  assert.deepEqual(b.getSnapshot().data, ['b'])
})

test('server rendering does not start requests', () => {
  let calls = 0
  const load = () => { calls += 1; return [] }
  function Probe() {
    const { loading } = useAsyncResource(load)
    return createElement('span', null, loading ? 'loading' : 'ready')
  }
  assert.equal(renderToStaticMarkup(createElement(Probe)), '<span>loading</span>')
  assert.equal(calls, 0)
})

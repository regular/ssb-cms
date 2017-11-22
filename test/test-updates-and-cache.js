const test = require('tape')
const pull = require('pull-stream')
const Updates = require('../update-stream')
const {inspect} = require('util')
const {cacheAndIndex} = require('../message-cache')

test('new a (bad), rev a1 (good)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        author: 'bad',
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        author: 'good',
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } }
  ]

  let cache
  pull(
    pull.values(kvs),
    Updates(['good'])(),
    cache = cacheAndIndex()
  )
  setImmediate( ()=> {
    let o = cache.getMessageObservable('a')
    t.ok(o)
    t.equal(o().key, 'a')
    t.deepEqual(o().value.content, {
      revisionRoot: 'a',
      revisionBranch: 'a',
      text: "world"
    })
    t.end()
  })
})

test('new a (good), rev a1 (bad)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        author: 'good',
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        author: 'bad',
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } }
  ]

  let cache
  pull(
    pull.values(kvs),
    Updates(['good'])(),
    cache = cacheAndIndex()
  )
  setImmediate( ()=> {
    let o = cache.getMessageObservable('a')
    t.ok(o)
    t.equal(o().key, 'a')
    t.deepEqual(o().value.content, {
      text: "hello"
    })
    t.end()
  })
})

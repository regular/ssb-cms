const test = require('tape')
const {insert} = require('../revs-view')

test('insert between two', (t)=>{
  let e = [{
    revision: 'a1', value: {
      timestamp: 1
    },
  }, {
    revision: 'a2', value: {
      timestamp: 1
    }
  }]
  let kv = {key: 'a1.5', value:{timestamp: 1}}
  let pos = {after: 'a1', before: 'a2'}

  let ne = insert(kv.key, kv, e, pos) 
  t.equal(ne.length, 3)
  t.deepEqual(ne[0], e[0])
  t.deepEqual(ne[1], kv)
  t.deepEqual(ne[2], e[1])
  t.end()
})

test('insert before newer', (t)=>{
  let e = [{
    revision: 'a1', value: {
      timestamp: 1
    },
  }, {
    revision: 'a2', value: {
      timestamp: 2
    }
  }, {
    revision: 'a3', value: {
      timestamp: 3
    }
  }, {
    revision: 'a4', value: {
      timestamp: 4
    }
  }]
  let kv = {key: 'a1.5', value:{timestamp: 2.5}}
  let pos = {after: 'a1', before: 'a4'}

  let ne = insert(kv.key, kv, e, pos) 
  t.equal(ne.length, 5)
  t.deepEqual(ne[0], e[0])
  t.deepEqual(ne[1], e[1])
  t.deepEqual(ne[2], kv)
  t.deepEqual(ne[3], e[2])
  t.deepEqual(ne[4], e[3])
  t.end()
})

test('insert before newer, after == null', (t)=>{
  let e = [{
    revision: 'a1', value: {
      timestamp: 1
    },
  }, {
    revision: 'a2', value: {
      timestamp: 2
    }
  }]
  let kv = {key: 'a0', value:{timestamp: 0}}
  let pos = {before: 'a4'}

  let ne = insert(kv.key, kv, e, pos) 
  t.equal(ne.length, 3)
  t.deepEqual(ne[0], kv)
  t.deepEqual(ne[1], e[0])
  t.deepEqual(ne[2], e[1])
  t.end()
})

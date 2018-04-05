const test = require('tape')
const pull = require('pull-stream')
const Updates = require('../update-stream')
const {inspect} = require('util')

function s(opts) {
  return Updates()(Object.assign({allowUntrusted: true}, opts))
}

function heads(u) {return u.heads.reverse().map(kv=>kv.key)}

test('breakTie: drafts befor non-drafts', t => {
  let r = [
    {
      key: 'draft-a',
      value: {}
    },
    {
      key: 'a',
      value: {}
    },
    {
      key: 'draft-b',
      value: {}
    }
  ]

  r = r.sort(Updates.breakTie)
  t.deepEqual(r.map( kv => kv.key ), 'draft-b draft-a a'.split(' '))
  t.end()
})

test('breakTie: newer before older', t => {
  let r = [
    {
      key: 'draft-a',
      value: {timestamp: 2}
    },
    {
      key: 'a',
      value: {timestamp: 10}
    },
    {
      key: 'b',
      value: {timestamp: 10}
    },
    {
      key: 'draft-b',
      value: {timestamp: 1}
    }
  ]

  r = r.sort(Updates.breakTie)
  t.deepEqual(r.map( kv => kv.key ), 'draft-a draft-b b a'.split(' '))
  t.end()
})

test('new a, new b', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'b', value: {
        content: {
          text: 'world'
    } } }
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      console.log(updates)
      t.notOk(err)
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.deepEqual(updates[1].value.content, {
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['b'])
      t.end()
    })
  )
})

test('new a, new b, rev b1', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'b', value: {
        content: {
          text: 'world'
    } } },
    { key: 'b1', value: {
        content: {
          revisionRoot: 'b',
          revisionBranch: 'b',
          text: 'foo'
    } } }
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.equal(updates[1].key, 'b')
      t.deepEqual(updates[1].value.content, {
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['b'])

      t.equal(updates[2].key, 'b')
      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'b',
        revisionBranch: 'b',
        text: "foo"
      })
      t.equal(updates[2].unsaved, false)
      t.deepEqual(heads(updates[2]), ['b1'])

      t.end()
    })
  )
})

test('new a, rev b1, new b', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'b1', value: {
        content: {
          revisionRoot: 'b',
          revisionBranch: 'b',
          text: 'foo'
    } } },
    { key: 'b', value: {
        content: {
          text: 'world'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 2)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.equal(updates[1].key, 'b')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'b',
        revisionBranch: 'b',
        text: "foo"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['b1'])

      t.end()
    })
  )
})

test('new a, rev a1, draft a2', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } },
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'foo'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.equal(updates[1].key, 'a')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['a1'])

      t.equal(updates[2].key, 'a')
      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[2].unsaved, true)
      t.deepEqual(heads(updates[2]), ['draft-a2'])

      t.end()
    })
  )
})

test('draft-a2, new a, rev a1', (t)=>{
  const kvs = [
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'foo'
    } } },
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.through(console.log),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a2'])
      t.equal(updates[0].revision, 'draft-a2')
      //t.equal(updates[0].tail, 'a') // fails

      t.end()
    })
  )
})

test('bufferUntilSync: draft-a2, new a, rev a1', (t)=>{
  const kvs = [
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'foo'
    } } },
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } },
    {sync: true}
  ]
  pull(
    pull.values(kvs),
    s({bufferUntilSync: true}),
    pull.through(console.log),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a2'])
      t.equal(updates[0].revision, 'draft-a2')
      //t.equal(updates[0].tail, 'a') // fails

      t.end()
    })
  )
})

test('draft-a2, rev a1, new a', (t)=>{
  const kvs = [
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'foo'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } },
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a2'])

      t.end()
    })
  )
})

test('new a, rev a1, draft a2, del draft a2', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } },
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'foo'
    } } },
    { key: 'draft-a2', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 4)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.equal(updates[1].key, 'a')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['a1'])
      
      t.equal(updates[2].key, 'a')
      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[2].unsaved, true)
      t.deepEqual(heads(updates[2]), ['draft-a2'])

      t.equal(updates[3].key, 'a')
      t.deepEqual(updates[3].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.equal(updates[3].unsaved, false)
      t.deepEqual(heads(updates[3]), ['a1'])

      t.end()
    })
  )
})

test('draft-a2, new a, rev a1, del draft-a2', (t)=>{
  const kvs = [
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'foo'
    } } },
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'world'
    } } },
    { key: 'draft-a2', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 2)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)

      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'world'
      })
      t.equal(updates[1].unsaved, false)

      t.end()
    })
  )
})

test.only('draft-a1, del draft-a1, new a', (t)=>{
  const kvs = [
    { key: 'draft-a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'foo'
    } } },
    { key: 'draft-a1', type: 'del'  },
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 3)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a1'])

      console.log('updates[1]', updates[1])
      t.equal(updates[1].type, 'del')

      t.notOk(updates[1].value)

      t.deepEqual(updates[2].value.content, {
        text: 'hello'
      })
      t.equal(updates[2].unsaved, false)
      t.deepEqual(heads(updates[2]), ['a'])

      t.end()
    })
  )
})

test('draft-a, del draft-a', (t)=>{
  const kvs = [
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 2)

      t.deepEqual(updates[0].value.content, {
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a'])

      t.equal(updates[1].type, 'del')
      t.equal(updates[1].key, 'draft-a')

      t.end()
    })
  )
})

test('draft-a, del draft-a, new a', (t)=>{
  const kvs = [
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a', type: 'del'  },
    { key: 'a', value: {
        content: {
          text: 'bar'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 3)

      t.deepEqual(updates[0].value.content, {
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a'])

      t.equal(updates[1].type, 'del')
      t.equal(updates[1].key, 'draft-a')

      t.deepEqual(updates[2].value.content, {
        text: 'bar'
      })
      t.equal(updates[2].unsaved, false)
      t.deepEqual(heads(updates[2]), ['a'])
      t.end()
    })
  )
})

test('draft-a, del draft-a, new a-from-draft-a', (t)=>{
  const kvs = [
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a', type: 'del'  },
    { key: 'a', value: {
        content: {
          'from-draft': 'draft-a',
          text: 'bar'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 3)

      t.deepEqual(updates[0].value.content, {
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a'])

      t.equal(updates[1].type, 'del')
      t.equal(updates[1].key, 'draft-a')

      t.deepEqual(updates[2].value.content, {
        'from-draft': 'draft-a',
        text: 'bar'
      })
      t.equal(updates[2].unsaved, false)
      t.deepEqual(heads(updates[2]), ['a'])
      t.end()
    })
  )
})

test('XXX new a, draft-a1, del draft-a1, rev a1-from-draft-a1', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'a foo'
    } } },
    { key: 'draft-a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'draft foo'
    } } },
    { key: 'draft-a1', type: 'del'  },
    { key: 'a1', value: {
        content: {
          'from-draft': 'draft-a',
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 4)

      t.deepEqual(updates[0].value.content, {
        text: 'a foo'
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'draft foo'
      })
      t.equal(updates[1].unsaved, true)
      t.deepEqual(heads(updates[1]), ['draft-a1'])
      //t.deepEqual(updates[1].internals, ['a'])

      t.deepEqual(updates[2].value.content, {
        text: 'a foo'
      })
      t.deepEqual(heads(updates[2]), ['a'])
      //t.deepEqual(updates[2].internals, [], 'no internals')

      t.deepEqual(updates[3].value.content, {
        'from-draft': 'draft-a',
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'bar'
      })
      t.equal(updates[3].unsaved, false)
      t.deepEqual(heads(updates[3]), ['a1'], 'heads')
      //t.deepEqual(updates[3].internals, ['a'], 'internals')
      t.end()
    })
  )
})
test('draft-a, new a-from-draft-a, del draft-a', (t)=>{
  const kvs = [
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'a', value: {
        content: {
          'from-draft': 'draft-a',
          text: 'bar'
    } } },
    { key: 'draft-a', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      console.log(inspect(updates, {depth: 5}))
      t.equal(updates.length, 3)

      t.deepEqual(updates[0].value.content, {
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a'])

      t.deepEqual(updates[1].value.content, {
        'from-draft': 'draft-a',
        text: 'bar'
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['a'])

      t.deepEqual(updates[2], {key: 'draft-a', type: 'del'})
      t.end()
    })
  )
})

test.skip('new a-from-draft-a, draft-a, del draft-a', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          'from-draft': 'draft-a',
          text: 'bar'
    } } },
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.deepEqual(updates[0].value.content, {
        'from-draft': 'draft-a',
        text: 'bar'
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])
      t.end()
    })
  )
})

test.skip('rev a1, new a-from-draft-a, draft-a, del draft-a', (t)=>{
  const kvs = [
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'a', value: {
        content: {
          'from-draft': 'draft-a',
          text: 'bar'
    } } },
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'baz'
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a1'])
      t.end()
    })
  )
})

test('new a, rev a1, rev a2 (fork, a2 wins), draft-a3 (merge)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'a1', value: {
        timestamp: 1,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
    { key: 'a2', value: {
        timestamp: 2,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'draft-a3', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: ['a1', 'a2'],
          text: 'merged'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 4)

      t.deepEqual(updates[0].value.content, {
        text: 'foo'
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'bar'
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['a1'])

      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'baz'
      })
      t.equal(updates[2].unsaved, false)
      t.deepEqual(heads(updates[2]), ['a1', 'a2'])

      t.deepEqual(updates[3].value.content, {
        revisionRoot: 'a',
        revisionBranch: ['a1', 'a2'],
        text: 'merged'
      })
      t.equal(updates[3].unsaved, true)
      t.deepEqual(heads(updates[3]), ['draft-a3'])

      t.end()
    })
  )
})

test('bufferUntilSync: new a, rev a1, rev a2 (fork, a2 wins), draft-a3 (merge)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'a1', value: {
        timestamp: 1,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
    { key: 'a2', value: {
        timestamp: 2,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'draft-a3', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: ['a1', 'a2'],
          text: 'merged'
    } } },
    {sync: true}
  ]
  pull(
    pull.values(kvs),
    s({bufferUntilSync:true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: ['a1', 'a2'],
        text: 'merged'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a3'])

      t.end()
    })
  )
})

test('bufferUntilSync: new a, rev a1, rev a2 (fork, a2 wins)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'a1', value: {
        timestamp: 1,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
    { key: 'a2', value: {
        timestamp: 2,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    {sync: true}
  ]
  pull(
    pull.values(kvs),
    s({bufferUntilSync:true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'baz'
      })
      t.deepEqual(heads(updates[0]), ['a1', 'a2'])

      t.end()
    })
  )
})

test('new a, rev a1, rev a2 (fork, a1 wins), draft-a3 (merge)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'a1', value: {
        timestamp: 2,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
    { key: 'a2', value: {
        timestamp: 1,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'draft-a3', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: ['a1', 'a2'],
          text: 'merged'
    } } },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 3)

      t.deepEqual(updates[0].value.content, {
        text: 'foo'
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'bar'
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['a1'])

      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'a',
        revisionBranch: ['a1', 'a2'],
        text: 'merged'
      })
      t.equal(updates[2].unsaved, true)
      t.deepEqual(heads(updates[2]), ['draft-a3'])

      t.end()
    })
  )
})

// only
test('allRevisions=true: new a, rev a1, rev a2 (fork, a1 wins), draft-a3 (merge)', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'a1', value: {
        timestamp: 2,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
    { key: 'a2', value: {
        timestamp: 1,
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'draft-a3', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: ['a1', 'a2'],
          text: 'merged'
    } } },
  ]
  pull(
    pull.values(kvs),
    s({allRevisions: true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 4)
      
      console.log('-- updates --')
      console.log(inspect(updates, {depth: 5}))

      t.deepEqual(updates[0].revisions[0].value.content, {
        text: 'foo'
      })
      //t.equal(updates[0].unsaved, false)
      //t.deepEqual(heads(updates[0]), ['a'])

      t.deepEqual(updates[1].revisions[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'bar'
      })
      //t.equal(updates[1].unsaved, false)
      //t.deepEqual(heads(updates[1]), ['a1'])

      t.equal(updates[2].revisions[0].key, 'a1')
      
      //t.deepEqual(updates[2].pos, {before: 'a1', after: ['a']})
      /*
      t.deepEqual(updates[2].revisions[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'baz' // changes because allRevisions is true
      })
      */
      //t.equal(updates[2].unsaved, false)
      //t.deepEqual(heads(updates[2]), ['a1','a2'])

      t.deepEqual(updates[3].revisions[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: ['a1', 'a2'],
        text: 'merged'
      })
      //t.equal(updates[3].unsaved, true)
      //t.deepEqual(heads(updates[3]), ['draft-a3'])

      t.end()
    })
  )
})
test('draft-a3 (merge), rev a1, rev a2 (fork), new a, del draft-a3', (t)=>{
  const kvs = [
    { key: 'draft-a3', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: ['a1', 'a2'],
          text: 'merged'
    } } },
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'bar'
    } } },
    { key: 'a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a3', type: 'del'}
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 2)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: ['a1', 'a2'],
        text: 'merged'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(heads(updates[0]), ['draft-a3'])

      /*
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'bar'
      })
      */
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['a1', 'a2'])

      t.end()
    })
  )
})

test('buffer until sync: new a, rev b1, new b, sync, rev a1' , (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'original a'
    } } },
    { key: 'b1', value: {
        content: {
          revisionRoot: 'b',
          revisionBranch: 'b',
          text: 'revised b'
    } } },
    { key: 'b', value: {
        content: {
          text: 'original b'
    } } },
    {sync: true},
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'revised a'
    } } },
  ]
  pull(
    pull.values(kvs),
    s({sync: true, bufferUntilSync: true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 4)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        text: "original a"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a'])

      t.equal(updates[1].key, 'b')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'b',
        revisionBranch: 'b',
        text: "revised b"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(heads(updates[1]), ['b1'])

      t.deepEqual(updates[2], {sync: true})

      t.equal(updates[3].key, 'a')
      t.deepEqual(updates[3].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "revised a"
      })
      t.equal(updates[3].unsaved, false)
      t.deepEqual(heads(updates[3]), ['a1'])

      t.end()
    })
  )
})

test.skip('allRevisions=true: rev a1, draft-a2, new a-from-draft-a, draft-a, del draft-a', (t)=>{
  const kvs = [
    { key: 'a1', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'baz'
    } } },
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a1',
          text: 'revised'
    } } },
    { key: 'a', value: {
        content: {
          'from-draft': 'draft-a',
          text: 'bar'
    } } },
    { key: 'draft-a', value: {
        content: {
          text: 'foo'
    } } },
    { key: 'draft-a', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s({allRevisions: true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      //console.log(updates)
      t.equal(updates.length, 4)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'baz'
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(heads(updates[0]), ['a1'])

      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: 'revised'
      })
      t.equal(updates[1].unsaved, true)
      t.deepEqual(heads(updates[1]), ['draft-a2'])

      t.equal(updates[2].pos, 'tail')
      // the revisions value is sent, because
      // we specified allRevisions=true
      t.deepEqual(updates[2].value.content, {
        'from-draft': 'draft-a',
      text: 'bar'
      })
      t.equal(updates[2].unsaved, true)
      t.deepEqual(heads(updates[2]), ['draft-a2'])

      t.deepEqual(updates[3], {key: 'draft-a', type: 'del'})

      t.end()
    })
  )
})

/* TODO
test('test with real data', (t)=>{
  const kvs = [
    {"key":"%3C1+","value":{"timestamp":1502706465607,"content":{"revisionRoot":"%7ep0","revisionBranch":"%7ep0"}}},
    {"key":"%d6PL","value":{"timestamp":1502719542665,"content":{"revisionRoot":"%7ep0","revisionBranch":"%3C1+"}}},
    {"key":"%tPlH","value":{"timestamp":1502728897852,"content":{"revisionRoot":"%7ep0","revisionBranch":"%7ep0"}}},
    {"key":"%eZe6","value":{"timestamp":1504007449007,"content":{"revisionRoot":"%7ep0","revisionBranch":"%3C1+"}}},
    {"key":"%7ep0","value":{"timestamp":1502695627867,"content":{}}}
  ]

  pull(
    pull.values(kvs),
    s({allRevisions: true}),
    pull.through( (kv)=>{
      console.log()
      console.log(kv.revision)
      console.log('- XX ', kv.pos && kv.pos.before || kv.pos, kv.pos && kv.pos.after)
    }),
    pull.collect( (err, updates) => {
      t.notOk(err)
      console.log(updates)
      t.end()
    })
  )
})
*/

test('from-draft sets unsaved=false: new a, draft a2, rev a2, del draft a2', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'foo'
    } } },
    { key: 'a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'foo',
          'from-draft': 'draft-a2'
    } } },
    { key: 'draft-a2', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 3)

      t.deepEqual(heads(updates[0]), ['a'])
      t.deepEqual(heads(updates[1]), ['draft-a2'])
      t.deepEqual(heads(updates[2]), ['a2'])
      t.deepEqual(updates[2].value.content, { revisionRoot: 'a', revisionBranch: 'a', text: 'foo', 'from-draft': 'draft-a2' })
      t.equal(updates[2].unsaved, false)
      t.end()
    })
  )
})

test.skip('allRevisions=true: pass through draft deletion: new a, draft a2, rev a2, del draft a2', (t)=>{
  const kvs = [
    { key: 'a', value: {
        content: {
          text: 'hello'
    } } },
    { key: 'draft-a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'foo'
    } } },
    { key: 'a2', value: {
        content: {
          revisionRoot: 'a',
          revisionBranch: 'a',
          text: 'foo',
          'from-draft': 'draft-a2'
    } } },
    { key: 'draft-a2', type: 'del'  },
  ]
  pull(
    pull.values(kvs),
    s({allRevisions: true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 4)
      console.log(updates)

      t.deepEqual(heads(updates[0]), ['a'])
      t.deepEqual(heads(updates[1]), ['draft-a2'])
      t.deepEqual(heads(updates[2]), ['a2'])
      t.deepEqual(updates[2].value.content, { revisionRoot: 'a', revisionBranch: 'a', text: 'foo', 'from-draft': 'draft-a2' })
      t.equal(updates[2].unsaved, false)

      t.deepEqual(updates[3], {key: 'draft-a2', type: 'del'})
      t.end()
    })
  )
})

//// ---- real world problems
//

test.skip('mxv(ns8), cg2(mxv), vec(mtx), ns8(vec)', (t)=>{
  const kvs = [
    { key: 'mxv', value: {
        content: {
          revisionRoot: 'mtx',
          revisionBranch: 'ns8'
    } } },
    { key: 'cg2', value: {
        content: {
          revisionRoot: 'mtx',
          revisionBranch: 'mxv'
    } } },
    { key: 'vec', value: {
        content: {
          revisionRoot: 'mtx',
          revisionBranch: 'mtx'
    } } },
    { key: 'ns8', value: {
        content: {
          revisionRoot: 'mtx',
          revisionBranch: 'vec'
    } } }
  ]
  pull(
    pull.values(kvs),
    s({allRevisions: true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.deepEqual(
        updates.map( x=> ({rev: x.revision, pos: x.pos})), [
          {rev:'mxv', pos: undefined},
          {rev:'cg2', pos: undefined},
          {rev:'ns8', pos: 'tail'},
          {rev:'vec', pos: 'tail'}
        ]
      )
      console.log(updates)
      t.end()
    })
  )
})


test('Filter updates by untrusted feeds', (t)=>{
  const kvs = [
    { key: 'a', value: {
        author: 'good',
        content: {
          text: 'hello'
    } } },
    { key: 'b', value: {
        author: 'bad',
        content: {
          text: 'world'
    } } }
  ]
  pull(
    pull.values(kvs),
    Updates(k=> k == 'good')(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 1)
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.deepEqual(heads(updates[0]), ['a'])
      t.end()
    })
  )
})

test('Do not filter updates by untrusted feeds, if allowUntrusted is true', (t)=>{
  const kvs = [
    { key: 'a', value: {
        author: 'good',
        content: {
          text: 'hello'
    } } },
    { key: 'b', value: {
        author: 'bad',
        content: {
          text: 'world'
    } } }
  ]
  pull(
    pull.values(kvs),
    Updates(k=> k == 'good')({allowUntrusted: true}),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equal(updates.length, 2)
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.deepEqual(updates[1].value.content, {
        text: "world"
      })
      t.end()
    })
  )
})

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
  pull(
    pull.values(kvs),
    Updates(k=> k == 'good')(),
    pull.collect( (err, updates) => {
      t.notOk(err)
      t.equals(updates.length, 1)

      t.equal(updates[0].key, 'a')
      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.deepEqual(heads(updates[0]), ['a1'])

      t.end()
    })
  )
})

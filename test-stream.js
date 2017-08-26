const test = require('tape')
const pull = require('pull-stream')
const s = require('./revision-stream')
const {includesAll, replace, append} = s

test('includesAll', (t)=>{
  t.ok(includesAll(1, 1))
  t.ok(includesAll(1, [1]))
  t.ok(includesAll([1], 1))
  t.ok(includesAll([1], [1]))

  t.notOk(includesAll(2, 1))
  t.notOk(includesAll(1, [2]))
  t.notOk(includesAll([2], 1))
  t.notOk(includesAll([2], [1]))

  t.ok(includesAll([1,2], [1,2]))
  t.notOk(includesAll([1,2,3], [1,2]))
  t.ok(includesAll([1,2], [1,2,3]))
  t.end()
})

test('replace', (t)=>{
  t.deepEqual(replace([1,2,3], 2, 4), [1,3,4])
  t.deepEqual(replace([1,2,3], [2,3], 4), [1,4])
  t.deepEqual(replace([1,2,3], 3, 4), [1,2,4])
  t.deepEqual(replace([1,2,3], [1,2,3], [4,5]), [4,5])
  t.deepEqual(replace([1,2,3], [1,2,3], 4), 4)
  t.end()
})

test('append', (t)=>{
  t.deepEqual(append(1,2), [1,2])
  t.deepEqual(append([1,2],3), [1,2,3])
  t.deepEqual(append([1,2],[3,4]), [1,2,3,4])
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
      t.notOk(err)
      t.deepEqual(updates[0].value.content, {
        text: "hello"
      })
      t.equal(updates[0].unsaved, false)
      t.deepEqual(updates[0].heads, ['a'])

      t.deepEqual(updates[1].value.content, {
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(updates[1].heads, ['b'])
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
      t.deepEqual(updates[0].heads, ['a'])

      t.equal(updates[1].key, 'b')
      t.deepEqual(updates[1].value.content, {
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(updates[1].heads, ['b'])

      t.equal(updates[2].key, 'b')
      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'b',
        revisionBranch: 'b',
        text: "foo"
      })
      t.equal(updates[2].unsaved, false)
      t.deepEqual(updates[2].heads, ['b1'])

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
      t.deepEqual(updates[0].heads, ['a'])

      t.equal(updates[1].key, 'b')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'b',
        revisionBranch: 'b',
        text: "foo"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(updates[1].heads, ['b1'])

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
      t.deepEqual(updates[0].heads, ['a'])

      t.equal(updates[1].key, 'a')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(updates[1].heads, ['a1'])

      t.equal(updates[2].key, 'a')
      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[2].unsaved, true)
      t.deepEqual(updates[2].heads, ['draft-a2'])

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
      t.deepEqual(updates[0].heads, ['draft-a2'])

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
      t.deepEqual(updates[0].heads, ['draft-a2'])

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
      t.deepEqual(updates[0].heads, ['a'])

      t.equal(updates[1].key, 'a')
      t.deepEqual(updates[1].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(updates[1].heads, ['a1'])
      
      t.equal(updates[2].key, 'a')
      t.deepEqual(updates[2].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a1',
        text: "foo"
      })
      t.equal(updates[2].unsaved, true)
      t.deepEqual(updates[2].heads, ['draft-a2'])

      t.equal(updates[3].key, 'a')
      t.deepEqual(updates[3].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: "world"
      })
      t.equal(updates[3].unsaved, false)
      t.deepEqual(updates[3].heads, ['a1'])

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

test('draft-a1, del draft-a1, new a', (t)=>{
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
      t.equal(updates.length, 2)

      t.deepEqual(updates[0].value.content, {
        revisionRoot: 'a',
        revisionBranch: 'a',
        text: 'foo'
      })
      t.equal(updates[0].unsaved, true)
      t.deepEqual(updates[0].heads, ['draft-a1'])

      t.deepEqual(updates[1].value.content, {
        text: 'hello'
      })
      t.equal(updates[1].unsaved, false)
      t.deepEqual(updates[1].heads, ['a'])

      t.end()
    })
  )
})

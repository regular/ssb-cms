const test = require('tape')
const DB = require('../db')
const pull = require('pull-stream')

const validMsgId = '%7ep0bLkGMSDI/Dk2AQsFP7civsOgS57jtIzYRiKxWM4=.sha256'

test('getMessageOrDraft', (t)=>{
  t.plan(6)

  const db = DB({
    get: (id, cb) => {
      t.equal(id, validMsgId)
      cb(null, 'bar')
    }
  }, {
    get: (id, cb) => {
      t.equal(id, 'draft-a')
      cb(null, 'foo')
    }
  })

  db.getMessageOrDraft('draft-a', (err, value)=>{
    t.notOk(err)
    t.equal(value, 'foo')
  })
  db.getMessageOrDraft(validMsgId, (err, value)=>{
    t.notOk(err)
    t.equal(value, 'bar')
  })
})

test('branches of draft', (t)=>{
  t.plan(1)

  const db = DB({
    links: (opts) => {
      t.fail("Don't adk ssb for drafts")
    }
  }, {
    byBranch: (root, opts) => {
      t.deepEqual(opts, {foo: 'bar'}, 'Options are passed through to drafts.byBranch')
    }
  })

  db.branches('draft-a', {foo: 'bar'})
})

test('branches of draft (live): sync comes through', (t)=>{
  const db = DB({
    links: (opts) => {
      t.fail("Don't adk ssb for drafts")
    }
  }, {
    byBranch: (root, opts) => {
      t.deepEqual(opts, {live: true, sync: true}, 'Options are passed through to drafts.byBranch')
      return pull.values([{foo: 'bar'}, {sync: true}])
    }
  })

  pull(
    db.branches('draft-a', {sync: true, live: true}),
    pull.collect( (err, items)=>{
      t.notOk(err)
      t.deepEqual(items, [{foo: 'bar'},{sync: true}])
      t.end()
    })
  )
})

test('branches of message: stream from ssb and drafts', (t)=>{
  t.plan(3)

  const db = DB({
    links: (opts) => {
      t.deepEqual(opts, {
        foo: 'bar',
        rel: 'branch',
        dest: validMsgId,
        keys: true,
        values: true
      }, "Correct options for ssb.links")
    }
  }, {
    byBranch: (root, opts) => {
      t.equal(root, validMsgId)
      t.deepEqual(opts, {foo: 'bar'}, "Options are passed through to draft.byBranch")
    }
  })

  db.branches(validMsgId, {foo: 'bar'})
})

test('branches of message (live): one sync comes through', (t)=>{
  const db = DB({
    links: (opts) => {
      t.deepEqual(opts, {
        foo: 'bar',
        live: true,
        sync: true,
        rel: 'branch',
        dest: validMsgId,
        keys: true,
        values: true
      }, "Correct options for ssb.links")
      return pull.values([
        {bar: 'baz'},
        {sync: true}
      ])
    }
  }, {
    byBranch: (root, opts) => {
      t.deepEqual(opts, {foo: 'bar', live: true, sync: true}, 'Options are passed through to drafts.byBranch')
      return pull.values([
        {foo: 'bar'}, 
        {sync: true}
      ])
    }
  })

  pull(
    db.branches(validMsgId, {foo: 'bar', sync: true, live: true}),
    pull.collect( (err, items)=>{
      t.notOk(err)
      t.deepEqual(items, [
        {bar: 'baz'},
        {foo: 'bar'},
        {sync: true}
      ])
      t.end()
    })
  )
})

test('branches of message: filter duplicate keys', (t)=>{
  const db = DB({
    links: (opts) => {
      return pull.values([
        {key: 'baz'},
        {key: 'baz'},
        {key: 'bar'}
      ])
    }
  }, {
    byBranch: (root, opts) => {
      return pull.values([
        {key: 'bar'},
        {key: 'baz'},
        {key: 'bar'}
      ])
    }
  })

  pull(
    db.branches(validMsgId),
    pull.collect( (err, items)=>{
      t.notOk(err)
      t.deepEqual(items, [
        {key: 'baz'},
        {key: 'bar'}
      ])
      t.end()
    })
  )
})

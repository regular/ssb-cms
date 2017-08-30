const test = require('tape')
const DB = require('../db')
const pull = require('pull-stream')

const validMsgId = '%7ep0bLkGMSDI/Dk2AQsFP7civsOgS57jtIzYRiKxWM4=.sha256'

test('revisions of draft', (t)=>{
  t.plan(1)

  const db = DB({
    get: (key) => {
      t.fail("Don't adk ssb for drafts")
    },
    links: (opts) => {
      t.fail("Don't adk ssb for drafts")
    }
  }, {
    get: (key, cb) => {
      t.equal(key, 'draft-a')
      cb(null, {})
    },
    byRevisionRoot: (root, opts) => {
      t.deepEqual(opts, {foo: 'bar'}, 'Options are passed through to drafts.byRevisionRoot')
    }
  })

  db.revisions('draft-a', {foo: 'bar'})
})

test('revisions of draft (live): sync comes through', (t)=>{
  const db = DB({
    get: (key) => {
      t.fail("Don't adk ssb for drafts")
    },
    links: (opts) => {
      t.fail("Don't adk ssb for drafts")
    }
  }, {
    get: (key, cb) => {
      t.equal(key, 'draft-a')
      cb(null, {bar: 'baz'})
    },
    byRevisionRoot: (root, opts) => {
      t.deepEqual(opts, {live: true, sync: true}, 'Options are passed through to drafts.byRevisionRoot')
      return pull.values([{foo: 'bar'}, {sync: true}])
    }
  })

  pull(
    db.revisions('draft-a', {sync: true, live: true}),
    pull.collect( (err, items)=>{
      t.notOk(err)
      t.deepEqual(items, [
        {key: 'draft-a', value: { bar: 'baz' } },
        {foo: 'bar'},
        {sync: true}])
      t.end()
    })
  )
})

test('revisions of message: stream from ssb and drafts', (t)=>{
  t.plan(3)

  const db = DB({
    get: (key, cb) => {
      t.equal(key, validMsgId)
      cb(null, {bar: 'baz'})
    },
    links: (opts) => {
      t.deepEqual(opts, {
        foo: 'bar',
        rel: 'revisionRoot',
        dest: validMsgId,
        keys: true,
        values: true
      }, "Correct options for ssb.links")
    }
  }, {
    get: (key, cb) => {
      t.fail("Don;t ask drafts for ssb message")
    },
    byRevisionRoot: (root, opts) => {
      t.equal(root, validMsgId)
      t.deepEqual(opts, {foo: 'bar'}, "Options are passed through to draft.byRevisionRoot")
    }
  })

  db.revisions(validMsgId, {foo: 'bar'})
})

test('revisions of message (live): one sync comes through', (t)=>{
  const db = DB({
    get: (key, cb) => {
      t.equal(key, validMsgId)
      cb(null, {bar: 'baz'})
    },
    links: (opts) => {
      t.deepEqual(opts, {
        foo: 'bar',
        live: true,
        sync: true,
        rel: 'revisionRoot',
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
    get: (key, cb) => {
      t.fail("Don;t ask drafts for ssb message")
    },
    byRevisionRoot: (root, opts) => {
      t.deepEqual(opts, {foo: 'bar', live: true, sync: true}, 'Options are passed through to drafts.byRevisionRoot')
      return pull.values([
        {key: validMsgId, value: { bar: 'baz' } },
        {foo: 'bar'},
        {sync: true}
      ])
    }
  })

  pull(
    db.revisions(validMsgId, {foo: 'bar', sync: true, live: true}),
    pull.collect( (err, items)=>{
      t.notOk(err)
      t.deepEqual(items, [
        {key: validMsgId, value: {bar: 'baz'}},
        {bar: 'baz'},
        {foo: 'bar'},
        {sync: true}
      ])
      t.end()
    })
  )
})

test('revisions of message: filter duplicate keys', (t)=>{
  const db = DB({
    get: (key, cb) => {
      t.equal(key, validMsgId)
      cb(null, {bar: 'baz'})
    },
    links: (opts) => {
      return pull.values([
        {key: validMsgId},
        {key: 'baz'},
        {key: 'bar'}
      ])
    }
  }, {
    get: (key, cb) => {
      t.fail("Don;t ask drafts for ssb message")
    },
    byRevisionRoot: (root, opts) => {
      return pull.values([
        {key: 'bar'},
        {key: validMsgId },
        {key: 'bar'}
      ])
    }
  })

  pull(
    db.revisions(validMsgId),
    pull.collect( (err, items)=>{
      t.notOk(err)
      t.deepEqual(items, [
        {key: validMsgId, value: {bar: 'baz'}},
        {key: 'bar'},
        {key: 'baz'}
      ])
      t.end()
    })
  )
})

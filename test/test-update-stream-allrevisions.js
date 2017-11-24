const test = require('tape')
const pull = require('pull-stream')
const UpdateStream = require('../update-stream')
const DB = require('../db')

const validMsgId = '%0ep0bLkGMSDI/Dk2AQsFP7civsOgS57jtIzYRiKxWM4=.sha256'
const validMsgId1 = '%1ep0bLkGMSDI/Dk2AQsFP7civsOgS57jtIzYRiKxWM4=.sha256'

const drafts = {
  byRevisionRoot: ()=> {
    return pull.values([{sync: true}])
  }
}

function SS(ssb, drafts) {
  const updateStream =  UpdateStream([])
  const db = DB(ssb, drafts)

  return function(id) {
    return pull(
      db.revisions(id, {sync: true}),
      updateStream({
        allowUntrusted: true,
        allRevisions: true,
        sync: true
      })
    )
  }
}
  
test('sortstream: rev a1, new a', t => {
  const ssb = {
    get: (id, cb)=>{
      setTimeout( ()=> {
        cb(null, {content: {
          branch: 'b'
        }})
      }, 1)
    },
    links: ()=>{
      return pull.values([
        {key: 'a1', value: {content: {
          branch: 'b',
          revisionRoot: validMsgId,
          revisionBranch: validMsgId
        }}},
        {sync: true}
      ])
    }
  }

  pull(
    SS(ssb, drafts)(validMsgId),
    pull.collect( (err, updates) => {
      console.log('updates', updates)
      t.equal(updates[0].revisions.length, 1)
      t.equal(updates[1].revisions.length, 2)

      t.equal(updates[1].revisions[1].key, validMsgId)
      t.equal(updates[1].revisions[0].key, 'a1')
      t.end()
    })
  )
})

test('sortstream: new a, rev a1', t => {
  const ssb = {
    get: (id, cb)=>{
      setTimeout( ()=> {
        cb(null, {content: {
          branch: 'b',
          revisionRoot: validMsgId,
          revisionBranch: validMsgId
        }})
      }, 1)
    },
    links: ()=>{
      return pull.values([
        {key: validMsgId, value: {content: {
          branch: 'b'
        }}},
        {sync: true}
      ])
    }
  }

  pull(
    SS(ssb, drafts)(validMsgId1),
    pull.collect( (err, updates) => {
      t.notOk(err)
      console.log('updates', updates)
      t.equal(updates[0].revisions.length, 1)
      t.equal(updates[1].revisions.length, 2)

      t.equal(updates[1].revisions[1].key, validMsgId)
      t.equal(updates[1].revisions[0].key, validMsgId1)
      t.end()
    })
  )
})

test('sortstream: new a, rev a2, rev a1 (fork, a2 wins)', t => {
  const ssb = {
    get: (id, cb)=>{
      cb(null, {content: {
        branch: 'b'
      }})
    },
    links: ()=>{
      return pull.values([
        {key: 'a2', value: {
        timestamp: 2,
        content: {
          branch: 'b',
          revisionRoot: validMsgId,
          revisionBranch: validMsgId
        }}},
        {key: 'a1', value: {
        timestamp: 1,
        content: {
          branch: 'b',
          revisionRoot: validMsgId,
          revisionBranch: validMsgId
        }}},
        {sync: true}
      ])
    }
  }

  pull(
    SS(ssb, drafts)(validMsgId),
    pull.through(console.log),
    pull.collect( (err, updates) => {
      console.log('updates', updates)
      t.equal(updates[0].revisions.length, 1)
      t.equal(updates[1].revisions.length, 2)
      t.equal(updates[2].revisions.length, 3)

      t.equal(updates[2].revisions[2].key, validMsgId)
      t.equal(updates[2].revisions[1].key, 'a1')
      t.equal(updates[2].revisions[0].key, 'a2')
      t.end()
    })
  )
})

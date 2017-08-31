const test = require('tape')
const pull = require('pull-stream')
const SS = require('../sort-stream')

const insert = SS.insert
const validMsgId = '%0ep0bLkGMSDI/Dk2AQsFP7civsOgS57jtIzYRiKxWM4=.sha256'
const validMsgId1 = '%1ep0bLkGMSDI/Dk2AQsFP7civsOgS57jtIzYRiKxWM4=.sha256'

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

const drafts = {
  byRevisionRoot: ()=> {
    return pull.values([{sync: true}])
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
    pull.map( a=>a.slice() ), // make a copy for the sake of testing
    pull.collect( (err, updates) => {
      console.log('updates', updates)
      t.equal(updates[0].length, 1)
      t.equal(updates[1].length, 2)

      t.equal(updates[1][0].id, validMsgId)
      t.equal(updates[1][1].id, 'a1')
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
    pull.map( a=>a.slice() ), // make a copy for the sake of testing
    pull.collect( (err, updates) => {
      console.log('updates', updates)
      t.equal(updates[0].length, 1)
      t.equal(updates[1].length, 2)

      t.equal(updates[1][0].id, validMsgId)
      t.equal(updates[1][1].id, validMsgId1)
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
    pull.map( a=>a.slice() ), // make a copy for the sake of testing
    pull.collect( (err, updates) => {
      console.log('updates', updates)
      t.equal(updates[0].length, 1)
      t.equal(updates[1].length, 2)
      t.equal(updates[2].length, 3)

      t.equal(updates[2][0].id, validMsgId)
      t.equal(updates[2][1].id, 'a1')
      t.equal(updates[2][2].id, 'a2')
      t.end()
    })
  )
})

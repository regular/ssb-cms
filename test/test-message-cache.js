const test = require('tape')
const pull = require('pull-stream')
const { updateObservableMessages } = require('../message-cache')

// revision + child props
// sync
// type: 'del'
// type: 'revert', remove: {draft-id}
function container() {
  let ret = []
  ret.delete = x => {
    let i = ret.indexOf(x)
    if (i === -1) throw 'delete: object not found in container'
    ret.splice(i, 1)
    console.log('after delete', ret.length, 'items')
  }
  return ret 
}

test('Should create container and object and should update object', t => {
  t.plan(4)
  let objs = {}
  let o

  let updates = [{
    key: 'obj-a',
    value: 'a value'
  }]

  let opts = {
    makeObservable: kv => {
      t.equal(kv, updates[0])
      return (o = {})
    },
    updateObservable: (o2, kv) => {
      t.equal(o, o2)
      t.equal(kv, updates[0])
      Object.assign(o, kv)
    },
    getContainer: kv => {
      t.equal(kv, updates[0])
      return objs[kv.key] || (objs[kv.key] = container())
    }
  }

  pull(
    pull.values(updates),
    updateObservableMessages(null, opts)
  )
})

test('Should update existing object', t => {
  t.plan(7)
  let objs = {}

  let updates = [
    {
      key: 'obj-a',
      value: 'a value'
    },
    {
      key: 'obj-a',
      value: 'b value'
    },
  ]

  let i = 0, ii = 0, o
  let opts = {
    makeObservable: kv => {
      t.equal(kv, updates[0])
      return (o = {})
    },
    updateObservable: (o2, kv) => {
      t.equal(o, o2)
      t.equal(kv, updates[i++])
      Object.assign(o, kv)
    },
    getContainer: kv => {
      t.equal(kv, updates[ii++])
      return objs[kv.key] || (objs[kv.key] = container())
    }
  }

  pull(
    pull.values(updates),
    updateObservableMessages(null, opts)
  )
})

test('Should add object if not found', t => {
  t.plan(8)
  let objs = {}

  let updates = [
    {
      key: 'obj-a',
      value: 'a value'
    },
    {
      key: 'obj-b',
      value: 'b value'
    },
  ]

  let i = 0, ii = 0, iii= 0, o
  let opts = {
    makeObservable: kv => {
      t.equal(kv, updates[iii++])
      return (o = {})
    },
    updateObservable: (o2, kv) => {
      t.equal(o, o2)
      t.equal(kv, updates[i++])
      Object.assign(o, kv)
    },
    getContainer: kv => {
      t.equal(kv, updates[ii++])
      return objs[kv.key] || (objs[kv.key] = container())
    }
  }

  pull(
    pull.values(updates),
    updateObservableMessages(null, opts)
  )
})

test('Should delete object when type=="del"', t => {
  t.plan(7)
  let objs = {}

  let updates = [
    {
      key: 'obj-a',
      value: 'a value'
    },
    {
      key: 'obj-a',
      type: 'del'
    },
  ]

  let ii = 0, o
  let opts = {
    makeObservable: kv => {
      t.equal(kv, updates[0])
      return (o = {})
    },
    updateObservable: (o2, kv) => {
      t.equal(o, o2)
      t.equal(kv, updates[0])
      Object.assign(o, kv)
    },
    getContainer: kv => {
      t.equal(kv, updates[ii++])
      return objs[kv.key] || (objs[kv.key] = container())
    }
  }

  pull(
    pull.values(updates),
    updateObservableMessages(null, opts, err => {
      t.notOk(err)
      t.equal(objs['obj-a'].length, 0)
    })
  )
})

test('Should update revert to previous revision', t => {
  t.plan(10)
  let objs = {}

  let updates = [
    {
      key: 'obj-a',
      value: 'a value',
      revision: 1
    },
    {
      key: 'obj-a',
      value: 'b value',
      revision: 2
    },
    {
      key: 'obj-a',
      value: 'a value',
      type: 'revert',
      remove: 2
    }
  ]

  let i = 0, ii = 0, o
  let opts = {
    makeObservable: kv => {
      t.equal(kv, updates[0])
      return (o = {})
    },
    updateObservable: (o2, kv) => {
      t.equal(o, o2)
      if (i<2) 
        t.equal(kv, updates[i++])
      else
        t.deepEqual(kv, {
          key: 'obj-a',
          value: 'a value',
          revision: 1,
          type: 'revert',
          remove: 2
        })
      Object.assign(o, kv)
    },
    getContainer: kv => {
      t.equal(kv, updates[ii++])
      return objs[kv.key] || (objs[kv.key] = container())
    }
  }

  pull(
    pull.values(updates),
    updateObservableMessages(null, opts)
  )
})

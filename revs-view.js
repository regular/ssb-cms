require('setimmediate')
const h = require('mutant/html-element')
const observable = require('observable')
const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')

const updateStream = require('./update-stream')

function arr(v) {
  if (typeof v === 'undefined') return []
  if (v === null) return []
  if (Array.isArray(v)) return v
  return [v]
}

function insert(key, kv, entries, pos) {
  let error = ()=> {throw new Error(`Couldn't place ${key} ${pos}`)}
  let after = arr(pos.after).slice()
  let before = arr(pos.before)
  // slide down the array until we are behind everything listed in `after`
  let i = 0
  while(after.length && i<entries.length) {
    let r = entries[i].revision || entries[i].key
    if (before.includes(r)) error()
    // jshint -W083
    if (after.includes(r)) after = after.filter( x=> x !== r )
    // jshint +W083
  }
  if (after.length) error()

  // now slide down further, until we either hit an entry of `before`
  // or the next timestamp is greaten than ours
  while(i<entries.length) {
    let r = entries[i].revision || entries[i].key
    if (before.includes(r)) break
    if (entries[i].value.timestamp > kv.value.timestamp) break
    ++i
  }
  return entries.slice(0, i).concat([kv]).concat(entries.slice(i))
}

function drawLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = '#003300';
  ctx.stroke();
}

function drawCircle(context, centerX, centerY, radius) {
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
  context.fillStyle = 'green';
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = '#003300';
  context.stroke();
}

function drawGraph(canvas, entries) {
  let ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  entries.forEach( (e, i)=> {
    drawCircle(ctx, e.cx, e.cy, 10)
  })
  entries.forEach( (e, i)=> {
    arr(e.value.content.revisionBranch).forEach( (b)=>{
      let otherEntry
      otherEntry = entries.find( x=> (x.revision || x.key) == b)
      drawLine(ctx, e.cx, e.cy, otherEntry.cx, otherEntry.cy)
    })
  })
}

function updateGraph(entries) {
  entries.forEach( (e)=> {
    let fx = 0
    entries.forEach( (other)=> {
      if (e === other) return
      let dx = other.cx - e.cx
      //let dy = other.cy - e.cy
      if (dx === 0) {
        fx += .01
      } else {
        fx += -1000/dx * 0.0000001
      }
    })
    arr(e.value.content.revisionBranch).forEach( (b)=>{
      let otherEntry = entries.find( x=> (x.revision || x.key) == b)
      let dx = otherEntry.cx - e.cx
      fx += dx * .001
    })
    e.vx += fx
    e.cx += e.vx
  })
}

function makeGraph(entries) {
  const entryHeight = 64
  const height = entries.length * entryHeight
  const width = 200
  let canvas = h('canvas', {
    width, height
  })
  let ctx = canvas.getContext('2d')
  entries.forEach( (e, i)=> {
    e.vx = 0
    e.cx = 100
    e.cy = entryHeight * (i + 0.5)
  })
  entries.forEach( (e, i)=> {
    arr(e.value.content.revisionBranch).forEach( (b)=>{
      let otherEntry
      otherEntry = entries.find( x=> (x.revision || x.key) == b)
    })
  })
  return canvas
}

module.exports = function(ssb, drafts, me, blobsRoot) {
  let revs = h('.revs')
  revs.selection = observable.signal()

  revs.selection( (id)=>{
    revs.querySelectorAll('.selected').forEach( el => el.classList.remove('selected') )
    //if (el) el.querySelector('.node').classList.add('selected')
  })

  function revisionsByRoot(key) {
    let get = /^draft/.test(key) ? drafts.get : ssb.get
    return pull(
      many([
        pull(
          pull.once(key),
          pull.asyncMap(get),
          pull.map( value => {return {key, value}})
        ),
        ssb.links({
          rel: 'revisionRoot',
          live: true,
          sync: true,
          dest: key,
          keys: true,
          values: true
        }),
        drafts.byRevisionRoot(key, {
          live: true,
          sync: true
        })
      ]),
      (()=>{
        let expectedSyncs = 2
        return pull.filter( (kv)=>{
          if (kv.sync) return --expectedSyncs <= 0
          return true
        })
      })(),
      updateStream({
        sync: true,
        allRevisions: true,
        bufferUntilSync: false
      })
    )
  }

  revs.root = observable.signal()

  let revisions
  let drain
  let entries
  let canvas
  let timer
  revs.root( id => {
    if (drain) drain.abort()
    revisions = null
    drain = null
    revs.selection(null)
    if (timer) clearInterval(timer)
    timer = null
    if (canvas) {
      revs.removeChild(canvas)
      camvas = null
    }
    entries = []
    if (!id) return
    revisions = pull(
      revisionsByRoot(id),
      drain = pull.drain( (kv)=>{
        if (kv.sync) {
          console.log(entries)
          revs.appendChild(canvas = makeGraph(entries))
          drawGraph(canvas, entries)
          timer = setInterval( ()=>{
            updateGraph(entries)
            drawGraph(canvas, entries)
            return true
          }, 100)
          return
        }
        let key = kv.revision || kv.key
        let pos = kv.pos || 'head'
        console.log('- RevView:', pos, key, kv.heads)
        if (pos === 'head') entries.push(kv)
        else if (pos === 'tail') entries.unshift(kv)
        else insert(key, kv, entries, pos)
      }, (err)=>{
        if (err) throw err
        //revs.selection(latest)
      })
    )
  })

  return revs
}

module.exports.insert = insert
module.exports.css = ()=> `
  .rev {
    font-size: 11px;
    color: #6b6969;
    background-color: #eee;
    margin: 1px 1px 0 1px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
    max-height: 32px;
    align-content: flex-start;
  }
  .rev .node {
    order: 3;
    margin: 8px 32px;
  }
  .rev img {
    margin: 0 8px;
    max-height: 32px;
  }
  .rev .author, .rev .timestamp {
    width: 80px;
  }
`

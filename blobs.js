const Value = require('mutant/value')
const bus = require('./bus')
const ref = require('ssb-ref')
const traverse = require('traverse')
const pull = require('pull-stream')

function rateLimit(ms, f) {
  let lastTime = 0
  let timer

  return function fun() {
    if (timer) clearTimeout(timer)
    const now = Date.now()
    if (now - lastTime > ms) {
      f()
      lastTime = now
    } else {
      timer = setTimeout(fun, ms)
    }
  }
}

module.exports = function Blobs(ssb, blobs, blobBytes, blobRefs, blobsPresent) {
  let refs = 0
  let present = 0
  let totalSize = 0
  let knownBlobs = new Set() 
  let sizeObs = {}
  let synced = false
  let refList = []

  const updateStuff = rateLimit(230, ()=>{ 
    if (!synced) return
    blobBytes.set(totalSize)
    blobsPresent.set(present)
    blobRefs.set(refs)

    if (!window.frameElement) {
      const event = new CustomEvent('blobs-progress', { detail: present / refs }); 
      document.body.dispatchEvent(event)
    }

  })

  let getSize = function(blob) {
    ssb.blobs.size(blob, (err, size) => {
      if (err) return sizeObs[blob].set(err.message)
      sizeObs[blob].set(size || 'zero')
      totalSize += size
      ++present
      updateStuff()
    })
  }

  let blobsLs
  return pull(
    pull.asyncMap( (kv, cb) => {
      if (typeof blobsLs === 'undefined') {
        pull(
          ssb.blobs.ls(),
          pull.collect( (err, ls) =>{
            if (err) console.error(err)
            blobsLs = ls || []
            cb(null, kv)
          } )
        )
      } else {
        cb(null, kv)
      }
    }),
    pull.through( processBlobReferences )
  )

  function processBlobReferences(kv) {
  
    if (kv.sync) {
      if (!synced) {
        synced = true
        updateStuff()
        blobs.set(refList)
        console.log('BLOBS synced')
      }
      return
    }
    
    traverse(kv.value.content || {}).forEach( function(v) {
      if (ref.isBlob(v)) {
        let blob = v
        let newBlob = !knownBlobs.has(blob)
        if (newBlob) {
          knownBlobs.add(blob)
          refs++
          updateStuff()
          
          if (!sizeObs[blob]) {
            sizeObs[blob] = Value('...')

            if (blobsLs.includes(blob)) {
              getSize(blob)
            } else {
              sizeObs[blob].set('wanted ...')
              ssb.blobs.want(blob, err => {
                if (err) return sizeObs[blob].set(err.message)
                getSize(blob)
              })
            }

          }
        }

        refList.push({
          id: blob,
          size: sizeObs[blob],
          neededBy: {
            key: kv.key,
            type: kv.value.content.type,
            name: kv.value.content.name,
            path: this.path.join('.')
          }
        })
        if (synced) blobs.set(refList)
      }
    })
  }
}

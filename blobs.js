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
    blobBytes.set(totalSize)
    blobsPresent.set(present)

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
      if (synced) updateStuff()
    })
  }

  pull(
    ssb.blobs.ls(),
    pull.drain( blob => {
      if (!sizeObs[blob]) {
        sizeObs[blob] = Value('...')
        getSize(blob)
      }
    } )
  )

  return function processBlobReferences(kv) {
  
    if (kv.sync) {
      if (!synced) {
        synced = true
        blobRefs.set(refs)
        blobBytes.set(totalSize)
        blobsPresent.set(present)
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
          if (synced) blobRefs.set(refs)
          
          if (!sizeObs[blob]) {
            sizeObs[blob] = Value('...')

            ssb.blobs.has(blob, (err, gotit) => {
              if (err) return sizeObs[blob].set(err.message)
              if (gotit) return getSize(blob)

              sizeObs[blob].set('wanted ...')
              ssb.blobs.want(blob, err => {
                if (err) return sizeObs[blob].set(err.message)
                getSize(blob)
              })
            })

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

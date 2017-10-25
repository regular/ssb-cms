// mutant
require('setimmediate')
const h = require('mutant/html-element')
const MutantMap = require('mutant/map')
const MutantDict = require('mutant/dict')
const Value = require('mutant/value')
const Struct = require('mutant/struct')
const MutantArray = require('mutant/array')
const computed = require('mutant/computed')
const when = require('mutant/when')
const send = require('mutant/send')
const resolve = require('mutant/resolve')
const ref = require('ssb-ref')
const bus = require('./bus')

const pull = require('pull-stream')
const cat = require('pull-cat')
const traverse = require('traverse')
const prettyBytes = require('pretty-bytes')
const updates = require('./update-stream')
const config = require('./cms-config')
const {isDraft} = require('./util')

module.exports = function(ssb, drafts, root, view) {
  let sbotConnect = Value(true)

  let isSynced = Value()
  let draftCount = Value(0)
  let draftWarning = Value(false)

  let forkCount = Value(0)
  let incompleteCount = Value(0)
  let messageCount = Value(0)
  let revisionCount = Value(0)
  
  let blobRefs = Value(0)
  let blobsPresent = Value(0)
  let blobBytes = Value(0)

  let version = Value('dev')

  let ready = computed([isSynced, blobRefs, blobsPresent], (s, r, p) => s && r === p)

  let peers = MutantDict()
  let peerCount = Value()
  let draftsMessage = Value("")

  let remoteUrl = window.location.href.replace(/#.*$/,'').replace('127.0.0.1', config.sbot.host || '127.0.0.1') + '#' +
    window.localStorage['electroparty-config']

  view.appendChild(
    h('section.remote-access', [
      h('h2', 'Remote access'),
      h('a', {href: remoteUrl, target: '_blank'}, remoteUrl)
    ])
  )

  let draftsMutantDict = MutantDict()
  let openDraft = Value('')
  view.appendChild(
    h('section.drafts', [
      h('h2', 'Drafts'),
      h('table', [ h('tr', [
        h('th', 'Id'),
        h('th', 'revisionRoot'),
        h('th', 'revisionBranch')
      ]), computed([draftsMutantDict], drafts  => {
        return Object.keys(drafts).map( k => {
          let kv = drafts[k]
          return [
            h('tr', [
              h('td', k),
              h('td', h('a', {href: `#${kv.revisionRoot}`}, kv.revisionRoot || 'no revisionRoot')),
              h('td', kv.revisionBranch || 'no revisionBranch'),
              h('td',
                when(
                  computed(
                    [openDraft],
                    d => d === k
                  ),
                  h('pre', JSON.stringify(kv, null, 2)),
                  h('button', {
                    'ev-click': ()=>{
                      openDraft.set(k)
                    }
                  }, 'inspect')
                )
              )
            ])
          ]
        })
      })]),
      h('div', draftsMessage),
      h('button', {
        'ev-click': function(e) {
          drafts.destroy()
          window.location.hash = ''
          window.location.reload()
        }
      }, 'Delete all drafts')
    ])
  )

  let forkedObjectsObs = MutantDict()
  view.appendChild(
    h('section.forks', [
      h('h2', 'Forks'),
      h('table', computed([forkedObjectsObs], forks  => {
        return Object.keys(forks).map( k => {
          let kv = forks[k]
          let content = kv.value && kv.value.content 
          return h('tr', [
            h('td', h('a', {href: `#${k}`}, (content && `${content.type || 'no type'} ${content.name || 'no name'}`) || 'no name')),
            h('td', `${Object.keys(kv.heads).length} heads`)
          ])
        })
      }))
    ])
  )

  view.appendChild(
    h('section.peers', [
      h('h2', 'Peers'),
      h('table', computed([peers], p  => {
        let count = 0
        let ret = Object.keys(p).map( k => {
          let v = p[k]
          if (v.state === 'connected') count++
          return h('tr', [
            h('td', k),
            h('td', v.host),
            h('td', v.port),
            h('td', v.source),
            h('td', v.state)
          ])
        })
        peerCount.set(count)
        return ret
      }))
    ])
  )

  let blobs = MutantArray()
  view.appendChild(
    h('section.blobs', [
      h('h2', 'Blobs'),
      h('table', MutantMap(blobs, b => h('tr', [
        h('td', h('a', {
          target: '_blank',
          href: `${config.blobsRoot}/${b.id}`
        }, b.id)),
        h('td', {
          style: {
            background: computed([b.size], s => s==='missing' ? 'red' : 'unset')
          }
        },computed([b.size], s=>Number.isInteger(s) ? prettyBytes(s) : s)),
        h('td', h('a', {
          href: `#${b.neededBy.key}`
        }, `${b.neededBy.type} ${b.neededBy.name || ''}`)),
        h('td', b.neededBy.path)
      ])))
    ])
  )

  function html() {
    return h('span.status', [
      h('span', [
        h('span', 'Version:'),
        h('span', version)
      ]),
      h('span', [
        'Sbot:',
        when(computed([sbotConnect], p => !p), h('span', {title: 'lost connection to backend'}, '⚠')),
        when(sbotConnect, h('span', {style:{color:'green'}}, '✓'))
      ]),
      h('span', [
        'Peers:',
        h('span', peerCount),
        when(computed([peerCount], p => p==0), h('span', {title: 'offline'}, '⚠'))
      ]),
      h('span', [
        'Drafts:',
        h('span', draftCount),
        when(draftWarning, h('span', {title: 'draft db corruption'}, '⚠'))
      ]),
      h('span', [
        'Objects:',
        h('span', messageCount)
      ]),
      h('span', [
        'Revisions:',
        h('span', revisionCount)
      ]),
      h('span', [
        'Forks:',
        h('span', forkCount)
      ]),
      h('span', [
        'Incomplete:',
        h('span', incompleteCount)
      ]),
      h('span', [
        'Blobs:',
        h('span', [' ', blobsPresent, ' / ', blobRefs, ' (', computed([blobBytes], b => prettyBytes(b)), ')']),
        h('span', { style: {
          color: computed([ready], r => r ? 'green' : 'red')
        } },
        computed([ready], r => r ? '✓' : '⌛ '))
      ])
    ])
  }

  function watchDrafts() {
    let seen = new Set()
    let allDrafts = {}
    let counts = {
      draft: 0,
      branch: 0,
      revroot: 0
    }
    let synced = false
    pull(
      drafts.all({
        live: true,
        sync: true,
        keys: true,
        values: true
      }),
      pull.drain( (kv)=>{
        if (kv.sync) {
          draftCount.set(counts.draft)
          draftsMutantDict.set(allDrafts)
          synced = true
          return
        }
        let key = kv.key
        //console.log('WATCH', kv.type, key)
        if (key[0]==='~') key = key.substr(1)
        let t = key.split(/[~-]/)[0].toLowerCase()
        if (t === 'draft') {
          if (!kv.type || kv.type == 'put') {
            if (!seen.has(kv.key)) {
              console.log('DRAFT', kv)
              counts[t]++
              seen.add(kv.key)
              allDrafts[kv.key] = kv
              if (synced) draftsMutantDict.put(kv.key, kv)
            }
          } else if (kv.type == 'del') {
            counts[t]--
            seen.delete(kv.key)
            if (synced) draftsMutantDict.delete(kv.key)
          }
        } else {
          counts[t] += (kv.type === 'del') ? -1 : 1
        }
        if (synced) {
          draftCount.set(counts.draft)
          draftWarning.set(counts.draft !== counts.branch || counts.draft !== counts.revroot)
        }
      })
    )
  }

  function watchMessages(root) {
    let synced = false

    function f(obs) {
      let list = {}
      return function (key, state) {
        let dirty = false
        if (key && list[key] && !state) {
          list[key] = false
          dirty=true
        }
        if (key && !list[key] && state) {
          list[key] = true
          dirty = true
        }
        if (dirty && synced || !key) obs.set(Object.keys(list).length)
      }
    }
  
    let forkedObjects = {}
    let forked = f(forkCount)
    let incomplete = f(incompleteCount)
    let message = f(messageCount)
    let revision = f(revisionCount)

    pull(
      ssb.links({
        live: true,
        sync: true,
        rel: 'root',
        dest: root,
        keys: true,
        values: true
      }),
      pull.through( kv => revision(kv.key, true) ),
      updates({sync: true, bufferUntilSync: true}),
      pull.through( AutoUpdate() ),
      pull.through( Blobs() ),
      pull.filter( x => {
        if (x.sync) {
          console.log('watch synced')
          synced = true
          // update observers
          forked()
          incomplete()
          message()
          revision()
          forkedObjectsObs.set(forkedObjects)
          isSynced.set(true)
        }
        return !x.sync
      }),
      pull.drain( kv => {
        //console.log('watch', kv)
        let {key, value} = kv
        if (kv.type === 'del') return
        if (isDraft(key)) return

        let content = value.content
        let revRoot = content && content.revisionRoot
        let revBranch = content && content.revisionBranch
        let isMessage = !revRoot || revRoot === key
        //let isRevision = revBranch && revBranch !== revRoot
        
        let isForked = Object.keys(kv.heads).length > 1
        let isKnownFork = Object.keys(forkedObjects).includes(kv.key)
        if (isForked && !isKnownFork) {
          forkedObjects[key] = kv
          if (synced) forkedObjectsObs.put(key, kv)
        } else if (!isForked && isKnownFork) {
          delete forkedObjects[key]
          if (synced) forkedObjectsObs.delete(key)
        }

        forked(key, isForked)
        incomplete(key, kv.tail !== key)
        message(key, isMessage)
      }, (err) => {
        console.log('status message stream ended', err)
      })
    )
  }

  function Blobs() {
    let refs = 0
    let present = 0
    let totalSize = 0
    let knownBlobs = new Set() 
    let sizeObs = {}
    let synced = false
    let refList = []

    let getSize = function(blob) {
      ssb.blobs.size(blob, (err, size) => {
        if (err) return sizeObs[blob].set(err.message)
        sizeObs[blob].set(size || 'zero')
        totalSize += size
        ++present
        if (synced) {
          blobBytes.set(totalSize)
          blobsPresent.set(present)
          if (window.frameElement) {
            bus.emit('screen-progress', {
              id: window.frameElement.id,
              progress: present / refs
            })
          }
        }
      })
    }

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


  function watchPeers() {
    sbotConnect.set(true)
    pull(
      cat([
        pull(
          pull.once(1),
          pull.asyncMap( (x,cb) => ssb.gossip.peers(cb) ),
          pull.flatten(),
          pull.map( kv => { return {peer:kv} } )
        ),
        ssb.gossip.changes()
      ]),
      pull.drain( kv => {
        peers.put(kv.peer.key, kv.peer)
      }, err => {
        console.error('Peers.changes ended:', err)
        sbotConnect.set(false)
      })
    )
  }

  function AutoUpdate() {
    let currentCodeBlobUrl = document.location.href.replace(document.location.hash, '')
    if (/#$/.test(currentCodeBlobUrl)) currentCodeBlobUrl = currentCodeBlobUrl.slice(0, -1)
    console.log('currentCodeBlobUrl', currentCodeBlobUrl)
    let author, sequence
    let updateUrl = null
    return function(kv) {
      if (kv.sync) {
        if (updateUrl) {
          let hash = document.location.hash
          console.error('*** Auto update!')
          document.location.href = updateUrl + hash
        }
        return
      }
      if (kv.value.content && kv.value.content.type === 'client-update') {
        let newCodeBlobUrl = `${config.blobsRoot}/${kv.value.content.code}`
        //console.log('newCodeBlobUrl', newCodeBlobUrl)
        if (currentCodeBlobUrl === newCodeBlobUrl) {
          console.log('Found currently running client code message', kv.key)
          author = kv.value.author
          sequence = kv.value.sequence
          version.set(`${sequence} (${kv.key.substr(1,6)})`)
        } else if (author && sequence) {
          if (kv.value.author === author && kv.value.sequence > sequence) {
            console.error(`Found newer client version! old seq: ${sequence}, new seq: ${kv.value.sequence}`)
            updateUrl = newCodeBlobUrl
          }
        }
      }
    }
  }

  watchPeers()
  watchDrafts()
  watchMessages(root)

  let ret = html()
  ret.ready = ready 
  return ret
}


module.exports.css = ()=>  `
  .menubar .status {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    height: 32px;
    font-size: 12px;
    padding-left: 1em;
  }
  .menubar .status>span {
    width: 100px;
    padding-right: 5px;
  }
  .statusView {
    overflow: scroll;
    height: calc(100vh - 32px); 
    color: #222;
    background: #eee;
    padding-left: 2em;
    width: 100%;
  }
  .middle .status>span>span {
    margin: .12em;
  }
  th {
    text-align: left;
  }
`

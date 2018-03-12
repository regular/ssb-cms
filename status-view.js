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
const tee = require('pull-tee')
const prettyBytes = require('pretty-bytes')
const Updates = require('./update-stream')
const config = require('./cms-config')
const {isDraft} = require('./util')
const Blobs = require('./blobs')

let updateAvailable = Value(false)

module.exports = function(ssb, drafts, root, view, trusted_keys) {
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

  //let ready = computed([isSynced, blobRefs, blobsPresent], (s, r, p) => s && r === p)

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

  let untrustedObs = MutantDict()
  view.appendChild(
    h('section.untrusted', [
      h('h2', 'Revisions that need to be signed off'),
      h('table', computed([untrustedObs], msgs  => {
        return Object.keys(msgs).map( k => {
          let kv = msgs[k]
          let content = kv.value && kv.value.content 
          return h('tr', [
            h('td', h('a', {href: `#${k}`}, (content && `${content.type || 'no type'} ${content.name || 'no name'}`) || 'no name')),
            h('td', `${kv.value.author}`)
          ])
        })
      }))
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
      h('span', {
        style: {
          display: computed( [updateAvailable], ua => ua ? 'inline' : 'none' )
        }
      }, [
        h('span', 'Update available!')
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
        /*
        h('span', { style: {
          color: computed([ready], r => r ? 'green' : 'red')
        } },
        computed([ready], r => r ? '✓' : '⌛ '))
        */
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

  function Untrusted() {
    let untrustedMessages = {}
    let sync = false
    return pull.through( kv => {
      if (kv.sync) {
        untrustedObs.set(untrustedMessages)
        sync = true
        return
      }
      let key = kv.key
      if (!trusted_keys || trusted_keys.includes(kv.value.author)) {
        delete untrustedMessages[key]
      } else {
        untrustedMessages[key] = kv
      }
      if (sync) {
        untrustedObs.set(untrustedMessages)
      }
    })
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
      tee(
        pull(
          Updates(trusted_keys)({sync: true, allowUntrusted: true, bufferUntilSync: true}),
          Untrusted(),
          pull.drain()
        )
      ),
      Updates(trusted_keys)({sync: true, bufferUntilSync: true}),
      pull.through( AutoUpdate() ),
      Blobs(ssb, blobs, blobBytes, blobRefs, blobsPresent),
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
    let synced = false
    return function(kv) {
      if (kv.sync) {
        synced = true
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
          console.warn('Found currently running client code message', kv.key)
          author = kv.value.author
          sequence = kv.value.sequence
          version.set(`${sequence} (${kv.key.substr(1,6)})`)
        } else if (author && sequence) {
          if (kv.value.author === author && kv.value.sequence > sequence) {
            console.error(`Found newer client version! old seq: ${sequence}, new seq: ${kv.value.sequence}`)
            updateUrl = newCodeBlobUrl
            if (synced) {
              updateAvailable.set(true)
            }
          }
        }
      }
    }
  }

  // inside frames, we dont do anything
  if (window.frameElement) {
    return h('div')
  }

  // if we are a kisok system, we only do auto updates
  // and blobs
  if (config.sbot.cms.kiosk) {
    const needToCheckBlobs = sessionStorage.getItem('enumerateBlobs') !== 'false'
    sessionStorage.removeItem('enumerateBlobs')

    // and on silent restarts, we dont even do blobs
    if (!needToCheckBlobs) {
      const event = new CustomEvent('blobs-progress', { detail: 1.0 }); 
      document.body.dispatchEvent(event)

      pull(
        ssb.messagesByType({
          live: true,
          sync: true,
          type: 'client-update',
          keys: true,
          values: true
        }),
        pull.through( AutoUpdate() ),
        pull.drain()
      )
    } else {
      pull(
        ssb.links({
          live: true,
          sync: true,
          rel: 'root',
          dest: root,
          keys: true,
          values: true
        }),
        pull.through( AutoUpdate() ),
        Updates()({sync: true, bufferUntilSync: true}),
        Blobs(ssb, blobs, blobBytes, blobRefs, blobsPresent),
        pull.drain()
      )
    }
  } else {
    watchPeers()
    watchDrafts()
    watchMessages(root)
  }

  let ret = html()
  //ret.ready = ready 
  return ret
}

module.exports.updateAvailable = updateAvailable

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

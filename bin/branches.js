const path = require('path')
const ssbClient = require('ssb-client')
const createConfig = require('ssb-config/inject')
const ssbKeys = require('ssb-keys')
const config = createConfig(process.env.ssb_appname)
const keys = ssbKeys.loadOrCreateSync(path.join(config.path, 'secret'))

const pull = require('pull-stream')

const DB = require('../db')
const updateStream = require('../update-stream')

const root =   '%HBQXn4hHFwQxy1ULBr6qLALOBPBP/P5Ue4mWSspblz0=.sha256'
const branch = '%zVhzFaCdmZQ7xoxNsP1qsZE1LozW45sTs75IbpjI3BE=.sha256' // node "Tests"
const revRoot ='%vGU6kCCj4BZSDYBYIIXO0N7jxc/q09Rk7XDD6ZOkyLc=.sha256' // node "Video 1080p"

const drafts = {
  byBranch: () => pull.empty()
}

ssbClient(keys, config, (err, ssb)=>{
  if (err) return console.error(err)

  let db = DB(ssb, drafts, root)
  pull(
    db.branches(branch),
    pull.filter( kv => kv.value.content.revisionRoot === revRoot ),
    pull.through( kv=> console.error('in', kv.key) ),
    updateStream(),
    pull.through( kv => console.error('out', kv.revision)),
    //pull.filter( kv => kv.key === revRoot ),
    pull.log()
  )
})

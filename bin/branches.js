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
const branch = '%rqxYX52iQzBMY5uIcHbodxtdttsriLzsrouDg8gqnik=.sha256' // station Sacred Manuscripts
const revRoot ='%l35F3ggMCwx5Tv68f0L75ssPnCfUHw7tFeYFIAFWdWk=.sha256' // screen main-menu

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
    pull.filter( kv => kv.key === revRoot ),
    pull.log()
  )
})

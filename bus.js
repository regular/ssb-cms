let bus
module.exports = bus = require('page-bus')('ssb-cms')
module.exports.sendToParentFrame = (eventName, data) => {
  if (window.frameElement) {
    const payload = Object.assign({}, data, {
      screenId: +window.frameElement.id
    })
    console.log(`sendToParentFrame: ${eventName}, ${JSON.stringify(payload)}`)
    bus.emit(eventName, payload)
    bus.emit('dummy', {})
  }
}

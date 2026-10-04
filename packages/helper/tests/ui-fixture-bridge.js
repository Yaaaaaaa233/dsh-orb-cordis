const listeners = new Map()
window.fixture = {
  stops: 0,
  calls: [],
  emit(name, value) { listeners.get(name)?.(value) },
}
window.dshOrb = new Proxy({}, {
  get(_target, name) {
    if (name.startsWith('on')) return (callback) => {
      listeners.set(name, callback)
      if (name === 'onAppearance') queueMicrotask(() => callback({ locale: 'zh' }))
      if (name === 'onPermission') queueMicrotask(() => callback('workspace-write'))
    }
    if (name === 'setExpanded') return async (expanded) => {
      window.fixture.calls.push(expanded)
      const side = parent.document.querySelector('#direction').value
      const frame = window.frameElement
      frame.style.width = `${expanded ? 344 : 96}px`
      frame.style.height = `${expanded ? 444 : 96}px`
      return { expanded, horizontal: parent.document.querySelector('#horizontal').value, vertical: side }
    }
    if (name === 'tccStatus') return async () => ({ screen: 'granted', accessibility: 'granted' })
    if (name === 'stop') return () => { window.fixture.stops++ }
    if (name === 'send') return () => window.fixture.emit('onTurn', { running: true })
    if (name === 'setPermission') return (value) => window.fixture.emit('onPermission', value)
    return async () => ({})
  },
})

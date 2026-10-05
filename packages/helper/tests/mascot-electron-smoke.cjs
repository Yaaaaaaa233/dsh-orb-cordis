// Run with the cached Electron executable. Own userData, DSH_HOME and mock
// socket isolate this real helper window from the user's desktop sessions.
const { app, BrowserWindow, screen } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')
const { pathToFileURL } = require('node:url')
const assert = require('node:assert/strict')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let win, socket, server, scratch, deadline
const results = [], errors = []
let expectFallback = false
const output = process.env.DSH_ORB_TEST_OUTPUT || path.join(os.tmpdir(), 'dsh-orb-mascot-smoke')
const check = (name, ok, detail) => { assert.ok(ok, name); results.push({ name, detail }); console.log('PASS '+name) }
async function until(fn, timeout = 5000) {
  const end = Date.now() + timeout
  while (Date.now() < end) { const value = await fn(); if (value) return value; await pause(40) }
  throw Error('Smoke wait timed out')
}
const js = code => win.webContents.executeJavaScript(code)
const send = message => socket.write(JSON.stringify(message)+'\n')
const info = () => js(`(()=>{const c=document.querySelector('#ball-mascot'),b=document.querySelector('#ball');return {state:c.dataset.mascotState,frames:Number(c.dataset.frames),renderer:c.dataset.renderer,gaze:(c.dataset.gaze||'0,0').split(',').map(Number),hidden:c.hidden,gifHidden:document.querySelector('#ball-gif').hidden,expanded:document.body.classList.contains('expanded'),docked:document.body.classList.contains('docked'),rect:b.getBoundingClientRect().toJSON()}})()`)
// The helper samples the pointer; DSH_ORB_TEST_CURSOR pins it so the isolated
// window can drive the eyes without moving the real cursor.
async function pointAt(dx, dy) {
  const bounds = win.getBounds(), r = (await info()).rect
  process.env.DSH_ORB_TEST_CURSOR = `${Math.round(bounds.x + r.x + r.width / 2 + dx)},${Math.round(bounds.y + r.y + r.height / 2 + dy)}`
}
function clearPointer() { delete process.env.DSH_ORB_TEST_CURSOR }
async function capture(name, ballOnly = true) {
  const i = await info(), r = i.rect
  const image = await win.webContents.capturePage(ballOnly ? { x: Math.round(r.x), y: Math.round(r.y), width: 72, height: 72 } : undefined)
  await fs.writeFile(path.join(output, name+'.png'), image.toPNG())
}
async function finish(error) {
  if (deadline) clearTimeout(deadline)
  if (error) console.error(error.stack)
  await fs.writeFile(path.join(output, 'native-result.json'), JSON.stringify({ passed: results, errors, error: error?.message, success: !error }, null, 2))
  socket?.destroy(); server?.close()
  // Only files created by this fixture are removed.
  if (scratch) await fs.rm(scratch, { recursive: true, force: true })
  app.exit(error ? 1 : 0)
}
async function dragTo(x, y) {
  const i = await info(), r = i.rect
  win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(r.x+36), y: Math.round(r.y+36), button: 'left', clickCount: 1 })
  await pause(30)
  const props = JSON.stringify({ pointerId: 1, button: 0, buttons: 1, screenX: x+36, screenY: y+36, clientX: r.x+36, clientY: r.y+36, bubbles: true })
  await js(`document.querySelector('#ball').dispatchEvent(new PointerEvent('pointermove',${props}))`)
  await pause(100)
  await js(`document.querySelector('#ball').dispatchEvent(new PointerEvent('pointerup',{...${props},buttons:0}))`)
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 48, y: 48, button: 'left', clickCount: 1 })
  await pause(350)
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-orb-mascot-native-'))
  app.setPath('userData', scratch)
  process.env.DSH_HOME = scratch
  process.env.DSH_ORB_TOKEN = 'isolated-mascot-test'
  server = net.createServer(peer => {
    socket = peer; peer.setEncoding('utf8'); let buffer = ''
    peer.on('data', chunk => {
      buffer += chunk; const lines = buffer.split('\n'); buffer = lines.pop()
      for (const line of lines) if (line) {
        const m = JSON.parse(line)
        if (m.type === 'tcc') send({ type: 'tcc', status: { applicable: false, screen: 'granted', accessibility: 'granted' } })
        if (m.type === 'prompt' || m.type === 'stop') errors.push('Unexpected model/control request: '+m.type)
      }
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  process.env.DSH_ORB_SOCKET = '127.0.0.1:'+server.address().port
  deadline = setTimeout(() => finish(Error('Native smoke deadline exceeded')), 45_000)
  await import(pathToFileURL(path.resolve(__dirname, '../lib/main.js')).href)
  win = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/floating.html')))
  await until(() => socket && !win.webContents.isLoading())
  win.webContents.on('console-message', d => { if (d.message.includes('ORB_DIAGNOSTIC') && /"event":"(?:error|rejection|mascot-fallback)"/.test(d.message) && !(expectFallback && d.message.includes('mascot-fallback'))) errors.push(d.message) })
  const display = screen.getPrimaryDisplay(), bounds = display.bounds, area = display.workArea
  await js(`window.dshOrb.move(${area.x+120},${area.y+160},false)`)
  await js(`(()=>{
    const clock=performance.now.bind(performance),raf=requestAnimationFrame;let offset=0;
    Object.defineProperty(performance,'now',{value:()=>clock()+offset});
    window.requestAnimationFrame=callback=>raf(t=>callback(t+offset));
    window.advanceMascotClock=ms=>{offset+=ms};
    const context=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){const result=context.call(this,type,...args);if(type==='webgl')window.testMascotGL=result;return result};
  })()`)
  send({ type: 'appearance', locale: 'zh', theme: 'dark' })
  send({ type: 'avatar', kind: 'skin', id: 'mascot-v10', version: 1 })
  await until(async () => (await info()).frames >= 8)
  let i = await info()
  check('Bundled skin renders under production CSP', i.renderer === 'webgl' && i.gifHidden && !i.hidden)
  check('Avatar keeps the 72px button hit area', i.rect.width === 72 && i.rect.height === 72)
  await capture('native-idle')
  const first = i.frames, started = Date.now(); await pause(1000); i = await info()
  check('Collapsed idle stays animated', i.frames-first >= 15, { fps: (i.frames-first)*1000/(Date.now()-started) })

  await pointAt(600, 0); await pause(500)
  let gaze = (await info()).gaze
  check('Pointer to the right looks right', gaze[0] > 8 && Math.abs(gaze[1]) < 5, { gaze })
  await pointAt(0, -600); await pause(500)
  gaze = (await info()).gaze
  check('Pointer above looks up', gaze[1] < -6, { gaze })
  await pointAt(-600, 600); await pause(600)
  gaze = (await info()).gaze
  check('Pointer down-left looks down-left', gaze[0] < -6 && gaze[1] > 4, { gaze })
  await capture('native-gaze-left')
  await pointAt(0, 0); await pause(600)
  gaze = (await info()).gaze
  check('Pointer on the ball parks the eyes', Math.abs(gaze[0]) < 5 && Math.abs(gaze[1]) < 1, { gaze })

  await js(`window.advanceMascotClock(300_100)`); await pause(80)
  check('Five-minute idle starts closing the eyes', (await info()).state === 'falling-asleep')
  await pause(2200)
  check('Sleep becomes a continuous animation', (await info()).state === 'sleeping')
  await pointAt(600, 0); await pause(300)
  gaze = (await info()).gaze
  check('Sleeping eyes ignore the pointer', Math.abs(gaze[0]) < 5, { gaze })
  await capture('native-sleep')
  await js(`document.querySelector('#ball').dispatchEvent(new PointerEvent('pointerenter'))`)
  await pause(80); check('Hover wakes the sleeping character', (await info()).state === 'waking')
  await pause(750); check('Hover returns to awake idle', (await info()).state === 'idle')
  await pause(400)
  gaze = (await info()).gaze
  check('Waking picks the pointer back up', gaze[0] > 8, { gaze })
  await pointAt(0, 0); await pause(500); clearPointer()
  await js(`document.querySelector('#ball').dispatchEvent(new PointerEvent('pointerleave'))`)

  send({ type: 'turn', running: true }); await pause(900)
  check('Production task event enters thinking', (await info()).state === 'thinking')
  await capture('native-thinking')
  await js(`window.advanceMascotClock(600_000)`); await pause(100)
  check('Running tasks suppress idle sleep', (await info()).state === 'thinking')
  send({ type: 'turn', running: false, interrupted: true }); await pause(80)
  check('Task stop enters recovery', (await info()).state === 'recovering')
  await pause(1700); check('Task stop settles back to idle', (await info()).state === 'idle')

  await js(`document.body.dispatchEvent(new PointerEvent('pointerenter'))`); await pause(400)
  i = await info()
  check('Panel expands without replacing or stretching the avatar', i.expanded && i.rect.width === 72 && i.rect.height === 72)
  await capture('native-expanded', false)
  await js(`document.body.dispatchEvent(new PointerEvent('pointerleave'))`); await pause(600)
  check('Panel collapses and animation continues', !(await info()).expanded)
  const beforeMove = win.getBounds()
  await dragTo(area.x+220, area.y+250)
  const moved = win.getBounds()
  check('Production pointer drag moves the native window', Math.abs(moved.x-beforeMove.x) > 20 || Math.abs(moved.y-beforeMove.y) > 20, { beforeMove, moved })
  check('Drag leaves avatar geometry intact', (await info()).rect.width === 72)
  await js(`document.body.dispatchEvent(new PointerEvent('pointerleave'));document.querySelector('#ball').dispatchEvent(new PointerEvent('pointerleave'))`)
  await pause(600)
  await dragTo(bounds.x-16, area.y+250)
  i = await info(); check('Release at the left screen edge docks', i.docked)
  const stopped = i.frames; await pause(300)
  check('Hidden docked skin suspends rendering', (await info()).frames === stopped)
  await pause(250)
  await js(`document.body.dispatchEvent(new PointerEvent('pointerenter'))`); await pause(450)
  check('Dock hover restores the visible skin', !(await info()).docked)
  const resumed = (await info()).frames; await pause(180)
  check('Undocked skin resumes animation', (await info()).frames > resumed)
  await js(`document.body.dispatchEvent(new PointerEvent('pointerleave'))`); await pause(600)
  await dragTo(bounds.x+bounds.width-56, area.y+250)
  check('Release at the right screen edge docks', (await info()).docked)
  await pause(600); await js(`document.body.dispatchEvent(new PointerEvent('pointerenter'))`); await pause(450)
  check('Right dock restores without losing the skin', !(await info()).docked && (await info()).renderer === 'webgl')

  send({ type: 'avatar', kind: 'preset', src: 'avatars/heart.gif', version: 2 }); await pause(100)
  i = await info(); check('Switching to a GIF hides the animated skin', i.hidden && !i.gifHidden)
  const disabled = i.frames; await pause(150); check('Deselected skin releases its animation loop', (await info()).frames === disabled)
  send({ type: 'avatar', kind: 'skin', id: 'mascot-v10', version: 3 }); await pause(150)
  check('Switching back reuses the animated skin', !(await info()).hidden)
  check('No renderer errors or model/control calls', errors.length === 0, errors)
  expectFallback = true
  await js(`window.testMascotGL.getExtension('WEBGL_lose_context').loseContext()`)
  await until(async () => (await info()).renderer === 'fallback')
  i = await info(); check('Graphics failure falls back to the static avatar', i.hidden && !i.gifHidden)
  send({ type: 'avatar', kind: 'preset', src: 'avatars/heart.gif', version: 4 }); await pause(100)
  send({ type: 'avatar', kind: 'skin', id: 'mascot-v10', version: 5 })
  await until(async () => (await info()).renderer === 'webgl' && !(await info()).hidden)
  expectFallback = false
  check('Reselecting the skin recovers from graphics failure', (await info()).renderer === 'webgl')
  await finish()
}
main().catch(finish)

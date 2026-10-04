import { MascotState } from './mascot-state.js'
import { TAU, SYMBOL_PERIOD, SYMBOL_FADE, mod, smooth, statusSway } from './mascot-motion.js'

// Extended lower/left artwork covers the circular crop throughout the sway.
// Original head, eyes and hair-root coordinates remain fixed.
const N = 1254, BODY_LEFT = 256, BODY_WIDTH = N + BODY_LEFT, BODY_HEIGHT = 1567, PAD = 100, TEX = BODY_WIDTH + PAD * 2, TEX_HEIGHT = BODY_HEIGHT + PAD * 2
const fragment = `precision highp float;
uniform sampler2D source; uniform vec2 size; uniform float time;
float sm(float a,float b,float x){float q=clamp((x-a)/(b-a),0.,1.);return q*q*(3.-2.*q);}
void main(){
 vec2 p=vec2(gl_FragCoord.x/size.x*480.,(1.-gl_FragCoord.y/size.y)*480.);
 float x=(p.x-39.)/.32,y=(p.y-48.)/.32,phase=time/8.*6.28318530718;
 float breath=sin(phase*2.),sway=sin(phase);
 float ba=.15*.01745329252*sway,ha=(1.1*sway+.25*sin(phase*2.+.4))*.01745329252;
 float head=1.-sm(1000.,1150.,y);
 float dx=-ba*(y-1240.)+head*(4.5*sway-ha*(y-1060.)+.008*sin(phase-.2)*(x-575.));
 float dy=ba*(x-600.)-(1240.-y)*.0048*breath+head*(ha*(x-600.)+2.5*sin(phase*2.+.5));
 float left=(1.-sm(150.,320.,x))*sm(390.,1070.,y),right=sm(835.,1040.,x)*sm(590.,1190.,y);
 float bangs=1.5*exp(-pow((x-557.)/175.,2.)-pow((y-640.)/240.,2.))*sm(300.,600.,y)+.75*exp(-pow((x-264.)/145.,2.)-pow((y-530.)/185.,2.))*sm(210.,495.,y);
 dx+=left*20.*sin(phase-.43)+right*26.*sin(phase-.6)+bangs*18.*sin(phase-.52);
 dy+=left*5.*sin(phase*2.-.5)+right*4.*sin(phase*2.-.8)+bangs*3.2*sin(phase*2.-.65);
 vec2 uv=vec2(x-dx+356.,y-dy+100.)/vec2(1710.,1767.);
 gl_FragColor=(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)?vec4(0.):texture2D(source,uv);
}`

function shader(gl, type, source) {
  const s = gl.createShader(type)
  gl.shaderSource(s, source); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error('Mascot shader compilation failed')
  return s
}

function createWarp(size) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  if (!gl) throw Error('Mascot WebGL unavailable')
  const program = gl.createProgram()
  gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, 'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}'))
  gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Mascot shader linking failed')
  gl.useProgram(program)
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const attr = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0)
  const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.uniform1i(gl.getUniformLocation(program, 'source'), 0)
  gl.uniform2f(gl.getUniformLocation(program, 'size'), size, size)
  const clock = gl.getUniformLocation(program, 'time')
  canvas.addEventListener('webglcontextlost', event => event.preventDefault())
  return {
    canvas,
    draw(source, time) {
      if (gl.isContextLost()) throw Error('Mascot WebGL context lost')
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      gl.uniform1f(clock, mod(time, 8)); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() { gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.getExtension('WEBGL_lose_context')?.loseContext() },
  }
}

function loadImage(name) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(Error('Mascot asset could not load'))
    image.src = new URL(`skins/mascot-v10/${name}.png`, import.meta.url).href
  })
}

function drawEye(ctx, cx, cy, p) {
  const q = smooth(0, 1, 1 - p.open), rx = 54 + 22 * q, ry = 89 * 4 / 3 * (1 - q)
  ctx.save(); ctx.translate(cx + p.gazeX * p.open, cy + p.gazeY * p.open); ctx.rotate(20 * Math.PI / 180)
  const gradient = ctx.createLinearGradient(0, -ry, rx * .15, ry + 20 * q)
  gradient.addColorStop(0, '#1d306c'); gradient.addColorStop(1, '#315cbb')
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(-rx, 0)
  ctx.bezierCurveTo(-rx, -ry, rx, -ry, rx, 0); ctx.bezierCurveTo(rx, ry + 20 * q, -rx, ry + 20 * q, -rx, 0)
  ctx.closePath(); ctx.fill(); ctx.restore()
}

function drawSymbols(ctx, images, p) {
  const sway = statusSway(p.t)
  ctx.save(); ctx.translate(373 + sway.x, 144 + sway.y); ctx.rotate(sway.rotation); ctx.translate(-373, -144)
  if (p.sleep > 0) {
    const cycle = mod(p.symbolTime, SYMBOL_PERIOD), fade = 1 - smooth(3, 3 + SYMBOL_FADE, cycle)
    if (cycle < 3 + SYMBOL_FADE) for (const [i, x, y] of [[0, 335, 169], [1, 357, 155], [2, 378, 145]]) {
      const appear = smooth(i * .33, i * .33 + .28, cycle)
      ctx.save(); ctx.globalAlpha = p.sleep * appear * fade
      ctx.translate(x, y + 4 * (1 - appear)); ctx.scale(.9 + .1 * appear, .9 + .1 * appear)
      ctx.drawImage(images[i + 2], -5, -85, 80, 105); ctx.restore()
    }
  }
  if (p.thinking > 0) {
    const head = Math.floor(mod(p.t, 1) * 12)
    ctx.save(); ctx.translate(373, 144); ctx.scale(1.68 * (.72 + .28 * p.thinking), 1.68 * (.72 + .28 * p.thinking))
    ctx.fillStyle = '#d8e4ff'
    for (let i = 0; i < 12; i++) {
      ctx.save(); ctx.rotate(i * TAU / 12)
      ctx.globalAlpha = p.thinking * (.16 + .84 * (1 - mod(head - i, 12) / 12) ** 2)
      ctx.beginPath(); ctx.roundRect(-3, -29, 6, 12, 3); ctx.fill(); ctx.restore()
    }
    ctx.restore()
  }
  ctx.restore()
}

/** Assets and GL resources are allocated once; hidden/docked avatars suspend RAF. */
export async function createMascotRenderer(canvas, { onError = () => {} } = {}) {
  const images = await Promise.all(['body', 'ahoge', 'z-small', 'z-middle', 'z-large'].map(loadImage))
  const size = Math.round(72 * Math.min(3, Math.max(1, window.devicePixelRatio || 1)))
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d'), warp = createWarp(size)
  if (!ctx) throw Error('Mascot canvas unavailable')
  const source = document.createElement('canvas'); source.width = 640; source.height = Math.round(640 * TEX_HEIGHT / TEX)
  const src = source.getContext('2d')
  const state = new MascotState()
  let enabled = false, visible = true, frame, last = -Infinity, frames = 0, failed = false, disposed = false
  function draw(now) {
    const p = state.pose(now), ratio = source.width / TEX, ratioY = source.height / TEX_HEIGHT
    src.setTransform(1, 0, 0, 1, 0, 0); src.clearRect(0, 0, source.width, source.height)
    src.setTransform(ratio, 0, 0, ratioY, (BODY_LEFT + PAD) * ratio, PAD * ratioY)
    src.drawImage(images[0], -BODY_LEFT, 0, BODY_WIDTH, BODY_HEIGHT); drawEye(src, 354, 753, p); drawEye(src, 733, 880, p)
    src.save(); src.translate(579, 273); src.rotate(p.angle * Math.PI / 180); src.scale(.3737, .3737)
    src.transform(1, 0, Math.tan(p.ahogeBend * Math.PI / 180), 1, 0, 0); src.translate(-464, -948)
    src.drawImage(images[1], 0, 0, N, N); src.restore()
    warp.draw(source, p.t)
    ctx.setTransform(size / 480, 0, 0, size / 480, 0, 0)
    ctx.fillStyle = '#141b2a'; ctx.fillRect(0, 0, 480, 480)
    drawSymbols(ctx, images, p); ctx.drawImage(warp.canvas, 0, 0, 480, 480)
    canvas.dataset.mascotState = p.state; canvas.dataset.frames = String(++frames)
    canvas.dataset.renderer = 'webgl'
  }
  function tick(now) {
    frame = undefined
    if (!enabled || !visible || document.hidden || failed || disposed) return
    try { if (now - last >= 1000 / 30 - 1) { draw(now); last = now } }
    catch (error) { failed = true; onError(error); return }
    frame = requestAnimationFrame(tick)
  }
  function resume() {
    const play = enabled && visible && !document.hidden && !failed && !disposed
    if (!play) {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
    } else if (frame === undefined) frame = requestAnimationFrame(tick)
  }
  document.addEventListener('visibilitychange', resume)
  return {
    update(activity) { state.update(activity); visible = activity.visible !== false; resume() },
    interact(pulse = false) { state.interact(undefined, pulse) },
    setEnabled(next) { if (next && !enabled) state.interact(); enabled = next; resume() },
    dispose() { disposed = true; resume(); document.removeEventListener('visibilitychange', resume); warp.dispose() },
  }
}

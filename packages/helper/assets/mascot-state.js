import { TAU, CYCLE, blink, idleAhoge, thinkingWiggle, rebound, smooth, ease5 } from './mascot-motion.js'

export const SLEEP_AFTER_MS = 5 * 60 * 1000
const blendAt = (b, now) => b.from + (b.to - b.from) * ease5(b.start, b.start + b.duration, now)

/** An independent monotonic clock keeps the body moving across UI changes. */
export class MascotState {
  constructor({ now = () => performance.now(), sleepAfterMs = SLEEP_AFTER_MS } = {}) {
    this.now = now
    this.sleepAfterMs = sleepAfterMs
    this.born = now()
    this.lastInteraction = this.born
    this.running = this.asking = this.hovered = this.dragging = false
    this.sleep = { from: 0, to: 0, start: this.born, duration: 1 }
    this.thinking = { from: 0, to: 0, start: this.born, duration: 1 }
    this.thought = () => 0
    this.bend = { from: 0, start: this.born - 550 }
    this.hoverStart = -Infinity
    this.sleepStart = this.born
  }

  interact(now = this.now(), pulse = false) {
    const sleeping = blendAt(this.sleep, now)
    this.lastInteraction = now
    if (pulse && !(this.running && !this.asking)) this.hoverStart = now + (sleeping > .5 ? 450 : 0)
    this.setSleep(false, now)
  }

  update(activity, now = this.now()) {
    const busy = this.running && !this.asking
    const wasHovered = this.hovered, wasDragging = this.dragging, wasAsking = this.asking
    for (const key of ['running', 'asking', 'hovered', 'dragging']) {
      if (key in activity) this[key] = activity[key] === true
    }
    if (this.hovered !== wasHovered || this.dragging !== wasDragging || this.asking !== wasAsking) {
      this.interact(now, this.hovered && !wasHovered)
    }
    const nextBusy = this.running && !this.asking
    if (nextBusy !== busy) {
      this.bend = { from: this.bendValue(now), start: now }
      const prior = this.thought, x = prior(now), h = .1
      const velocity = (prior(now + h) - prior(now - h)) / (2 * h) * 1000
      const started = now
      this.thinking = { from: blendAt(this.thinking, now), to: nextBusy ? 1 : 0, start: now, duration: 550 }
      if (nextBusy) {
        this.thought = time => {
          const u = (time - started) / 1000, gain = ease5(0, .55, u)
          return rebound(x, velocity, Math.max(0, u)) * (1 - gain) + thinkingWiggle(Math.max(0, u)) * gain
        }
      } else {
        this.thought = time => time < started ? prior(time) : rebound(x, velocity, (time - started) / 1000)
      }
      this.interact(now)
    }
    this.evaluateSleep(now)
  }

  setSleep(asleep, now) {
    const target = asleep ? 1 : 0
    if (this.sleep.to === target) return
    this.sleep = { from: blendAt(this.sleep, now), to: target, start: now, duration: asleep ? 1000 : 650 }
    if (asleep) this.sleepStart = now
  }

  evaluateSleep(now) {
    const asleep = !this.running && !this.asking && !this.hovered && !this.dragging && now - this.lastInteraction >= this.sleepAfterMs
    this.setSleep(asleep, now)
  }

  bendValue(now) {
    const current = 6 * Math.tanh(.22 * (this.thought(now) - this.thought(now - 70)) / 6)
    const gain = ease5(this.bend.start, this.bend.start + 550, now)
    return this.bend.from * (1 - gain) + current * gain
  }

  pose(now = this.now()) {
    this.evaluateSleep(now)
    const t = (now - this.born) / 1000, sleep = blendAt(this.sleep, now), thinking = blendAt(this.thinking, now)
    const angle = this.thought(now), q = (now - this.hoverStart) / 1000
    const hover = Number.isFinite(q) && q >= 0 ? 27 * Math.exp(-2.1 * q) * Math.sin(11 * q) : 0
    const state = this.running && !this.asking ? 'thinking'
      : this.asking ? 'awaiting-answer'
      : this.sleep.to === 1 ? sleep < .999 ? 'falling-asleep' : 'sleeping'
      : sleep > .001 ? 'waking' : thinking > .001 || Math.abs(angle) > .01 ? 'recovering' : 'idle'
    return {
      t, state, sleep, thinking,
      open: (1 - sleep) * blink(t),
      angle: idleAhoge(t) + angle + hover * (1 - thinking) * (1 - sleep),
      ahogeBend: this.bendValue(now),
      gazeX: 4 * Math.sin(t / CYCLE * TAU), gazeY: 0,
      symbolTime: (now - this.sleepStart) / 1000 - .8,
    }
  }
}

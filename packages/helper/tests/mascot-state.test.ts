import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MascotState, SLEEP_AFTER_MS } from '../assets/mascot-state.js'
import { CYCLE, TAU } from '../assets/mascot-motion.js'
import { GAZE_TEX_X, GAZE_TEX_Y } from '../assets/mascot-gaze.js'

function fixture() {
  let time = 0
  const state = new MascotState({ now: () => time })
  return { state, advance(ms: number) { time += ms; return state.pose() } }
}

/** The idle drift is always present, so tests isolate the pointer term. */
function tracking(pose: { t: number; gazeX: number; gazeY: number }) {
  return {
    x: pose.gazeX - 4 * Math.sin(pose.t / CYCLE * TAU),
    y: pose.gazeY,
  }
}

/** Both followers as a 0..1 fraction of their target, so the lags compare. */
function followers(pose: { t: number; gazeX: number; gazeY: number; lookX: number; lookY: number }) {
  return { eyes: tracking(pose).x / GAZE_TEX_X, head: pose.lookX }
}

describe('animated mascot state', () => {
  it('waits five minutes, closes gradually, and retains its body clock', () => {
    const f = fixture()
    assert.equal(SLEEP_AFTER_MS, 300_000)
    assert.equal(f.advance(299_999).state, 'idle')
    assert.equal(Number.isFinite(f.state.pose().angle), true)
    const falling = f.advance(1)
    assert.equal(falling.state, 'falling-asleep')
    assert.equal(falling.sleep, 0)
    const midway = f.advance(500)
    assert.ok(midway.open > 0 && midway.open < 1)
    const sleeping = f.advance(500)
    assert.equal(sleeping.state, 'sleeping')
    assert.equal(sleeping.open, 0)
    assert.equal(sleeping.t, 301)
  })

  it('stays awake while hovered or dragged, then starts a fresh idle timeout', () => {
    for (const flag of ['hovered', 'dragging']) {
      const f = fixture()
      f.state.update({ [flag]: true })
      assert.equal(f.advance(600_000).sleep, 0)
      f.state.update({ [flag]: false })
      assert.equal(f.advance(299_999).sleep, 0)
      assert.equal(f.advance(1).state, 'falling-asleep')
    }
  })

  it('wakes on hover and lets the hair interaction play after opening its eyes', () => {
    const f = fixture()
    f.advance(300_000); f.advance(1500)
    f.state.update({ hovered: true })
    assert.equal(f.state.pose().state, 'waking')
    assert.equal(f.state.pose().open, 0)
    assert.ok(f.advance(350).open > 0)
    assert.equal(f.advance(350).state, 'idle')
    assert.equal(f.state.pose().sleep, 0)
  })

  it('task events wake the character, suppress sleep, and finish with a continuous rebound', () => {
    const f = fixture()
    f.advance(300_000); f.advance(1500)
    f.state.update({ running: true })
    const ready = f.advance(800)
    assert.equal(ready.state, 'thinking')
    assert.equal(ready.open > .9, true)
    assert.equal(ready.thinking, 1)
    assert.equal(f.advance(600_000).sleep, 0)
    const before = f.state.pose()
    f.state.update({ running: false })
    const after = f.state.pose()
    assert.ok(Math.abs(before.angle - after.angle) < .0001)
    assert.ok(Math.abs(before.ahogeBend - after.ahogeBend) < .0001)
    assert.equal(f.advance(1700).state, 'idle')
    assert.equal(f.state.pose().sleep, 0)
  })

  it('waiting for an answer stays awake and resumes thinking when answered', () => {
    const f = fixture()
    f.state.update({ running: true }); f.advance(750)
    f.state.update({ asking: true })
    assert.equal(f.advance(600_000).state, 'awaiting-answer')
    assert.equal(f.state.pose().sleep, 0)
    assert.equal(f.state.pose().thinking, 0)
    f.state.update({ asking: false })
    assert.equal(f.advance(750).state, 'thinking')
  })

  it('handles a rapid stop/start without jumping to a different hair pose', () => {
    const f = fixture()
    f.state.update({ running: true }); f.advance(830)
    f.state.update({ running: false }); f.advance(140)
    const before = f.state.pose()
    f.state.update({ running: true })
    assert.ok(Math.abs(f.state.pose().angle - before.angle) < .0001)
    assert.ok(Math.abs(f.state.pose().ahogeBend - before.ahogeBend) < .0001)
    assert.equal(f.advance(800).thinking, 1)
  })

  it('glides the eyes toward the pointer without overshooting the budget', () => {
    const f = fixture()
    f.state.setGaze({ x: 1, y: 0 })
    let previous = tracking(f.state.pose()).x
    assert.equal(previous, 0)
    for (let step = 0; step < 60; step += 1) {
      const current = tracking(f.advance(16)).x
      assert.ok(current >= previous - 1e-9, `tracking went backwards at step ${step}`)
      assert.ok(current <= GAZE_TEX_X + 1e-9)
      previous = current
    }
    // Tolerance is a fraction of the target, so it holds for any tuned amplitude.
    assert.ok(Math.abs(previous - GAZE_TEX_X) < GAZE_TEX_X * .01, `settled at ${previous}`)
  })

  it('carries the vertical pointer term and returns to centre when the pointer is gone', () => {
    const f = fixture()
    f.state.setGaze({ x: 0, y: -1 })
    f.advance(600)
    assert.ok(tracking(f.state.pose()).y < -GAZE_TEX_Y * .9)
    f.state.setGaze(null)
    f.advance(900)
    const settled = tracking(f.state.pose())
    assert.ok(Math.abs(settled.x) < .2 && Math.abs(settled.y) < .2, settled)
  })

  it('ignores a malformed pointer instead of throwing', () => {
    const f = fixture()
    f.state.setGaze({ x: Number.NaN, y: 2 })
    f.advance(400)
    assert.deepEqual(tracking(f.state.pose()), { x: 0, y: 0 })
    f.state.setGaze(undefined)
    assert.deepEqual(tracking(f.advance(400)), { x: 0, y: 0 })
  })

  it('parks the eyes while asleep and picks the pointer up again after waking', () => {
    const f = fixture()
    f.state.setGaze({ x: 1, y: 0 })
    f.advance(600)
    assert.ok(tracking(f.state.pose()).x > GAZE_TEX_X * .9)
    f.advance(300_100)
    assert.equal(f.state.pose().state, 'falling-asleep')
    f.advance(1500)
    assert.equal(f.state.pose().state, 'sleeping')
    assert.ok(Math.abs(tracking(f.state.pose()).x) < .2)
    f.state.update({ hovered: true })
    f.advance(1500)
    assert.equal(f.state.pose().state, 'idle')
    assert.ok(tracking(f.state.pose()).x > GAZE_TEX_X * .9)
  })

  it('turns the head toward the pointer a beat behind the eyes', () => {
    const f = fixture()
    f.state.setGaze({ x: 1, y: 0 })
    const early = followers(f.advance(160))
    assert.ok(early.eyes > .6, `eyes ${early.eyes}`)
    assert.ok(early.head > .3, `head ${early.head}`)
    assert.ok(early.eyes > early.head + .1, `eyes ${early.eyes} head ${early.head}`)
    const settled = followers(f.advance(900))
    assert.ok(Math.abs(settled.eyes - settled.head) < .06, `eyes ${settled.eyes} head ${settled.head}`)
  })

  it('carries the head vertically and parks it with the eyes while asleep', () => {
    const f = fixture()
    f.state.setGaze({ x: 0, y: -1 })
    assert.ok(f.advance(1200).lookY < -.9)
    f.advance(300_100)
    f.advance(1500)
    const asleep = f.state.pose()
    assert.equal(asleep.state, 'sleeping')
    assert.equal(Math.abs(asleep.lookX), 0)
    assert.equal(Math.abs(asleep.lookY), 0)
    assert.equal(Math.abs(asleep.gazeY), 0)
    f.state.update({ hovered: true })
    f.advance(1500)
    assert.ok(f.state.pose().lookY < -.9)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MascotState, SLEEP_AFTER_MS } from '../assets/mascot-state.js'

function fixture() {
  let time = 0
  const state = new MascotState({ now: () => time })
  return { state, advance(ms: number) { time += ms; return state.pose() } }
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
})

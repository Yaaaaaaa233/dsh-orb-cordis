import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { GAZE_DEADZONE, GAZE_REF, GAZE_TEX_X, GAZE_TEX_Y, gazeVector } from '../assets/mascot-gaze.js'

const center = { x: 500, y: 400 }

describe('pointer gaze vector', () => {
  it('reaches full deflection at the reference distance and clamps beyond it', () => {
    const near = gazeVector({ x: center.x + GAZE_DEADZONE + GAZE_REF, y: center.y }, center)
    assert.equal(near?.x, 1)
    assert.equal(near?.y, 0)
    const far = gazeVector({ x: center.x + 5000, y: center.y }, center)
    assert.equal(far?.x, 1)
    assert.equal(far?.y, 0)
  })

  it('keeps the direction unit-length on a diagonal so the eyes never leave the face', () => {
    const vector = gazeVector({ x: center.x + 2400, y: center.y + 2400 }, center)
    assert.ok(vector !== null)
    assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-9)
    assert.ok(vector.x > 0 && vector.y > 0)
  })

  it('ramps the reach with distance instead of snapping to full deflection', () => {
    const quarter = gazeVector({ x: center.x + GAZE_DEADZONE + GAZE_REF / 4, y: center.y }, center)
    const half = gazeVector({ x: center.x + GAZE_DEADZONE + GAZE_REF / 2, y: center.y }, center)
    assert.ok(quarter !== null && half !== null)
    assert.ok(Math.abs(quarter.x - 0.25) < 1e-9)
    assert.ok(Math.abs(half.x - 0.5) < 1e-9)
  })

  it('looks straight ahead inside the deadzone', () => {
    assert.deepEqual(gazeVector({ x: center.x + GAZE_DEADZONE, y: center.y }, center), { x: 0, y: 0 })
    assert.deepEqual(gazeVector({ ...center }, center), { x: 0, y: 0 })
    const jitter = gazeVector({ x: center.x + 3, y: center.y - 4 }, center)
    assert.deepEqual(jitter, { x: 0, y: 0 })
  })

  it('every direction stays inside the deflection budget', () => {
    for (let step = 0; step < 16; step += 1) {
      const angle = step * Math.PI / 8
      const vector = gazeVector({ x: center.x + Math.cos(angle) * 900, y: center.y + Math.sin(angle) * 900 }, center)
      assert.ok(vector !== null)
      assert.ok(Math.abs(vector.x * GAZE_TEX_X) <= GAZE_TEX_X + 1e-9)
      assert.ok(Math.abs(vector.y * GAZE_TEX_Y) <= GAZE_TEX_Y + 1e-9)
    }
  })

  it('reports an unknown pointer or centre as null, not as centred eyes', () => {
    assert.equal(gazeVector(undefined, center), null)
    assert.equal(gazeVector(null, center), null)
    assert.equal(gazeVector({ x: 1, y: 2 }, undefined), null)
    assert.equal(gazeVector({ x: Number.NaN, y: 2 }, center), null)
    assert.equal(gazeVector({ x: 10, y: Number.POSITIVE_INFINITY }, center), null)
  })
})

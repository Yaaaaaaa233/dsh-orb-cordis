// Pointer-driven gaze for the animated skin.
// The eyes are drawn procedurally, so a continuous vector offset covers every
// direction: no per-direction art, no angle table, no sprite frames.
// A pointer inside the deadzone looks straight ahead; the reach ramps from 0 to
// full deflection across GAZE_REF px so a nearby pointer moves the eyes less.

/** Distance from the ball centre, in screen px, that means full deflection. */
export const GAZE_REF = 360
/** Pointer jitter resting on the ball must not move the eyes. */
export const GAZE_DEADZONE = 24
/** Eye travel in texture px at full deflection. The lens half-width is ~54px. */
export const GAZE_TEX_X = 16
export const GAZE_TEX_Y = 12
/** Time constant of the eye follow, in ms. Long enough to read as a glance. */
export const GAZE_TAU_MS = 150

function isPoint(value) {
  return typeof value === 'object' && value !== null
    && Number.isFinite(value.x) && Number.isFinite(value.y)
}

/**
 * Direction the eyes should look, as a vector of magnitude 0..1.
 * Returns `null` when either point is unknown, and the zero vector inside the
 * deadzone, so callers can tell "no pointer" from "pointer on the ball".
 */
export function gazeVector(pointer, center, { ref = GAZE_REF, deadzone = GAZE_DEADZONE } = {}) {
  if (!isPoint(pointer) || !isPoint(center)) return null
  const dx = pointer.x - center.x, dy = pointer.y - center.y
  const distance = Math.hypot(dx, dy)
  if (!Number.isFinite(distance)) return null
  if (distance <= deadzone) return { x: 0, y: 0 }
  const reach = Math.min(1, (distance - deadzone) / ref)
  return { x: dx / distance * reach, y: dy / distance * reach }
}

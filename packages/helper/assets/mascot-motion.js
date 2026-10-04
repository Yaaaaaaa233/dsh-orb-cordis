// Motion curves from the approved dsh-orb-mascot-v10 preview.
export const CYCLE = 8, TAU = Math.PI * 2, SYMBOL_PERIOD = 5.15, SYMBOL_FADE = .15
export const mod = (x, n) => ((x % n) + n) % n
export const smooth = (a, b, x) => { const q = Math.max(0, Math.min(1, (x - a) / (b - a))); return q * q * (3 - 2 * q) }
export const ease5 = (a, b, x) => { const q = Math.max(0, Math.min(1, (x - a) / (b - a))); return q ** 3 * (q * (q * 6 - 15) + 10) }
export const idleAhoge = t => { const p = t / CYCLE * TAU; return 3 * (2.8 * Math.sin(p - .6) + 1.4 * Math.sin(p * 2 - 1)) }
export function blink(t) {
  t = mod(t, CYCLE)
  for (const c of [2.15, 6.65]) {
    const q = t - c
    if (q >= -.13 && q < 0) return 1 - smooth(-.13, 0, q)
    if (q >= 0 && q < .055) return 0
    if (q >= .055 && q < .25) return smooth(.055, .25, q)
  }
  return 1
}
const fast = 2.1, slow = (3 - fast * 1.125) / 2.875
const integral = q => q ** 6 - 3 * q ** 5 + 2.5 * q ** 4
function thinkingPhase(q) {
  if (q <= .65) return fast * q
  const afterDown = fast * .65 + .7 * (fast + slow) / 2
  if (q < 1.35) { const s = q - .65; return fast * .65 + fast * s + (slow - fast) * .7 * integral(s / .7) }
  if (q <= 3.75) return afterDown + slow * (q - 1.35)
  const s = q - 3.75
  return afterDown + slow * 2.4 + slow * s + (fast - slow) * .25 * integral(s / .25)
}
export function thinkingWiggle(t) {
  const q = mod(t, 4), amplitude = 42 - 28 * ease5(.7, 1.85, q) + 28 * ease5(3.55, 4, q)
  return amplitude * Math.sin(TAU * thinkingPhase(q))
}
export function rebound(x, velocity, u) {
  if (u < 0) return x
  return Math.exp(-4.6 * u) * (x * Math.cos(9 * u) + (velocity + 4.6 * x) / 9 * Math.sin(9 * u)) * (1 - ease5(1.2, 1.6, u))
}
export function bodyMotion(t) {
  const phase = t / CYCLE * TAU, sway = Math.sin(phase), breath = Math.sin(phase * 2)
  return {
    phase, breath,
    ba: .15 * Math.PI / 180 * sway,
    ha: (1.1 * sway + .25 * Math.sin(phase * 2 + .4)) * Math.PI / 180,
    hx: 4.5 * sway, hy: 2.5 * Math.sin(phase * 2 + .5), yaw: .008 * Math.sin(phase - .2),
  }
}
export function statusSway(t) {
  const { breath, ba, ha, hx, hy, yaw } = bodyMotion(t)
  const x = (373 - 39) / .32, y = (144 - 48) / .32
  return {
    x: (-ba * (y - 1240) + hx - ha * (y - 1060) + yaw * (x - 575)) * .32,
    y: (ba * (x - 600) - (1240 - y) * .0048 * breath + ha * (x - 600) + hy) * .32,
    rotation: ba + ha,
  }
}

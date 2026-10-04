import { appendFileSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Diagnostic metadata only: never write message text, credentials, or arbitrary errors.
const allowed = new Set(['event', 'seq', 'watermark', 'running', 'watching', 'count', 'sockets', 'kind', 'name', 'line', 'column', 'queued', 'expanded', 'pinned', 'asking'])
export function diagnostic(source: string, fields: Record<string, unknown>): void {
  try {
    const dir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-orb', 'diagnostics')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const safe: Record<string, unknown> = { time: new Date().toISOString(), source }
    for (const [key, value] of Object.entries(fields)) {
      if (!allowed.has(key)) continue
      if (typeof value === 'number' || typeof value === 'boolean') safe[key] = value
      else if (typeof value === 'string' && /^[a-zA-Z0-9_./:-]{1,100}$/.test(value)) safe[key] = value
    }
    const log = join(dir, source + '.jsonl')
    try { if (statSync(log).size > 2_000_000) renameSync(log, log + '.previous') } catch {}
    appendFileSync(log, JSON.stringify(safe) + '\n', { mode: 0o600 })
    writeFileSync(join(dir, source + '-state.json'), JSON.stringify(safe) + '\n', { mode: 0o600 })
  } catch { /* Diagnostics must never affect a session. */ }
}

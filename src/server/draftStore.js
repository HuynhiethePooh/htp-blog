/**
 * Server-only storage for draft rooms. Never import this from a client component --
 * it pulls in the Redis client and reads secrets.
 *
 * Two backends behind one interface:
 *   - Upstash Redis in production (atomic compare-and-set via a Lua script)
 *   - an in-process Map for `astro dev`, so local development needs no credentials
 *
 * Concurrency is the whole point of this file. Eight people bidding on a 15-second
 * clock will collide; `mutate()` runs read-modify-write inside a CAS retry loop so a
 * losing write is *retried against fresh state* rather than silently clobbering the
 * winner. Without this, two simultaneous bids can both "succeed" and one disappears.
 */
import { Redis } from '@upstash/redis'

/** Rooms self-destruct a week after their last write. Keeps the free tier tidy. */
const TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_CAS_ATTEMPTS = 6

const stateKey = (room) => `draft:${room}`
const versionKey = (room) => `draft:${room}:v`

// ── Upstash backend ──────────────────────────────────────────────────

/**
 * Set state+version only if the stored version still matches what we read.
 * Returns 1 on success, 0 if someone else wrote first.
 */
const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[2])
if current == false then current = '0' end
if current ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[4])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 1
`

/**
 * Read a secret from the environment.
 *
 * `process.env` is the source of truth: on Netlify the Functions runtime populates it,
 * so a rotated token takes effect without a rebuild and the value is never baked into
 * the bundle.
 *
 * Astro dev is the awkward case -- Vite loads `.env` into `import.meta.env` but leaves
 * `process.env` untouched, so a local `.env` would otherwise be invisible here and the
 * store would quietly fall back to in-memory while you thought you were testing Redis.
 * The `import.meta.env.DEV` guard is statically replaced with `false` in production
 * builds, so this branch is dead-code-eliminated and no secret is ever inlined.
 */
function readEnv(name) {
  const fromProcess = globalThis.process?.env?.[name]
  if (fromProcess) return fromProcess

  if (import.meta.env?.DEV) {
    const dev = {
      UPSTASH_REDIS_REST_URL: import.meta.env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: import.meta.env.UPSTASH_REDIS_REST_TOKEN,
      KV_REST_API_URL: import.meta.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: import.meta.env.KV_REST_API_TOKEN,
    }
    return dev[name] || undefined
  }
  return undefined
}

/**
 * Upstash is plain HTTPS, so the same client works on Netlify, locally, anywhere.
 * `UPSTASH_*` is what you set by hand (or what the Netlify Upstash extension injects);
 * `KV_REST_API_*` is the alias some hosts inject automatically.
 */
function redisCredentials() {
  const url = readEnv('UPSTASH_REDIS_REST_URL') ?? readEnv('KV_REST_API_URL')
  const token = readEnv('UPSTASH_REDIS_REST_TOKEN') ?? readEnv('KV_REST_API_TOKEN')
  return url && token ? { url, token } : null
}

function upstashBackend({ url, token }) {
  const redis = new Redis({ url, token })

  // Upstash helpfully JSON.parses values that look like JSON; we want the raw object
  // either way.
  const decode = (raw) => {
    if (raw == null) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  }

  return {
    name: 'upstash',
    async load(room) {
      const [raw, version] = await redis.mget(stateKey(room), versionKey(room))
      const state = decode(raw)
      if (!state) return null
      return { state, version: Number(version ?? 0) }
    },
    async create(room, state) {
      const ok = await redis.set(stateKey(room), JSON.stringify(state), { nx: true, ex: TTL_SECONDS })
      if (!ok) return false
      await redis.set(versionKey(room), '1', { ex: TTL_SECONDS })
      return true
    },
    async cas(room, state, expectedVersion) {
      const result = await redis.eval(
        CAS_SCRIPT,
        [stateKey(room), versionKey(room)],
        [JSON.stringify(state), String(expectedVersion), String(expectedVersion + 1), String(TTL_SECONDS)]
      )
      return Number(result) === 1
    },
  }
}

// ── In-memory backend (dev only) ─────────────────────────────────────

function memoryBackend() {
  // Survives HMR by hanging off globalThis.
  const rooms = (globalThis.__draftRooms ??= new Map())

  return {
    name: 'memory',
    async load(room) {
      const entry = rooms.get(room)
      if (!entry) return null
      // Deep copy so callers can't mutate stored state without going through cas().
      return { state: structuredClone(entry.state), version: entry.version }
    },
    async create(room, state) {
      if (rooms.has(room)) return false
      rooms.set(room, { state: structuredClone(state), version: 1 })
      return true
    },
    async cas(room, state, expectedVersion) {
      const entry = rooms.get(room)
      if (!entry || entry.version !== expectedVersion) return false
      rooms.set(room, { state: structuredClone(state), version: expectedVersion + 1 })
      return true
    },
  }
}

// ── Backend selection ────────────────────────────────────────────────

let backend = null

export function getStore() {
  if (backend) return backend
  const creds = redisCredentials()
  if (creds) {
    backend = upstashBackend(creds)
  } else {
    if (import.meta.env?.PROD) {
      console.warn(
        '[draft] No Upstash credentials found (UPSTASH_REDIS_REST_URL / ' +
          'UPSTASH_REDIS_REST_TOKEN). Falling back to in-memory storage, which does NOT ' +
          'work across function invocations — drafts will appear to randomly lose state. ' +
          'Set both variables in Netlify → Site configuration → Environment variables.'
      )
    }
    backend = memoryBackend()
  }
  return backend
}

export const isPersistent = () => getStore().name !== 'memory'

// ── Public API ───────────────────────────────────────────────────────

export class DraftError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export async function loadDraft(room) {
  const found = await getStore().load(room)
  if (!found) throw new DraftError('No draft with that code. Check the code, or start a new one.', 404)
  return found
}

export async function createDraft(room, state) {
  return getStore().create(room, state)
}

/**
 * Read-modify-write a room atomically.
 *
 * `fn(state)` mutates the state in place and may return a value to pass back to the
 * caller. It must be free of side effects outside `state`, because a lost CAS race
 * discards its work and calls it again on freshly loaded state.
 *
 * @returns {Promise<{state: object, version: number, result: any}>}
 */
export async function mutate(room, fn) {
  const store = getStore()

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const found = await store.load(room)
    if (!found) throw new DraftError('No draft with that code.', 404)

    const { state, version } = found
    const result = await fn(state)

    // `fn` can signal "nothing to write" so a plain poll never costs a write.
    if (result?.skipWrite) return { state, version, result }

    if (await store.cas(room, state, version)) {
      return { state, version: version + 1, result }
    }

    // Someone beat us to it. Back off briefly, then retry against their state.
    await new Promise((r) => setTimeout(r, 15 * (attempt + 1)))
  }

  throw new DraftError('The draft is busy right now — try that again.', 409)
}

// ── Room codes & tokens ──────────────────────────────────────────────

/** No I/O/0/1 — these get read aloud and typed on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newRoomCode(length = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Allocate a room code that isn't taken, giving up rather than looping forever. */
export async function reserveRoom(state, attempts = 8) {
  const store = getStore()
  for (let i = 0; i < attempts; i++) {
    // Widen the code space if we keep colliding.
    const room = newRoomCode(i < 4 ? 4 : 6)
    state.room = room
    if (await store.create(room, state)) return room
  }
  throw new DraftError('Could not allocate a room code. Try again.', 503)
}

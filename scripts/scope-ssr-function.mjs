// Narrow the generated Netlify SSR function to the routes that actually need it.
//
// @astrojs/netlify emits `path: "/*", preferStatic: true` for its SSR function. Real
// files in dist/ are served straight from the CDN, but every path that does NOT match a
// static file still invokes the function -- so a bot probing /wp-login.php or /.env
// costs an invocation, and on a mostly-static blog that background scanning traffic
// dwarfs the real SSR usage. Only /api/* is ever server-rendered here, so say that.
//
// This rewrites generated output, which means it is coupled to the adapter's emit
// format (pinned to @astrojs/netlify 5.2.1 -- see astro.config.mjs). It fails loudly
// rather than silently no-opping if that format changes.

import { readFile, writeFile } from 'node:fs/promises'

const SSR_ENTRY = new URL('../.netlify/functions-internal/ssr/ssr.mjs', import.meta.url)
const FROM = 'path: "/*"'
const TO = 'path: "/api/*"'

let source
try {
  source = await readFile(SSR_ENTRY, 'utf8')
} catch (err) {
  if (err.code === 'ENOENT') {
    // Expected whenever DRAFT_ENABLED is off: a static build emits no SSR function.
    console.log('[scope-ssr] No SSR function in this build — nothing to scope.')
    process.exit(0)
  }
  throw err
}

if (source.includes(TO)) {
  console.log('[scope-ssr] SSR function already scoped to /api/*.')
  process.exit(0)
}

if (!source.includes(FROM)) {
  console.error(
    `[scope-ssr] Could not find ${FROM} in ssr.mjs. The adapter's output format changed;\n` +
      '            re-check this script before trusting the deploy, or the SSR function\n' +
      '            will keep catching every unmatched request.'
  )
  process.exit(1)
}

await writeFile(SSR_ENTRY, source.replace(FROM, TO))
console.log(`[scope-ssr] SSR function scoped: ${FROM} -> ${TO}`)

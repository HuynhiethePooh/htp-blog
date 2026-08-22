/**
 * Builds src/draft/data/pool.js from the Bulbapedia wikitext for Regulation Set M-B.
 *
 * Reg M-B (Pokemon Champions, Jun 17 - Sep 2 2026) lists eligible Pokemon as
 * {{CPCard|dex|Species|ig=-Form|name=...}} rows in two sections: the base list and a
 * "Mega Evolutions" list. We treat every row -- base form, regional form, and Mega --
 * as its own draftable entry, because the draft bids on them separately.
 *
 * Sprites and types come from PokeAPI at build time so the site has no runtime
 * dependency on it. Reg M-B introduced Megas that do not exist in PokeAPI at all
 * (Mega Meganium, Mega Raichu X/Y, ...); those fall back to the base species artwork
 * and are flagged so the UI can badge them instead of showing a broken image.
 *
 *   node scripts/build-pool.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const WIKI = join(here, 'reg-m-b.wiki')
const OUT = join(here, '..', 'src', 'draft', 'data', 'pool.js')

const ARTWORK = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`

/** Form suffix from the wiki (`ig=-Mega X`) -> the slug PokeAPI uses, when it has one. */
const FORM_SLUGS = {
  '-Mega': 'mega',
  '-Mega X': 'mega-x',
  '-Mega Y': 'mega-y',
  '-Alola': 'alola',
  '-Galar': 'galar',
  '-Hisui': 'hisui',
  '-Paldea Combat': 'paldea-combat',
  '-Paldea Blaze': 'paldea-blaze',
  '-Paldea Aqua': 'paldea-aqua',
  '-Heat': 'heat',
  '-Wash': 'wash',
  '-Frost': 'frost',
  '-Fan': 'fan',
  '-Mow': 'mow',
  '-Midnight': 'midnight',
  '-Dusk': 'dusk',
  '-Female': 'female',
  '-Small': 'small',
  '-Large': 'large',
  '-Jumbo': 'jumbo',
  '-Fancy': 'fancy',
  '-Eternal': 'eternal',
}

/** Human-readable label for a form suffix. */
const FORM_LABELS = {
  '-Mega': 'Mega',
  '-Mega X': 'Mega X',
  '-Mega Y': 'Mega Y',
  '-Alola': 'Alolan',
  '-Galar': 'Galarian',
  '-Hisui': 'Hisuian',
  '-Paldea Combat': 'Paldean Combat Breed',
  '-Paldea Blaze': 'Paldean Blaze Breed',
  '-Paldea Aqua': 'Paldean Aqua Breed',
  '-Heat': 'Heat',
  '-Wash': 'Wash',
  '-Frost': 'Frost',
  '-Fan': 'Fan',
  '-Mow': 'Mow',
  '-Midnight': 'Midnight',
  '-Dusk': 'Dusk',
  '-Female': 'Female',
  '-Small': 'Small',
  '-Large': 'Large',
  '-Jumbo': 'Jumbo',
  '-Fancy': 'Fancy',
  '-Eternal': 'Eternal',
}

/** Species names whose PokeAPI slug differs from a naive lowercase. */
const SPECIES_SLUG = {
  'Mr. Rime': 'mr-rime',
  'Kommo-o': 'kommo-o',
}

/**
 * PokeAPI has no bare entry for these species -- it only exposes explicit forms, so
 * `/pokemon/aegislash` 404s. Map each to the form Bulbapedia treats as the default.
 */
const DEFAULT_FORM = {
  pyroar: 'male',
  meowstic: 'male',
  aegislash: 'shield',
  gourgeist: 'average',
  mimikyu: 'disguised',
  morpeko: 'full-belly',
  maushold: 'family-of-four',
  palafin: 'zero',
  basculegion: 'male',
  lycanroc: 'midday',
  urshifu: 'single-strike',
  eiscue: 'ice',
  indeedee: 'male',
  oinkologne: 'male',
  toxtricity: 'amped',
  wishiwashi: 'solo',
  minior: 'red-meteor',
  darmanitan: 'standard',
  zygarde: '50',
}

/**
 * Cases where `<species>-<formSlug>` is not what PokeAPI calls the form.
 * Keyed by `Species|-Wiki Form`.
 */
const SLUG_OVERRIDE = {
  'Gourgeist|-Jumbo': 'gourgeist-super',
  'Meowstic|-Mega': 'meowstic-male-mega',
  'Tauros|-Paldea Combat': 'tauros-paldea-combat-breed',
  'Tauros|-Paldea Blaze': 'tauros-paldea-blaze-breed',
  'Tauros|-Paldea Aqua': 'tauros-paldea-aqua-breed',
}

const slugSpecies = (name) =>
  SPECIES_SLUG[name] ??
  name
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[\s_]+/g, '-')

/** Strip wiki markup out of an `ig=` display name: `[[X (Pokémon)|Mega X]]` -> `Mega X`. */
function cleanDisplayName(raw) {
  if (!raw) return null
  let s = raw.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[|\]\]/g, '')
  s = s.replace(/<br\s*\/?>/gi, ' ')
  s = s.replace(/<\/?small>/gi, '')
  return s.replace(/\s+/g, ' ').trim()
}

function parseWiki(text) {
  const megaHeading = text.indexOf('===Mega Evolutions===')
  if (megaHeading === -1) throw new Error('Could not find the Mega Evolutions heading')

  const rows = []
  // {{CPCard|0006|Charizard|ig=-Mega X|name=[[Charizard (Pokémon)|Mega Charizard X]]}}
  const re = /\{\{CPCard\|(\d+)\|([^|}]+)((?:\|[^}]*)?)\}\}/g
  let m
  while ((m = re.exec(text)) !== null) {
    const [, dexRaw, speciesRaw, rest] = m
    const species = speciesRaw.trim()
    const ig = /\|ig=([^|}]*)/.exec(rest)?.[1]?.trim() ?? null
    const nameParam = /\|name=([^}]*)/.exec(rest)?.[1] ?? null

    rows.push({
      dex: Number(dexRaw),
      species,
      form: ig,
      displayName: cleanDisplayName(nameParam),
      // Bulbapedia lists Megas in their own section after this offset.
      isMega: m.index > megaHeading,
    })
  }
  return rows
}

/**
 * Build the label the draft board shows. Prefer our own form labels over Bulbapedia's
 * `name=` markup, which nests parentheses ("Tauros (Paldean Form (Combat Breed))") and
 * repeats the species ("Rotom (Wash Rotom)"). Fall back to `name=` for rows with no
 * form suffix, where it still carries signal ("Meowstic (Male)").
 */
function labelFor(row) {
  if (!row.form) return row.displayName || row.species

  if (row.isMega) {
    // '-Mega' -> "Mega Blastoise"; '-Mega X' -> "Mega Charizard X".
    const variant = row.form.replace(/^-Mega\s*/, '')
    return `Mega ${row.species}${variant ? ` ${variant}` : ''}`
  }

  const label = FORM_LABELS[row.form] ?? row.form.replace(/^-/, '')
  return `${row.species} (${label})`
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'htp-blog draft pool builder' } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

/** Run `jobs` with bounded concurrency so we stay polite to PokeAPI. */
async function pool(jobs, limit, worker) {
  const out = new Array(jobs.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, async () => {
      while (i < jobs.length) {
        const idx = i++
        out[idx] = await worker(jobs[idx], idx)
      }
    })
  )
  return out
}

async function main() {
  const rows = parseWiki(await readFile(WIKI, 'utf8'))
  const megas = rows.filter((r) => r.isMega).length
  console.log(`parsed ${rows.length} entries (${rows.length - megas} base, ${megas} mega)`)

  // Resolve each entry against PokeAPI. Cache by slug: many rows share one.
  const cache = new Map()
  const lookup = async (slug) => {
    if (!cache.has(slug)) cache.set(slug, getJSON(`https://pokeapi.co/api/v2/pokemon/${slug}`).catch(() => null))
    return cache.get(slug)
  }

  let fallbacks = 0
  const entries = await pool(rows, 8, async (row) => {
    const base = slugSpecies(row.species)
    const dflt = DEFAULT_FORM[base]
    // The species slug PokeAPI actually serves (some only exist as an explicit form).
    const baseSlug = dflt ? `${base}-${dflt}` : base

    // Candidate slugs, most specific first.
    const candidates = []
    if (row.form) {
      const override = SLUG_OVERRIDE[`${row.species}|${row.form}`]
      if (override) candidates.push(override)
      const formSlug = FORM_SLUGS[row.form]
      if (formSlug) {
        candidates.push(`${base}-${formSlug}`)
        // e.g. Mega Meowstic lives at meowstic-male-mega, not meowstic-mega.
        if (dflt) candidates.push(`${base}-${dflt}-${formSlug}`)
      }
    }
    candidates.push(baseSlug)

    let data = null
    let used = null
    for (const slug of candidates) {
      data = await lookup(slug)
      if (data) {
        used = slug
        break
      }
    }

    // We only had to settle for the plain species when a specific form was requested.
    const spriteFallback = Boolean(row.form) && used === baseSlug
    if (spriteFallback) fallbacks++

    const artId = data?.id ?? row.dex
    return {
      id: `${row.dex}${row.form ? row.form.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}`,
      name: labelFor(row),
      species: row.species,
      dex: row.dex,
      form: row.form ? (FORM_LABELS[row.form] ?? row.form.replace(/^-/, '')) : null,
      isMega: row.isMega,
      types: data?.types?.map((t) => t.type.name) ?? [],
      sprite: ARTWORK(artId),
      spriteFallback,
    }
  })

  // Guard against a parse regression silently shrinking the pool.
  const ids = new Set(entries.map((e) => e.id))
  if (ids.size !== entries.length) {
    const seen = new Set()
    const dupes = entries.filter((e) => (seen.has(e.id) ? true : (seen.add(e.id), false)))
    throw new Error(`duplicate ids: ${dupes.map((d) => `${d.id} (${d.name})`).join(', ')}`)
  }
  const untyped = entries.filter((e) => e.types.length === 0)
  console.log(`resolved: ${entries.length} entries, ${fallbacks} sprite fallbacks, ${untyped.length} untyped`)
  if (untyped.length) console.log('  untyped:', untyped.map((e) => e.name).join(', '))

  const banner = `// GENERATED by scripts/build-pool.mjs -- do not edit by hand.
// Source: Bulbapedia "Regulation Set M-B" (Pokemon Champions, Jun 17 - Sep 2 2026).
// ${entries.length} draftable entries; Mega Evolutions are separate entries.
// Regenerate with: npm run build:pool
`
  await writeFile(OUT, `${banner}\nexport const POOL = ${JSON.stringify(entries, null, 2)}\n\nexport default POOL\n`)
  console.log(`wrote ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

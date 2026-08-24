import { defineConfig } from 'astro/config';

// Utils and plugins
import remarkModifiedTime from './src/utils/remark-modified-time.mjs';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import vue from '@astrojs/vue';

// Astro Configuration
import react from "@astrojs/react";
// Pinned to 5.2.1: 5.3+ imports `astro/env/setup`, which does not exist until Astro
// 4.10. The adapter's peerDependencies claims `astro ^4.2.0`, but that range is wrong --
// bumping it without also upgrading Astro fails the build with
// `Missing "./env/setup" specifier in "astro" package`.
import netlify from "@astrojs/netlify";

// The auction draft is the only server-rendered thing on this site, and it is off by
// default. Set DRAFT_ENABLED=true in the Netlify UI (or your shell) to turn it back on.
//
// This is a hard off switch, not just a hidden page: with no `prerender = false` route
// left, `output` drops to 'static' and @astrojs/netlify emits no SSR function at all
// (see its astro:build:done hook). Nothing on the site can burn a function invocation
// while the flag is off -- not the draft, and not bot traffic probing for /wp-login.php.
const DRAFT_ENABLED = process.env.DRAFT_ENABLED === 'true';

/** Mounts the draft's page and API only when the flag is on. */
const draftRoutes = () => ({
  name: 'draft-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (!DRAFT_ENABLED) return;
      injectRoute({ pattern: '/draft', entrypoint: './src/draft/page.astro' });
      injectRoute({ pattern: '/api/draft/[action]', entrypoint: './src/draft/api.ts', prerender: false });
    },
  },
});

// https://astro.build/config
export default defineConfig({
  // Site Information
  site: 'https://huynhiethepooh.netlify.app',
  trailingSlash: 'never',
  // Every blog page is prerendered either way. 'hybrid' only buys the ability for a
  // route to opt out with `export const prerender = false`, which only the draft API
  // does -- so with the draft off there is nothing for a server to render.
  output: DRAFT_ENABLED ? 'hybrid' : 'static',
  adapter: netlify(),
  prefetch: {
    prefetchAll: true
  },
  // Markdown Configuration
  markdown: {
    // Using custom Remark plugin to get modified time
    remarkPlugins: [remarkModifiedTime]
  },
  // Third-party Integrations
  integrations: [
  // Draft page + API, mounted only when DRAFT_ENABLED=true.
  draftRoutes(),
  // Tailwind CSS for styling
  tailwind(),
  // Sitemap generator. The draft is unlisted -- keeping it out of the sitemap is the
  // point, since publishing it there would hand the URL straight to search engines.
  sitemap({
    filter: (page) => !new URL(page).pathname.startsWith('/draft')
  }),
  // MDX support
  mdx(), 
  vue(),
  react({
    experimentalReactChildren: true,
    include: ['**/*.jsx']
  })
  ]
});
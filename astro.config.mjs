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

// https://astro.build/config
export default defineConfig({
  // Site Information
  site: 'https://huynhiethepooh.netlify.app',
  trailingSlash: 'never',
  // 'hybrid' keeps every blog page prerendered as static HTML. Only routes that opt out
  // with `export const prerender = false` become Netlify Functions -- currently just
  // the draft API under /api/draft.
  output: 'hybrid',
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
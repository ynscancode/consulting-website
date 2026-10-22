// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  site: 'https://avise.co',
  output: 'static',
  adapter: vercel(),
  // The homepage is now a single page with anchor sections.
  redirects: {
    '/about': '/#about',
    '/experience': '/#experience',
    '/projects': '/#projects',
    '/contact': '/#contact',
  },
});

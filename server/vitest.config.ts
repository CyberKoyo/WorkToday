import { defineConfig } from 'vitest/config';

// Wrangler imports .md as text (the rule in wrangler.toml); this does the same for the tests.
export default defineConfig({
  plugins: [{ name: 'md-text', transform: (code, id) => (id.endsWith('.md') ? `export default ${JSON.stringify(code)};` : undefined) }],
});

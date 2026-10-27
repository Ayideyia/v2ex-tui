import { build, transform } from 'esbuild';
import { readFileSync, statSync, chmodSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const watch = process.argv.includes('--watch');
const minify = !process.argv.includes('--no-minify');
const outfile = 'dist/v2ex.js';

/**
 * yoga-layout-prebuilt (used by ink 3) ships emscripten code that relies on sloppy-mode
 * implicit globals (e.g. `_a = ...`). The bundle is strict, so evaluate that one file
 * through the Function constructor, which always runs in sloppy mode.
 */
const sloppyNbind = {
  name: 'sloppy-nbind',
  setup(b) {
    b.onLoad({ filter: /yoga-layout-prebuilt[\\/].*nbind\.js$/ }, async (args) => {
      const src = (await transform(readFileSync(args.path, 'utf8'), { minify: true, legalComments: 'none' })).code;
      return {
        loader: 'js',
        contents: `module.exports = (new Function('module', 'exports', 'require', ${JSON.stringify(src)} + '\\nreturn module.exports;'))(module, exports, require);`,
      };
    });
  },
};

const options = {
  plugins: [sloppyNbind],
  entryPoints: ['src/index.tsx'],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  minify,
  sourcemap: false,
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
  define: {
    'process.env.NODE_ENV': '"production"',
    __VERSION__: JSON.stringify(pkg.version),
  },
  // ink only loads react-devtools-core when DEV=true; never needed in the bundle
  external: ['react-devtools-core'],
  logLevel: 'info',
};

if (watch) {
  const { context } = await import('esbuild');
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
  chmodSync(outfile, 0o755);
  console.log(`built ${outfile} (${(statSync(outfile).size / 1024).toFixed(1)} KB)`);
}

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] || 'dist/ux');
await mkdir(output, { recursive: true });
const result = await build({
  metafile: true,
  entryPoints: { app: 'ux/react/main.tsx', studio: 'ux/react/studio.tsx' },
  outdir: output,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  minify: true,
  legalComments: 'eof',
  define: {
    'process.env.NODE_ENV': '"production"',
    __LOCAL_REVIEW__: process.argv.includes('--review') ? 'true' : 'false',
  },
  logLevel: 'info',
});

if (process.argv.includes('--inputs'))
  console.log(
    JSON.stringify({
      inputs: Object.keys(result.metafile.inputs)
        .filter((name) => name.startsWith('ux/'))
        .sort(),
    }),
  );

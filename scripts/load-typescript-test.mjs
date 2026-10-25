import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export async function loadTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
    plugins: [
      {
        name: 'shared-react',
        setup(builder) {
          builder.onResolve({ filter: /^react(?:\/.*)?$/ }, ({ path }) => ({
            path: pathToFileURL(require.resolve(path)).href,
            external: true,
          }));
        },
      },
    ],
  });
  return import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  );
}

import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pdfjs-dist/package.json'));
const destination = fileURLToPath(new URL('../public/pdf/', import.meta.url));
await mkdir(destination, { recursive: true });
await cp(join(source, 'build/pdf.worker.min.mjs'), join(destination, 'pdf.worker.min.mjs'));
await cp(join(source, 'LICENSE'), join(destination, 'LICENSE'));
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(source, directory), join(destination, directory), { recursive: true });
}

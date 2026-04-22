import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.resolve(pluginRoot, '..', 'control', 'config', 'routing-table.json');
const targetDirectory = path.resolve(pluginRoot, 'config');
const targetPath = path.resolve(targetDirectory, 'routing-table.json');

async function main() {
  try {
    const nextContent = await readFile(sourcePath, 'utf8');
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(targetPath, nextContent, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await main();

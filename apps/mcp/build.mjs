import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

await mkdir(new URL('./dist/',import.meta.url),{recursive:true});
await build({absWorkingDir:fileURLToPath(new URL('.',import.meta.url)),entryPoints:['src/server/entry/index.ts'],outfile:'dist/index.js',bundle:true,platform:'node',format:'esm',target:'node24',sourcemap:true,
  banner:{js:"#!/usr/bin/env node\nimport { createRequire as __issusRequire } from 'node:module'; const require = __issusRequire(import.meta.url);"}});
const files=await Promise.all(['index.js','index.js.map'].map(async path=>({path,sha256:createHash('sha256').update(await readFile(new URL('./dist/'+path,import.meta.url))).digest('hex')})));
await writeFile(new URL('./dist/manifest.json',import.meta.url),JSON.stringify({name:'@issus/mcp',runtime:'node24',entry:'index.js',files},null,2)+'\n','utf8');

import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const tests=JSON.parse(await readFile(new URL('../CORE_TESTS.json',import.meta.url),'utf8'));
if(!Array.isArray(tests)||!tests.every(name=>/^tests\/[a-z0-9-]+\.test\.mjs$/.test(name)))throw new Error('Invalid review test list.');
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;

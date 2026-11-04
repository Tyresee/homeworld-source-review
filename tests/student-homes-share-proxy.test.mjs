import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('the independent game proxy sets a single no-referrer policy and retains inherited transport, type and permission protections',async()=>{
  const source=await readFile(new URL('./fixtures/share-proxy.conf',import.meta.url),'utf8'),block=/location \^~ \/games\/homeworld\/ \{([^}]+)\}/.exec(source)?.[1];assert.ok(block);
  assert.match(block,/proxy_hide_header\s+Referrer-Policy\s*;/);assert.deepEqual([...block.matchAll(/add_header\s+Referrer-Policy\s+"([^"]+)"\s+always;/g)].map(match=>match[1]),['no-referrer']);
  assert.match(block,/add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/);assert.match(block,/add_header X-Content-Type-Options "nosniff" always;/);assert.match(block,/add_header Permissions-Policy "microphone=\(self\), camera=\(\), geolocation=\(\)" always;/);
  assert.match(block,/proxy_pass http:\/\/127\.0\.0\.1:1;/);assert.doesNotMatch(source,/location\s+\/\s*\{/,'the policy override must stay in this game namespace');
});

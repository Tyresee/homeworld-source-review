import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderHomeSharePage,HOME_SHARE_PAGE} from '../server/student-homes/share-page.mjs';

test('raw share HTML has matching public metadata and preserves only one valid public capability',async()=>{
  const html=await readFile(new URL('../public/home-share.html',import.meta.url),'utf8');
  const id='A'.repeat(43),rendered=renderHomeSharePage(html,`?share=${id}&from=singlemessage`);
  for(const marker of ['rel="canonical"','property="og:url"'])assert.ok(rendered.includes(`${marker} ${marker.startsWith('rel')?'href':'content'}="${HOME_SHARE_PAGE}?share=${id}"`));
  assert.ok(rendered.includes("property=\"og:title\" content=\"My Home\""));
  assert.ok(rendered.includes('name="twitter:image" content="https://platform.example.invalid/games/homeworld/assets/home-share/share-bunny-v2.jpg"'));
  assert.ok(!rendered.includes('singlemessage'));
  for(const query of ['?share=<script>',`?share=${id}&share=${id}`,`?share=${id}&sample=1`]){
    const rejected=renderHomeSharePage(html,query);assert.ok(rejected.includes(`rel="canonical" href="${HOME_SHARE_PAGE}"`));assert.ok(!rejected.includes('<script>'));
  }
});

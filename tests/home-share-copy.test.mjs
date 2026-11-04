import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {getHomeShareCopy} from '../public/js/home-share-copy.js';
import {renderHomeShareDocument} from '../server/student-homes/share-document.mjs';
test('a named share uses the child title and the requested factual description without inventing statistics',()=>{
  assert.deepEqual(getHomeShareCopy("Sample Learner Home"),{title:"Sample Learner Home",description:"Sample Learner's home, built in English class. Take a look."});
  for(const title of [null,'',"My Learning Home","My Little World","My Home",'invalid'])assert.deepEqual(getHomeShareCopy(title),{title:"My Home",description:"A home built in English class. Take a look."});
});
test('server metadata and browser copy share one source, and all title/description markup remains escaped',async()=>{
  const template=await readFile(new URL('../public/home-share.html',import.meta.url),'utf8'),title="Sample </title><script>x</script> Home";
  const html=renderHomeShareDocument(template,{title,canonical:'https://example.test/?share=A&x="'});
  assert.equal(html.includes('<script>x</script>'),false);assert.match(html,/Sample &lt;\/title&gt;&lt;script&gt;x&lt;\/script&gt; Home/);assert.ok(html.includes(`content="${escapeShareExpected(getHomeShareCopy(title).description)}"`));assert.match(html,/share=A&amp;x=&quot;/);
});
test('replacement tokens in a display name remain literal and cannot duplicate document fragments',async()=>{
  const template=await readFile(new URL('../public/home-share.html',import.meta.url),'utf8');
  const html=renderHomeShareDocument(template,{title:"Sample $& $' $` $$ Home"});
  assert.ok(html.includes("<title>Sample $&amp; $&#39; $` $$ Home</title>"));
  assert.equal((html.match(/<title>/g)||[]).length,1);assert.equal((html.match(/<body /g)||[]).length,1);
});

function escapeShareExpected(value){return String(value).replace(/[&<>\"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char]));}

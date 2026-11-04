import {getHomeShareCopy} from '../../public/js/home-share-copy.js';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
/** Metadata must be present before JavaScript for link-preview crawlers.
 * Only the already-public frozen display title reaches the document. */
export function renderHomeShareDocument(template,{title,canonical=''}={}){
  const copy=getHomeShareCopy(title),text=escape(copy.title),description=escape(copy.description);
  return template.replace(/<title>[^<]*<\/title>/,()=>'<title>'+text+'</title>')
    .replace(/(<h1 id="share-title">)[\s\S]*?(<\/h1>)/,(_all,start,end)=>start+text+end)
    .replace(/(<meta id="share-meta-(?:description|summary)"[^>]* content=")[^"]*(">)/g,(_all,start,end)=>start+description+end)
    .replace(/(<meta id="share-meta-title"[^>]* content=")[^"]*(">)/,(_all,start,end)=>start+text+end)
    .replace(/(<meta id="share-twitter-description"[^>]* content=")[^"]*(">)/,(_all,start,end)=>start+description+end)
    .replace(/(<meta id="share-twitter-title"[^>]* content=")[^"]*(">)/,(_all,start,end)=>start+text+end)
    .replace(/(<link id="share-canonical"[^>]* href=")[^"]*(">)/,(_all,start,end)=>start+escape(canonical||'https://platform.example.invalid/games/homeworld/home-share.html')+end)
    .replace(/(<meta id="share-meta-url"[^>]* content=")[^"]*(">)/,(_all,start,end)=>start+escape(canonical||'https://platform.example.invalid/games/homeworld/home-share.html')+end);
}

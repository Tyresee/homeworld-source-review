export const HOME_SHARE_PAGE='https://platform.example.invalid/games/homeworld/home-share.html';

// Only the public random capability belongs in metadata. Never copy arbitrary
// query text, student identity, cookies, or a fragment into the HTML document.
export function renderHomeSharePage(template,search=''){
  const query=new URLSearchParams(search),ids=query.getAll('share');
  const link=ids.length===1&&/^[A-Za-z0-9_-]{43}$/.test(ids[0])&&!query.has('sample')
    ?`${HOME_SHARE_PAGE}?share=${ids[0]}`:HOME_SHARE_PAGE;
  return template.replaceAll(`"${HOME_SHARE_PAGE}"`,`"${link}"`);
}

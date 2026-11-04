/** Display metadata only. The trusted publisher supplies a frozen display
 * title; the viewer never infers identity or invents lesson statistics. */
export function getHomeShareCopy(value){
  const suffix=" Home";
  const legacy=new Set(["My Learning Home","My Little World","My Home"]);
  const raw=typeof value==='string'?value.trim():'';
  const title=raw.length<=60&&raw.length>suffix.length&&raw.endsWith(suffix)&&!legacy.has(raw)?raw:"My Home";
  return{title,description:"Every small effort can be seen."};
}

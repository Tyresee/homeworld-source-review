/** Keep one placement request in flight. A delayed result must not remove a
 * newer ghost or revive a scene that has already been closed. */
export function commitHomePlacement(placement,{commit,isCurrent,accept,reject}) {
  if(!placement||placement.committing)return false;
  placement.committing=true;
  const settle=result=>{
    placement.committing=false;
    if(!isCurrent(placement))return;
    if(result?.ok===true)accept(result);
    else reject(result??{ok:false,error:"DisplayText2235, DisplayText0974."});
  };
  const failed=error=>settle({ok:false,error:error?.message??"DisplayText2235, DisplayText0974."});
  try{
    const result=commit();
    if(result&&typeof result.then==='function')Promise.resolve(result).then(settle,failed);
    else settle(result);
  }catch(error){failed(error);}
  return true;
}

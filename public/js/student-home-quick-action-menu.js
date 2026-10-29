import {getObjectCapabilities,TELEVISION_CHANNELS} from './home-object-state.js';

/** This menu only describes executable controller/object capabilities. It is
 * not a second catalogue of hoped-for animations. Recheck on every activation. */
const icons={sit:'sit',lie:'sleep',watch:'watch',tidy:'tidy',wipe:'wipe',read:'read',cook:'cook',wash:'wash',dishwash:'dishwash',swim:'swim',football:'football',admire:'admire'};
const labels={lie:"DisplayText3930",watch:"DisplayText3931",tidy:"DisplayText3932",wipe:"DisplayText3933",swim:"DisplayText3934",football:"DisplayText3935"};
export function getObjectQuickActions({robotActions=[],kind,objectState=null,watching=false}={}){
  const rows=robotActions.filter(row=>row&&typeof row.id==='string').map(row=>({
    id:`robot:${row.id}`,label:labels[row.kind]??row.label,icon:row.kind==='sit'?(kind?.toLowerCase().includes('sofa')?'sofa-sit':['compactToilet','bdSplitToilet','bdMonoblocToilet','bdSmartToilet'].includes(kind)?'toilet':'sit'):icons[row.kind]??'robot',
    disabled:row.disabled===true,reason:row.reason??row.error??'',detail:row.detail??'',
    command:{type:'robot',actionId:row.id},
  }));
  // A specific use is more useful than the generic approach/admire command.
  if(rows.some(row=>row.command.actionId!=='admire')){
    const index=rows.findIndex(row=>row.command.actionId==='admire');if(index>=0)rows.splice(index,1);
  }
  const type=getObjectCapabilities(kind)?.type;
  if(objectState&&type==='lamp')rows.push(
    {id:'object:power',label:objectState.power?"DisplayText3936":"DisplayText3937",icon:'lamp',command:{type:'patch',patch:{power:!objectState.power}}},
    {id:'object:brightness',label:"DisplayText3938",icon:'lamp',detail:`DisplayText3939: ${["DisplayText3910","DisplayText3911","DisplayText3912"][objectState.brightness-1]}`,command:{type:'patch',patch:{power:true,brightness:objectState.brightness%3+1}}},
  );
  if(objectState&&type==='clock')rows.push(
    {id:'object:demonstrate',label:kind==='cuckooClock'?"DisplayText3940, DisplayText3941":"DisplayText3942",icon:'clock',command:{type:'demonstrate'}},
    {id:'object:chime',label:objectState.chime?"DisplayText3917":"DisplayText3918",icon:'clock',command:{type:'patch',patch:{chime:!objectState.chime}}},
  );
  if(objectState&&type==='television')rows.push(
    {id:'object:power',label:objectState.power?"DisplayText3920":"DisplayText3921",icon:'watch',command:{type:'patch',patch:{power:!objectState.power}}},
    {id:'object:channel',label:watching?"DisplayText3943":"DisplayText3944",icon:'watch',detail:`DisplayText3296: ${TELEVISION_CHANNELS[objectState.channel]}`,command:watching?{type:'robot-channel'}:{type:'patch',patch:{power:true,channel:(objectState.channel+1)%TELEVISION_CHANNELS.length}}},
  );
  return rows;
}

/** Resolve only an item owned and placed in this visible student/floor. */
export function getQuickActionOwned(commerce,data,view,floor){
  if(!commerce||!data||!['interior','estate'].includes(view))return null;
  const id=view==='estate'?data.outdoorOwnedId:data.furnitureId??(data.surfaceId?.startsWith('furniture:')?data.surfaceId.slice(10):null);
  if(!id)return null;
  return commerce.owned?.find(row=>row.id===id&&row.status==='placed'&&(view==='estate'||row.storey===floor))??null;
}

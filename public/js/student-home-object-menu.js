import {getObjectCapabilities,getObjectState} from './home-object-state.js';
import {TV_CHANNELS} from './student-home-object-runtime.js';

/** Local controls use the same authoritative unit/state as robot actions. */
export function getHomeObjectMenu(commerce,owned,{change,demonstrate,robotChannel}={}){
  const cap=getObjectCapabilities(owned?.item?.kind),state=owned&&getObjectState(commerce,owned.id);
  if(!cap||!state||owned.status!=='placed')return [];
  const set=patch=>()=>change(owned.id,patch);
  if(cap.type==='lamp')return [
    {id:'object-power',label:state.power?"DisplayText3905":"DisplayText3906",detail:state.power?"DisplayText3907":"DisplayText3908",action:set({power:!state.power})},
    {id:'object-brightness',label:"DisplayText3909",children:["DisplayText3910","DisplayText3911","DisplayText3912"].map((label,i)=>({id:`brightness-${i+1}`,label:`${state.brightness===i+1?'✓ ':''}${label}`,action:set({power:true,brightness:i+1})}))},
  ];
  if(cap.type==='clock')return [
    {id:'object-demonstrate',label:owned.item.kind==='cuckooClock'?"DisplayText3913":"DisplayText3914",detail:"DisplayText3915, DisplayText3916",action:()=>demonstrate(owned.id)},
    {id:'object-chime',label:state.chime?"DisplayText3917":"DisplayText3918",detail:"DisplayText3919",action:set({chime:!state.chime})},
  ];
  return [
    {id:'object-power',label:state.power?"DisplayText3920":"DisplayText3921",action:set({power:!state.power})},
    {id:'object-channel',label:`DisplayText3922 · ${TV_CHANNELS[state.channel]}`,children:TV_CHANNELS.map((label,i)=>({id:`channel-${i}`,label:`${state.channel===i?'✓ ':''}${label}`,action:set({power:true,channel:i})}))},
    {id:'object-volume',label:"DisplayText3923",detail:"DisplayText3924",children:["DisplayText3925","DisplayText3926","DisplayText3927"].map((label,i)=>({id:`volume-${i}`,label:`${state.volume===i?'✓ ':''}${label}`,action:set({volume:i})}))},
    {id:'object-robot-channel',label:"DisplayText3928",detail:"DisplayText3929",action:()=>robotChannel(owned.id)},
  ];
}

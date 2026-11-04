                                                                          
                                                                              
                                                        
export const ELEVATOR_KEYPAD_COPY=Object.freeze({
  title:"DisplayText4847",
  contextTitle:"DisplayText4848 · DisplayText4849",
  moreRoomsSuffix:"DisplayText4850",
  hintIdle:"DisplayText4851, DisplayText4852.DisplayText4853.",
  hintRiding:"DisplayText4854……",
  here:"DisplayText4855",
  hereAria:number=>`${number} DisplayText0931, DisplayText4856`,
  goAria:number=>`DisplayText4857 ${number} DisplayText0931`,
  offAria:number=>`${number} DisplayText0931, DisplayText4858`,
  offTitle:"DisplayText4859",
  screenIdle:(number,label)=>label?`DisplayText4856 · ${label}`:"DisplayText4856",
  screenRiding:number=>`DisplayText4860 ${number} DisplayText0931`,
});

/** 2 columns up to 8 floors, 3 up to 15, otherwise 4. */
export function keypadColumns(floorCount){return floorCount<=8?2:floorCount<=15?3:4;}

   
                                                                        
                                                                          
                                                              
                                                                              
                                                                            
   
export function buildElevatorKeypad({floorCount,currentFloor,served=[],labelFor=()=>null,riding=false,targetFloor=null}={}){
  if(!Number.isInteger(floorCount)||floorCount<1)throw new RangeError('floorCount must be a positive integer.');
  const columns=keypadColumns(floorCount),rowCount=Math.ceil(floorCount/columns),reach=new Set(served);
  const cell=floor=>{
    const number=floor+1,label=labelFor(floor)??null;
    const state=floor===currentFloor?'here':reach.has(floor)&&reach.has(currentFloor)?'go':'off';
    return {floor,number,state,lit:riding&&floor===targetFloor,disabled:riding||state!=='go',
      title:state==='off'?ELEVATOR_KEYPAD_COPY.offTitle:label??'',
      ariaLabel:state==='here'?ELEVATOR_KEYPAD_COPY.hereAria(number):state==='off'?ELEVATOR_KEYPAD_COPY.offAria(number):ELEVATOR_KEYPAD_COPY.goAria(number)};
  };
  const rows=[];
  for(let r=rowCount-1;r>=0;r--){const row=[];for(let c=0;c<columns;c++){const floor=r*columns+c;row.push(floor<floorCount?cell(floor):null);}rows.push(row);}
  return {columns,rows,scroll:floorCount>12};
}

/** Number shown on the remote screen while riding: the floor the cabin is
 * currently nearest to, from the continuous focus storey (0-based → 1-based). */
export function keypadScreenFloor(focusStorey){return Math.round(focusStorey)+1;}

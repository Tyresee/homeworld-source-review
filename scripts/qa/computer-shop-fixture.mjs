// Fictional shop QA. No credentials, platform network or real student data.
import {createStudentHome,validateStudentHome} from '../../server/student-homes/profile.mjs';
import {prepareCommerceCommand,houseFromCommerce} from '../../server/student-homes/commerce.mjs';

export function createComputerShopFixture(studentId){
  let home=createStudentHome(studentId,'2026-11-02T00:00:00.000Z');const commands=[];
  function apply(command){const id='qa-computer-setup-'+(commands.length+1),prepared=prepareCommerceCommand(home.commerce,command,id);
    home={...home,commerce:prepared.commerce,house:houseFromCommerce(prepared.commerce),revision:home.revision+1};commands.push({id,type:command.type,amount:prepared.amount});
    if(!validateStudentHome(home,studentId))throw Error('Invalid computer shop setup');}
  apply({type:'checkout',lines:[{skuId:'writingDesk-classic',quantity:4}]});
  const desks=home.commerce.owned.filter(row=>row.item.kind==='writingDesk');
  const positions=[[-1.45,-1],[1.45,-1],[-1.45,1.45],[1.45,1.45]];
  desks.forEach((desk,index)=>apply({type:'placeItem',id:desk.id,pose:{x:positions[index][0],z:positions[index][1],rotation:0},storey:0}));
  return{home,commands,summary:{id:'computer-shop',floors:1,deskIds:desks.map(row=>row.id),commands:commands.length,simulatedSpend:commands.reduce((sum,row)=>sum+row.amount,0)}};
}

/** Explicit in-memory order service for the optional computer-shop fixture.
 * Other review fixtures retain their purchase prohibition. */
export function createComputerReviewPayments(wallets){
  const orders=new Map(),copy=value=>structuredClone(value);
  return studentId=>{
    const wallet=()=>wallets.get(studentId),result=order=>({order:copy(order),wallet:copy(wallet())});
    const get=async id=>{const order=orders.get(id);if(!order||order.studentId!==studentId)throw Object.assign(Error('Fictional order missing'),{status:404});return result(order);};
    return{wallet:async()=>copy(wallet()),get,
      async reserve({orderId,...quote}){
        const prior=orders.get(orderId);if(prior)return get(orderId);
        if(quote.studentId!==studentId||!Number.isSafeInteger(quote.amount)||quote.amount<=0||quote.amount>wallet().balance)throw Object.assign(Error('Fictional balance insufficient'),{status:402});
        const order={...quote,id:orderId,status:'reserved'};orders.set(orderId,order);wallet().balance-=quote.amount;wallet().reserved+=quote.amount;wallet().revision++;return result(order);
      },
      async commit(id){const order=orders.get(id);if(!order||order.studentId!==studentId)throw Object.assign(Error('Fictional order missing'),{status:404});
        if(order.status!=='committed'){order.status='committed';wallet().reserved-=order.amount;wallet().totalSpent+=order.amount;wallet().revision++;}return result(order);
      }};
  };
}

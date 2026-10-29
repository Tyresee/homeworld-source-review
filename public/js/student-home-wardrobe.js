import {ROBOT_CLOTHING_PRODUCTS} from './robot-wardrobe-catalog.js';

const slots={outfit:"DisplayText3891",headwear:"DisplayText3892",footwear:"DisplayText0184"};
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const button=(label,cls,action)=>{const node=el('button',cls,label);node.type='button';node.addEventListener('click',action);return node;};

/** Trials are pictures only. Wearing an owned SKU waits for the account command;
 * closing a trial never writes to a student's save or spends their points. */
export function createStudentHomeWardrobe({getState,getColors,getThumbnail,onEquip,onAddToCart,onShop}) {
  const products=new Map(ROBOT_CLOTHING_PRODUCTS.map(product=>[product.skuId,product]));
  const dialog=el('dialog','robot-wardrobe');dialog.setAttribute('aria-labelledby','robot-wardrobe-title');document.body.append(dialog);
  let slot='outfit',trial=null,busy=false,notice='',lastFocus,epoch=0,disposed=false;
  const owns=sku=>getState()?.owned.some(item=>item.skuId===sku);
  const equipped=()=>getState()?.avatar?.equipped??{};
  function picture(equipment,alt){const img=el('img');img.alt=alt;img.draggable=false;img.width=300;img.height=210;try{img.src=getThumbnail({productType:'clothing',equipped:equipment,colors:getColors()});}catch{img.alt="DisplayText4166";}return img;}
  async function equip(sku,part){if(busy)return;const own=epoch;busy=true;notice="DisplayText4167…";render();
    try{const result=await onEquip(sku,part);if(disposed||own!==epoch)return;if(result?.ok){trial=null;notice="DisplayText4168, DisplayText4169.";}else notice=result?.error??"DisplayText4170, DisplayText0974.";}
    catch{if(own===epoch)notice="DisplayText4171, DisplayText4172.";}
    finally{busy=false;if(!disposed&&own===epoch&&dialog.open)render();}
  }
  function render(){
    const focusLabel=dialog.contains(document.activeElement)?document.activeElement.getAttribute('aria-label'):null;
    dialog.replaceChildren();const header=el('header','robot-wardrobe-header'),heading=el('div');heading.append(el('p','robot-eyebrow',"DisplayText4173, DisplayText4174"));
    const title=el('h2','',"DisplayText4175");title.id='robot-wardrobe-title';heading.append(title);
    const close=button('','robot-wardrobe-close',()=>dialog.close());close.setAttribute('aria-label',"DisplayText4176");
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M6 6 18 18 M18 6 6 18');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');svg.append(path);close.append(svg);header.append(heading,close);dialog.append(header);
    const layout=el('div','robot-wardrobe-layout'),preview=el('section','robot-wardrobe-preview'),product=products.get(trial),equipment={...equipped(),...(product?{[product.slot]:product.skuId}:{})};
    preview.append(picture(equipment,product?`${product.name}DisplayText4177`:"DisplayText4178"),el('h3','',product?`DisplayText3318 · ${product.name}`:"DisplayText4179"),el('p','',product&&!owns(trial)?"DisplayText4180.DisplayText4181, DisplayText4182.":"DisplayText3891, DisplayText3892, DisplayText4183, DisplayText4184."));
    if(product){if(owns(trial))preview.append(button("DisplayText4185",'robot-primary',()=>equip(product.skuId,product.slot)));else{const inCart=getState().cart.some(line=>line.skuId===trial);preview.append(button(inCart?"DisplayText4186":`DisplayText3308 · ${product.price.toLocaleString('en')} DisplayText0920`,'robot-primary',()=>{if(inCart){dialog.close();onShop();return;}const result=onAddToCart(product.skuId);notice=result?.ok?"DisplayText3309, DisplayText4187.":result?.error??"DisplayText4188";render();}));}preview.append(button("DisplayText4189",'robot-quiet',()=>{trial=null;render();}));}
    const content=el('section','robot-wardrobe-content'),nav=el('nav','robot-wardrobe-slots');nav.setAttribute('aria-label',"DisplayText4190");
    for(const[id,label]of Object.entries(slots)){const count=ROBOT_CLOTHING_PRODUCTS.filter(p=>p.slot===id&&owns(p.skuId)).length,b=button(`${label} ${count}`,'',()=>{slot=id;trial=null;render();});b.setAttribute('aria-label',`DisplayText4191${label}`);b.setAttribute('aria-pressed',String(slot===id));nav.append(b);}content.append(nav);
    const status=el('p','robot-wardrobe-status',notice);status.setAttribute('role','status');status.setAttribute('aria-live','polite');content.append(status);
    const choices=[null,...ROBOT_CLOTHING_PRODUCTS.filter(p=>p.slot===slot&&owns(p.skuId))],grid=el('div','robot-wardrobe-grid');
    for(const p of choices){const sku=p?.skuId??null,name=p?.name??(slot==='headwear'?"DisplayText4192":slot==='footwear'?"DisplayText4193":"DisplayText4194"),worn=(equipped()[slot]??null)===sku,b=button('','robot-wardrobe-choice',()=>equip(sku,slot));b.setAttribute('aria-label',`DisplayText3316${name}`);b.setAttribute('aria-pressed',String(worn));b.disabled=worn||busy;b.append(picture({...equipped(),[slot]:sku},name),el('strong','',name),el('span','',worn?"DisplayText3400":"DisplayText4195"));grid.append(b);}content.append(grid);
    if(choices.length===1)content.append(el('p','robot-wardrobe-empty',"DisplayText4196.DisplayText4197, DisplayText4198."));
    content.append(button("DisplayText4199 →",'robot-market-link',()=>{dialog.close();onShop();}));layout.append(preview,content);dialog.append(layout);
    if(busy)for(const b of dialog.querySelectorAll('button'))if(b!==close)b.disabled=true;
    if(focusLabel)[...dialog.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===focusLabel)?.focus({preventScroll:true});
  }
  dialog.addEventListener('close',()=>{epoch++;trial=null;if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();});
  return {open({previewSku=null}={}){if(!getState()||busy||disposed)return;epoch++;trial=products.has(previewSku)?previewSku:null;if(trial)slot=products.get(trial).slot;notice='';lastFocus=document.activeElement;render();if(!dialog.open)dialog.showModal();dialog.querySelector('.robot-wardrobe-close').focus({preventScroll:true});},close(){if(dialog.open)dialog.close();},dispose(){disposed=true;epoch++;dialog.close();dialog.remove();}};
}

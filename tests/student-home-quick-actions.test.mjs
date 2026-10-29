import test from 'node:test';
import assert from 'node:assert/strict';
import {createStudentHomeQuickActions} from '../public/js/student-home-quick-actions.js';

function fixture(options={}){
  const doc={activeElement:null};
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.scrollTop=0;}
    setAttribute(key,value){this.attributes[key]=value;}
    append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    addEventListener(type,fn){this.listeners.set(type,[...this.listeners.get(type)??[],fn]);}
    dispatch(type,fields={}){const event={target:this,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...fields};for(const fn of this.listeners.get(type)??[])fn(event);return event;}
    focus(){doc.activeElement=this;}
    remove(){this.parent.children=this.parent.children.filter(node=>node!==this);}
  }
  doc.createElement=tag=>new Element(tag);doc.body=new Element('body');const canvas=new Element('canvas');canvas.focus();
  const calls=[],menu=createStudentHomeQuickActions({document:doc,onAction:(...args)=>calls.push(['action',...args]),onStop:(...args)=>calls.push(['stop',...args]),onClose:()=>calls.push(['close']),...options});
  const root=doc.body.children[0],find=className=>{const search=node=>node.className===className?node:node.children.map(search).find(Boolean);return search(root);};
  const buttons=()=>find('home-quick-actions').children.filter(node=>node.tagName==='button');
  return {doc,root,canvas,menu,calls,find,buttons};
}
const sofa={targetId:'furniture:sofa-1',title:"DisplayText4586",actions:[{id:'sit',icon:'sofa-sit',label:"DisplayText0251"},{id:'watch',label:"DisplayText3931"},{id:'tidy',label:"DisplayText3932"}]};
const flush=async()=>{await Promise.resolve();await Promise.resolve();};

test('opens without stealing focus and invokes the action for the exact selected object',async()=>{
  const f=fixture();f.menu.show(sofa);assert.equal(f.menu.isOpen,true);assert.equal(f.doc.activeElement,f.canvas);
  f.buttons()[2].dispatch('click');await flush();assert.deepEqual(f.calls,[['action','tidy','furniture:sofa-1']]);
  assert.equal(f.menu.isOpen,true);assert.equal(f.buttons()[2].disabled,false);f.menu.dispose();
});
test('same-selection refresh keeps the focused button and scrolled actions',()=>{
  const f=fixture();f.menu.show(sofa);const button=f.buttons()[1];button.focus();f.find('home-quick-actions').scrollTop=48;
  f.menu.show({...sofa,actions:sofa.actions.map(a=>a.id==='watch'?{...a,disabled:true,reason:"DisplayText4587"}:a)});
  assert.equal(f.buttons()[1],button);assert.equal(f.doc.activeElement,button);assert.equal(f.find('home-quick-actions').scrollTop,48);
  assert.equal(button.disabled,true);assert.equal(button.title,"DisplayText4587");f.menu.dispose();
});
test('disabled and busy commands cannot invoke actions; reason remains visible',async()=>{
  const f=fixture();f.menu.show({...sofa,actions:[{id:'watch',label:"DisplayText3931",disabled:true,reason:"DisplayText4588"}]});
  f.buttons()[0].dispatch('click');await flush();assert.deepEqual(f.calls,[]);assert.equal(f.buttons()[0].children[1].children[1].textContent,"DisplayText4588");
  f.menu.show({...sofa,busy:true});f.buttons()[0].dispatch('click');await flush();assert.deepEqual(f.calls,[]);f.menu.dispose();
});
test('async errors stay attached to the old selection and cannot alter the next object',async()=>{
  let finish;const f=fixture({onAction:()=>new Promise(resolve=>{finish=resolve;})});
  f.menu.show(sofa);f.buttons()[0].dispatch('click');assert.equal(f.buttons()[0].disabled,true);
  f.menu.show({...sofa,targetId:'furniture:sofa-2',title:"DisplayText4589",status:"DisplayText4590"});
  finish({ok:false,error:"DisplayText4591"});await flush();
  assert.equal(f.find('home-quick-status').textContent,"DisplayText4590");assert.equal(f.buttons()[0].disabled,false);assert.equal(f.menu.targetId,'furniture:sofa-2');f.menu.dispose();
});
test('action rejection displays its real error, then allows retry',async()=>{
  const f=fixture({onAction:()=>({ok:false,error:"DisplayText4592"})});f.menu.show(sofa);f.buttons()[0].dispatch('click');await flush();
  assert.equal(f.find('home-quick-status').textContent,"DisplayText4592");assert.equal(f.root.dataset.error,'true');assert.equal(f.buttons()[0].disabled,false);f.menu.dispose();
});
test('close and stop are distinct; external close does not loop back to the owner',async()=>{
  const f=fixture();f.menu.show(sofa);f.find('home-quick-stop').dispatch('click');await flush();
  assert.deepEqual(f.calls,[['stop','furniture:sofa-1']]);assert.equal(f.menu.isOpen,true);
  f.find('home-quick-close').dispatch('click');assert.equal(f.menu.isOpen,false);assert.deepEqual(f.calls.at(-1),['close']);
  const count=f.calls.length;f.menu.show(sofa);f.menu.close();assert.equal(f.calls.length,count);f.menu.dispose();assert.equal(f.doc.body.children.length,0);
});
test('the dock contains wheel/drag events and Escape while preserving keyboard button activation',()=>{
  const f=fixture();f.menu.show(sofa);for(const type of['pointerdown','pointerup','dblclick','contextmenu','wheel'])assert.equal(f.root.dispatch(type).stopped,true);
  assert.equal(f.root.dispatch('keydown',{key:' '}).stopped,true);
  const event=f.root.dispatch('keydown',{key:'Escape'});assert.equal(event.prevented,true);assert.equal(f.menu.isOpen,false);f.menu.dispose();
});
test('toilet sit does not borrow sofa art and text is never inserted as markup',()=>{
  const f=fixture();f.menu.show({targetId:'furniture:toilet',title:'<script>bad</script>',actions:[{id:'toilet',kind:'sit',icon:'toilet',label:"DisplayText4090"}]});
  assert.equal(f.find('home-quick-title').textContent,'<script>bad</script>');assert.equal(f.buttons()[0].children[0].children.length,0);
  assert.match(f.buttons()[0].children[0].innerHTML,/<svg/);f.menu.dispose();
});

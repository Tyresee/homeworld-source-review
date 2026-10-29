import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {applyHomeTheme,preserveHomeTheme} from '../public/js/home-theme.js';

const source=await readFile(new URL('../public/js/student-homes.js',import.meta.url),'utf8');
function fixture(){
  class Element{
    constructor(){this.events={};this.attributes={};this.dataset={};this.style={setProperty(){}};this.children=[];this.hidden=true;this.disabled=false;}
    setAttribute(name,value){this.attributes[name]=String(value);}addEventListener(name,callback){this.events[name]=callback;}append(...children){this.children.push(...children);}focus(){}
  }
  const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  const document={getElementById:$,createElement:()=>new Element(),createTextNode:text=>text,addEventListener(){},querySelectorAll:()=>[]};
  const calls={camera:0,stand:0,dance:0};let view='interior';
  const scene={getView:()=>view,toggleStageCamera(){calls.camera++;return {ok:true};},standAvatar(){calls.stand++;},toggleStage(){calls.dance++;}};
  const context={document,applyHomeTheme,preserveHomeTheme,addEventListener(){},createStudentHomeContextMenu:()=>({close(){}})};
  const executable=source.replace(/^import[^\n]+\n/gm,'').replace(/\nboot\(\);\s*$/,'');
  runInNewContext(executable+`\nglobalThis.ui={syncStageCamera,syncView,busy,bind:(value,renderer)=>{home=value;scene=renderer;syncStageCamera();}};`,context);
  return {$,calls,scene,ui:context.ui,setView:value=>{view=value;context.ui.syncView(value);},bind:value=>context.ui.bind(value?{id:'isolated-home'}:null,scene)};
}

test('camera button shows exit during automatic shots and follow after returning, independently of stopping the dance',()=>{
  const f=fixture();f.bind(true);const button=f.$('stage-camera-toggle');
  assert.equal(button.hidden,true);f.ui.syncStageCamera({active:true,returning:false,available:true,suppressed:false});
  assert.equal(button.hidden,false);assert.equal(button.disabled,false);assert.equal(button.textContent,"DisplayText3761");assert.equal(button.attributes['aria-pressed'],'true');assert.match(button.title,/DisplayText4218/);
  button.events.click();assert.equal(f.calls.camera,1);assert.equal(f.calls.stand,0);assert.equal(f.calls.dance,0);
  f.ui.syncStageCamera({active:false,returning:true,available:true,suppressed:true});assert.equal(button.disabled,true);assert.match(button.textContent,/DisplayText4611/);button.events.click();assert.equal(f.calls.camera,1,'return animation cannot queue another button request');
  f.ui.syncStageCamera({active:false,returning:false,available:true,suppressed:true});assert.equal(button.disabled,false);assert.equal(button.textContent,"DisplayText3762");assert.equal(button.attributes['aria-pressed'],'false');button.events.click();assert.equal(f.calls.camera,2);
});

test('camera UI is hidden without a student, outside or after a reset, and disabled throughout saving',()=>{
  const f=fixture(),state={active:true,returning:false,available:true,suppressed:false},button=f.$('stage-camera-toggle');
  f.ui.syncStageCamera(state);assert.equal(button.hidden,true);button.events.click();assert.equal(f.calls.camera,0);
  f.bind(true);assert.equal(button.hidden,false);f.ui.busy(true);assert.equal(button.disabled,true);button.events.click();assert.equal(f.calls.camera,0);f.ui.busy(false);assert.equal(button.disabled,false);
  f.setView('estate');assert.equal(button.hidden,true);f.setView('building');assert.equal(button.hidden,true);f.setView('interior');assert.equal(button.hidden,false);
  f.ui.syncStageCamera({active:false,returning:false,available:false,suppressed:false});assert.equal(button.hidden,true);f.bind(false);assert.equal(button.hidden,true);
});

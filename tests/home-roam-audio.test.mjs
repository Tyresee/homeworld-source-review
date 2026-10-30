import test from 'node:test';
import assert from 'node:assert/strict';
import {createHomeRoamAudio} from '../public/js/home-roam-audio.js';

function contextFactory() {
  const contexts=[];
  class Context {
    constructor(){this.currentTime=2;this.sampleRate=100;this.destination={};this.state='suspended';this.nodes=[];contexts.push(this);}
    parameter(){return {value:0,events:[],setValueAtTime(...values){this.events.push(['set',...values]);},setTargetAtTime(...values){this.events.push(['target',...values]);},linearRampToValueAtTime(...values){this.events.push(['linear',...values]);},exponentialRampToValueAtTime(...values){this.events.push(['exp',...values]);}};}
    node(){const node={disconnects:0,connections:[],connect(other){this.connections.push(other);return other;},disconnect(){this.disconnects++;}};this.nodes.push(node);return node;}
    createGain(){const node=this.node();node.gain=this.parameter();return node;}
    createBiquadFilter(){const node=this.node();node.frequency=this.parameter();node.Q=this.parameter();return node;}
    createBufferSource(){const node=this.node();node.start=function(){this.started=true;};node.stop=function(time){this.stopped=time??true;};return node;}
    createBuffer(channels,length){const data=new Float32Array(length);return {getChannelData:()=>data};}
    resume(){this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
  }
  return {Context,contexts};
}

test('WebAudio is never created by construction, mute settings or unprimed sound requests',()=>{
  const {Context,contexts}=contextFactory(),audio=createHomeRoamAudio({AudioContextClass:Context});
  assert.equal(contexts.length,0);audio.setMuted(true);assert.equal(audio.play('water',true,'tap'),false);assert.equal(contexts.length,0);
  assert.equal(audio.unlock(),true);assert.equal(contexts.length,1);assert.equal(contexts[0].state,'running');assert.equal(audio.getState().muted,true);audio.unlock();assert.equal(contexts.length,1);
  audio.dispose();assert.equal(contexts[0].state,'closed');assert.equal(audio.unlock(),false);
});

test('filtered water and gas voices are owner-deduplicated, stoppable and muted through one master',()=>{
  const {Context,contexts}=contextFactory(),audio=createHomeRoamAudio({AudioContextClass:Context,random:()=>.5});audio.unlock();
  assert.equal(audio.play('water',true,'sink'),true);assert.equal(audio.play('water',true,'sink'),true);assert.equal(audio.getState().activeLoops,1);assert.equal(audio.play('gas',true,'hob'),true);assert.equal(audio.getState().activeLoops,2);
  assert.deepEqual(contexts[0].nodes.filter(node=>node.type==='bandpass').map(node=>node.frequency.value),[1300,3200]);
  audio.setMuted(true);const master=contexts[0].nodes[0];assert.ok(master.gain.events.some(row=>row[0]==='target'&&row[1]===0));
  audio.setMuted(false);assert.ok(master.gain.events.some(row=>row[0]==='target'&&row[1]===1));audio.play('water',false,'sink');assert.equal(audio.getState().activeLoops,1);audio.play('gas',false,'hob');assert.equal(audio.getState().activeLoops,0);assert.ok(contexts[0].nodes.filter(node=>node.started).every(node=>node.stopped===2.5));audio.dispose();
});

test('click, slide and timed flush synthesize bounded noise voices without files or timers',()=>{
  const {Context,contexts}=contextFactory(),audio=createHomeRoamAudio({AudioContextClass:Context});audio.unlock();
  for(const kind of['click','slide','flush'])assert.equal(audio.play(kind),true);
  assert.equal(audio.play('unrecognized'),false);assert.equal(audio.getState().activeLoops,0);audio.dispose();assert.equal(contexts[0].state,'closed');assert.equal(audio.play('click'),false);
});

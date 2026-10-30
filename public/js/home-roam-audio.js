/** Ephemeral, gesture-unlocked room sounds. No media files or account state. */
export function createHomeRoamAudio({muted=false, AudioContextClass=null, random=Math.random}={}) {
  let context=null,master=null,noise=null,disposed=false;
  const loops=new Map(),voices=new Set();

  function unlock() {
    if(disposed)return false;
    if(!context) {
      const Context=AudioContextClass??globalThis.AudioContext??globalThis.webkitAudioContext;
      if(!Context)return false;
      try {context=new Context();master=context.createGain();master.gain.value=muted?0:1;master.connect(context.destination);}
      catch {context=null;return false;}
    }
    if(context.state==='suspended')context.resume()?.catch?.(()=>{});
    return true;
  }
  function noiseBuffer() {
    if(!noise) {
      noise=context.createBuffer(1,Math.floor(context.sampleRate*2),context.sampleRate);
      const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=random()*2-1;
    }
    return noise;
  }
  function voice(filterType,frequency,q=1) {
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=noiseBuffer();source.loop=true;filter.type=filterType;filter.frequency.value=frequency;filter.Q.value=q;
    source.connect(filter);filter.connect(gain);gain.connect(master);
    const row={source,filter,gain};voices.add(row);
    source.onended=()=>{voices.delete(row);for(const node of[source,filter,gain])node.disconnect();};
    return row;
  }
  function stop(row,time=context?.currentTime??0) {try{row.source.stop(time);}catch{/* already stopped */}}
  function play(kind,on=true,owner='default') {
    // Deliberately do not unlock here: callers must be in a real click handler.
    if(disposed||!context||!['click','slide','flush','water','gas'].includes(kind))return false;
    const now=context.currentTime;
    if(kind==='water'||kind==='gas') {
      let owned=loops.get(owner);if(!owned){owned=new Map();loops.set(owner,owned);}
      const previous=owned.get(kind);
      if(!on) {
        if(previous){previous.gain.gain.setTargetAtTime(0,now,.07);stop(previous,now+.5);owned.delete(kind);}
        if(!owned.size)loops.delete(owner);return !!previous;
      }
      if(previous)return true;
      const row=voice('bandpass',kind==='water'?1300:3200,kind==='water'?.5:1.4);
      row.gain.gain.value=0;row.gain.gain.setTargetAtTime(kind==='water'?.15:.04,now,.12);row.source.start();owned.set(kind,row);return true;
    }
    if(!on)return false;
    if(kind==='flush') {
      const row=voice('lowpass',2800);row.filter.frequency.setValueAtTime(2800,now);row.filter.frequency.exponentialRampToValueAtTime(320,now+2.8);
      row.gain.gain.setValueAtTime(0,now);row.gain.gain.linearRampToValueAtTime(.32,now+.12);row.gain.gain.setTargetAtTime(0,now+1.7,.5);
      row.source.start();stop(row,now+4.5);return true;
    }
    const slide=kind==='slide',duration=slide?.3:.045,row=voice(slide?'lowpass':'highpass',slide?650:2600);
    row.gain.gain.setValueAtTime(slide?.16:.28,now);row.gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    row.source.start();stop(row,now+duration+.02);return true;
  }
  function setMuted(value) {muted=!!value;if(master)master.gain.setTargetAtTime(muted?0:1,context.currentTime,.03);return muted;}
  function dispose() {
    if(disposed)return;disposed=true;loops.clear();
    for(const row of voices){stop(row);for(const node of[row.source,row.filter,row.gain])node.disconnect();}voices.clear();master?.disconnect();
    context?.close()?.catch?.(()=>{});context=null;master=null;noise=null;
  }
  return {unlock,play,setMuted,getMuted:()=>muted,getState:()=>({initialized:!!context,muted,activeLoops:[...loops.values()].reduce((n,rows)=>n+rows.size,0),disposed}),dispose};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {HOME_ROAM_DEFAULT_LOCALE,HOME_ROAM_COPY,getHomeRoamCopy,resolveHomeRoamLocale,formatHomeRoamTitle} from '../public/js/home-roam-copy.js';

test('the classroom view uses the specified shared product labels rather than logic-local strings',()=>{
  const copy=getHomeRoamCopy();
  assert.equal(copy,HOME_ROAM_COPY[HOME_ROAM_DEFAULT_LOCALE]);
  assert.equal(copy.dock,"Visit");assert.equal(copy.statusExterior,"Viewing: Exterior");assert.equal(copy.statusInterior,"Viewing: Interior");
  assert.equal(copy.doorTip,"Click the door to enter");assert.equal(copy.leave,"Leave");assert.equal(copy.exampleTitle,"Example home · Free visit");
  assert.equal(copy.homeTitle,"{name}'s home · Free visit");assert.equal(copy.faucetOn,"Turn tap on");assert.equal(copy.faucetOff,"Turn tap off");
  assert.equal(copy.flush,"Flush");assert.equal(copy.floorLampOn,"Turn floor lamp on");assert.equal(copy.floorLampOff,"Turn floor lamp off");
  assert.equal(copy.hobOn,"Light hob");assert.equal(copy.hobOff,"Turn hob off");assert.equal(copy.ceilingOn,"Turn light on");assert.equal(copy.ceilingOff,"Turn light off");
  assert.equal(copy.drawerOpen,"Open drawer");assert.equal(copy.drawerClose,"Close drawer");assert.equal(copy.cabinetOpen,"Open cabinet door");assert.equal(copy.cabinetClose,"Close cabinet door");
});

test('explicit locale and URL selection resolve without document, storage or account access',()=>{
  assert.equal(resolveHomeRoamLocale(undefined,{search:'?theme=warm&locale=en'}),'en');
  assert.equal(resolveHomeRoamLocale('zh_CN',{search:'?locale=en'}),'en');
  assert.equal(resolveHomeRoamLocale('en-GB',{search:'?locale=en'}),'en');
  assert.equal(resolveHomeRoamLocale('en'),'en');
  assert.equal(resolveHomeRoamLocale('unsupported',{search:'?locale=en'}),HOME_ROAM_DEFAULT_LOCALE);
  assert.equal(resolveHomeRoamLocale(undefined,{search:'?theme=warm'}),HOME_ROAM_DEFAULT_LOCALE);
  assert.equal(getHomeRoamCopy('en').doorTip,'Click the door to enter');
});

test('both language tables have complete immutable controls, action labels and mode-specific help',()=>{
  assert.deepEqual(Object.keys(HOME_ROAM_COPY.en).sort(),Object.keys(HOME_ROAM_COPY['en']).sort());
  for(const copy of Object.values(HOME_ROAM_COPY)){
    assert.ok(Object.isFrozen(copy));assert.equal(copy.outsideHelp.length,7);assert.equal(copy.insideHelp.length,10);
    for(const[key,value]of Object.entries(copy)){
      if(Array.isArray(value)){assert.ok(Object.isFrozen(value));for(const row of value){assert.ok(Object.isFrozen(row));assert.equal(row.length,2);assert.ok(row.every(text=>typeof text==='string'&&text.length>0));}}
      else assert.equal(typeof value,'string',key);
    }
    assert.throws(()=>{copy.dock='bad';},TypeError);assert.throws(()=>copy.insideHelp.push(['X','bad']),TypeError);
  }
  assert.equal(/[\p{Script=Han}]/u.test(JSON.stringify(HOME_ROAM_COPY.en)),false);
});

test('student titles interpolate only the name, while examples and empty identities use the shared fallback',()=>{
  for(const locale of ['en','en']){
    const copy=getHomeRoamCopy(locale);
    assert.equal(formatHomeRoamTitle(' Sam ',locale),copy.homeTitle.replace('{name}','Sam'));
    assert.equal(formatHomeRoamTitle('<b>Sam</b>',locale),copy.homeTitle.replace('{name}','<b>Sam</b>'),'the UI receives plain text, never an HTML template');
    assert.equal(formatHomeRoamTitle('$&',locale),copy.homeTitle.replace('{name}',()=>'$&'),'identity text is not interpreted as replacement syntax');
    for(const name of ['',undefined,null,'  '])assert.equal(formatHomeRoamTitle(name,locale),copy.exampleTitle);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {subtractRectangles,getUnionArea,rectDifferenceArea,isConstructionRect,constructionCellsToRects} from '../public/js/home-construction-grid.js';

const r=(minX,minZ,width,depth)=>({minX,minZ,width,depth});
const touchesInterior=(a,b)=>Math.min(a.minX+a.width,b.minX+b.width)-Math.max(a.minX,b.minX)>1e-7
  &&Math.min(a.minZ+a.depth,b.minZ+b.depth)-Math.max(a.minZ,b.minZ)>1e-7;
function assertDifference(selected,built) {
  const before=structuredClone({selected,built}),difference=subtractRectangles(selected,built);
  assert.deepEqual({selected,built},before,'geometry calculation must not mutate saved floor geometry');
  assert.equal(getUnionArea(difference),rectDifferenceArea(selected,built));
  assert.ok(difference.every(isConstructionRect));
  for(const rect of difference)assert.ok(built.every(old=>!touchesInterior(rect,old)),'preview must never highlight an already built area');
  for(let i=0;i<difference.length;i++)for(let j=i+1;j<difference.length;j++)assert.equal(touchesInterior(difference[i],difference[j]),false);
  return difference;
}
test('larger rectangle preview subtracts the completed house and keeps only its extension',()=>{
  assert.deepEqual(assertDifference([r(-2.8,-2.6,8.4,5.2)],[r(-2.8,-2.6,5.6,5.2)]),[r(2.8,-2.6,2.8,5.2)]);
  assert.deepEqual(assertDifference([r(-2.8,-2.6,5.6,5.2)],[r(-2.8,-2.6,8.4,5.2)]),[]);
});
test('partially built edge cells retain only their uncovered 0.2 metre increments',()=>{
  const selection=constructionCellsToRects([{cx:5,cz:0},{cx:5,cz:1},{cx:5,cz:0}]);
  assert.deepEqual(assertDifference(selection,[r(-2.8,-2.6,5.6,5.2)]),[r(2.8,-2.6,.4,2)]);
  assert.deepEqual(assertDifference([r(.1+.1,.2,1.2,1.2)],[r(.2,.2,.4+.2,1.2)]),[r(.8,.2,.6,1.2)]);
});
test('overlapping selections and existing slabs keep concave holes and never duplicate the preview',()=>{
  const selected=[r(0,0,6,6),r(2,2,6,6)],built=[r(1,1,2,2),r(2,2,2,2),r(4,0,2,2)];
  const difference=assertDifference(selected,built);
  assert.equal(getUnionArea(difference),45);
  assert.deepEqual(subtractRectangles([...selected].reverse(),[...built].reverse()),difference);
  assert.deepEqual(subtractRectangles(difference,built),difference);
});
test('touching boundaries and invalid input cannot create negative or off-grid preview pieces',()=>{
  assert.deepEqual(assertDifference([r(0,0,2,2)],[r(2,0,2,2),r(0,2,2,2)]),[r(0,0,2,2)]);
  assert.deepEqual(subtractRectangles([],[]),[]);
  for(const bad of [null,[r(0,0,.1,1)],[r(NaN,0,1,1)]])assert.throws(()=>subtractRectangles([r(0,0,1,1)],bad));
});

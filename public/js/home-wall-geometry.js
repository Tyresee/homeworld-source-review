import * as THREE from 'three';

/** Cut only the existing triangles at room boundaries. No new wall, window,
 * end cap or collision solid is introduced; all holes stay exactly as built. */
export function clipWallGeometryInterval(mesh,from,to,axis='x') {
  const geometry=mesh.geometry,position=geometry?.attributes.position;
  if(!position||to-from<=1e-7)return null;
  mesh.updateMatrix();
  const attributes=Object.entries(geometry.attributes),buffers=Object.fromEntries(attributes.map(([key])=>[key,[]]));
  const index=geometry.index,count=index?.count??position.count,point=new THREE.Vector3();
  function vertex(i) {
    const out={};for(const[name,attribute]of attributes)out[name]=Array.from({length:attribute.itemSize},(_,n)=>attribute.getComponent(i,n));
    point.fromArray(out.position).applyMatrix4(mesh.matrix);out.coordinate=point[axis];return out;
  }
  function interpolate(a,b,t){const out={coordinate:a.coordinate+(b.coordinate-a.coordinate)*t};for(const[name]of attributes)out[name]=a[name].map((value,i)=>value+(b[name][i]-value)*t);return out;}
  function clip(input,bound,above) {
    const output=[];if(!input.length)return output;
    for(let i=0;i<input.length;i++) {
      const a=input[i],b=input[(i+1)%input.length],insideA=above?a.coordinate>=bound-1e-9:a.coordinate<=bound+1e-9,insideB=above?b.coordinate>=bound-1e-9:b.coordinate<=bound+1e-9;
      if(insideA)output.push(a);if(insideA!==insideB)output.push(interpolate(a,b,(bound-a.coordinate)/(b.coordinate-a.coordinate)));
    }return output;
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<count;i+=3) {
    const triangle=[vertex(index?index.getX(i):i),vertex(index?index.getX(i+1):i+1),vertex(index?index.getX(i+2):i+2)];
    const polygon=clip(clip(triangle,from,true),to,false);
    for(let j=1;j<polygon.length-1;j++) {
      const vertices=[polygon[0],polygon[j],polygon[j+1]];
      a.fromArray(vertices[0].position);b.fromArray(vertices[1].position);c.fromArray(vertices[2].position);
      if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-20)continue;
      for(const v of vertices)for(const[name]of attributes)buffers[name].push(...v[name]);
    }
  }
  if(!buffers.position.length)return null;
  const result=new THREE.BufferGeometry();for(const[name,attribute]of attributes)result.setAttribute(name,new THREE.Float32BufferAttribute(buffers[name],attribute.itemSize));
  result.computeBoundingBox();result.computeBoundingSphere();return result;
}

/** Partition existing triangles by outward face normal, without adding caps. */
export function splitWallGeometryFaces(mesh,geometry,alongAxis='x') {
  mesh.updateMatrix();const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrix),attributes=Object.entries(geometry.attributes),index=geometry.index,position=geometry.attributes.position;
  const normal=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),perpendicular=alongAxis==='x'?'z':'x';
  const buckets={negative:Object.fromEntries(attributes.map(([key])=>[key,[]])),positive:Object.fromEntries(attributes.map(([key])=>[key,[]])),trim:Object.fromEntries(attributes.map(([key])=>[key,[]]))};
  for(let i=0;i<(index?.count??position.count);i+=3) {
    const vertices=[0,1,2].map(n=>index?index.getX(i+n):i+n);
    a.fromBufferAttribute(position,vertices[0]);b.fromBufferAttribute(position,vertices[1]);c.fromBufferAttribute(position,vertices[2]);
    normal.copy(b).sub(a).cross(c.sub(a)).normalize().applyNormalMatrix(normalMatrix);
    const large=Math.abs(normal[perpendicular])>=Math.max(Math.abs(normal.y),Math.abs(normal[alongAxis]))-1e-7;
    const bucket=buckets[large?(normal[perpendicular]<0?'negative':'positive'):'trim'];
    for(const vertex of vertices)for(const[name,attribute]of attributes)for(let n=0;n<attribute.itemSize;n++)bucket[name].push(attribute.getComponent(vertex,n));
  }
  return Object.entries(buckets).filter(([,data])=>data.position.length).map(([face,data])=>{const result=new THREE.BufferGeometry();for(const[name,attribute]of attributes)result.setAttribute(name,new THREE.Float32BufferAttribute(data[name],attribute.itemSize));result.computeBoundingBox();result.computeBoundingSphere();return{face,geometry:result};});
}

/** Resolve room-facing portions of an existing wall. Returns null for an
 * unchanged single-owner wall, so isolated fixtures retain their exact mesh. */
export function createSharedWallFaceMeshes(mesh,rooms,{axis='x',rectForRoom,includePublic=false,defaultSurfaceId=axis==='x'?'wall.inner':'wall.side',trimColor='#f4efe6'}={}) {
  if(!rectForRoom)throw new TypeError('A room rectangle resolver is required');
  mesh.updateMatrix();mesh.geometry.computeBoundingBox();const localBounds=mesh.geometry.boundingBox,worldBounds=localBounds.clone().applyMatrix4(mesh.matrix),perpendicular=axis==='x'?'z':'x';
  const from=worldBounds.min[axis],to=worldBounds.max[axis],originalRoom=mesh.userData.roomId??'living';
  const rects=rooms.map(room=>({room,rect:rectForRoom(room)})).filter(({rect})=>rect&&(perpendicular==='x'?rect.minX<worldBounds.max.x+.045&&rect.maxX>worldBounds.min.x-.045:rect.minZ<worldBounds.max.z+.045&&rect.maxZ>worldBounds.min.z-.045));
  // Snap room bounds to the actual Float32 end planes. A microscopic final
  // interval can still contain an entire end cap and must not be discarded.
  const cuts=[...new Set([from,to,...rects.flatMap(({rect})=>axis==='x'?[rect.minX,rect.maxX]:[rect.minZ,rect.maxZ])].filter(value=>value>=from-1e-6&&value<=to+1e-6).map(value=>Math.abs(value-from)<1e-6?from:Math.abs(value-to)<1e-6?to:value))].sort((a,b)=>a-b);
  const find=(mid,side)=>{const cross=side==='negative'?worldBounds.min[perpendicular]-.045:worldBounds.max[perpendicular]+.045,x=axis==='x'?mid:cross,z=axis==='x'?cross:mid;return rects.find(({rect})=>x>rect.minX+1e-7&&x<rect.maxX-1e-7&&z>rect.minZ+1e-7&&z<rect.maxZ-1e-7)?.room??null;};
  const intervals=cuts.slice(1).map((end,i)=>({from:cuts[i],to:end,negative:find((cuts[i]+end)/2,'negative'),positive:find((cuts[i]+end)/2,'positive')})).filter(row=>row.to-row.from>1e-7);
  const changed=intervals.some(row=>['negative','positive'].some(side=>row[side]?row[side].id!==originalRoom:includePublic));
  if(!changed)return null;
  const result=[];
  for(const interval of intervals) {
    const clipped=clipWallGeometryInterval(mesh,interval.from,interval.to,axis);if(!clipped)continue;
    for(const {face,geometry}of splitWallGeometryFaces(mesh,clipped,axis)) {
      const owner=face==='trim'?null:interval[face],material=mesh.material.clone(),copy=new THREE.Mesh(geometry,material);
      copy.position.copy(mesh.position);copy.quaternion.copy(mesh.quaternion);copy.scale.copy(mesh.scale);copy.castShadow=mesh.castShadow;copy.receiveShadow=mesh.receiveShadow;copy.name=mesh.name;
      const surfaceId=face==='trim'?null:owner&&owner.id!=='living'?`room:${owner.id}.wall`:defaultSurfaceId;
      copy.userData={...mesh.userData,roomId:owner?.id??null,roomKind:owner?.kind??null,wallFace:face,wallTextureAxis:mesh.userData.wallTextureAxis??axis,wallTextureMinY:localBounds.min.y};
      delete copy.userData.themeRoomId;
      if(surfaceId)copy.userData.surfaceId=surfaceId;else{delete copy.userData.surfaceId;copy.userData.wallNeutralTrim=true;material.map=null;material.color.set(trimColor);}
      result.push(copy);
    }
    clipped.dispose();
  }
  return result;
}

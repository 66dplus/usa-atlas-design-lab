import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// D3's stream projects geographic rings before Three triangulates them.
// Even-odd nesting keeps lake holes and detached islands under the same county ID.
export function projectedShapes(feature, projection, stream) {
  const rings=[];let ring;
  stream(feature,projection.stream({
    polygonStart(){},polygonEnd(){},
    lineStart(){ring=[];},lineEnd(){if(ring.length>=3)rings.push(ring);},
    point(x,y){if(!Number.isFinite(x+y))throw new Error('Non-finite geographic boundary');ring.push(new THREE.Vector2((x-600)/100,(375-y)/100));}
  }));
  const path=new THREE.ShapePath();path.userData={style:{fillRule:'evenodd'}};
  for(const points of rings){
    if(Math.abs(THREE.ShapeUtils.area(points))<1e-12)continue;
    path.moveTo(points[0].x,points[0].y);
    for(const point of points.slice(1))path.lineTo(point.x,point.y);
    path.currentPath.closePath();
  }
  return path.toShapes();
}

const cache=new WeakMap();
export function footprints(geo, stream) {
  const result=geo.counties.map(feature=>{
    if(cache.has(feature.feature))return cache.get(feature.feature);
    const shapes=projectedShapes(feature.feature,geo.projection,stream);
    if(!shapes.length)throw new Error('No 3D boundary for '+feature.id+'. Use 2D while this boundary is repaired.');
    const geometry=new THREE.ExtrudeGeometry(shapes,{depth:1,bevelEnabled:false,steps:1,curveSegments:1});
    geometry.rotateX(-Math.PI/2);geometry.deleteAttribute('uv');geometry.clearGroups();
    const row={feature,geometry,shapes};cache.set(feature.feature,row);return row;
  });
  return result;
}

export function stateMesh(rows, values, {height,color,center,selectedId,heightValue=values}) {
  const parts=[],edges=[],selectedEdges=[],perimeter=new Map();
  const vertexKey=p=>`${Math.round(p.x*1e7)},${Math.round(p.y*1e7)}`;
  for(const {feature,geometry,shapes} of rows){
    const v=values(feature),relief=heightValue(feature),h=.0015+(relief==null?0:relief*height);
    const part=geometry.clone(),positions=part.attributes.position,normals=part.attributes.normal;
    const colors=new Float32Array(positions.count*3),ids=new Float32Array(positions.count);
    const tint=new THREE.Color(color(v));
    for(let i=0;i<positions.count;i++){
      positions.setXYZ(i,positions.getX(i)-center.x,positions.getY(i)*h,positions.getZ(i)-center.z);
      const shade=normals.getY(i)>.5?1:.65;
      colors.set([tint.r*shade,tint.g*shade,tint.b*shade],i*3);ids[i]=Number(feature.id);
    }
    part.setAttribute('color',new THREE.BufferAttribute(colors,3));part.setAttribute('county',new THREE.BufferAttribute(ids,1));parts.push(part);
    for(const shape of shapes){
      const points=shape.extractPoints(1);
      for(const ring of [points.shape,...points.holes])for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length];
        const edge=[a.x-center.x,h+.00002,-a.y-center.z,b.x-center.x,h+.00002,-b.y-center.z];edges.push(...edge);if(feature.id===selectedId)selectedEdges.push(...edge);
        const ka=vertexKey(a),kb=vertexKey(b);if(ka===kb)continue;
        const key=ka<kb?ka+'|'+kb:kb+'|'+ka,previous=perimeter.get(key);
        if(previous)previous.count++;else perimeter.set(key,{count:1,edge});
      }
    }
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  if(!merged)throw new Error('County mesh could not be assembled');
  merged.computeBoundingBox();
  const mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(edges,3)),new THREE.LineBasicMaterial({color:'#3a2032',transparent:true,opacity:.38,depthWrite:false}));
  const selection=selectedEdges.length?new LineSegments2(new LineSegmentsGeometry().setPositions(selectedEdges),new LineMaterial({color:'#ffffff',linewidth:2.5,depthTest:true,depthWrite:false})):null;
  if(selection)selection.renderOrder=4;
  const boundary=[...perimeter.values()].filter(e=>e.count===1).flatMap(e=>e.edge);
  const outline=new LineSegments2(new LineSegmentsGeometry().setPositions(boundary),new LineMaterial({color:'#ffe9bc',linewidth:1.2,transparent:true,opacity:.8,depthTest:true,depthWrite:false}));
  outline.renderOrder=3;
  return {mesh,lines,outline,selection};
}

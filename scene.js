import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import {field,noise,palettes,colorAt} from './field.js';

const spherePoint=(lon,lat,r)=>{const a=lon*Math.PI/180,b=lat*Math.PI/180;return new THREE.Vector3(r*Math.cos(b)*Math.cos(a),r*Math.sin(b),-r*Math.cos(b)*Math.sin(a));};
const mapPoint=(x,y,h=0)=>new THREE.Vector3((x-600)/100,h,(y-375)/100);

export class AtlasScene {
 constructor(host,geo,onFailure){
  this.host=host;this.geo=geo;this.group=new THREE.Group();this.scene=new THREE.Scene();this.scene.add(this.group);
  this.camera=new THREE.PerspectiveCamera(40,1,.02,100);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0,0);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
  this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.renderer.domElement.setAttribute('aria-label','Interactive geographic scene. Drag to rotate. Use the camera buttons to zoom and reset.');
  this.renderer.domElement.setAttribute('role','img');host.append(this.renderer.domElement);
  this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onFailure('The graphics context was interrupted. Reload the page to restore 3D.');});
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=false;this.controls.enablePan=false;
  this.controls.addEventListener('change',()=>this.render());
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
  this.scene.add(new THREE.AmbientLight(0xffffff,1.0));
  this.key=new THREE.DirectionalLight(0xfff5e5,1.6);this.key.position.set(-4,9,5);this.scene.add(this.key);
  this.key.castShadow=true;this.key.shadow.mapSize.set(2048,2048);Object.assign(this.key.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.5,far:30});this.key.shadow.bias=-.0003;
  this.fill=new THREE.DirectionalLight(0xa8c5ff,.5);this.fill.position.set(6,3,-5);this.scene.add(this.fill);
  this.textures={};this.generation=0;this.onFailure=onFailure;this.resize();
 }
 resize(){const r=this.host.getBoundingClientRect();if(!r.width||!r.height)return;this.renderer.setSize(r.width,r.height);this.camera.aspect=r.width/r.height;this.camera.zoom=Math.min(1,r.width/700);this.camera.updateProjectionMatrix();this.render();}
 render(){this.renderer.render(this.scene,this.camera);}
 clear(){
  while(this.group.children.length){const o=this.group.children[0];this.group.remove(o);o.traverse(n=>{n.geometry?.dispose();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>{if(m.map&&!Object.values(this.textures).includes(m.map))m.map.dispose();m.dispose();});});}
 }
 async texture(path){if(this.textures[path])return this.textures[path];const t=await new THREE.TextureLoader().loadAsync(path);t.colorSpace=path.includes('normal')?THREE.NoColorSpace:THREE.SRGBColorSpace;t.anisotropy=4;this.textures[path]=t;return t;}
 async show(kind,metric){
  const generation=++this.generation;this.kind=kind;this.metric=metric;this.clear();
  this.renderer.toneMappingExposure=kind==='orbital'?1.25:.95;
  if(kind==='orbital'||kind==='engraved'){
   const textures=kind==='orbital'?await Promise.all([this.texture('assets/earth-silver.jpg'),this.texture('assets/earth-normal.jpg')]):[];
   if(generation!==this.generation)return;
   this.globe(kind,metric,textures);
  }else this.plane(kind,metric);
  this.reset();this.render();
 }
 reset(){
  const globe=['orbital','engraved'].includes(this.kind);
  this.controls.target.set(0,0,0);this.camera.up.set(0,1,0);
  if(globe){this.camera.position.copy(spherePoint(-100,38,this.kind==='orbital'?9.4:10.7));this.controls.minDistance=6.1;this.controls.maxDistance=20;this.controls.maxPolarAngle=Math.PI;}
  else {this.controls.target.set(0,this.kind==='strata'?1.3:.45,0);this.camera.position.set(this.kind==='strata'?6:.3,this.kind==='strata'?7.7:6.6,this.kind==='strata'?10.2:7.6);this.controls.minDistance=6;this.controls.maxDistance=25;this.controls.maxPolarAngle=Math.PI*.48;}
  this.camera.lookAt(this.controls.target);this.controls.update();this.render();
 }
 zoom(factor){this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);this.controls.update();this.render();}
 rotate(){const v=this.camera.position.clone().sub(this.controls.target);v.applyAxisAngle(new THREE.Vector3(0,1,0),.18);this.camera.position.copy(v.add(this.controls.target));this.camera.lookAt(this.controls.target);this.controls.update();this.render();}
 lines(geometry,r,color,opacity=.5){
  const coords=[];
  const lines=geometry.type==='MultiLineString'?geometry.coordinates:geometry.type==='MultiPolygon'?geometry.coordinates.flat():geometry.type==='Polygon'?geometry.coordinates:[];
  for(const line of lines)for(let i=1;i<line.length;i++){const a=spherePoint(...line[i-1],r),b=spherePoint(...line[i],r);if(a.distanceTo(b)>1.5)continue;coords.push(...a.toArray(),...b.toArray());}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  return new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color,transparent:true,opacity,toneMapped:false}));
 }
 globe(kind,metric,textures){
  const engraved=kind==='engraved',r=4.5;
  let mat;
  if(engraved){
   const c=document.createElement('canvas');c.width=2048;c.height=1024;const ctx=c.getContext('2d');ctx.fillStyle='#e8e8dc';ctx.fillRect(0,0,c.width,c.height);
   const proj=d3.geoEquirectangular().translate([1024,512]).scale(2048/(2*Math.PI));const path=d3.geoPath(proj,ctx);
   ctx.beginPath();path(this.geo.world);ctx.fillStyle='#d5d9c9';ctx.fill();
   const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
   mat=new THREE.MeshBasicMaterial({map:tex,toneMapped:false});
  }else mat=new THREE.MeshStandardMaterial({map:textures[0],normalMap:textures[1],normalScale:new THREE.Vector2(.5,.5),color:'#9db4c2',roughness:.95,metalness:.02});
  this.group.add(new THREE.Mesh(new THREE.SphereGeometry(r,128,96),mat));
  this.group.add(this.lines(this.geo.globeLines,r+.012,engraved?'#818a75':'#688b98',engraved?.5:.24));
  this.group.add(this.lines(this.geo.usLines,r+.025,engraved?'#a1a382':'#c8f5ff',engraved?.55:.53));
  this.group.add(this.lines(this.geo.mainland,r+.038,engraved?'#a88742':'#beedfb',.95));
  const graticule=d3.geoGraticule().step([10,10])();this.group.add(this.lines(graticule,r+.009,engraved?'#9ea590':'#4a8d9d',engraved?.35:.13));
  const samples=this.geo.samples, dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  if(engraved){
   const positions=[],colors=[];
   for(const [x,y,lon,lat] of samples){const v=field(lon,lat,metric);if(noise(x,y)>v*1.65)continue;positions.push(...spherePoint(lon,lat,r+.032).toArray());colors.push(...new THREE.Color(v>.22?'#b38129':'#626e48').toArray());}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
   this.group.add(new THREE.Points(g,new THREE.PointsMaterial({size:.021,vertexColors:true,sizeAttenuation:true,toneMapped:false})));
  } else {
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.75,metalness:.04}),samples.length);
   for(let i=0;i<samples.length;i++){const [x,y,lon,lat]=samples[i],v=field(lon,lat,metric),h=.017+Math.pow(v,2.3)*.4;const n=spherePoint(lon,lat,1);dummy.position.copy(n.clone().multiplyScalar(r+h/2+.024));dummy.quaternion.setFromUnitVectors(up,n);dummy.scale.set(.0065,h,.0065);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(colorAt(palettes.orbital,Math.max(0,Math.min(1,v*3.2-.2)))));}
   mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;this.group.add(mesh);
   const atmos=new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{glowColor:{value:new THREE.Color('#44bbed')}},vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n;varying vec3 v;uniform vec3 glowColor;void main(){float rim=pow(max(0.0,1.0-abs(dot(n,v))),5.0);gl_FragColor=vec4(glowColor,rim*.45);}'});
   this.group.add(new THREE.Mesh(new THREE.SphereGeometry(r*1.024,96,64),atmos));
  }
 }
 landMesh(kind,metric,y=0){
  const data=new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${this.geo.nation}"/></svg>`);
  const group=new THREE.Group();const color=kind==='ember'?'#f5e3b6':kind==='porcelain'?'#edccd1':'#527b76';
  for(const path of data.paths)for(const shape of SVGLoader.createShapes(path)){
   const geometry=new THREE.ExtrudeGeometry(shape,{depth:kind==='strata'?9:2,bevelEnabled:false,steps:1});
   geometry.rotateX(Math.PI/2);geometry.scale(.01,.01,.01);geometry.translate(-6,y,-3.75);
   const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0}));mesh.receiveShadow=true;group.add(mesh);
  }
  // A high-resolution geographic texture attaches to the identical coordinate frame.
  const c=document.createElement('canvas');c.width=2400;c.height=1500;const ctx=c.getContext('2d');ctx.scale(2,2);const p=new Path2D(this.geo.nation);ctx.clip(p);
  const palette=palettes[kind==='strata'?'green':kind];
  const interpolate=d3.interpolateRgbBasis(palette);
  for(const [x,z,lon,lat] of this.geo.samples){const v=field(lon,lat,metric);ctx.fillStyle=interpolate(Math.min(1,v*1.8));ctx.fillRect(x-2,z-2,4.2,4.2);}
  ctx.strokeStyle=kind==='strata'?'#b1cfb3':'#fff7ed';ctx.lineWidth=.55;ctx.globalAlpha=.42;ctx.stroke(new Path2D(this.geo.states));
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(12,7.5),new THREE.MeshStandardMaterial({map:texture,transparent:true,alphaTest:.1,roughness:1,side:THREE.DoubleSide,depthWrite:true}));plane.rotation.x=-Math.PI/2;plane.position.y=y+.006;plane.receiveShadow=true;group.add(plane);
  return group;
 }
 plane(kind,metric){
  const layers=kind==='strata'?3:1;
  for(let layer=0;layer<layers;layer++){
   const y=layer*1.4,m=kind==='strata'?(metric+layer*3)%10:metric;this.group.add(this.landMesh(kind,m,y));
   const dummy=new THREE.Object3D(),samples=kind==='strata'?this.geo.samples:this.geo.samples.filter(([x,z,lon,lat])=>field(lon,lat,m)>.26||noise(x,z)<.13);
   const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:.7,metalness:0}),samples.length);
   for(let i=0;i<samples.length;i++){
    const [x,z,lon,lat]=samples[i],v=field(lon,lat,m),n=noise(x,z);
    const h=kind==='strata'?.025+v*v*.72:.008+Math.pow(v,2.2)*(kind==='ember'?1.65:1.5)*(.75+n*.45);
    dummy.position.copy(mapPoint(x,z,y+h/2+.015));dummy.scale.set(kind==='ember'?.012:.019,h,kind==='ember'?.012:.019);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    mesh.setColorAt(i,new THREE.Color(colorAt(palettes[kind==='strata'?(layer===2?'orbital':layer===1?'ember':'green'):kind],Math.min(1,v*1.17))));
   }
   mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.castShadow=true;this.group.add(mesh);
  }
  if(kind!=='strata'){
   const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.055;floor.receiveShadow=true;this.group.add(floor);
   for(const c of this.geo.cities.filter(c=>['Seattle','Los Angeles','Chicago','Houston','New York'].includes(c.name))){
    const anchor=mapPoint(...c.point,.08),end=anchor.clone().add(new THREE.Vector3(c.name==='New York'?1.1:-.7,.55,c.name==='Houston'?.6:-.6));
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor,end]),new THREE.LineBasicMaterial({color:'#796d68',transparent:true,opacity:.7}));this.group.add(line);
    const label=document.createElement('canvas');label.width=512;label.height=90;const ctx=label.getContext('2d');ctx.font='38px Georgia';ctx.fillStyle=kind==='ember'?'#4f4038':'#684457';ctx.strokeStyle=kind==='ember'?'#f7f2e9':'#f6efef';ctx.lineWidth=5;ctx.textAlign='center';ctx.strokeText(c.name,256,57);ctx.fillText(c.name,256,57);
    const texture=new THREE.CanvasTexture(label);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false}));sprite.position.copy(end).add(new THREE.Vector3(0,.13,0));sprite.scale.set(2,.35,1);this.group.add(sprite);
   }
  }
 }
 dispose(){this.generation++;this.observer.disconnect();this.controls.dispose();this.clear();Object.values(this.textures).forEach(t=>t.dispose());this.renderer.dispose();this.renderer.domElement.remove();}
}

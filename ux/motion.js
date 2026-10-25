// One interruptible owner for sheet entry/exit; cancellation never hides a reopened sheet.
const running = new WeakMap();
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isSurfaceOpen = node => !node.hidden&&!node.inert;
export function showSurface(node, open, {axis='y', distance=28, duration=260}={}) {
  const old=running.get(node),visible=!node.hidden;
  const opacity=visible?getComputedStyle(node).opacity:'0';
  const transform=visible?getComputedStyle(node).transform:null;
  old?.cancel();node.hidden=false;node.inert=!open;
  if(reducedMotion()){node.hidden=!open;running.delete(node);return Promise.resolve(true);}
  // Preserve the surface's authored placement (for example a centred comparison drawer).
  const base=getComputedStyle(node).transform,shift=(base==='none'?'':base+' ')+`translate${axis.toUpperCase()}(${distance}px)`;
  const animation=node.animate([{opacity,transform:transform||shift},{opacity:open?1:0,transform:open?base:shift}],{duration,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'});
  running.set(node,animation);
  return animation.finished.then(()=>{if(running.get(node)!==animation)return false;node.hidden=!open;animation.cancel();running.delete(node);return true;}).catch(()=>false);
}
export function slidePill(group, selected) {
  const items=[...group.querySelectorAll(':scope > button, :scope > a[data-page]')].filter(button=>button.dataset?.pill!=='skip'),index=items.indexOf(selected);
  if(index<0)return;
  group.style.setProperty('--slot',index);group.style.setProperty('--slots',items.length);
}
export function animateReplacement(node, change) {
  running.get(node)?.cancel();
  const scroll=node.scrollTop;change();node.scrollTop=scroll;
  if(reducedMotion()){running.delete(node);return;}
  const animation=node.animate([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
  running.set(node,animation);
  animation.finished.then(()=>{if(running.get(node)===animation)running.delete(node);}).catch(()=>{});
}

const layouts=new WeakMap();
export function captureMapLayout(container,maps) {
  const old=layouts.get(container);old?.animations.forEach(animation=>animation.cancel());old?.overlay.remove();layouts.delete(container);
  if(reducedMotion())return null;
  const bounds=container.getBoundingClientRect(),overlay=document.createElement('div');
  overlay.className='map-layout-transition';overlay.setAttribute('aria-hidden','true');
  Object.assign(overlay.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'3',overflow:'hidden'});
  for(const map of maps.filter(Boolean)){
    const rect=map.host.getBoundingClientRect();if(!rect.width||!rect.height||!map.initialized)continue;
    const surface=map.coverTransition();if(!surface)continue;
    const holder=document.createElement('div');
    Object.assign(holder.style,{position:'absolute',left:(rect.left-bounds.left)+'px',top:(rect.top-bounds.top)+'px',width:rect.width+'px',height:rect.height+'px',overflow:'hidden'});
    holder.append(surface);overlay.append(holder);
  }
  if(!overlay.childElementCount)return null;
  container.append(overlay);layouts.set(container,{overlay,animations:[]});return overlay;
}
/** @param {Element|null} container @param {HTMLElement|null} overlay
 * @param {{entering?:boolean,pane?:Element|null}} options */
export function animateMapLayout(container,overlay,{entering=false,pane}={}) {
  const owner=layouts.get(container);if(!overlay||owner?.overlay!==overlay)return Promise.resolve();
  const options={duration:entering?650:320,easing:'cubic-bezier(.16,1,.3,1)',fill:'both'};
  owner.animations.push(overlay.animate(entering?[
    {opacity:1,clipPath:'inset(0 0 0 0)'},
    {opacity:.8,clipPath:'inset(0 50% 0 0)',offset:.6},
    {opacity:0,clipPath:'inset(0 50% 0 0)'},
  ]:[{opacity:1},{opacity:0}],options));
  if(entering&&pane)owner.animations.push(pane.animate([
    {opacity:0,transform:'translateX(48px)'},{opacity:1,transform:'translateX(0)'},
  ],options));
  return Promise.all(owner.animations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{
    if(layouts.get(container)!==owner)return;
    owner.animations.forEach(animation=>animation.cancel());overlay.remove();layouts.delete(container);
  });
}

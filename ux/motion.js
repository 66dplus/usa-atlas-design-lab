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
  const buttons=[...group.querySelectorAll(':scope > button')].filter(button=>button.dataset?.pill!=='skip'),index=buttons.indexOf(selected);
  if(index<0)return;
  group.style.setProperty('--slot',index);group.style.setProperty('--slots',buttons.length);
}
export function animateReplacement(node, change) {
  running.get(node)?.cancel();
  const scroll=node.scrollTop;change();node.scrollTop=scroll;
  if(reducedMotion()){running.delete(node);return;}
  const animation=node.animate([{opacity:.65,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});
  running.set(node,animation);
  animation.finished.then(()=>{if(running.get(node)===animation)running.delete(node);}).catch(()=>{});
}

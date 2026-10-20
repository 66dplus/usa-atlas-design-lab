import snapshot from './snapshot/data.json';
export const snapshotCapturedAt=snapshot.capturedAt;
// shortcut: this local prototype bundles its verified snapshot for browser independence;
// switch to live reads and lazy geography assets during runtime integration.
// Build-time injection is scoped to preview.bundle.js. Existing atlas consumers
// continue using their live fetch. This prototype reads one labelled real snapshot.
async function snapshotFetch(input,options={}){
  if(options.method&&options.method!=='GET')throw new Error('The prototype snapshot is read-only.');
  const url=new URL(String(input),location.href);
  let payload;
  if(url.pathname==='/api/atlas/catalog')payload=snapshot.catalog;
  else if(url.pathname==='/api/atlas/observations')payload=snapshot.observations[url.searchParams.get('field')];
  else if(url.pathname==='/api/view-settings')payload={...snapshot.assets['/ux/view-settings.json'],savedAt:null};
  else payload=snapshot.assets[url.pathname];
  return new Response(JSON.stringify(payload??{error:'This resource is not in the prototype snapshot.'}),{status:payload?200:404,headers:{'Content-Type':'application/json'}});
}
export {snapshotFetch as fetch};

export function listPaths(spec){
  return Object.keys(spec.paths||{});
}
export function listMethods(spec, path){
  const node = (spec.paths||{})[path]||{};
  return Object.keys(node).filter(k=>['get','post','put','patch','delete'].includes(k));
}
export function listResponseStatuses(spec, path, method){
  const node = (((spec.paths||{})[path]||{})[method]||{}).responses||{};
  return Object.keys(node);
}
export function getJsonSchema(spec, {path, method, mode, status}){
  const op = (((spec.paths||{})[path]||{})[method]||{});
  if(mode==='request'){
    const rb = (op.requestBody||{}).content||{};
    const c = rb['application/json'] || Object.values(rb)[0];
    return c ? c.schema : null;
  } else {
    const resp = ((op.responses||{})[status]||{}).content||{};
    const c = resp['application/json'] || Object.values(resp)[0];
    return c ? c.schema : null;
  }
}
export function resolveLocalRef(spec, schema){
  if(!schema || !schema.$ref) return schema;
  const ref = schema.$ref;
  if(!ref.startsWith('#/')) return schema; // only local
  const path = ref.slice(2).split('/').map(decodeURIComponent);
  let cur = spec;
  for(const p of path){ cur = cur?.[p]; if(cur===undefined) return null; }
  return cur;
}

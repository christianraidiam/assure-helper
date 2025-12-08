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
  const pickJson = (content)=>{
    if(!content) return null;
    if(content['application/json']) return content['application/json'];
    const alt = Object.entries(content).find(([k])=>k[0].startsWith('application/json'));
    if(alt) return alt[1];
    return Object.values(content)[0] || null;
  };

  if(mode==='request'){
    let rb = op.requestBody;
    if(rb && rb.$ref) rb = resolveLocalRef(spec, rb);
    const chosen = pickJson(rb?.content);
    return chosen ? chosen.schema : null;
  } else {
    let resp = (op.responses||{})[status];
    if(resp && resp.$ref) resp = resolveLocalRef(spec, resp);
    const chosen = pickJson(resp?.content);
    return chosen ? chosen.schema : null;
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

// Collect textual business restrictions in descriptions containing "[Restrição]"
function splitRestrictions(desc){
  if(!desc || typeof desc!=='string' || !desc.includes('[Restrição]')) return [];
  const parts = desc.split(/\[Restrição\]\s*/i);
  const fieldDesc = (parts.shift()||'').trim();
  return parts
    .map(p=>p.trim())
    .filter(Boolean)
    .map(restriction=>({ fieldDesc, restriction }));
}

export function collectRestrictions(spec, schema, path='$'){
  const res=[];
  const visit=(node, curPath)=>{
    if(!node) return;
    if(node.$ref){
      const resolved = resolveLocalRef(spec, node);
      if(resolved) node = resolved;
    }
    const extracted = splitRestrictions(node.description);
    extracted.forEach(item=>{
      res.push({
        path: curPath,
        field: item.fieldDesc || '(no description)',
        restriction: item.restriction
      });
    });
    const branch = list=>{
      if(Array.isArray(list)) list.forEach(sub=>visit(sub, curPath));
    };
    branch(node.allOf);
    branch(node.oneOf);
    branch(node.anyOf);
    if(node.properties){
      for(const [k,v] of Object.entries(node.properties)){
        visit(v, `${curPath}.${k}`);
      }
    }
    if(node.items) visit(node.items, `${curPath}[]`);
    if(typeof node.additionalProperties==='object' && !Array.isArray(node.additionalProperties)){
      visit(node.additionalProperties, `${curPath}.{*}`);
    }
  };
  visit(schema, path);
  return res;
}

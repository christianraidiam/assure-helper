export function safeParse(str){
  try{ return { ok:true, value: JSON.parse(str) }; }catch(e){ return { ok:false, error: e.message }; }
}
export function pretty(obj){ return JSON.stringify(obj, null, 2); }
export function summarize(obj){
  let arrays=0, objects=0, keys=0;
  function walk(v){
    if(Array.isArray(v)){ arrays++; v.forEach(walk); }
    else if(v && typeof v==='object'){ objects++; for(const k in v){ keys++; walk(v[k]); } }
  }
  walk(obj);
  return { arrays, objects, keys };
}

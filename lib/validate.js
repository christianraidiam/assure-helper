// Minimal JSON validation against a (resolved) schema
export function validate(value, schema, path='$'){
  const errors=[];
  if(!schema) return { valid:true, errors };

  // Resolve simple refs in caller before passing here for now
  const type = schema.type;
  if(type){
    const ok = (
      (type==='object' && value && typeof value==='object' && !Array.isArray(value)) ||
      (type==='array' && Array.isArray(value)) ||
      (type==='string' && typeof value==='string') ||
      (type==='number' && typeof value==='number' && !Number.isNaN(value)) ||
      (type==='integer' && Number.isInteger(value)) ||
      (type==='boolean' && typeof value==='boolean') ||
      (type==='null' && value===null)
    );
    if(!ok) errors.push(`${path}: expected ${type}`);
  }

  if(schema.enum && !schema.enum.includes(value)){
    errors.push(`${path}: not in enum ${JSON.stringify(schema.enum)}`);
  }
  if(typeof value==='string'){
    if(schema.maxLength!=null && value.length>schema.maxLength) errors.push(`${path}: maxLength ${schema.maxLength} exceeded`);
    if(schema.minLength!=null && value.length<schema.minLength) errors.push(`${path}: minLength ${schema.minLength} not met`);
    if(schema.pattern){
      try{
        const re = new RegExp(schema.pattern);
        if(!re.test(value)) errors.push(`${path}: does not match pattern ${schema.pattern}`);
      }catch{}
    }
  }
  if(typeof value==='number'){
    if(schema.maximum!=null && value>schema.maximum) errors.push(`${path}: > maximum ${schema.maximum}`);
    if(schema.minimum!=null && value<schema.minimum) errors.push(`${path}: < minimum ${schema.minimum}`);
  }
  if(Array.isArray(value)){
    if(schema.maxItems!=null && value.length>schema.maxItems) errors.push(`${path}: > maxItems ${schema.maxItems}`);
    if(schema.minItems!=null && value.length<schema.minItems) errors.push(`${path}: < minItems ${schema.minItems}`);
    const it = schema.items;
    if(it){
      value.forEach((v,i)=>{
        const r = validate(v, it, `${path}[${i}]`);
        errors.push(...r.errors);
      });
    }
  }
  if(value && typeof value==='object' && !Array.isArray(value)){
    const req = schema.required||[];
    req.forEach(k=>{
      if(value[k]===undefined) errors.push(`${path}.${k}: required`);
    });
    const props = schema.properties||{};
    for(const k in value){
      if(props[k]){
        const r = validate(value[k], props[k], `${path}.${k}`);
        errors.push(...r.errors);
      }else if(schema.additionalProperties===false){
        errors.push(`${path}.${k}: additionalProperties not allowed`);
      }else if(typeof schema.additionalProperties === 'object'){
        const r = validate(value[k], schema.additionalProperties, `${path}.${k}`);
        errors.push(...r.errors);
      }
    }
    // oneOf / anyOf (basic)
    if(schema.oneOf){
      const matches = schema.oneOf.map(s=>validate(value, s, path).errors.length===0).filter(Boolean).length;
      if(matches!==1) errors.push(`${path}: must match exactly one schema in oneOf`);
    }
    if(schema.anyOf){
      const matches = schema.anyOf.map(s=>validate(value, s, path).errors.length===0).filter(Boolean).length;
      if(matches===0) errors.push(`${path}: must match at least one schema in anyOf`);
    }
  }
  return { valid: errors.length===0, errors };
}

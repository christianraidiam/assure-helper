import { state, saveState } from '../../app/state.js';
import { safeParse, pretty } from '../../lib/json-utils.js';
import { listPaths, listMethods, listResponseStatuses, getJsonSchema, resolveLocalRef } from '../../lib/schema-utils.js';
import { validate } from '../../lib/validate.js';

let specObj = null;

export async function render(root){
  root.innerHTML = `
    <section class="section">
      <h1>OpenAPI Validator (payload only)</h1>

      <div class="row">
        <div class="col">
          <label class="label">Spec URL</label>
          <input id="spec-url" class="input" placeholder="https://example.com/openapi.json" value="${state.openapi.spec||''}"/>
        </div>
        <div class="col">
          <label class="label">Or paste JSON/YAML</label>
          <textarea id="spec-text" class="textarea" placeholder="{}"></textarea>
        </div>
      </div>
      <div class="toolbar">
        <button id="load" class="btn btn-primary">Load / Parse</button>
        <button id="clear" class="btn btn-ghost">Clear</button>
      </div>

      <div id="status" class="empty">Load a spec to select endpoints.</div>

      <hr class="sep"/>

      <div class="row">
        <div class="col">
          <label class="label">Endpoint</label>
          <select id="path" class="select"><option value="">—</option></select>
        </div>
        <div class="col">
          <label class="label">Method</label>
          <select id="method" class="select"><option value="">—</option></select>
        </div>
        <div class="col">
          <label class="label">Mode</label>
          <select id="mode" class="select">
            <option value="request" ${state.openapi.mode==='request'?'selected':''}>Request Body</option>
            <option value="response" ${state.openapi.mode!=='request'?'selected':''}>Response Body</option>
          </select>
        </div>
        <div class="col">
          <label class="label">Status (for Response)</label>
          <select id="status-code" class="select"><option value="200">200</option></select>
        </div>
      </div>

      <div class="row">
        <div class="col">
          <label class="label">Payload JSON</label>
          <textarea id="payload" class="textarea" placeholder="{}">${state.openapi.payload||''}</textarea>
        </div>
        <div class="col">
          <label class="label">Schema Preview</label>
          <pre id="schema" class="kv empty">—</pre>
        </div>
      </div>

      <div class="toolbar">
        <button id="validate" class="btn btn-primary">Validate</button>
      </div>

      <div id="result" class="kv empty">Results will appear here.</div>
    </section>
  `;

  const urlEl = document.getElementById('spec-url');
  const textEl = document.getElementById('spec-text');
  const pathEl = document.getElementById('path');
  const methodEl = document.getElementById('method');
  const modeEl = document.getElementById('mode');
  const statusEl = document.getElementById('status-code');
  const payloadEl = document.getElementById('payload');
  const schemaEl = document.getElementById('schema');
  const statusBox = document.getElementById('status');
  const resultEl = document.getElementById('result');

  // restore selection
  const restoreSelects = ()=>{
    if(!specObj) return;
    const paths = listPaths(specObj);
    pathEl.innerHTML = '<option value="">—</option>' + paths.map(p=>`<option>${p}</option>`).join('');
    if(state.openapi.path){ pathEl.value=state.openapi.path; }
    updateMethods();
  };

  function updateMethods(){
    methodEl.innerHTML = '<option value="">—</option>';
    statusEl.innerHTML = '<option value="200">200</option>';
    schemaEl.className='kv empty'; schemaEl.textContent='—';
    if(!pathEl.value) return;

    const methods = listMethods(specObj, pathEl.value);
    methodEl.innerHTML = '<option value="">—</option>' + methods.map(m=>`<option ${state.openapi.method===m?'selected':''}>${m}</option>`).join('');
    if(methodEl.value) updateStatuses();
  }

  function updateStatuses(){
    statusEl.innerHTML = '<option value="200">200</option>';
    if(!pathEl.value || !methodEl.value) return;
    const statuses = listResponseStatuses(specObj, pathEl.value, methodEl.value);
    statusEl.innerHTML = statuses.map(s=>`<option ${state.openapi.status===s?'selected':''}>${s}</option>`).join('');
    updateSchemaPreview();
  }

  function updateSchemaPreview(){
    const mode = modeEl.value;
    const schema = getJsonSchema(specObj, { path: pathEl.value, method: methodEl.value, mode, status: statusEl.value });
    let resolved = schema;
    // resolve single depth local $ref
    if(schema && schema.$ref){ resolved = resolveLocalRef(specObj, schema); }
    if(resolved){
      schemaEl.className='kv';
      schemaEl.textContent = JSON.stringify(resolved, null, 2);
    }else{
      schemaEl.className='kv empty'; schemaEl.textContent='No JSON schema found for this selection.';
    }
  }

  document.getElementById('clear').addEventListener('click', ()=>{
    specObj=null; urlEl.value=''; textEl.value=''; pathEl.innerHTML='<option value="">—</option>'; methodEl.innerHTML='<option value="">—</option>';
    statusEl.innerHTML='<option value="200">200</option>'; schemaEl.className='kv empty'; schemaEl.textContent='—'; resultEl.className='kv empty'; resultEl.textContent='Results will appear here.';
    statusBox.textContent='Cleared. Load a spec to select endpoints.';
  });

  document.getElementById('load').addEventListener('click', async ()=>{
    const url = urlEl.value.trim();
    const raw = textEl.value.trim();
    try{
      let text = raw;
      if(!text && url){
        const res = await fetch(url);
        if(!res.ok) throw new Error('Failed to fetch spec: '+res.status);
        text = await res.text();
      }
      if(!text) throw new Error('Provide a URL or paste a spec.');
      // try JSON first
      let spec;
      try{ spec = JSON.parse(text); }
      catch{
        // very tiny YAML fallback (non-strict): try to convert YAML to JSON via a naive approach (for most simple YAML files).
        // Note: for complex YAML, consider including a small YAML parser later.
        throw new Error('Spec is not valid JSON. Please paste JSON for now.');
      }
      specObj = spec; state.openapi.spec = url; saveState();
      statusBox.textContent = 'Spec loaded. Select endpoint/method/mode.';
      restoreSelects();
    }catch(e){
      statusBox.textContent = 'Error: ' + e.message;
    }
  });

  pathEl.addEventListener('change', e=>{ state.openapi.path=e.target.value; saveState(); updateMethods(); });
  methodEl.addEventListener('change', e=>{ state.openapi.method=e.target.value; saveState(); updateStatuses(); });
  modeEl.addEventListener('change', e=>{ state.openapi.mode=e.target.value; saveState(); updateSchemaPreview(); });
  statusEl.addEventListener('change', e=>{ state.openapi.status=e.target.value; saveState(); updateSchemaPreview(); });
  payloadEl.addEventListener('input', e=>{ state.openapi.payload=e.target.value; saveState(); });

  document.getElementById('validate').addEventListener('click', ()=>{
    const payloadRaw = payloadEl.value.trim();
    const parsed = safeParse(payloadRaw);
    if(!parsed.ok){
      resultEl.className='kv empty';
      resultEl.textContent = 'Invalid JSON payload: ' + parsed.error;
      return;
    }
    const schema = getJsonSchema(specObj, { path: pathEl.value, method: methodEl.value, mode: modeEl.value, status: statusEl.value });
    let resolved = schema;
    if(schema && schema.$ref) resolved = resolveLocalRef(specObj, schema);
    if(!resolved){
      resultEl.className='kv empty';
      resultEl.textContent='No JSON schema for this selection.';
      return;
    }
    const res = validate(parsed.value, resolved, '$');
    resultEl.className='kv';
    resultEl.textContent = JSON.stringify(res, null, 2);
  });

  // If there is an existing spec in state, try to refocus selections
  if(state.openapi.spec){ document.getElementById('status').textContent='Spec URL saved. Click "Load / Parse" to reload.'; }
}

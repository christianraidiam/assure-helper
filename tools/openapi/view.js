import { state, saveState } from '../../app/state.js';
import { safeParse, pretty } from '../../lib/json-utils.js';
import { listPaths, listMethods, listResponseStatuses, getJsonSchema, resolveLocalRef, collectRestrictions } from '../../lib/schema-utils.js';
import { validate } from '../../lib/validate.js';

const esc = (s='')=>s.replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const highlightJSON = (obj)=>{
  if(obj==null) return '';
  const json = JSON.stringify(obj, null, 2);
  return esc(json)
    .replace(/(^|\n)(\s*)\"([^"]+)\":/g, (_, brk, sp, key)=>`${brk}${sp}<span class="j-key">"${key}"</span>:`)
    .replace(/: \"([^"]*)\"/g, (_, val)=>`: <span class="j-str">"${esc(val)}"</span>`)
    .replace(/: (-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (_, num)=>`: <span class="j-num">${num}</span>`)
    .replace(/: (true|false)/g, (_, b)=>`: <span class="j-bool">${b}</span>`)
    .replace(/: null/g, ': <span class="j-null">null</span>');
};

function getSecurity(spec, path, method){
  if(!spec || !path || !method) return [];
  const op = spec?.paths?.[path]?.[method.toLowerCase()];
  if(op && Array.isArray(op.security)) return op.security;
  if(Array.isArray(spec.security)) return spec.security;
  return [];
}

function describeSecurity(spec, req){
  const schemes = spec?.components?.securitySchemes || {};
  return Object.entries(req||{}).map(([name, scopes])=>{
    const def = schemes[name] || {};
    const type = def.type || 'unknown';
    const description = def.description || '';
    const flows = def.flows ? Object.entries(def.flows).map(([flowName, flowDef])=>({
      name: flowName,
      scopes: Object.keys(flowDef?.scopes||{}),
      description: flowDef?.description || ''
    })) : [];
    return { name, type, scopes: scopes||[], flows, description };
  });
}

let specObj = null;
let yamlModulePromise = null;

// Parse JSON first; if that fails, lazily load a YAML parser from CDN.
async function parseSpecText(rawText) {
  if (!rawText) throw new Error('Provide a URL or paste a spec.');
  try {
    return JSON.parse(rawText);
  } catch (_) {
    // fall through to YAML
  }

  if (!yamlModulePromise) {
    yamlModulePromise = import('https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.mjs')
      .catch(err => {
        yamlModulePromise = null;
        throw new Error('Failed to load YAML parser: ' + err.message);
      });
  }

  const yaml = await yamlModulePromise;
  try {
    return yaml.load(rawText);
  } catch (err) {
    throw new Error('Spec is not valid JSON or YAML: ' + (err?.message || err));
  }
}

export async function render(root){
  root.innerHTML = `
    <section class="section" style="max-width:1300px;margin-inline:auto;">
      <h1 style="text-align:center;">OpenAPI Validator</h1>
      <p class="hero-sub" style="margin-top:4px;text-align:center;">Load a spec, pick an endpoint, validate payloads, and review security and business rules.</p>

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
          <div id="security-panel" class="security-card empty">
            <div class="security-card-header">
              <div>
                <div class="label" style="margin-bottom:2px;">Security</div>
                <div class="security-summary" id="security-summary">No security requirements</div>
              </div>
              <button id="security-toggle" class="btn btn-ghost btn-xs" type="button" aria-pressed="true">Hide</button>
            </div>
            <div id="security-body" class="security-body"></div>
          </div>
        </div>
      </div>

      <div class="row">
        <div class="col">
          <label class="label">Payload JSON</label>
          <textarea id="payload" class="textarea" placeholder="{}">${state.openapi.payload||''}</textarea>
        </div>
        <div class="col">
          <div class="schema-header">
            <label class="label" style="margin-bottom:0;">Schema Preview</label>
          </div>
          <div id="schema-box" class="schema-box">
            <pre id="schema" class="kv empty schema-fixed">—</pre>
            <button id="schema-resize" class="schema-resize" type="button" aria-pressed="false" title="Expand/Collapse schema preview"></button>
          </div>
        </div>
      </div>

      <div class="toolbar">
        <button id="validate" class="btn btn-primary">Validate</button>
      </div>

      <div id="result" class="kv empty">Results will appear here.</div>
      <div id="restrictions" class="kv empty" style="margin-top:10px;">Business [Restrição] notes will appear here.</div>
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
  const schemaBox = document.getElementById('schema-box');
  const schemaResize = document.getElementById('schema-resize');
  const statusBox = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const restrictionsEl = document.getElementById('restrictions');
  const securityEl = document.getElementById('security-panel');
  const securitySummaryEl = document.getElementById('security-summary');
  const securityBodyEl = document.getElementById('security-body');
  const securityToggle = document.getElementById('security-toggle');

  const setSchemaExpanded = (flag)=>{
    if(!schemaBox || !schemaResize) return;
    schemaBox.classList.toggle('expanded', !!flag);
    schemaResize.setAttribute('aria-pressed', flag ? 'true' : 'false');
  };
  setSchemaExpanded(false);

  if(schemaResize){
    schemaResize.addEventListener('click', ()=>{
      setSchemaExpanded(!schemaBox.classList.contains('expanded'));
    });
  }

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
    schemaEl.className='kv empty schema-fixed'; schemaEl.textContent='—';
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
      schemaEl.className='kv schema-fixed';
      schemaEl.innerHTML = highlightJSON(resolved);
    }else{
      schemaEl.className='kv empty schema-fixed'; schemaEl.textContent='No JSON schema found for this selection.';
    }
    renderSecurity();
  }

  document.getElementById('clear').addEventListener('click', ()=>{
    specObj=null; urlEl.value=''; textEl.value=''; pathEl.innerHTML='<option value="">—</option>'; methodEl.innerHTML='<option value="">—</option>';
    statusEl.innerHTML='<option value="200">200</option>'; schemaEl.className='kv empty schema-fixed'; schemaEl.textContent='—'; setSchemaExpanded(false);
    resultEl.className='kv empty'; resultEl.textContent='Results will appear here.';
    if(securityEl){
      securityEl.className='security-card empty';
      securitySummaryEl.textContent='No security requirements';
      securityBodyEl.innerHTML='';
    }
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
      const spec = await parseSpecText(text.trim());
      specObj = spec; state.openapi.spec = url; saveState();
      statusBox.textContent = 'Spec loaded. Select endpoint/method/mode.';
      restoreSelects();
      renderSecurity();
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
      schemaBox.classList.remove('expanded');
      if(schemaResize) schemaResize.setAttribute('aria-pressed','false');
      restrictionsEl.className='kv empty';
      restrictionsEl.textContent='No [Restrição] notes for this selection.';
      return;
    }
    const res = validate(parsed.value, resolved, '$', specObj);
    resultEl.className='kv';
    resultEl.innerHTML = highlightJSON(res);
    renderSecurity();

    const restrictions = collectRestrictions(specObj, resolved, '$');
    if(restrictions.length){
      restrictionsEl.className='kv';
      const list = restrictions.map(r=>`
        <div class="restriction-item">
          <div class="restriction-path">${esc(r.path)}</div>
          <div class="restriction-body">
            <div class="restriction-field">${esc(r.field||'')}</div>
            <div class="restriction-text">[Restrição] ${esc(r.restriction||'')}</div>
          </div>
        </div>
      `).join('');
      restrictionsEl.innerHTML = `
        <div class="restriction-heading">Business rules (manual review)</div>
        <div class="restriction-note">[Restrição] items are not auto-validated. Review and apply these rules for the selected endpoint.</div>
        <div class="restrictions-list">${list}</div>
      `;
    }else{
      restrictionsEl.className='kv empty';
      restrictionsEl.textContent='No [Restrição] notes for this selection.';
    }

    renderSecurity();
  });

  // If there is an existing spec in state, try to refocus selections
  if(state.openapi.spec){ document.getElementById('status').textContent='Spec URL saved. Click "Load / Parse" to reload.'; }

  function renderSecurity(){
    if(!securityEl){
      return;
    }
    if(!specObj || !pathEl.value || !methodEl.value){
      securityEl.className='security-card empty';
      securitySummaryEl.textContent='Select endpoint/method to see security.';
      securityBodyEl.innerHTML='';
      return;
    }
    const sec = getSecurity(specObj, pathEl.value, methodEl.value);
    if(!sec || sec.length===0){
      securityEl.className='security-card empty';
      securitySummaryEl.textContent='No security requirements (public).';
      securityBodyEl.innerHTML='';
      return;
    }
    const blocks = sec.map((req, idx)=>{
      const schemes = describeSecurity(specObj, req);
      const items = schemes.map(s=>{
        const scopes = (s.scopes&&s.scopes.length)
          ? s.scopes.map(sc=>`<span class="scope-chip">${esc(sc)}</span>`).join(' ')
          : '<span class="scope-chip muted">No scopes required</span>';
        const desc = s.description || (s.flows?.find(f=>f.description)?.description) || '';
        return `
          <div class="security-scheme">
            <div class="security-row">
              <span class="grant-badge">${esc(s.name)}</span>
              <span class="badge badge-ghost">${esc(s.type)}</span>
            </div>
            ${desc ? `<div class="security-desc">${esc(desc)}</div>` : ''}
            <div class="security-row scopes-row">
              <span class="label" style="margin:0;font-size:11px;">Scopes</span>
              <div class="scope-list">${scopes}</div>
            </div>
          </div>
        `;
      }).join('');
      return `<div class="security-block"><div class="security-heading">Requirement set ${idx+1}</div>${items}</div>`;
    }).join('');
    securityEl.className='security-card';
    const summaryScopes = sec.flatMap(s=>Object.values(s).flat()).flatMap(()=>[]); // placeholder if needed
    securitySummaryEl.textContent = 'Security required';
    securityBodyEl.innerHTML = `
      <div class="security-note">Any one of the following requirement sets can authorize this call:</div>
      <div class="security-sets">${blocks}</div>
    `;
  }

  if(securityToggle){
    securityToggle.addEventListener('click', ()=>{
      const bodyVisible = !securityBodyEl.classList.toggle('collapsed');
      securityToggle.textContent = bodyVisible ? 'Hide' : 'Show';
      securityToggle.setAttribute('aria-pressed', bodyVisible ? 'true' : 'false');
    });
  }
}

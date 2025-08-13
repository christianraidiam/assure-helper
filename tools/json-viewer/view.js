import { state, saveState } from '../../app/state.js';
import { safeParse, pretty, summarize } from '../../lib/json-utils.js';

export async function render(root){
  root.innerHTML = `
    <section class="section">
      <h1>JSON Viewer</h1>
      <label class="label">Paste JSON</label>
      <textarea id="json-input" class="textarea" placeholder='{"hello":"world"}'>${state.json.input||''}</textarea>
      <div class="toolbar">
        <button id="validate" class="btn btn-primary">Validate</button>
        <button id="clear" class="btn btn-ghost">Clear</button>
      </div>
      <div id="json-out" class="kv empty">Validation output will appear here.</div>
    </section>
  `;

  const input = document.getElementById('json-input');
  const out = document.getElementById('json-out');

  input.addEventListener('input', e=>{ state.json.input=e.target.value; saveState(); });

  document.getElementById('clear').addEventListener('click', ()=>{
    input.value=''; state.json.input=''; saveState(); out.className='kv empty'; out.textContent='Paste JSON to validate.';
  });

  document.getElementById('validate').addEventListener('click', ()=>{
    const res = safeParse(input.value.trim());
    if(!res.ok){
      out.className='kv empty';
      out.textContent = 'Invalid JSON: ' + res.error;
      return;
    }
    const sum = summarize(res.value);
    out.className='kv';
    out.textContent = pretty({ valid:true, summary: sum, json: res.value });
  });
}

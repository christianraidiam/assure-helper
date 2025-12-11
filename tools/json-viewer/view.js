import { state, saveState } from '../../app/state.js';
import { safeParse, pretty, summarize } from '../../lib/json-utils.js';

const esc = (s='')=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
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
    out.innerHTML = highlightJSON({ valid:true, summary: sum, json: res.value });
  });
}

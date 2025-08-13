import { state, saveState } from '../../app/state.js';
import { decodeJWT } from '../../lib/jwt-utils.js';
import { copy, download } from '../../app/ui.js';

export async function render(root){
  root.innerHTML = `
    <section class="section">
      <h1>JWT → JSON</h1>
      <label class="label">Paste JWT</label>
      <textarea id="jwt-input" class="textarea" placeholder="eyJhbGciOi...">${state.jwt.token||''}</textarea>
      <div class="toolbar">
        <button id="decode" class="btn btn-primary">Decode</button>
        <button id="clear" class="btn btn-ghost">Clear</button>
      </div>
      <div id="jwt-out" class="kv empty">Decoded header & payload will appear here.</div>
    </section>
  `;
  const input = document.getElementById('jwt-input');
  const out = document.getElementById('jwt-out');

  input.addEventListener('input', e=>{ state.jwt.token=e.target.value; saveState(); });

  document.getElementById('clear').addEventListener('click', ()=>{
    input.value=''; state.jwt.token=''; saveState(); out.className='kv empty'; out.textContent='Paste a JWT to decode.';
  });

  document.getElementById('decode').addEventListener('click', ()=>{
    try{
      const { header, payload } = decodeJWT(input.value.trim());
      out.className='kv';
      out.textContent = JSON.stringify({ header, payload }, null, 2);
    }catch(e){
      out.className='kv empty'; out.textContent = 'Invalid JWT: ' + e.message;
    }
  });
}

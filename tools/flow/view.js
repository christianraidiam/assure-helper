import { state, saveState } from '../../app/state.js';
import { decodeJWT } from '../../lib/jwt-utils.js';
import { safeParse } from '../../lib/json-utils.js';

// Escape for safe HTML
const esc = (s='')=>String(s).replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));

function renderCardJSON(json){
  try{ return highlightJSON(json); }catch{ return ''; }
}

function highlightJSON(obj){
  if (obj == null) return '';
  const json = JSON.stringify(obj, null, 2);
  return esc(json)
    .replace(/(^|\n)(\s*)\"([^"]+)\":/g, (_, brk, sp, key) => `${brk}${sp}<span class="j-key">"${key}"</span>:`)
    .replace(/: \"([^"]*)\"/g, (_, val) => `: <span class="j-str">"${esc(val)}"</span>`)
    .replace(/: (-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (_, num) => `: <span class="j-num">${num}</span>`)
    .replace(/: (true|false)/g, (_, b) => `: <span class="j-bool">${b}</span>`)
    .replace(/: null/g, ': <span class="j-null">null</span>');
}

export async function render(root){
  const cards = state.flow.cards || [];

  root.innerHTML = `
    <section class="section" style="max-width:1400px;margin-inline:auto;">
      <div class="hero-block">
        <span class="hero-pill">Flow Toolkit · Chronological</span>
        <h1 class="hero-title">Flow Board</h1>
        <p class="hero-sub">Decode JWTs or parse JSON, then pin them as tagged cards in order.</p>
      </div>

      <div class="row">
        <div class="col" style="min-width:320px;">
          <label class="label">Paste JWT or JSON</label>
          <textarea id="flow-input" class="textarea" placeholder="Paste JWT or JSON here">${esc(state.flow.input||'')}</textarea>
          <div class="toolbar" style="margin-top:8px;">
            <button id="flow-add" class="btn btn-primary">Add to Board</button>
            <button id="flow-clear" class="btn btn-ghost">Clear</button>
          </div>
          <div id="flow-status" class="kv empty" style="margin-top:8px;">Waiting for input…</div>
        </div>
        <div class="col">
          <div class="schema-header" style="margin-top:0;">
            <label class="label" style="margin-bottom:0;">Preview</label>
            <span id="flow-preview-type" class="badge" style="display:none;">—</span>
          </div>
          <pre id="flow-preview" class="kv empty flow-preview">—</pre>
        </div>
      </div>

      <hr class="sep"/>

      <div class="schema-header" style="margin-top:0;">
        <h2 style="margin:0;color:var(--text);font-size:20px;">Board</h2>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="hero-pill soft">Oldest first · Click card JSON to expand</span>
          <button id="flow-clear-all" class="btn btn-ghost btn-xs" style="padding:6px 10px;">Clear all cards</button>
        </div>
      </div>
      <div id="flow-board" class="flow-board"></div>
    </section>
  `;

  const inputEl = root.querySelector('#flow-input');
  const statusEl = root.querySelector('#flow-status');
  const previewEl = root.querySelector('#flow-preview');
  const previewType = root.querySelector('#flow-preview-type');
  const boardEl = root.querySelector('#flow-board');

  function setPreview(type, content, msgClass='kv', asHTML=false){
    previewEl.className = `${msgClass} flow-preview`;
    if(asHTML){
      previewEl.innerHTML = content;
    } else {
      previewEl.textContent = content;
    }
    if(type){
      previewType.style.display='inline-flex';
      previewType.textContent = type;
    } else {
      previewType.style.display='none';
    }
  }

  function parseInput(raw){
    const trimmed = raw.trim();
    if(!trimmed) return { ok:false, reason:'Empty input' };
    // Check JWT first
    if(trimmed.split('.').length >= 2){
      try{
        const { header, payload } = decodeJWT(trimmed);
        return { ok:true, type:'JWT', json: payload, header, raw: trimmed };
      }catch{}
    }
    // Fallback to JSON parse
    const parsed = safeParse(trimmed);
    if(parsed.ok) return { ok:true, type:'JSON', json: parsed.value, raw: trimmed };
    return { ok:false, reason: parsed.error || 'Not valid JWT or JSON' };
  }

  function refreshBoard(){
    const list = state.flow.cards || [];
    if(!list.length){
      boardEl.innerHTML = '<div class="empty">No cards yet. Add a JWT/JSON and tag it.</div>';
      return;
    }
    boardEl.innerHTML = list.map((card, idx)=>{
      const jsonHTML = renderCardJSON(card.json);
      return `
        <div class="flow-card" data-idx="${idx}">
          <div class="flow-card-top">
            <input class="flow-tag" data-idx="${idx}" value="${esc(card.tag||'')}" placeholder="Tag (e.g., /contracts response)" />
            <span class="badge">${esc(card.type||'JSON')}</span>
          </div>
          <div class="flow-card-actions">
            <button class="btn btn-ghost btn-xs" data-action="copy" data-idx="${idx}">Copy JSON</button>
            <button class="btn btn-ghost btn-xs" data-action="delete" data-idx="${idx}">Delete</button>
          </div>
          <pre class="kv flow-json" data-idx="${idx}">${jsonHTML}</pre>
        </div>
      `;
    }).join('');
  }

  function addCard(parsed){
    const tag = `Item ${state.flow.cards.length+1}`;
    const nextCard = { tag, type: parsed.type, json: parsed.json, raw: parsed.raw, header: parsed.header||null };
    state.flow.cards = [...(state.flow.cards||[]), nextCard];
    saveState();
    refreshBoard();
  }

  function updatePreview(){
    const raw = inputEl.value;
    state.flow.input = raw; saveState();
    const parsed = parseInput(raw);
    if(!parsed.ok){
      statusEl.className='kv empty';
      statusEl.textContent = parsed.reason || 'Invalid input';
      setPreview(null, '—', 'kv empty');
      return parsed;
    }
    statusEl.className='kv';
    statusEl.textContent = parsed.type === 'JWT' ? 'Decoded JWT → payload shown below.' : 'Valid JSON parsed.';
    setPreview(parsed.type, renderCardJSON(parsed.json), 'kv', true);
    return parsed;
  }

  inputEl.addEventListener('input', ()=>{ updatePreview(); });

  root.querySelector('#flow-clear').addEventListener('click', ()=>{
    inputEl.value=''; state.flow.input=''; saveState();
    setPreview(null, '—', 'kv empty');
    statusEl.className='kv empty'; statusEl.textContent='Cleared input.';
  });

  root.querySelector('#flow-add').addEventListener('click', ()=>{
    const parsed = updatePreview();
    if(!parsed.ok) return;
    addCard(parsed);
    statusEl.className='kv'; statusEl.textContent='Added to board.';
  });

  root.querySelector('#flow-clear-all').addEventListener('click', ()=>{
    state.flow.cards = [];
    saveState();
    refreshBoard();
  });

  boardEl.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const idx = Number(btn.dataset.idx);
    if(btn.dataset.action==='delete'){
      state.flow.cards.splice(idx,1);
      saveState(); refreshBoard();
    }
    if(btn.dataset.action==='copy'){
      const card = state.flow.cards[idx];
      navigator.clipboard.writeText(JSON.stringify(card?.json||{}, null, 2)).catch(()=>{});
    }
  });

  boardEl.addEventListener('input', e=>{
    const tagEl = e.target.closest('.flow-tag');
    if(!tagEl) return;
    const idx = Number(tagEl.dataset.idx);
    state.flow.cards[idx].tag = tagEl.value;
    saveState();
  });

  // Expand/collapse JSON on click
  boardEl.addEventListener('click', e=>{
    const pre = e.target.closest('.flow-json');
    if(!pre) return;
    pre.classList.toggle('expanded');
  });

  // Initial paint
  const initParsed = updatePreview();
  if(initParsed.ok){
    setPreview(initParsed.type, renderCardJSON(initParsed.json), 'kv', true);
  }
  refreshBoard();
}

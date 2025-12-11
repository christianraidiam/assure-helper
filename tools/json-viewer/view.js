import { state, saveState } from '../../app/state.js';
import { safeParse, pretty, summarize } from '../../lib/json-utils.js';

const esc = (s='')=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const highlightJSON = (obj)=>{
  if(obj==null) return '';
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return esc(json)
    .replace(/(^|\n)(\s*)\"([^"]+)\":/g, (_, brk, sp, key)=>`${brk}${sp}<span class="j-key">"${key}"</span>:`)
    .replace(/: \"([^"]*)\"/g, (_, val)=>`: <span class="j-str">"${esc(val)}"</span>`)
    .replace(/: (-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (_, num)=>`: <span class="j-num">${num}</span>`)
    .replace(/: (true|false)/g, (_, b)=>`: <span class="j-bool">${b}</span>`)
    .replace(/: null/g, ': <span class="j-null">null</span>');
};

function createTree(node, search=''){
  const term = search?.trim().toLowerCase() || '';
  const matches = (txt)=> term && (txt||'').toLowerCase().includes(term);

  const renderNode = (value, label, path, depth)=>{
    const isObj = value && typeof value === 'object' && !Array.isArray(value);
    const isArr = Array.isArray(value);
    const isLeaf = !isObj && !isArr;

    const selfMatch = matches(label) || (isLeaf && matches(String(value)));
    const keyMatch = matches(label);
    const valMatch = isLeaf && matches(String(value));

    if(isLeaf){
      return { hasMatch: selfMatch, html: `
        <li class="tree-li leaf" data-path="${path}" data-depth="${depth}">
          <div class="tree-row leaf">
            <span class="leaf-bullet"></span>
            <span class="leaf-key j-key${keyMatch?' match':''}">"${esc(label)}"</span><span class="leaf-sep">:</span><span class="leaf-val${valMatch?' match':''}">${highlightJSON(value)}</span>
          </div>
        </li>
      `, isLeaf:true };
    }

    const entries = isArr ? value.map((v,i)=>[String(i), v]) : Object.entries(value||{});
    const count = entries.length;
    const ownLabel = isArr ? `${label} [${count}]` : `${label} {${count}}`;

    let childrenHtml = '';
    let childMatched = false;
    entries.forEach(([k,v])=>{
      const childPath = `${path}.${k}`;
      const child = renderNode(v, k, childPath, depth+1);
      if(child.hasMatch) childMatched = true;
      childrenHtml += child.html;
    });

    const shouldOpen = term ? (selfMatch || childMatched) : depth === 0; // only root open by default
    const caretClass = shouldOpen ? 'caret open' : 'caret';
    const caretSymbol = shouldOpen ? '▼' : '▶';

    const highlight = (selfMatch || matches(ownLabel)) ? ' match' : '';
    return {
      hasMatch: selfMatch || childMatched,
      html: `
        <li class="tree-li" data-depth="${depth}">
          <div class="tree-row parent" data-path="${path}" data-collapsed="${shouldOpen?'false':'true'}">
            <span class="${caretClass}">${caretSymbol}</span>
            <span class="node-icon ${isArr?'array':'object'}"></span>
            <span class="key${highlight}">${ownLabel}</span>
          </div>
          <ul class="tree-ul${shouldOpen?'':' collapsed'}" data-path="${path}">
            ${childrenHtml}
          </ul>
        </li>
      `
    };
  };

  return renderNode(node, 'root', 'root', 0).html;
}

function debounce(fn, ms=250){
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

export async function render(root){
  root.innerHTML = `
    <section class="section" style="max-width:1400px;margin-inline:auto;">
      <div class="schema-header" style="align-items:flex-end;">
        <div style="flex:1;text-align:center;">
          <h1 style="margin:8px 0 4px;">JSON Viewer</h1>
          <p class="hero-sub" style="margin:0;">Validate instantly, then explore big payloads with collapsible keys.</p>
        </div>
        <div class="metrics" style="color:var(--muted);font-size:12px;">
          <span id="json-metrics"></span>
        </div>
      </div>

      <div class="row">
        <div class="col" style="min-width:320px;">
          <label class="label">Paste JSON</label>
          <div class="code-field" style="position:relative;border:1px solid var(--stroke);background:#08333a;border-radius:12px;">
            <textarea id="json-input"
                      class="textarea"
                      spellcheck="false"
                      placeholder='Paste JSON here'
                      style="min-height:280px; resize:vertical; border:0; background:transparent; padding:12px;">${state.json.input||''}</textarea>
          </div>
          <div id="json-status" class="status-bar empty" style="display:none;">Waiting for input…</div>
          <div class="toolbar" style="margin-top:8px;">
            <button id="beautify" class="btn btn-ghost">Beautify</button>
            <button id="copy" class="btn btn-ghost">Copy</button>
            <button id="clear" class="btn btn-ghost">Clear</button>
          </div>
        </div>

        <div class="col">
          <div class="schema-header" style="margin-top:0; align-items:center;">
            <label class="label" style="margin-bottom:0;">Tree</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="search" class="input" style="max-width:200px;" placeholder="Search (key or value)"/>
              <button id="collapse-all" class="btn btn-ghost btn-xs">Collapse all</button>
            </div>
          </div>
          <div id="breadcrumb" class="kv empty" style="margin-bottom:8px;">Select a node to see its path.</div>
          <div id="json-tree" class="kv json-tree empty" style="min-height:320px; max-height:70vh; overflow:auto; padding:10px;">Tree will appear after valid JSON.</div>
        </div>
      </div>
    </section>
  `;

  const input = document.getElementById('json-input');
  const out = document.getElementById('json-tree');
  const statusBar = document.getElementById('json-status');
  const metrics = document.getElementById('json-metrics');
  const breadcrumb = document.getElementById('breadcrumb');
  const searchEl = document.getElementById('search');

  const setStatus = (ok, msg)=>{
    statusBar.style.display = msg ? 'block' : 'none';
    statusBar.className = ok ? 'status-bar ok' : 'status-bar error';
    statusBar.textContent = msg || '';
  };

  const setMetrics = (text)=>{ metrics.textContent = text||''; };
  const setBreadcrumb = (text, empty=false)=>{
    breadcrumb.className = empty ? 'kv empty' : 'kv';
    breadcrumb.textContent = empty ? 'Select a node to see its path.' : text;
  };

  const renderTree = (value, search='')=>{
    out.className = 'kv json-tree';
    out.innerHTML = `<ul class="tree-ul root">${createTree(value, search)}</ul>`;
  };

  const scrollFirstMatch = ()=>{
    const term = searchEl.value.trim();
    if(!term) return;
    const first = out.querySelector('.match');
    if(first && typeof first.scrollIntoView === 'function'){
      first.scrollIntoView({ block:'center', behavior:'smooth' });
    }
  };

  const handleValidate = ()=>{
    const res = safeParse(input.value.trim());
    if(!res.ok){
      out.className='kv empty';
      out.textContent = 'Invalid JSON.';
      setStatus(false, 'Invalid JSON: ' + res.error);
      setMetrics('');
      return null;
    }
    state.json.input = input.value; saveState();
    const sum = summarize(res.value);
    const size = new Blob([input.value]).size;
    setMetrics(`${(size/1024).toFixed(1)} KB · ${Object.keys(res.value||{}).length} top-level keys`);
    setStatus(true, 'Valid JSON');
    renderTree(res.value, searchEl.value.trim());
    scrollFirstMatch();
    return res.value;
  };

  const debouncedValidate = debounce(handleValidate, 300);

  input.addEventListener('input', e=>{
    state.json.input = e.target.value; saveState();
    debouncedValidate();
  });

  document.getElementById('clear').addEventListener('click', ()=>{
    input.value=''; state.json.input=''; saveState();
    out.className='kv empty'; out.textContent='Tree will appear after valid JSON.';
    setStatus(false, '');
    setMetrics('');
    setBreadcrumb('', true);
  });

  document.getElementById('beautify').addEventListener('click', ()=>{
    const res = safeParse(input.value.trim());
    if(!res.ok){ setStatus(false, 'Invalid JSON: ' + res.error); return; }
    input.value = JSON.stringify(res.value, null, 2);
    state.json.input = input.value; saveState();
    setStatus(true, 'Beautified');
    handleValidate();
  });

  document.getElementById('copy').addEventListener('click', ()=>{
    navigator.clipboard.writeText(input.value).catch(()=>{});
    setStatus(true, 'Copied to clipboard');
  });

  searchEl.addEventListener('input', ()=>{
    const res = safeParse(input.value.trim());
    if(!res.ok) return;
    renderTree(res.value, searchEl.value.trim());
    scrollFirstMatch();
  });

  document.getElementById('collapse-all').addEventListener('click', ()=>{
    out.querySelectorAll('.tree-ul').forEach((ul, idx)=>{
      if(idx===0) return; // keep root visible
      ul.classList.add('collapsed');
    });
    out.querySelectorAll('.tree-row.parent').forEach(row=>{
      row.dataset.collapsed='true';
      const c = row.querySelector('.caret'); if(c){ c.textContent='▶'; c.classList.remove('open'); }
    });
  });

  out.addEventListener('click', e=>{
    const row = e.target.closest('.tree-row');
    if(!row) return;
    const path = row.dataset.path;
    setBreadcrumb(path, false);
    const ul = row.parentElement?.querySelector(':scope > .tree-ul');
    if(ul){
      const collapsed = ul.classList.toggle('collapsed');
      row.dataset.collapsed = collapsed ? 'true' : 'false';
      const caret = row.querySelector('.caret');
      if(caret){
        caret.textContent = collapsed ? '▶' : '▼';
        caret.classList.toggle('open', !collapsed);
      }
    }
  });

  // Initial render if state has input
  if(state.json.input){
    handleValidate();
  }else{
    setStatus(false, '');
  }
}

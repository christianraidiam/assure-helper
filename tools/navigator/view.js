import { state, saveState } from '../../app/state.js';

export async function render(outlet){
  outlet.innerHTML = `
    <section class="section">
      <h1 style="text-align:center;">Conformance Suite Navigator</h1>
      <p class="hero-sub" style="margin-top:4px;text-align:center;">Jump to Conformance Suite logs or plans by suite, type, and ID.</p>

      <!-- make this row stacked -->
      <div class="row stack">
        <div class="col">
          <label class="label">Suite</label>
          <select id="suite" class="select">
            <option ${state.navigator.suite==='OPF CS'?'selected':''}>OPF CS</option>
            <option ${state.navigator.suite==='OPIN CS'?'selected':''}>OPIN CS</option>
          </select>
        </div>

        <div class="col">
          <label class="label">Type</label>
          <select id="type" class="select">
            <option ${state.navigator.type==='Test Module'?'selected':''}>Test Module</option>
            <option ${state.navigator.type==='Test Plan'?'selected':''}>Test Plan</option>
          </select>
        </div>

        <div class="col">
          <label class="label">ID</label>
          <input id="nav-id" class="input" placeholder="Enter ID" value="${state.navigator.id||''}"/>
        </div>
      </div>

      <div class="toolbar">
        <button id="open" class="btn btn-primary">Open Tab</button>
      </div>

      <div class="empty">Paste an ID and open the relevant page in the Conformance Suite.</div>
    </section>
  `;

  document.getElementById('suite').addEventListener('change', e=>{ state.navigator.suite=e.target.value; saveState(); });
  document.getElementById('type').addEventListener('change', e=>{ state.navigator.type=e.target.value; saveState(); });
  document.getElementById('nav-id').addEventListener('input', e=>{ state.navigator.id=e.target.value; saveState(); });

  document.getElementById('open').addEventListener('click', ()=>{
    const suite = state.navigator.suite;
    const type = state.navigator.type;
    const id = state.navigator.id?.trim();
    if(!id) return alert('Please enter an ID');
    let url='';
    if(suite==='OPF CS'){
      url = type==='Test Module'
        ? `https://web.conformance.directory.openbankingbrasil.org.br/log-detail.html?log=${encodeURIComponent(id)}`
        : `https://web.conformance.directory.openbankingbrasil.org.br/plan-detail.html?plan=${encodeURIComponent(id)}`;
    } else {
      url = type==='Test Module'
        ? `https://web.conformance.directory.opinbrasil.com.br/log-detail.html?log=${encodeURIComponent(id)}`
        : `https://web.conformance.directory.opinbrasil.com.br/plan-detail.html?plan=${encodeURIComponent(id)}`;
    }
    window.open(url, '_blank');
  });
}

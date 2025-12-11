import { state, saveState } from '../../app/state.js';

const OIDS = {
  '2.5.4.3': 'Common Name (CN)',
  '2.5.4.6': 'Country (C)',
  '2.5.4.7': 'Locality (L)',
  '2.5.4.8': 'State or Province (ST)',
  '2.5.4.10': 'Organization (O)',
  '2.5.4.11': 'Organizational Unit (OU)',
  '2.5.4.13': 'Description',
  '2.5.4.5': 'Serial Number',
  '0.9.2342.19200300.100.1.25': 'DC',
  '2.5.4.15': 'Business Category',
  '2.5.4.97': 'User Identifier (UID)',
  '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC',
  '1.3.6.1.4.1.311.60.2.1.2': 'jurisdictionST',
  '1.3.6.1.4.1.311.60.2.1.1': 'jurisdictionL',
  '1.3.6.1.4.1.34697.2.1': 'LEI'
};

const EXT_OIDS = {
  '2.5.29.19': 'Basic Constraints',
  '2.5.29.15': 'Key Usage',
  '2.5.29.17': 'Subject Alternative Name',
  '2.5.29.32': 'Certificate Policies',
  '2.5.29.37': 'Extended Key Usage',
};

const SIG_ALG_MD5 = ['1.2.840.113549.1.1.4'];
const SIG_ALG_SHA1 = ['1.2.840.113549.1.1.5'];

function parsePemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function parseLength(buf, offset) {
  let len = buf[offset++];
  if (len & 0x80) {
    const bytes = len & 0x7f;
    len = 0;
    for (let i = 0; i < bytes; i++) {
      len = (len << 8) | buf[offset++];
    }
  }
  return { length: len, offset };
}

function parseDER(buf, offset = 0) {
  const start = offset;
  const first = buf[offset++];
  const cls = first >> 6;
  const constructed = !!(first & 0x20);
  let tag = first & 0x1f;
  if (tag === 0x1f) {
    tag = 0;
    let b;
    do {
      b = buf[offset++];
      tag = (tag << 7) | (b & 0x7f);
    } while (b & 0x80);
  }
  const lenInfo = parseLength(buf, offset);
  const length = lenInfo.length;
  offset = lenInfo.offset;
  const end = offset + length;
  const value = buf.subarray(offset, end);
  const children = [];
  if (constructed || tag === 0x10 || tag === 0x11) {
    let childOffset = offset;
    while (childOffset < end) {
      const child = parseDER(buf, childOffset);
      children.push(child);
      childOffset = child.end;
    }
  }
  return { cls, constructed, tag, length, headerLen: offset - start, start, end, value, children };
}

function decodeOID(bytes) {
  if (!bytes.length) return '';
  const first = bytes[0];
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    const b = bytes[i];
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

function getStringValue(node) {
  if (!node) return '';
  const tag = node.tag;
  if (tag === 0x0c || tag === 0x13 || tag === 0x16 || tag === 0x1e || tag === 0x14) { // UTF8, Printable, IA5, BMP, Teletex
    return new TextDecoder(tag === 0x1e ? 'utf-16be' : 'utf-8').decode(node.value);
  }
  return Array.from(node.value).map(b => b.toString(16).padStart(2, '0')).join(':');
}

function parseName(seq) {
  const entries = [];
  seq?.children?.forEach(set => {
    const r = set.children?.[0];
    if (!r || r.tag !== 0x10) return;
    const oid = decodeOID(r.children[0].value);
    const valNode = r.children[1];
    entries.push({ oid, name: OIDS[oid] || oid, value: getStringValue(valNode) });
  });
  return entries;
}

function nameToString(entries) {
  return entries.map(e => `${e.name || e.oid}=${e.value}`).join(', ');
}

function parseTime(node) {
  if (!node) return null;
  const txt = getStringValue(node);
  try{
    // UTCTime YYMMDDHHMMSSZ or Generalized YYYYMMDDHHMMSSZ
    const iso = (node.tag === 0x17)
      ? `20${txt.slice(0, 2)}-${txt.slice(2, 4)}-${txt.slice(4, 6)}T${txt.slice(6, 8)}:${txt.slice(8, 10)}:${txt.slice(10, 12)}Z`
      : `${txt.slice(0, 4)}-${txt.slice(4, 6)}-${txt.slice(6, 8)}T${txt.slice(8, 10)}:${txt.slice(10, 12)}:${txt.slice(12, 14)}Z`;
    const d = new Date(iso);
    return isNaN(d) ? null : d;
  }catch{ return null; }
}

function parseExtensions(extSeq) {
  const ext = [];
  extSeq?.children?.forEach(e => {
    const oid = decodeOID(e.children[0].value);
    const name = EXT_OIDS[oid] || oid;
    const critical = e.children[1] && e.children[1].tag === 1 ? (e.children[1].value[0] !== 0) : false;
    const valNode = e.children[critical ? 2 : 1];
    let detail = '';
    if (oid === '2.5.29.17') { // SAN
      const inner = parseDER(valNode.value);
      const sans = inner.children.map(n => getStringValue(n)).filter(Boolean);
      detail = sans.join(', ');
    } else if (oid === '2.5.29.19') {
      const inner = parseDER(valNode.value);
      const ca = inner.children.find(c => c.tag === 1);
      detail = ca ? `CA=${ca.value[0] ? 'TRUE' : 'FALSE'}` : '';
    } else if (oid === '2.5.29.32') {
      const inner = parseDER(valNode.value);
      const oids = inner.children.map(c => decodeOID(c.children?.[0]?.value || c.value)).filter(Boolean);
      detail = oids.join(', ');
    } else {
      detail = Array.from(valNode.value).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    ext.push({ oid, name, critical, detail });
  });
  return ext;
}

function parseCertificate(der) {
  const root = parseDER(der);
  const tbs = root.children?.[0];
  const sigAlg = root.children?.[1];
  const signature = root.children?.[2];
  const versionNode = tbs?.children?.find(c=>c.cls===2 && c.tag===0);
  const version = versionNode?.children?.[0]?.value?.[0] + 1 || 1;
  const serial = tbs?.children?.find(c=>c.tag===2);
  const issuer = tbs?.children?.find(c=>c.tag===0x10 && parseName(c).length>0);
  const validity = tbs?.children?.find(c=>c.tag===0x10 && c.children?.length===2 && (c.children[0].tag===0x17 || c.children[0].tag===0x18));
  const subject = tbs?.children?.find((c, idx)=>idx>tbs.children.indexOf(validity||{}) && c.tag===0x10 && parseName(c).length>0) || tbs?.children?.[5];
  const spki = tbs?.children?.find(c=>c.tag===0x10 && c.children?.[0]?.tag===0x10 && c.children?.[1]?.tag===3) || tbs?.children?.[6];
  const extsCtx = tbs?.children?.find(c=>c.cls===2 && c.tag===3);
  const extSeq = extsCtx?.children?.find(n=>n.tag===0x10) || extsCtx?.children?.[0];

  const subjectEntries = parseName(subject);
  const issuerEntries = parseName(issuer);
  const notBefore = parseTime(validity?.children?.[0]);
  const notAfter = parseTime(validity?.children?.[1]);
  const extensions = parseExtensions(extSeq);
  const sigOid = decodeOID(sigAlg?.children?.[0]?.value || []);
  return { type: 'certificate', version, serial, subjectEntries, issuerEntries, notBefore, notAfter, extensions, spki, sigOid, signature: signature?.value, tbs };
}

function parseCSR(der) {
  const root = parseDER(der);
  const cri = root.children?.[0];
  const subject = cri?.children?.[1];
  const spki = cri?.children?.[2];
  const attrs = cri?.children?.[3];
  let extensions = [];
  attrs?.children?.forEach(a => {
    const oid = decodeOID(a.children?.[0]?.value || []);
    if (oid === '1.2.840.113549.1.9.14') {
      const set = a.children?.[1];
      const extSeq = parseDER(set.value).children?.[0];
      extensions = parseExtensions(extSeq);
    }
  });
  const subjectEntries = parseName(subject);
  return { type: 'csr', subjectEntries, extensions, spki };
}

async function digest(hash, data) {
  const buf = await crypto.subtle.digest(hash, data);
  return new Uint8Array(buf);
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
}
function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function getSPKIInfo(spki) {
  if (!spki) return {};
  const algOid = decodeOID(spki.children?.[0]?.children?.[0]?.value || []);
  let keySize = null;
  let keyAlgo = algOid;
  if (algOid === '1.2.840.113549.1.1.1') { // rsaEncryption
    const bitstr = spki.children?.[1];
    const inner = parseDER(bitstr.value.subarray(1));
    const modulus = inner.children?.[0]?.value;
    keySize = modulus ? modulus.length * 8 : null;
    keyAlgo = 'RSA';
  } else if (algOid === '1.2.840.10045.2.1') { // ecPublicKey
    keyAlgo = 'EC';
  }
  return { keySize, keyAlgo, algOid };
}

function checkStatus(cert) {
  const checks = [];
  if (cert.type === 'certificate') {
    const now = new Date();
    const days = (cert.notAfter && !isNaN(cert.notAfter)) ? Math.floor((cert.notAfter - now) / (1000 * 60 * 60 * 24)) : null;
    const expiryStatus = days!=null && days >= 0 ? 'pass' : 'fail';
    const detail = cert.notAfter ? (days!=null ? `Expires ${cert.notAfter.toUTCString()} (${days} days)` : cert.notAfter.toString()) : 'No expiry found';
    checks.push({ name: 'Expiry', status: expiryStatus, detail });
    const selfSigned = nameToString(cert.subjectEntries) === nameToString(cert.issuerEntries);
    checks.push({ name: 'Self-Signed', status: selfSigned ? 'warn' : 'pass', detail: selfSigned ? 'Certificate is self-signed' : 'Not self-signed' });
  } else {
    checks.push({ name: 'Expiry', status: 'info', detail: 'Not applicable for CSR' });
    checks.push({ name: 'Self-Signed', status: 'info', detail: 'Not applicable for CSR' });
  }
  const spkiInfo = getSPKIInfo(cert.spki);
  if (spkiInfo.keySize) {
    const ok = spkiInfo.keySize >= 2048;
    checks.push({ name: 'Key Size', status: ok ? 'pass' : 'fail', detail: `${spkiInfo.keyAlgo||''} ${spkiInfo.keySize} bits` });
  }
  const weakAlg = cert.sigOid && (SIG_ALG_MD5.includes(cert.sigOid) || SIG_ALG_SHA1.includes(cert.sigOid));
  checks.push({ name: 'MD5/SHA1', status: weakAlg ? 'fail' : 'pass', detail: weakAlg ? `Uses ${cert.sigOid}` : 'Not using MD5 or SHA1' });
  return checks;
}

function renderTable(title, rows) {
  return `
    <div class="kv cardish">
      <div class="table-title">${title}</div>
      <div class="table-grid">
        ${rows.map(r=>`
          <div class="cell label-cell">${r.label}</div>
          <div class="cell value-cell">${r.value||'—'}</div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderChecks(checks){
  return `
    <div class="kv cardish">
      <div class="table-title">Certificate Checks</div>
      <div class="table-grid checks-grid">
        ${checks.map(c=>`
          <div class="cell label-cell">${c.name}</div>
          <div class="cell value-cell"><span class="badge ${c.status}">${c.status.toUpperCase()}</span> ${c.detail||''}</div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderExtensions(exts){
  const rows = exts.map(e=>({ label: `${e.name}${e.critical?' (critical)':''}`, value: e.detail||e.oid }));
  return renderTable('Selected Certificate Extensions', rows);
}

export async function render(root){
  state.csr = state.csr || {};
  root.innerHTML = `
    <section class="section" style="max-width:1300px;margin-inline:auto;">
      <div class="hero-block" style="text-align:center;">
        <h1 class="hero-title">CSR / Certificate Decoder</h1>
        <p class="hero-sub">Paste or upload a CSR/Certificate to decode fields, extensions, and fingerprints.</p>
      </div>
      <div>
        <label class="label">Paste PEM (CSR or Certificate)</label>
        <textarea id="csr-input" class="textarea" placeholder="-----BEGIN CERTIFICATE-----">${state.csr.input||''}</textarea>
        <div class="toolbar" style="margin-top:8px;">
          <input type="file" id="csr-file" accept=".pem,.crt,.cer,.csr" class="btn btn-ghost" style="padding:8px;border-radius:10px;" />
          <button id="csr-clear" class="btn btn-ghost">Clear</button>
          <button id="csr-parse" class="btn btn-primary">Decode</button>
        </div>
        <div id="csr-status" class="status-bar empty" style="display:none;">Waiting for input…</div>
      </div>
      <div id="csr-results" class="kv empty" style="margin-top:12px;">Results will appear here.</div>
    </section>
  `;

  const input = root.querySelector('#csr-input');
  const file = root.querySelector('#csr-file');
  const status = root.querySelector('#csr-status');
  const results = root.querySelector('#csr-results');

  const setStatus = (ok, msg)=>{
    status.style.display = msg ? 'block' : 'none';
    status.className = ok ? 'status-bar ok' : 'status-bar error';
    status.textContent = msg || '';
  };

  const renderOutput = async (pemText)=>{
    try{
      const der = parsePemToDer(pemText);
      let parsed;
      try{
        parsed = parseCertificate(der);
      }catch{
        parsed = parseCSR(der);
      }
      const spkiInfo = getSPKIInfo(parsed.spki);
      const checks = checkStatus(parsed);

      const fingerprints = parsed.spki ? await digest('SHA-256', parsed.spki.value) : null;
      const derSha256 = await digest('SHA-256', der.buffer.slice(der.byteOffset, der.byteOffset+der.byteLength));
      const derSha1 = await digest('SHA-1', der.buffer.slice(der.byteOffset, der.byteOffset+der.byteLength));
      let derMd5 = null;
      try{ derMd5 = await digest('MD5', der.buffer.slice(der.byteOffset, der.byteOffset+der.byteLength)); }catch{}

      const subjectRows = parsed.subjectEntries || [];
      const issuerRows = parsed.type==='certificate' ? (parsed.issuerEntries||[]) : [];

      const properties = [];
      if(parsed.type==='certificate'){
        const vf = (parsed.notBefore && !isNaN(parsed.notBefore)) ? parsed.notBefore.toUTCString() : '—';
        const vt = (parsed.notAfter && !isNaN(parsed.notAfter)) ? parsed.notAfter.toUTCString() : '—';
        properties.push({label:'Valid From', value: vf});
        properties.push({label:'Valid To', value: vt});
      }
      properties.push({label:'Key Size', value: spkiInfo.keySize ? `${spkiInfo.keySize} bits` : '—'});
      properties.push({label:'Key Algorithm', value: spkiInfo.keyAlgo || spkiInfo.algOid || '—'});
      if(parsed.serial) properties.push({label:'Serial Number', value: Array.from(parsed.serial.value||[]).map(b=>b.toString(16).padStart(2,'0')).join(':')});

      const fingerprintRows = [
        { label:'SHA256 Fingerprint', value: toHex(new Uint8Array(derSha256)) },
        { label:'SHA1 Fingerprint', value: toHex(new Uint8Array(derSha1)) },
        { label:'MD5 Fingerprint', value: derMd5 ? toHex(new Uint8Array(derMd5)) : 'Unavailable' },
      ];
      if(fingerprints){
        fingerprintRows.push({ label:'SPKI SHA256 Hex', value: toHex(fingerprints) });
        fingerprintRows.push({ label:'SPKI SHA256 Base64', value: toBase64(fingerprints) });
      }

      results.className = '';
      results.innerHTML = `
        ${renderChecks(checks)}
        ${renderTable('Certificate Subject', subjectRows.map(s=>({label: s.name||s.oid, value: s.value})))}
        ${parsed.type==='certificate' ? renderTable('Certificate Issuer', issuerRows.map(s=>({label: s.name||s.oid, value: s.value}))) : ''}
        ${renderTable('Certificate Properties', properties)}
        ${parsed.extensions?.length ? renderExtensions(parsed.extensions) : ''}
        ${renderTable('Certificate Fingerprints', fingerprintRows)}
      `;
      setStatus(true, parsed.type==='certificate' ? 'Decoded certificate' : 'Decoded CSR');
    }catch(err){
      results.className='kv empty';
      results.textContent = 'Failed to decode. Ensure valid PEM.';
      setStatus(false, err.message || 'Decode failed');
    }
  };

  root.querySelector('#csr-parse').addEventListener('click', ()=>{
    const val = input.value.trim();
    state.csr.input = val;
    saveState();
    renderOutput(val);
  });
  input.addEventListener('input', ()=>{ state.csr.input = input.value; saveState(); });
  root.querySelector('#csr-clear').addEventListener('click', ()=>{
    input.value=''; state.csr.input=''; saveState();
    results.className='kv empty'; results.textContent='Results will appear here.';
    setStatus(false,'');
  });
  file.addEventListener('change', ()=>{
    const f = file.files?.[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = e=>{
      input.value = e.target.result;
      state.csr.input = input.value; saveState();
      renderOutput(input.value);
    };
    reader.readAsText(f);
  });

  if(state.csr.input){
    renderOutput(state.csr.input);
  }
}

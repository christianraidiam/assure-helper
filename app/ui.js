export function toast(msg, ms=2000){
  let t=document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), ms);
}
export function copy(text){
  navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard'));
}
export function download(name, content, type='application/json'){
  const blob=new Blob([content],{type}); const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name; a.click(); URL.revokeObjectURL(a.href);
}

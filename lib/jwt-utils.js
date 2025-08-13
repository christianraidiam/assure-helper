function b64urlToStr(s){
  s=s.replace(/-/g,'+').replace(/_/g,'/'); const pad = s.length%4 ? '='.repeat(4-(s.length%4)) : '';
  return atob(s+pad);
}
export function decodeJWT(token){
  const parts = (token||'').split('.');
  if(parts.length<2) throw new Error('Invalid JWT format');
  const header = JSON.parse(b64urlToStr(parts[0]));
  const payload = JSON.parse(b64urlToStr(parts[1]));
  return { header, payload, raw: { header:parts[0], payload:parts[1], signature:parts[2]||'' } };
}

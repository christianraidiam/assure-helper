const KEY='assure-helper-state';
export const state = {
  navigator: { suite:'OPF CS', type:'Test Module', id:'' },
  jwt: { token:'' },
  json: { input:'' },
  openapi: { spec:'', path:'', method:'get', mode:'response', status:'200', payload:'' },
  flow: { input:'', cards:[] }
};
export function loadState(){
  try{ Object.assign(state, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch{}
}
export function saveState(){
  localStorage.setItem(KEY, JSON.stringify(state));
}

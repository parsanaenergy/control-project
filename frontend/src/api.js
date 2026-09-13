// When the dashboard is opened from another device, use the same host as the
// page itself instead of pointing that device back to its own localhost.
const BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api`;
async function request(path, options={}) {
  const r = await fetch(BASE + path, {headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  let data=null; try { data=await r.json(); } catch { data=null; }
  if(!r.ok){ const err=new Error(typeof data?.detail==='string'?data.detail:data?.detail?.message||'خطای سرور'); err.status=r.status; err.detail=data?.detail; throw err; }
  return data;
}
export const api={
  get:(p)=>request(p),
  post:(p,b)=>request(p,{method:'POST',body:JSON.stringify(b)}),
  patch:(p,b)=>request(p,{method:'PATCH',body:JSON.stringify(b)}),
};

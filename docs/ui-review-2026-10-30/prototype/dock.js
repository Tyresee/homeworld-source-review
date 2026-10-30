(()=>{
const css=`#home-tools{display:none!important}
.dock{position:absolute;z-index:6;display:flex;gap:14px;align-items:flex-end}
.dock.views{left:28px;bottom:28px;background:#fffffff2;border:1px solid #e8e0d4;border-radius:26px;padding:12px 14px;box-shadow:0 10px 30px #5a46301a}
.vt{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;cursor:pointer;font:600 14px "PingFang SC","Noto Sans SC",sans-serif;color:#6f655a;padding:0}
.vt .ic{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;background:#f6f1ea;transition:.15s}
.vt svg{width:40px;height:40px}
.vt[aria-pressed=true]{color:#2b2622}
.vt[aria-pressed=true] .ic{background:#f4e1d5;box-shadow:inset 0 0 0 3px #b9755a}
.vt:hover .ic{transform:translateY(-2px)}
.dock.cam{right:28px;bottom:28px;flex-direction:column;gap:10px}
.cb{width:52px;height:52px;border-radius:16px;background:#fffffff2;border:1px solid #e8e0d4;box-shadow:0 6px 18px #5a463014;display:grid;place-items:center;cursor:pointer;padding:0}
.cb svg{width:26px;height:26px}
.show{position:absolute;z-index:6;left:330px;bottom:28px;display:flex;align-items:center;gap:10px;height:64px;padding:0 22px 0 14px;border-radius:22px;border:0;cursor:pointer;background:#2b2622;color:#fff;font:700 16px "PingFang SC","Noto Sans SC",sans-serif;box-shadow:0 10px 30px #2b26222e}
.show svg{width:40px;height:40px}`;
const st=document.createElement('style');st.textContent=css;document.head.append(st);
const home=document.querySelector('.home');
const I={
room:'<svg viewBox="0 0 40 40" fill="none"><rect x="6" y="20" width="28" height="10" rx="4" fill="#e9a98a"/><rect x="9" y="14" width="22" height="9" rx="4" fill="#f2c3a9"/><rect x="4" y="18" width="6" height="12" rx="3" fill="#d98f6f"/><rect x="30" y="18" width="6" height="12" rx="3" fill="#d98f6f"/><rect x="9" y="30" width="3" height="4" rx="1" fill="#8a5a3c"/><rect x="28" y="30" width="3" height="4" rx="1" fill="#8a5a3c"/></svg>',
garden:'<svg viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="34" rx="16" ry="3" fill="#b9d39a"/><rect x="18" y="20" width="4" height="14" rx="2" fill="#9a6a45"/><circle cx="20" cy="15" r="10" fill="#7fb36a"/><circle cx="14" cy="18" r="6" fill="#8fc27a"/><circle cx="26" cy="18" r="6" fill="#6aa35a"/></svg>',
house:'<svg viewBox="0 0 40 40" fill="none"><path d="M5 19 20 7l15 12" fill="#c96f50"/><path d="M5 19 20 7l15 12v2H5z" fill="#d27d5d"/><rect x="9" y="19" width="22" height="15" rx="2" fill="#f4e8d6"/><rect x="17" y="25" width="6" height="9" rx="2" fill="#9a6a45"/><rect x="11" y="22" width="4" height="4" rx="1" fill="#9fc9d6"/><rect x="25" y="22" width="4" height="4" rx="1" fill="#9fc9d6"/></svg>',
plus:'<svg viewBox="0 0 26 26"><path d="M13 6v14M6 13h14" stroke="#2b2622" stroke-width="2.6" stroke-linecap="round"/></svg>',
minus:'<svg viewBox="0 0 26 26"><path d="M6 13h14" stroke="#2b2622" stroke-width="2.6" stroke-linecap="round"/></svg>',
reset:'<svg viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="8" stroke="#2b2622" stroke-width="2.2"/><circle cx="13" cy="13" r="2.4" fill="#b9755a"/><path d="M13 2v4M13 20v4M2 13h4M20 13h4" stroke="#2b2622" stroke-width="2.2" stroke-linecap="round"/></svg>',
spot:'<svg viewBox="0 0 40 40" fill="none"><path d="M14 6h12l-2 8h-8z" fill="#f2c14e"/><path d="M16 14 6 36h28L24 14z" fill="#f2c14e" opacity=".35"/><circle cx="20" cy="31" r="4" fill="#fff"/></svg>'};
const views=[['view-interior','室内','room'],['view-estate','户外','garden'],['view-building','整栋','house']];
const d=document.createElement('div');d.className='dock views';
for(const [id,label,ic] of views){const b=document.createElement('button');b.className='vt';b.type='button';b.setAttribute('aria-pressed',document.getElementById(id).getAttribute('aria-pressed'));b.innerHTML=`<span class="ic">${I[ic]}</span>${label}`;b.onclick=()=>{document.getElementById(id).click();d.querySelectorAll('.vt').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');};d.append(b);}
home.append(d);
const c=document.createElement('div');c.className='dock cam';
for(const [k,label,fn] of [['plus','放大',null],['minus','缩小',null],['reset','回到默认视角',()=>document.getElementById('reset-view').click()]]){const b=document.createElement('button');b.className='cb';b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML=I[k];if(fn)b.onclick=fn;c.append(b);}
home.append(c);
const s=document.createElement('button');s.className='show';s.type='button';s.innerHTML=I.spot+'表演时间';s.onclick=()=>document.getElementById('stage-toggle').click();home.append(s);
})();

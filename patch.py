from pathlib import Path
p=Path('/mnt/data/karsa-polish/work/index.html')
s=p.read_text()
s=s.replace('''    <div class="menu-group"><div class="menu-label">OPERASIONAL</div>\n      <button class="nav-item" data-page="sales"><i>◇</i>Penjualan</button>\n      <button class="menu-subitem" id="salesProducts"><span>↳</span> Produk & HPP</button>\n      <button class="nav-item" data-page="purchases"><i>□</i>Pembelian</button>\n      <button class="nav-item" data-page="stock"><i>△</i>Stok & HPP</button>\n    </div>''','''    <div class="menu-group"><div class="menu-label">OPERASIONAL</div>\n      <button class="nav-item" data-page="sales"><i>◇</i><span>Penjualan</span><b class="nav-chevron">›</b></button>\n      <button class="menu-subitem" id="salesProducts" data-page="stock"><span>↳</span><span>Produk & HPP</span></button>\n      <button class="nav-item" data-page="purchases"><i>□</i><span>Pembelian</span><b class="nav-chevron">›</b></button>\n      <button class="nav-item" data-page="stock"><i>△</i><span>Stok & HPP</span><b class="nav-chevron">›</b></button>\n    </div>''')
s=s.replace('''    <div class="menu-group menu-tools"><div class="menu-label">MASTER</div>\n      <button class="menu-action" id="cashManage"><i>＋</i>Kelola Kas / Bank</button>\n      <button class="menu-action" id="productManage"><i>＋</i>Kelola Produk</button>\n    </div>''','''    <div class="menu-group menu-tools"><div class="menu-label">MASTER DATA</div>\n      <button class="menu-action" id="cashManage"><i>◈</i><span>Kelola Kas / Bank</span><b class="nav-chevron">›</b></button>\n      <button class="menu-action" id="productManage"><i>◇</i><span>Kelola Produk</span><b class="nav-chevron">›</b></button>\n    </div>''')
s=s.replace('<header class="topbar">','<header class="topbar">')
p.write_text(s)

p=Path('/mnt/data/karsa-polish/work/style.css')
s=p.read_text()
# append premium overrides, intentionally no dependency on changing existing styles
s += r'''
/* KARSA Finance — Premium UX layer */
:root{--gold-soft:#d7b96f1a;--surface:#11110f;--surface-2:#171714;--line-soft:#25241f}
button{font-family:inherit;-webkit-tap-highlight-color:transparent}
.sidebar{background:linear-gradient(180deg,#0c0c0bf7,#0a0a09f7);backdrop-filter:blur(22px);box-shadow:16px 0 70px #0007}
.menu-nav{overflow-y:auto;overscroll-behavior:contain;padding:2px 2px 10px;scrollbar-width:none}.menu-nav::-webkit-scrollbar{display:none}
.menu-group{padding:7px 0}.menu-label{padding:8px 10px 6px;color:#56534c;font-size:8px;letter-spacing:1.8px;font-weight:800}
.nav-item,.menu-action,.menu-subitem{position:relative;overflow:hidden;display:flex;align-items:center;width:100%;border:1px solid transparent;transition:background .22s ease,border-color .22s ease,color .22s ease,transform .18s ease,box-shadow .22s ease}
.nav-item i,.menu-action i{flex:0 0 22px;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;background:#151513;color:#7f765f;transition:transform .22s ease,background .22s ease,color .22s ease}
.nav-item span,.menu-action span{flex:1;min-width:0}.nav-chevron{font-style:normal;font-size:17px;font-weight:400;color:#44413b;transition:transform .22s ease,color .22s ease}
.nav-item:hover,.menu-action:hover,.menu-subitem:hover{background:linear-gradient(90deg,#191814,#141412);border-color:#28261f;color:#eeeae0;transform:translateX(2px)}
.nav-item:hover i,.menu-action:hover i{background:#242015;color:var(--gold);transform:scale(1.05)}
.nav-item:hover .nav-chevron,.menu-action:hover .nav-chevron{color:var(--gold);transform:translateX(2px)}
.nav-item.active{background:linear-gradient(100deg,#201c14,#161614);border-color:#3a3223;box-shadow:inset 3px 0 var(--gold),0 8px 24px #0003}.nav-item.active i{background:#2b2417;color:var(--gold)}.nav-item.active .nav-chevron{color:var(--gold);transform:translateX(2px)}
.menu-subitem{gap:10px;margin:2px 0 2px 16px;width:calc(100% - 16px);padding:10px 12px;border-radius:10px;background:transparent;color:#67645d;font-size:10px;cursor:pointer;text-align:left}.menu-subitem span:first-child{color:#675d49}.menu-subitem:hover{color:#ddd6c8;background:#161512}.menu-subitem.active{color:var(--gold);background:#1b1812;border-color:#312a1d}
.menu-tools{margin-top:3px;padding-top:10px;border-top:1px solid #1b1b19}.menu-action{gap:12px;padding:11px 12px;border-radius:11px;background:transparent;color:#77736b;text-align:left;font-size:11px;cursor:pointer}.menu-action i{font-style:normal}.side-bottom{padding-top:8px}
.topbar{background:linear-gradient(180deg,#0b0b0bf2,#0b0b0bd9);backdrop-filter:blur(18px)}.top-title{min-width:0}.brand-mark{position:relative}.brand-mark:after{content:"";position:absolute;inset:-5px;border:1px solid #d7b96f18;border-radius:14px;pointer-events:none}.top-action{transition:transform .18s ease,border-color .2s ease,background .2s ease,box-shadow .2s ease}.top-action:hover{transform:translateY(-1px);border-color:#4b402c;background:#191711;box-shadow:0 8px 22px #0004}
.view.active{animation:viewPremium .32s cubic-bezier(.2,.7,.2,1)}@keyframes viewPremium{from{opacity:0;transform:translateY(10px) scale(.995)}to{opacity:1;transform:none}}
.panel,.stat-card,.hero-banner,.export-card{transition:border-color .22s ease,box-shadow .22s ease,transform .22s ease}.panel:hover{border-color:#292823}.stat-card:hover{border-color:#302c23;transform:translateY(-2px);box-shadow:0 12px 35px #0004}.export-card:hover{transform:translateY(-2px);box-shadow:0 12px 30px #0004}
.bottom-nav{border-color:#3a352b!important;background:linear-gradient(180deg,#191916f7,#10100ff7)!important}.bottom-item{transition:transform .18s ease,background .2s ease,color .2s ease}.bottom-item:active{transform:scale(.93)}.bottom-item.active{box-shadow:inset 0 0 0 1px #4a3e28,0 5px 20px #0003}.bottom-main{box-shadow:0 8px 24px #a57e3638}
.modal{backdrop-filter:blur(9px)}.modal-card{background:linear-gradient(180deg,#151513,#10100f);border-color:#343129;box-shadow:0 35px 100px #000c}.modal-card:before{content:"";display:block;width:42px;height:4px;border-radius:99px;background:#39362f;margin:0 auto 12px;opacity:.8}.field input,.field select,.field textarea{transition:border-color .2s,box-shadow .2s,background .2s}.field input:focus,.field select:focus,.field textarea:focus{border-color:#9b7c3d;box-shadow:0 0 0 3px #d7b96f12;background:#0d0d0c}.row-edit{transition:transform .15s,background .2s,border-color .2s}.row-edit:hover{transform:translateY(-1px)}
.ripple{position:absolute;border-radius:50%;background:#d7b96f26;transform:scale(0);animation:karsaRipple .55s ease-out;pointer-events:none}.@keyframes karsaRipple{to{transform:scale(3.5);opacity:0}}
@media(max-width:1099px){
  .sidebar{width:min(340px,91vw);padding:16px 12px 14px;border-right-color:#302d26}.side-brand{padding:3px 8px 20px}.profile-mini{margin-bottom:10px}.menu-nav{padding-bottom:18px}.menu-group{padding:5px 0}.nav-item{min-height:48px;border-radius:13px;padding:11px 12px}.menu-subitem{min-height:44px;margin-left:15px}.menu-action{min-height:48px;border-radius:13px}.menu-label{padding-left:10px}
  .topbar{border-bottom-color:#25231f;box-shadow:0 8px 25px #0003}.top-actions .top-action{box-shadow:0 4px 15px #0003}
  .panel{box-shadow:0 8px 30px #0003}.bottom-nav{box-shadow:0 18px 60px #000b!important}
}
@media(max-width:620px){
  .topbar{backdrop-filter:blur(20px)}.top-title .eyebrow{opacity:.75}.top-actions{gap:6px}.top-action{border-radius:12px}.view{padding-top:18px}.panel{box-shadow:none}.panel:hover,.stat-card:hover,.export-card:hover{transform:none;box-shadow:none}.menu-backdrop{backdrop-filter:blur(4px)}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
'''
# fix invalid selector from append typo
s=s.replace('.@keyframes karsaRipple','@keyframes karsaRipple')
p.write_text(s)

p=Path('/mnt/data/karsa-polish/work/app.js')
s=p.read_text()
old="""  function go(page){\n    document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));\n    document.querySelectorAll('.top-nav[data-page], .bottom-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));\n    document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===page));\n    const title=[...document.querySelectorAll('.nav-item'),...document.querySelectorAll('.bottom-item[data-page]')].find(x=>x.dataset.page===page); $('pageTitle').textContent=title?title.textContent.trim():page;\n    window.scrollTo({top:0,behavior:'smooth'});\n  }"""
new="""  function go(page){\n    const view=document.getElementById(page);\n    if(!view){ toast('Halaman '+page+' belum tersedia.',false); return false; }\n    document.querySelectorAll('.nav-item,.menu-subitem').forEach(x=>x.classList.toggle('active',x.dataset.page===page));\n    document.querySelectorAll('.top-nav[data-page], .bottom-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));\n    document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===page));\n    const title=[...document.querySelectorAll('.nav-item,.menu-subitem'),...document.querySelectorAll('.bottom-item[data-page]')].find(x=>x.dataset.page===page);\n    if($('pageTitle')) $('pageTitle').textContent=title?title.textContent.replace(/[›↳]/g,'').trim():page;\n    closeMenu();\n    window.scrollTo({top:0,behavior:'smooth'});\n    return true;\n  }"""
if old not in s: print('go old not found')
else: s=s.replace(old,new)
s=s.replace("$('salesProducts')?.addEventListener('click',()=>{closeMenu();go('stock');});","$('salesProducts')?.addEventListener('click',()=>go('stock'));")
# Replace nav binding with unified, safer binding
old2="""    document.querySelectorAll('.bottom-item[data-page]').forEach(b=>b.addEventListener('click',()=>{go(b.dataset.page);closeMenu();}));\n    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});\n    document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{go(b.dataset.page);closeMenu();}));\n    document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));"""
new2="""    document.querySelectorAll('.bottom-item[data-page], .nav-item[data-page], .menu-subitem[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));\n    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});\n    document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));\n    document.addEventListener('click',e=>{\n      const btn=e.target.closest('button');\n      if(!btn || btn.disabled) return;\n      const rect=btn.getBoundingClientRect(), size=Math.max(rect.width,rect.height);\n      const r=document.createElement('span'); r.className='ripple'; r.style.width=r.style.height=size+'px';\n      r.style.left=(e.clientX-rect.left-size/2)+'px'; r.style.top=(e.clientY-rect.top-size/2)+'px';\n      btn.appendChild(r); setTimeout(()=>r.remove(),600);\n    });"""
if old2 not in s: print('bind old2 not found')
else: s=s.replace(old2,new2)
p.write_text(s)

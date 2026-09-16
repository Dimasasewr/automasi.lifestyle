/* KARSA Finance System — production-style client layer
   Supabase Auth + PostgreSQL + double-entry journals + CSV/XLSX export.
   No public registration: users are created in Supabase Authentication. */
(() => {
  'use strict';

  const SB_URL = String(window.KARSA_CONFIG?.SUPABASE_URL || '').trim();
  const SB_KEY = String(window.KARSA_CONFIG?.SUPABASE_KEY || '').trim();
  const DEMO_MODE = Boolean(window.KARSA_CONFIG?.DEMO_MODE);
  const state = {
    transactions: [], sales: [], purchases: [], ar: [], ap: [], arPayments: [], apPayments: [],
    products: [], hpp: [], journals: [], journalLines: [], accounts: [], cashAccounts: [], costComponents: [], stockMovements: [], profile: null
  };
  let sb = null;
  let user = null;
  let toastTimer = null;

  const $ = id => document.getElementById(id);
  const num = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v ?? '').trim();
    if (!s) return 0;
    s = s.replace(/Rp/gi,'').replace(/\s/g,'');
    // Nominal Indonesia: 1.000 / 1.000.000. Koma diperlakukan sebagai desimal bila ada.
    if (s.includes('.') && s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
    else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
    else s = s.replace(/,/g,'');
    s = s.replace(/[^0-9.-]/g,'');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const moneyNames = new Set(['amount','total','paid','opening_balance','selling_price','price','unit_price','hpp','cost','debit','credit']);
  const formatNominal = v => {
    const n = Math.max(0, Math.trunc(num(v)));
    return n ? new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(n) : '';
  };
  const money = v => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num(v));
  const dateToday = () => new Date().toISOString().slice(0, 10);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'data';
  const configured = () => !!(SB_URL && SB_KEY && !/PASTE_/i.test(SB_URL) && !/PASTE_/i.test(SB_KEY));

  function toast(text, ok = true) {
    const el = $('toast'); if (!el) return;
    el.textContent = text; el.classList.toggle('error', !ok); el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function authMessage(text, ok = false) {
    const el = $('authMessage'); if (!el) return;
    el.textContent = text; el.className = 'auth-message ' + (ok ? 'ok' : 'error');
  }
  function setLoader(text) { if ($('loaderStatus')) $('loaderStatus').textContent = text; }
  function showLoader(on) { $('loader')?.classList.toggle('hidden', !on); }
  function showAuth() { $('auth')?.classList.remove('hidden'); $('app')?.classList.add('hidden'); }
  function showApp() { $('auth')?.classList.add('hidden'); $('app')?.classList.remove('hidden'); }

  function errorText(error) {
    if (!error) return 'Terjadi kesalahan.';
    return error.message || error.details || error.hint || 'Terjadi kesalahan pada Supabase.';
  }
  async function withTimeout(promise, ms = 12000, label = 'Permintaan Supabase') {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout setelah ${Math.round(ms / 1000)} detik.`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function query(table, columns = '*', order = 'created_at', ascending = false) {
    let q = sb.from(table).select(columns);
    if (order) q = q.order(order, { ascending });
    const { data, error } = await withTimeout(q, 12000, `Memuat ${table}`);
    if (error) throw error;
    return data || [];
  }
  async function insert(table, row) {
    const payload = { ...row };
    if (user && ['transactions','sales','purchases','ar_payments','ap_payments','products','stock_movements','journal_headers'].includes(table)) payload.created_by = user.id;
    const { data, error } = await withTimeout(sb.from(table).insert(payload).select().single(), 12000, `Menyimpan ${table}`);
    if (error) throw error;
    return data;
  }

  async function loadAll() {
    const tasks = [
      ['transactions','transactions','transaction_date'], ['sales','sales','sale_date'], ['purchases','purchases','purchase_date'],
      ['accounts_receivable','ar','invoice_date'], ['accounts_payable','ap','invoice_date'], ['ar_payments','arPayments','payment_date'],
      ['ap_payments','apPayments','payment_date'], ['products','products','created_at'], ['accounts','accounts','code'],
      ['cash_accounts','cashAccounts','created_at'], ['journal_headers','journals','journal_date'],
      ['v_product_hpp','hpp','name'], ['product_cost_components','costComponents','created_at'], ['stock_movements','stockMovements','movement_date']
    ];

    const results = await Promise.allSettled(tasks.map(([table, key, order]) => query(table, '*', order, false)));
    const warnings = [];
    results.forEach((result, i) => {
      const [table, key] = tasks[i];
      if (result.status === 'fulfilled') {
        state[key] = result.value || [];
      } else {
        state[key] = [];
        warnings.push(`${table}: ${errorText(result.reason)}`);
        console.warn('[KARSA Finance] Gagal memuat', table, result.reason);
      }
    });

    try {
      state.journalLines = await query('journal_lines', '*', 'line_no', true);
    } catch (e) {
      state.journalLines = [];
      warnings.push(`journal_lines: ${errorText(e)}`);
    }

    try {
      const { data, error } = await withTimeout(
        sb.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        12000,
        'Memuat profile'
      );
      if (error) throw error;
      state.profile = data;
    } catch (e) {
      state.profile = null;
      console.warn('[KARSA Finance] Profile tidak dapat dimuat:', e);
    }

    window.KARSA_STATE = state;
    return warnings;
  }

  function account(code) { return state.accounts.find(a => a.code === code); }
  function accountId(code) { return account(code)?.id || null; }
  function cashId() { return state.cashAccounts.find(c=>c.active!==false)?.id || null; }
  function ensureAccount(code, label) { const id = accountId(code); if (!id) throw new Error(`Akun ${code} (${label}) belum ada. Jalankan SQL database KARSA terlebih dahulu.`); return id; }
  function ensureCash() { const id = cashId(); if (!id) throw new Error('Belum ada Kas/Bank. Gunakan menu ☰ → Kelola Kas / Bank untuk membuat rekening.'); return id; }

  async function ensureDefaultCashAccount() {
    if (!sb || !user || state.cashAccounts.length) return;
    const kas = account('1100');
    if (!kas) return;
    try {
      await insert('cash_accounts',{name:'Kas Utama',account_type:'cash',account_id:kas.id,opening_balance:0,active:true});
      state.cashAccounts = await query('cash_accounts','*','created_at',false);
    } catch(e) { console.warn('[KARSA Finance] Default Kas tidak dibuat:',e); }
  }
  function nextNo(prefix, rows, field) {
    const max = rows.reduce((m, r) => { const x = String(r[field] || '').match(/(\d+)$/); return x ? Math.max(m, Number(x[1])) : m; }, 0);
    return `${prefix}-${String(max + 1).padStart(5, '0')}`;
  }

  async function createJournal({ type, date, description, sourceType, sourceId, lines }) {
    const clean = lines.filter(x => num(x.debit) > 0 || num(x.credit) > 0).map((x, i) => ({ ...x, debit: num(x.debit), credit: num(x.credit), line_no: i + 1 }));
    const debit = clean.reduce((s, x) => s + x.debit, 0);
    const credit = clean.reduce((s, x) => s + x.credit, 0);
    if (!clean.length) throw new Error('Jurnal tidak memiliki baris.');
    if (Math.abs(debit - credit) > 0.01) throw new Error(`Jurnal tidak balance. Debit ${money(debit)} ≠ Kredit ${money(credit)}.`);
    for (const line of clean) if (!line.account_id) throw new Error('Ada akun jurnal yang belum tersedia. Jalankan SQL setup.');
    const header = await insert('journal_headers', {
      journal_no: nextNo('JRN', state.journals, 'journal_no'), journal_date: date || dateToday(), journal_type: type,
      source_type: sourceType || null, source_id: sourceId || null, description, status: 'posted'
    });
    const { error } = await withTimeout(sb.from('journal_lines').insert(clean.map(x => ({ journal_id: header.id, line_no: x.line_no, account_id: x.account_id, description: x.description || description, debit: x.debit, credit: x.credit }))), 12000, 'Menyimpan detail jurnal');
    if (error) throw error;
    return header;
  }

  async function addCashTransaction(data) {
    const amount = num(data.cash_in) || num(data.cash_out);
    const direction = num(data.cash_in) > 0 ? 'in' : 'out';
    if ((num(data.cash_in) > 0) === (num(data.cash_out) > 0)) throw new Error('Isi salah satu: Uang Masuk atau Uang Keluar.');
    const { data: row, error } = await withTimeout(sb.rpc('post_cash_transaction', {
      p_date: data.transaction_date || dateToday(), p_direction: direction, p_category: data.category, p_amount: amount,
      p_cash_account_id: data.cash_account_id || null, p_description: String(data.description || '').trim(),
      p_reference: data.reference_no || null, p_pic: data.pic || null
    }), 12000, 'Menyimpan transaksi kas');
    if (error) throw error;
    return row;
  }

  function bindMoneyInputs(root) {
    (root || document).querySelectorAll('.money-input[data-money]').forEach(input => {
      const normalize = () => { input.value = formatNominal(input.value); };
      input.addEventListener('focus', () => { if (input.value === '0') input.value = ''; input.select(); });
      input.addEventListener('input', () => {
        const raw = input.value.replace(/[^0-9]/g,'');
        input.value = raw ? new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(raw)) : '';
      });
      input.addEventListener('blur', normalize);
      normalize();
    });
  }

  function formField(label, name, type = 'text', value = '', extra = '') {
    const isMoney = type === 'number' && moneyNames.has(name);
    if (isMoney) {
      const attrs = extra.replace(/\b(min|step)="[^"]*"/g,'');
      return `<div class="field money-field"><label>${esc(label)}<input name="${esc(name)}" type="text" inputmode="numeric" autocomplete="off" class="money-input" data-money="1" value="${esc(formatNominal(value))}" ${attrs}></label><small class="field-help">Contoh: 1.000</small></div>`;
    }
    return `<div class="field"><label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${extra}></label></div>`;
  }
  function selectField(label, name, options, value = '', extra = '') {
    return `<div class="field"><label>${esc(label)}<select name="${esc(name)}" ${extra}><option value="">Pilih...</option>${options.map(o => `<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label></div>`;
  }
  function modal(title, eyebrow, html, onSubmit) {
    $('modalEyebrow').textContent = eyebrow; $('modalTitle').textContent = title; $('modalForm').innerHTML = html + '<div class="form-actions"><button type="button" class="close-form" id="cancelForm">Batal</button><button class="gold-btn" type="submit">Simpan & Posting</button></div>';
    $('modal').classList.remove('hidden');
    bindMoneyInputs($('modalForm'));
    $('cancelForm').onclick = closeModal;
    $('modalForm').onsubmit = async e => {
      e.preventDefault();
      const submit = e.currentTarget.querySelector('button[type="submit"]');
      if (submit?.disabled) return;
      if (submit) { submit.disabled = true; submit.dataset.originalText = submit.textContent; submit.textContent = 'Menyimpan…'; }
      const fd = new FormData(e.currentTarget);
      try { await onSubmit(fd); closeModal(); await refresh(); toast('Data berhasil disimpan.'); }
      catch (err) { toast(errorText(err), false); }
      finally { if (submit) { submit.disabled = false; submit.textContent = submit.dataset.originalText || 'Simpan & Posting'; } }
    };
  }
  function closeModal() { $('modal')?.classList.add('hidden'); $('modalForm').innerHTML = ''; }

  function cashOptions() { return state.cashAccounts.filter(c=>c.active!==false).map(c => ({ value: c.id, label: `${c.name} (${c.account_type === 'bank' ? 'Bank' : 'Kas'})` })); }

  function openingBalanceModal() {
    const cash=cashOptions();
    if(!cash.length){ toast('Belum ada Kas/Bank. Buka ☰ → Kelola Kas / Bank terlebih dahulu.',false); return; }
    modal('Saldo awal','OPENING BALANCE',`<div class="notice">Saldo awal dipakai sebagai titik awal rekening. Pilih <b>Tambah</b> untuk menambah saldo atau <b>Kurangi</b> untuk mengoreksi saldo awal. Perubahan dicatat ke jurnal.</div><div class="form-grid">
      ${formField('Tanggal','date','date',dateToday(),'required')}
      ${selectField('Kas / Bank','cash_account_id',cash,'','required')}
      ${selectField('Aksi','action',[{value:'add',label:'Tambah saldo awal'},{value:'subtract',label:'Kurangi saldo awal'}],'add','required')}
      ${formField('Nominal','amount','number','','min="0.01" step="0.01" required')}
      <div class="field full"><label>Keterangan<textarea name="description" rows="3" required>Penyesuaian saldo awal</textarea></label></div>
    </div>`, async fd=>{
      const id=fd.get('cash_account_id'), action=fd.get('action'), amount=num(fd.get('amount'));
      if(amount<=0) throw new Error('Nominal harus lebih dari 0.');
      const c=state.cashAccounts.find(x=>x.id===id);
      if(!c) throw new Error('Kas/Bank tidak ditemukan.');
      if(action==='subtract' && num(c.opening_balance)-amount<0) throw new Error('Saldo awal tidak boleh menjadi negatif.');
      const {error}=await withTimeout(sb.rpc('post_opening_balance_adjustment',{p_date:fd.get('date')||dateToday(),p_cash_account_id:id,p_action:action,p_amount:amount,p_description:String(fd.get('description')||'Penyesuaian saldo awal').trim()}),12000,'Menyimpan saldo awal');
      if(error) throw error;
    });
  }

  function cashManageModal(){
    modal('Kelola Kas / Bank','MASTER KAS & BANK',`<div class="notice">Buat rekening yang akan muncul sebagai pilihan pada transaksi. Sistem menyediakan akun Kas dan Bank dasar.</div><div class="form-grid">
      ${formField('Nama rekening','name','text','','placeholder="Kas Utama / BCA / Mandiri" required')}
      ${selectField('Jenis','account_type',[{value:'cash',label:'Kas'},{value:'bank',label:'Bank'}],'cash','required')}
      ${formField('Saldo awal','opening_balance','number','0','min="0" step="0.01"')}
    </div>`, async fd=>{
      const type=fd.get('account_type'), code=type==='bank'?'1200':'1100', aid=accountId(code);
      if(!aid) throw new Error(`Akun ${code} belum tersedia. Jalankan SQL setup KARSA.`);
      const name=String(fd.get('name')||'').trim(); if(!name) throw new Error('Nama rekening wajib diisi.');
      const opening=num(fd.get('opening_balance'));
      const created=await insert('cash_accounts',{name,account_type:type,account_id:aid,opening_balance:0,active:true});
      if(opening>0){
        const {error}=await withTimeout(sb.rpc('post_opening_balance_adjustment',{p_date:dateToday(),p_cash_account_id:created.id,p_action:'add',p_amount:opening,p_description:`Saldo awal ${name}`}),12000,'Menyimpan saldo awal rekening');
        if(error) throw error;
      }
    });
  }

  function transactionModal() {
    const cash = cashOptions();
    modal('Tambah transaksi', 'TRANSACTION', `<div class="form-grid">
      ${formField('Tanggal','transaction_date','date',dateToday(),'required')}
      ${selectField('Jenis','direction',[{value:'in',label:'Uang Masuk'},{value:'out',label:'Uang Keluar'}],'in','required')}
      ${selectField('Kategori','category',[{value:'Penjualan',label:'Penjualan'},{value:'Modal',label:'Modal'},{value:'Pelunasan Piutang',label:'Pelunasan Piutang'},{value:'Pendapatan Lain',label:'Pendapatan Lain'},{value:'Pembelian',label:'Pembelian'},{value:'Pengeluaran',label:'Pengeluaran'},{value:'Bayar Hutang',label:'Bayar Hutang'},{value:'Prive',label:'Prive'}],'','required')}
      ${formField('Nominal','amount','number','','min="0" step="0.01" required')}
      ${selectField('Kas / Bank','cash_account_id',cash,'',cash.length?'required':'')}
      ${formField('Referensi','reference_no','text','','placeholder="Invoice / bukti"')}
      ${formField('PIC','pic','text','','placeholder="Nama PIC"')}
      <div class="field full"><label>Keterangan<textarea name="description" rows="3" required></textarea></label></div>
    </div>`, async fd => {
      const direction = fd.get('direction'); const amount = num(fd.get('amount'));
      if (amount <= 0) throw new Error('Nominal harus lebih dari 0.');
      await addCashTransaction({ transaction_date: fd.get('transaction_date'), category: fd.get('category'), description: fd.get('description'), cash_account_id: fd.get('cash_account_id'), cash_in: direction==='in'?amount:0, cash_out: direction==='out'?amount:0, reference_no: fd.get('reference_no'), pic: fd.get('pic'), source_type:'manual' });
    });
  }

  function saleModal() {
    modal('Tambah penjualan', 'SALES', `<div class="form-grid">
      ${formField('Tanggal','sale_date','date',dateToday(),'required')}
      ${formField('Pelanggan','customer_name','text','','placeholder="Nama pelanggan"')}
      ${formField('Total Penjualan','total','number','','min="0" step="0.01" required')}
      ${formField('Dibayar','paid','number','0','min="0" step="0.01" required')}
      ${formField('Jatuh Tempo','due_date','date')}
      ${selectField('Kas / Bank','cash_account_id',cashOptions())}
    </div>`, async fd => {
      const total=num(fd.get('total')), paid=num(fd.get('paid'));
      if(total<=0)throw new Error('Total penjualan harus lebih dari 0.');
      if(paid<0||paid>total)throw new Error('Nominal dibayar tidak valid.');
      const { error } = await withTimeout(sb.rpc('post_sale', {
        p_date: fd.get('sale_date') || dateToday(), p_customer: fd.get('customer_name') || null, p_total: total, p_paid: paid,
        p_due: fd.get('due_date') || null, p_cash_account_id: fd.get('cash_account_id') || null
      }), 12000, 'Menyimpan penjualan');
      if(error)throw error;
    });
  }

  function purchaseModal() {
    modal('Tambah pembelian', 'PURCHASES', `<div class="form-grid">
      ${formField('Tanggal','purchase_date','date',dateToday(),'required')}
      ${formField('Supplier','supplier_name','text','','placeholder="Nama supplier"')}
      ${formField('Total Pembelian','total','number','','min="0" step="0.01" required')}
      ${formField('Dibayar','paid','number','0','min="0" step="0.01" required')}
      ${formField('Jatuh Tempo','due_date','date')}
      ${selectField('Kas / Bank','cash_account_id',cashOptions())}
    </div>`, async fd => {
      const total=num(fd.get('total')), paid=num(fd.get('paid'));
      if(total<=0)throw new Error('Total pembelian harus lebih dari 0.');
      if(paid<0||paid>total)throw new Error('Nominal dibayar tidak valid.');
      const { error } = await withTimeout(sb.rpc('post_purchase', {
        p_date: fd.get('purchase_date') || dateToday(), p_supplier: fd.get('supplier_name') || null, p_total: total, p_paid: paid,
        p_due: fd.get('due_date') || null, p_cash_account_id: fd.get('cash_account_id') || null
      }), 12000, 'Menyimpan penjualan');
      if(error)throw error;
    });
  }

  function productModal() {
    modal('Tambah produk & HPP', 'PRODUCT / HPP', `<div class="form-grid">
      ${formField('SKU','sku','text','','required')}${formField('Nama Produk','name','text','','required')}
      ${formField('Ukuran','size','text','','placeholder="S / M / L / XL"')}${formField('Jenis Kain','fabric_type','text')}
      ${formField('Harga Jual','selling_price','number','0','min="0" step="0.01" required')}${formField('Stok Awal','stock_qty','number','0','min="0" step="0.001"')}
      ${formField('Batas Reorder','reorder_level','number','0','min="0" step="0.001"')}
      <div class="field full"><label>Komponen HPP <span class="field-help">format: nama|kelompok|qty|harga satuan, satu per baris</span><textarea name="components" rows="8" placeholder="Kain Utama|bahan|1|45000\nSatin 1|bahan|0.2|10000\nResleting|aksesoris|1|3000\nSticker|packaging|1|500\nPaper Bag|packaging|1|2500\nThanks Card|packaging|1|1000\nPlastik Zip Lock|packaging|1|700\nHandtag|aksesoris|1|1000\nTali Rami|aksesoris|1|500\nOngkos Produksi|produksi|1|15000"></textarea></label></div>
    </div>`, async fd => {
      const row=await insert('products',{sku:fd.get('sku').trim(),name:fd.get('name').trim(),size:fd.get('size')||null,fabric_type:fd.get('fabric_type')||null,selling_price:num(fd.get('selling_price')),stock_qty:num(fd.get('stock_qty')),reorder_level:num(fd.get('reorder_level')),active:true});
      const lines=String(fd.get('components')||'').split('\n').map(x=>x.trim()).filter(Boolean);
      const allowed=new Set(['bahan','produksi','packaging','aksesoris']);
      for(const line of lines){const [name,group='bahan',qty='1',cost='0']=line.split('|').map(x=>x.trim()); if(!name)continue; const g=allowed.has(group.toLowerCase())?group.toLowerCase():'bahan'; await insert('product_cost_components',{product_id:row.id,component_group:g,component_name:name,unit:'pcs',qty:num(qty),unit_cost:num(cost)});}
      if(num(fd.get('stock_qty'))>0) await insert('stock_movements',{movement_no:nextNo('STK',state.stockMovements,'movement_no'),movement_date:dateToday(),product_id:row.id,movement_type:'in',qty:num(fd.get('stock_qty')),unit_cost:0,source_type:'opening',note:'Stok awal'});
    });
  }

  function renderTable(target, headers, rows, empty='Belum ada data.') {
    const el=$(target); if(!el)return;
    if(!rows.length){el.innerHTML=`<div class="empty">${esc(empty)}</div>`;return;}
    el.innerHTML=`<table><thead><tr>${headers.map(h=>`<th>${esc(h.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${h.render ? h.render(r) : esc(r[h.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  // Safe table helper (separate from renderTable to keep cell callbacks readable).
  function table(target, columns, rows, empty='Belum ada data.') {
    const el=$(target); if(!el)return;
    if(!rows.length){el.innerHTML=`<div class="empty">${esc(empty)}</div>`;return;}
    el.innerHTML=`<table><thead><tr>${columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${columns.map(c=>`<td>${c.render?c.render(row):esc(row[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function renderDashboard() {
    const t=state.transactions.filter(x=>x.status==='posted'); const inSum=t.reduce((s,x)=>s+num(x.cash_in),0), outSum=t.reduce((s,x)=>s+num(x.cash_out),0);
    const ar=state.ar.reduce((s,x)=>s+Math.max(0,num(x.amount)-num(x.paid)),0), ap=state.ap.reduce((s,x)=>s+Math.max(0,num(x.amount)-num(x.paid)),0);
    const saleCash=state.sales.reduce((s,x)=>s+num(x.paid),0), purchaseCash=state.purchases.reduce((s,x)=>s+num(x.paid),0);
    const bal=state.cashAccounts.reduce((s,x)=>{const ins=state.transactions.filter(t=>t.cash_account_id===x.id).reduce((a,t)=>a+num(t.cash_in),0)+state.sales.filter(t=>t.cash_account_id===x.id).reduce((a,t)=>a+num(t.paid),0);const outs=state.transactions.filter(t=>t.cash_account_id===x.id).reduce((a,t)=>a+num(t.cash_out),0)+state.purchases.filter(t=>t.cash_account_id===x.id).reduce((a,t)=>a+num(t.paid),0);return s+num(x.opening_balance)+ins-outs},0);
    ['sBalance','heroBalance'].forEach(id=>$(id)&&( $(id).textContent=money(bal) )); if($('sIn'))$('sIn').textContent=money(inSum);if($('sOut'))$('sOut').textContent=money(outSum);if($('sAR'))$('sAR').textContent=money(ar);if($('sAP'))$('sAP').textContent=money(ap);
    table('recent',[{label:'Tanggal',render:r=>esc(r.transaction_date)},{label:'Keterangan',render:r=>esc(r.description)},{label:'Masuk',render:r=>`<span class="money-in">${money(r.cash_in)}</span>`},{label:'Keluar',render:r=>`<span class="money-out">${money(r.cash_out)}</span>`}],t.slice(0,8));
    $('controlList').innerHTML=[
      `<div class="attention-item"><div class="bar"></div><div><strong>${state.journals.length} jurnal tercatat</strong><small>Jurnal tersimpan di database Supabase.</small></div></div>`,
      `<div class="attention-item"><div class="bar"></div><div><strong>${state.products.length} produk aktif</strong><small>HPP dihitung dari komponen produk.</small></div></div>`,
      `<div class="attention-item"><div class="bar ${ar>0?'red':''}"></div><div><strong>${money(ar)} piutang tersisa</strong><small>Periksa jatuh tempo pada menu Piutang.</small></div></div>`,
      `<div class="attention-item"><div class="bar ${ap>0?'red':''}"></div><div><strong>${money(ap)} hutang tersisa</strong><small>Periksa kewajiban pada menu Hutang.</small></div></div>`
    ].join('');
  }
  function renderCash(){
    const totalIn=state.transactions.reduce((s,x)=>s+num(x.cash_in),0)+state.sales.reduce((s,x)=>s+num(x.paid),0), totalOut=state.transactions.reduce((s,x)=>s+num(x.cash_out),0)+state.purchases.reduce((s,x)=>s+num(x.paid),0), opening=state.cashAccounts.reduce((s,x)=>s+num(x.opening_balance),0);
    const cards=state.cashAccounts.map(c=>{const ins=state.transactions.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.cash_in),0)+state.sales.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.paid),0),outs=state.transactions.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.cash_out),0)+state.purchases.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.paid),0);return `<div class="stat-card"><span>${esc(c.name)}</span><strong>${money(num(c.opening_balance)+ins-outs)}</strong><small>Awal ${money(c.opening_balance)} · Masuk ${money(ins)} · Keluar ${money(outs)}</small></div>`}).join('');
    $('cashCards').innerHTML=cards+`<div class="stat-card"><span>Total Saldo</span><strong>${money(opening+totalIn-totalOut)}</strong><small>Semua Kas & Bank</small></div>`;
    table('cashTable',[{label:'Tanggal',render:r=>esc(r.transaction_date)},{label:'Rekening',render:r=>esc(state.cashAccounts.find(c=>c.id===r.cash_account_id)?.name||'-')},{label:'Keterangan',render:r=>esc(r.description)},{label:'Masuk',render:r=>`<span class="money-in">${money(r.cash_in)}</span>`},{label:'Keluar',render:r=>`<span class="money-out">${money(r.cash_out)}</span>`}],state.transactions);
  }
  function editTransactionModal(row){
    const cash = cashOptions();
    modal('Perbaiki transaksi','EDIT TRANSACTION',`<div class="notice">Perubahan akan memperbarui transaksi dan jurnal pasangan terkait. Gunakan ini untuk koreksi nominal, tanggal, rekening, kategori, referensi, atau keterangan.</div><div class="form-grid">
      ${formField('Tanggal','transaction_date','date',row.transaction_date,'required')}
      ${selectField('Jenis','direction',[{value:'in',label:'Uang Masuk'},{value:'out',label:'Uang Keluar'}],num(row.cash_in)>0?'in':'out','required')}
      ${selectField('Kategori','category',[{value:'Penjualan',label:'Penjualan'},{value:'Modal',label:'Modal'},{value:'Pelunasan Piutang',label:'Pelunasan Piutang'},{value:'Pendapatan Lain',label:'Pendapatan Lain'},{value:'Pembelian',label:'Pembelian'},{value:'Pengeluaran',label:'Pengeluaran'},{value:'Bayar Hutang',label:'Bayar Hutang'},{value:'Prive',label:'Prive'}],row.category,'required')}
      ${formField('Nominal','amount','number',num(row.cash_in)||num(row.cash_out),'required')}
      ${selectField('Kas / Bank','cash_account_id',cash,row.cash_account_id,'required')}
      ${formField('Referensi','reference_no','text',row.reference_no||'')}
      ${formField('PIC','pic','text',row.pic||'')}
      <div class="field full"><label>Keterangan<textarea name="description" rows="3" required>${esc(row.description||'')}</textarea></label></div>
    </div>`, async fd=>{
      const direction=fd.get('direction'), amount=num(fd.get('amount'));
      if(amount<=0) throw new Error('Nominal harus lebih dari 0.');
      const {error}=await withTimeout(sb.rpc('update_cash_transaction',{p_id:row.id,p_date:fd.get('transaction_date')||dateToday(),p_direction:direction,p_category:fd.get('category'),p_amount:amount,p_cash_account_id:fd.get('cash_account_id'),p_description:String(fd.get('description')||'').trim(),p_reference:fd.get('reference_no')||null,p_pic:fd.get('pic')||null}),12000,'Memperbarui transaksi');
      if(error) throw error;
    });
  }
  function editSaleModal(row){
    modal('Perbaiki penjualan','EDIT SALES',`<div class="notice">Koreksi total, pembayaran, pelanggan, tanggal, jatuh tempo atau rekening. Jurnal dan piutang terkait ikut disesuaikan.</div><div class="form-grid">
      ${formField('Tanggal','sale_date','date',row.sale_date,'required')}
      ${formField('Pelanggan','customer_name','text',row.customer_name||'')}
      ${formField('Total Penjualan','total','number',num(row.total),'required')}
      ${formField('Dibayar','paid','number',num(row.paid),'required')}
      ${formField('Jatuh Tempo','due_date','date',row.due_date||'')}
      ${selectField('Kas / Bank','cash_account_id',cashOptions(),row.cash_account_id,row.paid>0?'required':'')}
    </div>`, async fd=>{
      const total=num(fd.get('total')),paid=num(fd.get('paid'));
      if(total<=0||paid<0||paid>total) throw new Error('Nominal penjualan tidak valid.');
      if(paid>0&&!fd.get('cash_account_id')) throw new Error('Kas/Bank wajib dipilih jika ada pembayaran.');
      const {error}=await withTimeout(sb.rpc('update_sale',{p_id:row.id,p_date:fd.get('sale_date')||dateToday(),p_customer:fd.get('customer_name')||null,p_total:total,p_paid:paid,p_due:fd.get('due_date')||null,p_cash_account_id:fd.get('cash_account_id')||null}),12000,'Memperbarui penjualan');
      if(error) throw error;
    });
  }
  function editPurchaseModal(row){
    modal('Perbaiki pembelian','EDIT PURCHASE',`<div class="notice">Koreksi total, pembayaran, supplier, tanggal, jatuh tempo atau rekening. Jurnal dan hutang terkait ikut disesuaikan.</div><div class="form-grid">
      ${formField('Tanggal','purchase_date','date',row.purchase_date,'required')}
      ${formField('Supplier','supplier_name','text',row.supplier_name||'')}
      ${formField('Total Pembelian','total','number',num(row.total),'required')}
      ${formField('Dibayar','paid','number',num(row.paid),'required')}
      ${formField('Jatuh Tempo','due_date','date',row.due_date||'')}
      ${selectField('Kas / Bank','cash_account_id',cashOptions(),row.cash_account_id,row.paid>0?'required':'')}
    </div>`, async fd=>{
      const total=num(fd.get('total')),paid=num(fd.get('paid'));
      if(total<=0||paid<0||paid>total) throw new Error('Nominal pembelian tidak valid.');
      if(paid>0&&!fd.get('cash_account_id')) throw new Error('Kas/Bank wajib dipilih jika ada pembayaran.');
      const {error}=await withTimeout(sb.rpc('update_purchase',{p_id:row.id,p_date:fd.get('purchase_date')||dateToday(),p_supplier:fd.get('supplier_name')||null,p_total:total,p_paid:paid,p_due:fd.get('due_date')||null,p_cash_account_id:fd.get('cash_account_id')||null}),12000,'Memperbarui pembelian');
      if(error) throw error;
    });
  }
  function editProductModal(row){
    modal('Perbaiki produk','EDIT PRODUCT',`<div class="form-grid">
      ${formField('SKU','sku','text',row.sku||'','required')}${formField('Nama Produk','name','text',row.name||'','required')}
      ${formField('Ukuran','size','text',row.size||'')}${formField('Jenis Kain','fabric_type','text',row.fabric_type||'')}
      ${formField('Harga Jual','selling_price','number',num(row.selling_price),'required')}${formField('Batas Reorder','reorder_level','number',num(row.reorder_level))}
      ${selectField('Status','active',[{value:'true',label:'Aktif'},{value:'false',label:'Nonaktif'}],row.active===false?'false':'true','required')}
    </div>`, async fd=>{
      const {error}=await withTimeout(sb.rpc('update_product',{p_id:row.id,p_sku:fd.get('sku'),p_name:fd.get('name'),p_size:fd.get('size'),p_fabric_type:fd.get('fabric_type'),p_selling_price:num(fd.get('selling_price')),p_reorder_level:num(fd.get('reorder_level')),p_active:fd.get('active')==='true'}),12000,'Memperbarui produk');
      if(error) throw error;
    });
  }

  function renderTransactions(){table('trxTable',[{label:'ID',render:r=>`<span class="badge">${esc(r.transaction_no)}</span>`},{label:'Tanggal',render:r=>esc(r.transaction_date)},{label:'Kategori',render:r=>esc(r.category)},{label:'Keterangan',render:r=>esc(r.description)},{label:'Masuk',render:r=>`<span class="money-in">${money(r.cash_in)}</span>`},{label:'Keluar',render:r=>`<span class="money-out">${money(r.cash_out)}</span>`},{label:'Status',render:r=>esc(r.status)},{label:'Aksi',render:r=>`<button class="row-edit" data-edit-trx="${esc(r.id)}">Edit</button>`}],state.transactions);
    document.querySelectorAll('[data-edit-trx]').forEach(b=>b.onclick=()=>{const row=state.transactions.find(x=>x.id===b.dataset.editTrx);if(row)editTransactionModal(row);});
  }
  function renderSales(){table('salesTable',[{label:'No',render:r=>`<span class="badge">${esc(r.sale_no)}</span>`},{label:'Tanggal',render:r=>esc(r.sale_date)},{label:'Customer',render:r=>esc(r.customer_name||'-')},{label:'Total',render:r=>money(r.total)},{label:'Dibayar',render:r=>money(r.paid)},{label:'Sisa',render:r=>money(num(r.total)-num(r.paid))},{label:'Status',render:r=>esc(r.status)},{label:'Aksi',render:r=>`<button class="row-edit" data-edit-sale="${esc(r.id)}">Edit</button>`}],state.sales);document.querySelectorAll('[data-edit-sale]').forEach(b=>b.onclick=()=>{const r=state.sales.find(x=>x.id===b.dataset.editSale);if(r)editSaleModal(r);});}
  function renderPurchases(){table('purchaseTable',[{label:'No',render:r=>`<span class="badge">${esc(r.purchase_no)}</span>`},{label:'Tanggal',render:r=>esc(r.purchase_date)},{label:'Supplier',render:r=>esc(r.supplier_name||'-')},{label:'Total',render:r=>money(r.total)},{label:'Dibayar',render:r=>money(r.paid)},{label:'Sisa',render:r=>money(num(r.total)-num(r.paid))},{label:'Status',render:r=>esc(r.status)},{label:'Aksi',render:r=>`<button class="row-edit" data-edit-purchase="${esc(r.id)}">Edit</button>`}],state.purchases);document.querySelectorAll('[data-edit-purchase]').forEach(b=>b.onclick=()=>{const r=state.purchases.find(x=>x.id===b.dataset.editPurchase);if(r)editPurchaseModal(r);});}
  function renderAR(){table('arTable',[{label:'Customer',render:r=>esc(r.customer_name)},{label:'Referensi',render:r=>esc(r.reference_no||'-')},{label:'Tanggal',render:r=>esc(r.invoice_date)},{label:'Total',render:r=>money(r.amount)},{label:'Dibayar',render:r=>money(r.paid)},{label:'Sisa',render:r=>money(num(r.amount)-num(r.paid))},{label:'Jatuh Tempo',render:r=>esc(r.due_date||'-')},{label:'Status',render:r=>esc(r.status)}],state.ar);}
  function renderAP(){table('apTable',[{label:'Supplier',render:r=>esc(r.supplier_name)},{label:'Referensi',render:r=>esc(r.reference_no||'-')},{label:'Tanggal',render:r=>esc(r.invoice_date)},{label:'Total',render:r=>money(r.amount)},{label:'Dibayar',render:r=>money(r.paid)},{label:'Sisa',render:r=>money(num(r.amount)-num(r.paid))},{label:'Jatuh Tempo',render:r=>esc(r.due_date||'-')},{label:'Status',render:r=>esc(r.status)}],state.ap);}
  function renderStock(){table('stockTable',[{label:'SKU',render:r=>`<span class="badge">${esc(r.sku)}</span>`},{label:'Produk',render:r=>esc(r.name)},{label:'Ukuran',render:r=>esc(r.size||'-')},{label:'Kain',render:r=>esc(r.fabric_type||'-')},{label:'Stok',render:r=>num(r.stock_qty)},{label:'HPP/Unit',render:r=>money(r.hpp_per_unit)},{label:'Harga Jual',render:r=>money(r.selling_price)},{label:'Laba/Unit',render:r=>money(r.estimated_profit)},{label:'Margin',render:r=>`${num(r.margin_percent).toFixed(2)}%`},{label:'Aksi',render:r=>r.id?`<button class="row-edit" data-edit-product="${esc(r.id)}">Edit</button>`:'-'}],state.hpp.length?state.hpp:state.products.map(p=>({...p,hpp_per_unit:0,estimated_profit:num(p.selling_price),margin_percent:100})));document.querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>{const r=state.products.find(x=>x.id===b.dataset.editProduct)||state.hpp.find(x=>x.id===b.dataset.editProduct);if(r)editProductModal(r);});}
  function renderJournal(){
    const rows=state.journals.map(h=>{const ls=state.journalLines.filter(l=>l.journal_id===h.id);return {...h,lines:ls};});
    table('journalTable',[{label:'No',render:r=>`<span class="badge">${esc(r.journal_no)}</span>`},{label:'Tanggal',render:r=>esc(r.journal_date)},{label:'Jenis',render:r=>esc(r.journal_type)},{label:'Keterangan',render:r=>esc(r.description)},{label:'Debit',render:r=>money(r.lines.reduce((s,l)=>s+num(l.debit),0))},{label:'Kredit',render:r=>money(r.lines.reduce((s,l)=>s+num(l.credit),0))},{label:'Balance',render:r=>{const d=r.lines.reduce((s,l)=>s+num(l.debit),0),c=r.lines.reduce((s,l)=>s+num(l.credit),0);return Math.abs(d-c)<.01?'<span class="badge ok-badge">BALANCE</span>':'<span class="badge danger-badge">SELISIH</span>';}}],rows);
  }
  function renderReports(){
    const revenue=state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({...l,h}))).reduce((s,l)=>{const a=state.accounts.find(x=>x.id===l.account_id);return s+(a?.account_type==='revenue'?num(l.credit)-num(l.debit):0)},0);
    const cogs=state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({...l,h}))).reduce((s,l)=>{const a=state.accounts.find(x=>x.id===l.account_id);return s+(a?.account_type==='cogs'?num(l.debit)-num(l.credit):0)},0);
    const expense=state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({...l,h}))).reduce((s,l)=>{const a=state.accounts.find(x=>x.id===l.account_id);return s+(a?.account_type==='expense'?num(l.debit)-num(l.credit):0)},0);
    const gross=revenue-cogs, net=gross-expense;
    $('reportCards').innerHTML=`<div class="stat-card"><span>Pendapatan</span><strong>${money(revenue)}</strong></div><div class="stat-card"><span>HPP</span><strong>${money(cogs)}</strong></div><div class="stat-card"><span>Laba Kotor</span><strong>${money(gross)}</strong></div><div class="stat-card"><span>Beban</span><strong>${money(expense)}</strong></div><div class="stat-card"><span>Laba Bersih</span><strong>${money(net)}</strong></div>`;
    table('reportTable',[{label:'Laporan',render:r=>esc(r.name)},{label:'Nilai',render:r=>money(r.value)}],[{name:'Penjualan',value:revenue},{name:'HPP',value:cogs},{name:'Laba Kotor',value:gross},{name:'Beban Operasional',value:expense},{name:'Laba Bersih',value:net}]);
  }
  function renderAll(){renderDashboard();renderCash();renderTransactions();renderSales();renderPurchases();renderAR();renderAP();renderStock();renderJournal();renderReports();}

  function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
  function downloadCSV(filename, rows){
    if(!rows.length){toast('Tidak ada data untuk diexport.',false);return;}
    const headers=Object.keys(rows[0]); const text=[headers.map(csvEscape).join(','),...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(','))].join('\r\n');
    const blob=new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); const url=URL.createObjectURL(blob); a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  function journalExportRows(){return state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({journal_no:h.journal_no,tanggal:h.journal_date,jenis:h.journal_type,referensi:h.source_type||'',keterangan:h.description,akun:state.accounts.find(a=>a.id===l.account_id)?.code||'',nama_akun:state.accounts.find(a=>a.id===l.account_id)?.name||'',debit:num(l.debit),kredit:num(l.credit),status:h.status})));}
  function exportData(type){
    const map={transactions:state.transactions,journal:journalExportRows(),sales:state.sales,purchases:state.purchases,ar:state.ar,ap:state.ap,stock:state.hpp};
    if(type==='xlsx'){exportWorkbook();return;}
    if(type==='all'){downloadCSV(`KARSA-Finance-Semua-${dateToday()}.csv`,state.transactions);return;}
    downloadCSV(`KARSA-Finance-${slug(type)}-${dateToday()}.csv`,map[type]||[]);
  }
  function exportWorkbook(){
    if(!window.XLSX){toast('Library Excel belum termuat. Pastikan koneksi internet tersedia.',false);return;}
    const wb=XLSX.utils.book_new();
    const today=dateToday();
    const add=(name,rows)=>{
      const data=rows.length?rows:[{Keterangan:'Tidak ada data'}];
      const ws=XLSX.utils.json_to_sheet(data);
      ws['!freeze']={xSplit:0,ySplit:1};
      ws['!autofilter']={ref:ws['!ref']};
      const keys=Object.keys(data[0]||{}); ws['!cols']=keys.map(k=>({wch:Math.min(34,Math.max(12,k.length+4))}));
      XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
    };
    const guide=[
      {Bagian:'KARSA FINANCE',Keterangan:'Workbook keuangan profesional — PT Karsa Lifestyle Nusantara',Tanggal:today},
      {Bagian:'Petunjuk',Keterangan:'Sheet data dapat difilter. Nominal disimpan sebagai angka agar dapat dihitung di Excel/Google Sheets.',Tanggal:today},
      {Bagian:'Saldo',Keterangan:'Saldo akhir = Saldo Awal + Uang Masuk - Uang Keluar.',Tanggal:today},
      {Bagian:'Jurnal',Keterangan:'Debit dan kredit setiap jurnal harus balance.',Tanggal:today},
      {Bagian:'HPP',Keterangan:'HPP/unit berasal dari komponen biaya produk yang tersedia.',Tanggal:today},
      {Bagian:'Laba/Rugi',Keterangan:'Pendapatan - HPP - Beban.',Tanggal:today}
    ];
    add('Petunjuk',guide);
    add('Transaksi',state.transactions);add('Penjualan',state.sales);add('Pembelian',state.purchases);add('Piutang',state.ar);add('Hutang',state.ap);add('Produk_HPP',state.hpp);add('Komponen_HPP',state.costComponents);add('Stok',state.stockMovements);add('Jurnal',journalExportRows());add('Akun',state.accounts);add('Kas_Bank',state.cashAccounts);

    const cashSheet=[['KARSA FINANCE — RINGKASAN KAS & BANK'],[],['Rekening','Saldo Awal','Uang Masuk','Uang Keluar','Saldo Akhir']];
    state.cashAccounts.forEach((c,i)=>{
      const row=i+4, ins=state.transactions.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.cash_in),0)+state.sales.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.paid),0), outs=state.transactions.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.cash_out),0)+state.purchases.filter(t=>t.cash_account_id===c.id).reduce((s,t)=>s+num(t.paid),0);
      cashSheet.push([c.name,num(c.opening_balance),ins,outs,{f:`B${row}+C${row}-D${row}`}]);
    });
    const wsCash=XLSX.utils.aoa_to_sheet(cashSheet);wsCash['!freeze']={xSplit:0,ySplit:3};wsCash['!cols']=[{wch:28},{wch:18},{wch:18},{wch:18},{wch:18}];if(wsCash['!ref'])wsCash['!autofilter']={ref:`A3:E${cashSheet.length}`};XLSX.utils.book_append_sheet(wb,wsCash,'Rumus_Kas');

    const hppSheet=[['KARSA FINANCE — HPP PRODUK'],[],['SKU','Produk','Harga Jual','HPP/Unit','Laba/Unit','Margin %']];
    state.hpp.forEach((p,i)=>{const r=i+4;hppSheet.push([p.sku,p.name,num(p.selling_price),num(p.hpp_per_unit),{f:`C${r}-D${r}`},{f:`IF(C${r}>0,E${r}/C${r},0)`}]);});
    const wsHpp=XLSX.utils.aoa_to_sheet(hppSheet);wsHpp['!freeze']={xSplit:0,ySplit:3};wsHpp['!cols']=[{wch:16},{wch:32},{wch:18},{wch:18},{wch:18},{wch:14}];wsHpp['!autofilter']={ref:`A3:F${Math.max(3,hppSheet.length)}`};XLSX.utils.book_append_sheet(wb,wsHpp,'Rumus_HPP');

    const journalRows=journalExportRows();
    const jr=[['KARSA FINANCE — JURNAL PROFESIONAL'],[],['Tanggal','No Jurnal','Jenis','Referensi','Keterangan','Kode Akun','Nama Akun','Debit','Kredit','Status']];
    journalRows.forEach(x=>jr.push([x.tanggal,x.journal_no,x.jenis,x.referensi,x.keterangan,x.akun,x.nama_akun,num(x.debit),num(x.kredit),x.status]));
    const wsJ=XLSX.utils.aoa_to_sheet(jr);wsJ['!freeze']={xSplit:0,ySplit:3};wsJ['!cols']=[{wch:13},{wch:15},{wch:12},{wch:16},{wch:36},{wch:12},{wch:28},{wch:18},{wch:18},{wch:12}];if(jr.length>3)wsJ['!autofilter']={ref:`A3:J${jr.length}`};XLSX.utils.book_append_sheet(wb,wsJ,'Jurnal_Profesional');

    const rev=state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({...l,h}))).reduce((s,l)=>{const a=state.accounts.find(x=>x.id===l.account_id);return s+(a?.account_type==='revenue'?num(l.credit)-num(l.debit):0)},0);
    const cogs=state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({...l,h}))).reduce((s,l)=>{const a=state.accounts.find(x=>x.id===l.account_id);return s+(a?.account_type==='cogs'?num(l.debit)-num(l.credit):0)},0);
    const expense=state.journals.flatMap(h=>state.journalLines.filter(l=>l.journal_id===h.id).map(l=>({...l,h}))).reduce((s,l)=>{const a=state.accounts.find(x=>x.id===l.account_id);return s+(a?.account_type==='expense'?num(l.debit)-num(l.credit):0)},0);
    const lr=[['KARSA FINANCE — LABA / RUGI'],[],['Komponen','Nilai'],['Pendapatan',rev],['HPP',cogs],['Laba Kotor',{f:'B4-B5'}],['Beban',expense],['Laba Bersih',{f:'B6-B7'}]];
    const wsLR=XLSX.utils.aoa_to_sheet(lr);wsLR['!cols']=[{wch:26},{wch:20}];XLSX.utils.book_append_sheet(wb,wsLR,'Laba_Rugi');

    const cashFlow=[['KARSA FINANCE — ARUS KAS'],[],['Komponen','Nilai'],['Total Uang Masuk',state.transactions.reduce((s,x)=>s+num(x.cash_in),0)+state.sales.reduce((s,x)=>s+num(x.paid),0)],['Total Uang Keluar',state.transactions.reduce((s,x)=>s+num(x.cash_out),0)+state.purchases.reduce((s,x)=>s+num(x.paid),0)],['Arus Kas Bersih',{f:'B4-B5'}]];
    const wsCF=XLSX.utils.aoa_to_sheet(cashFlow);wsCF['!cols']=[{wch:28},{wch:20}];XLSX.utils.book_append_sheet(wb,wsCF,'Arus_Kas');

    // Format nominal columns as Rupiah-like numbers and dates as text-safe ISO dates.
    wb.SheetNames.forEach(name=>{const ws=wb.Sheets[name];if(!ws||!ws['!ref'])return;for(const addr in ws){if(addr[0]==='!')continue;const cell=ws[addr];if(typeof cell.v==='number')cell.z='#,##0';}});
    XLSX.writeFile(wb,`KARSA-Finance-Professional-${today}.xlsx`);
    toast('Workbook Finance Profesional berhasil dibuat dan siap dibuka di Excel / Google Sheets.');
  }

  function toggleMenu(){ $('sidebar')?.classList.toggle('menu-open'); $('menuBackdrop')?.classList.toggle('hidden',!$('sidebar')?.classList.contains('menu-open')); }
  function closeMenu(){ $('sidebar')?.classList.remove('menu-open'); $('menuBackdrop')?.classList.add('hidden'); }

  function go(page){
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
    document.querySelectorAll('.top-nav[data-page], .bottom-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
    document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===page));
    const title=[...document.querySelectorAll('.nav-item'),...document.querySelectorAll('.bottom-item[data-page]')].find(x=>x.dataset.page===page); $('pageTitle').textContent=title?title.textContent.trim():page;
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function refresh(){
    if(!sb || !user) return;
    try {
      const warnings = await loadAll();
      await ensureDefaultCashAccount();
      try { renderAll(); } catch(e) { console.error('[KARSA Finance] Render error:', e); toast('Data masuk, tetapi sebagian tampilan gagal dirender: '+errorText(e), false); }
      updateProfile();
      if(warnings.length) console.warn('[KARSA Finance] Data warning:', warnings);
      return warnings;
    } catch(e) {
      console.error('[KARSA Finance] Refresh error:', e);
      toast('Gagal memuat ulang data: '+errorText(e), false);
      throw e;
    }
  }
  function updateProfile(){const name=state.profile?.full_name||user?.email?.split('@')[0]||'Finance';if($('profileName'))$('profileName').textContent=name;if($('profileEmail'))$('profileEmail').textContent=user?.email||'-';if($('avatar'))$('avatar').textContent=name.slice(0,2).toUpperCase();}

  let loginBusy = false;
  let handledSessionId = null;

  async function login(){
    if(!configured()) throw new Error('Supabase belum dikonfigurasi. Isi config.js dengan Project URL dan Publishable/anon public key.');
    if(!sb) throw new Error('Koneksi Supabase belum siap. Tunggu sebentar lalu coba lagi.');
    if(loginBusy) return;

    const email = $('loginEmail')?.value.trim() || '';
    const password = $('loginPass')?.value || '';
    if(!email || !password) throw new Error('Email dan password wajib diisi.');

    loginBusy = true;
    const button = $('loginForm')?.querySelector('button[type="submit"]');
    if(button){ button.disabled = true; button.dataset.originalText = button.textContent; button.textContent = 'Menghubungkan…'; }
    authMessage('Menghubungkan ke Supabase…', true);

    try {
      const result = await withTimeout(
        sb.auth.signInWithPassword({ email, password }),
        15000,
        'Login Supabase'
      );
      const { data, error } = result;
      if(error) throw error;
      if(!data?.session) throw new Error('Login belum menghasilkan session.');

      // Jangan menunggu loadAll di dalam callback auth.
      user = data.session.user;
      await handleSession(data.session);
    } finally {
      loginBusy = false;
      if(button){ button.disabled = false; button.textContent = button.dataset.originalText || 'Masuk ke Finance'; }
    }
  }

  async function logout(){
    if(!sb) return;
    try { await withTimeout(sb.auth.signOut(), 10000, 'Logout Supabase'); }
    finally { user = null; handledSessionId = null; showAuth(); showLoader(false); }
  }

  async function handleSession(session){
    if(!session?.user){
      handledSessionId = null;
      user = null;
      showLoader(false);
      showAuth();
      return;
    }

    user = session.user;
    const sessionId = session.access_token || session.user.id;
    if (handledSessionId === sessionId) return;
    handledSessionId = sessionId;
    // Tampilkan area aplikasi segera supaya UI tidak pernah terkunci di loader.
    showLoader(false);
    showAuth();
    authMessage('');

    try {
      setLoader('Memuat data Finance…');
      const warnings = await loadAll();
      await ensureDefaultCashAccount();
      try { updateProfile(); renderAll(); }
      catch (renderError) {
        console.error('[KARSA Finance] Render error:', renderError);
        toast('Login berhasil. Sebagian tampilan belum dapat dirender.', false);
      }
      showApp();
      if(warnings.length) toast('Login berhasil. Beberapa data belum termuat; cek Console untuk detail.', false);
    } catch(e) {
      console.error('[KARSA Finance] loadAll error:', e);
      // Login tetap dianggap berhasil meskipun data database bermasalah.
      showApp();
      toast(`Login berhasil, tetapi data belum termuat: ${errorText(e)}`, false);
    } finally {
      showLoader(false);
    }
  }

  function bind(){
    $('loginForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await login();}catch(err){authMessage(errorText(err),false);}});
    $('logout')?.addEventListener('click',async()=>{try{await logout();}catch(e){toast(errorText(e),false);}});
    $('closeModal')?.addEventListener('click',closeModal); $('modal')?.addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
    $('topTransaction')?.addEventListener('click',transactionModal);
    $('topOpening')?.addEventListener('click',openingBalanceModal);

    $('cashManage')?.addEventListener('click',()=>{closeMenu();cashManageModal();});
    $('productManage')?.addEventListener('click',()=>{closeMenu();productModal();});
    $('menuToggle')?.addEventListener('click',toggleMenu);
    $('bottomAdd')?.addEventListener('click',transactionModal);
    $('bottomMenu')?.addEventListener('click',()=>{ if($('sidebar')?.classList.contains('menu-open')) closeMenu(); else toggleMenu(); });
    $('menuBackdrop')?.addEventListener('click',closeMenu);
    $('salesProducts')?.addEventListener('click',()=>{closeMenu();go('stock');});
    $('topSales')?.addEventListener('click',()=>go('sales'));
    $('topPurchases')?.addEventListener('click',()=>go('purchases'));
    document.querySelectorAll('.bottom-item[data-page]').forEach(b=>b.addEventListener('click',()=>{go(b.dataset.page);closeMenu();}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
    document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{go(b.dataset.page);closeMenu();}));
    document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
    document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>exportData(b.dataset.export)));
    setInterval(()=>{if($('clock'))$('clock').textContent=new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(new Date());},1000);
  }

  async function init(){
    bind();
    showLoader(true);
    setLoader('Memeriksa konfigurasi…');

    if(!configured()){
      showLoader(false);
      showAuth();
      authMessage('Supabase belum dikonfigurasi. Buka config.js lalu isi Project URL dan Publishable/anon public key.');
      return;
    }

    if(!window.supabase?.createClient){
      showLoader(false);
      showAuth();
      authMessage('Library Supabase gagal dimuat. Pastikan koneksi internet aktif lalu refresh halaman.');
      return;
    }

    try {
      sb = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      // Listener auth TIDAK boleh menunggu query database di dalam callback.
      sb.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => {
          handleSession(session).catch(e => {
            console.error('[KARSA Finance] Session handler error:', e);
            showLoader(false);
            if(session?.user) showApp(); else showAuth();
            toast(errorText(e), false);
          });
        }, 0);
      });

      setLoader('Memeriksa session…');
      const { data, error } = await withTimeout(
        sb.auth.getSession(),
        10000,
        'Pemeriksaan session'
      );
      if(error) throw error;

      if(data?.session){
        await handleSession(data.session);
      } else {
        user = null;
        showLoader(false);
        showAuth();
      }
    } catch(err) {
      console.error('[KARSA Finance] Init error:', err);
      showLoader(false);
      showAuth();
      authMessage(errorText(err), false);
    }
  }
  window.KARSA={state,refresh,login,logout,downloadCSV,exportWorkbook,exportData,money};
  document.addEventListener('DOMContentLoaded',init);
})();

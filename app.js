```javascript
// app.js — Expense Tracker (GitHub Pages ready)
// Full file with robust Excel export and Enter-to-submit on Amount

// ====== Constants & State ======
const LS_KEY = 'xpense.v1.transactions';
const LS_THEME = 'xpense.v1.theme';
let transactions = loadTransactions();
let charts = { cat: null, month: null, net: null };

// ====== DOM Helpers ======
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ====== Formatting / Small Utils ======
function formatCurrency(n) {
  const sign = n < 0 ? '-' : '';
  const val = Math.abs(n);
  return `${sign}$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function todayISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 10);
}
function monthKey(isoDate) {
  return isoDate.slice(0, 7); // YYYY-MM
}
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

// ====== Persistence ======
function loadTransactions() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveTransactions() {
  localStorage.setItem(LS_KEY, JSON.stringify(transactions));
}

// ====== Theme ======
(function initTheme() {
  const saved = localStorage.getItem(LS_THEME);
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
  const toggle = $('#themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem(LS_THEME, document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    });
  }
})();

// ====== Initial UI State ======
(function initFormDefaults() {
  const dateEl = $('#date');
  const typeEl = $('#type');
  if (dateEl) dateEl.value = todayISO();
  if (typeEl) typeEl.value = 'expense';
})();

renderAll();

// ====== Form Handlers ======
const form = $('#txForm');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const date = $('#date').value;
    const desc = $('#desc').value.trim();
    const category = $('#category').value.trim() || 'Uncategorized';
    const type = $('#type').value;
    const amount = parseFloat($('#amount').value);

    if (!date || !desc || isNaN(amount) || amount < 0) return;

    const tx = { id: uid(), date, desc, category, type, amount };
    transactions.push(tx);
    saveTransactions();
    e.target.reset();
    $('#date').value = todayISO();
    renderAll();
  });

  // Submit when pressing Enter inside the Amount box
  const amt = $('#amount');
  if (amt) {
    amt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        form.requestSubmit(); // more reliable than form.submit()
      }
    });
  }
}

// ====== Filters ======
const filterMonth = $('#filterMonth');
const filterQuery = $('#filterQuery');
const filterType  = $('#filterType');
const clearFilters = $('#clearFilters');

if (filterMonth) filterMonth.addEventListener('input', renderTable);
if (filterQuery) filterQuery.addEventListener('input', renderTable);
if (filterType)  filterType.addEventListener('change', renderTable);
if (clearFilters) {
  clearFilters.addEventListener('click', () => {
    $('#filterMonth').value = '';
    $('#filterQuery').value = '';
    $('#filterType').value = 'all';
    renderTable();
  });
}

// ====== Import / Export ======
const exportBtn = $('#exportBtn');
const importBtn = $('#importBtn');
const fileInput = $('#fileInput');

if (exportBtn) exportBtn.addEventListener('click', exportExcel);
if (importBtn && fileInput) {
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', onImportFile);
}

async function onImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = await file.arrayBuffer();
    let rows = [];
    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = new TextDecoder().decode(data);
      rows = parseCSV(text);
    } else {
      if (typeof XLSX === 'undefined') throw new Error('XLSX not loaded');
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws);
    }

    // Expected headers: date, desc, category, type, amount
    const imported = [];
    for (const r of rows) {
      const date = asISO(r.date ?? r.Date);
      const desc = String(r.desc ?? r.Description ?? '').trim();
      const category = String(r.category ?? r.Category ?? 'Uncategorized').trim();
      const typeRaw = String(r.type ?? r.Type ?? 'expense').toLowerCase();
      const type = typeRaw.includes('inc') ? 'income' : 'expense';
      const amount = parseFloat(r.amount ?? r.Amount);
      if (date && desc && !Number.isNaN(amount)) {
        imported.push({ id: uid(), date, desc, category, type, amount: Math.abs(amount) });
      }
    }

    if (imported.length) {
      transactions = dedupe([...transactions, ...imported]);
      saveTransactions();
      renderAll();
      alert(`Imported ${imported.length} row(s).`);
    } else {
      alert('No valid rows found to import.');
    }
  } catch (err) {
    console.error('Import error:', err);
    alert('Import failed. Please ensure the file is a valid Excel or CSV with columns like date, desc, category, type, amount.');
  } finally {
    e.target.value = '';
  }
}

// ====== Rendering ======
function renderAll() {
  renderTable();
  renderCategoryList();
  renderKPIs();
  renderCharts();
}

function getFiltered() {
  const m = $('#filterMonth')?.value || ''; // YYYY-MM
  const q = ($('#filterQuery')?.value || '').trim().toLowerCase();
  const t = $('#filterType')?.value || 'all';
  return transactions
    .filter(tx => {
      const byMonth = m ? tx.date.startsWith(m) : true;
      const byQuery = q ? (tx.desc.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q)) : true;
      const byType = t === 'all' ? true : tx.type === t;
      return byMonth && byQuery && byType;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function renderTable() {
  const filtered = getFiltered();
  const countEl = $('#txCount');
  if (countEl) countEl.textContent = filtered.length;
  const body = $('#txBody');
  if (!body) return;
  body.innerHTML = '';
  for (const tx of filtered) {
    const tr = document.createElement('tr');
    tr.className = 'row';
    tr.innerHTML = `
      <td class="td whitespace-nowrap">${tx.date}</td>
      <td class="td">${escapeHTML(tx.desc)}</td>
      <td class="td">${escapeHTML(tx.category)}</td>
      <td class="td text-right ${tx.type === 'expense' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${formatCurrency(tx.amount)}</td>
      <td class="td">
        <span class="badge ${tx.type === 'expense' ? 'badge-expense' : 'badge-income'}">${tx.type}</span>
      </td>
      <td class="td">
        <span class="action mr-3" data-action="edit" data-id="${tx.id}">Edit</span>
        <span class="action text-rose-600" data-action="del" data-id="${tx.id}">Delete</span>
      </td>
    `;
    body.appendChild(tr);
  }

  // Row actions
  body.querySelectorAll('[data-action="del"]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      transactions = transactions.filter(t => t.id !== id);
      saveTransactions();
      renderAll();
    });
  });
  body.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener('click', () => startEdit(el.getAttribute('data-id')));
  });
}

function startEdit(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  const date = prompt('Date (YYYY-MM-DD):', tx.date);
  if (!date) return;
  const desc = prompt('Description:', tx.desc) ?? tx.desc;
  const category = prompt('Category:', tx.category) ?? tx.category;
  const type = prompt('Type (expense/income):', tx.type) ?? tx.type;
  const amountStr = prompt('Amount:', tx.amount);
  const amount = parseFloat(amountStr);
  if (!asISO(date) || !desc.trim() || Number.isNaN(amount)) return alert('Invalid values.');
  tx.date = asISO(date);
  tx.desc = desc.trim();
  tx.category = category.trim() || 'Uncategorized';
  tx.type = type.toLowerCase().startsWith('inc') ? 'income' : 'expense';
  tx.amount = Math.abs(amount);
  saveTransactions();
  renderAll();
}

function renderCategoryList() {
  const dl = $('#categoryList');
  if (!dl) return;
  const s = new Set(transactions.map(t => t.category).filter(Boolean));
  dl.innerHTML = [...s].sort().map(c => `<option value="${escapeHTML(c)}"></option>`).join('');
}

function renderKPIs() {
  const nowM = monthKey(todayISO());
  let total = 0, income = 0, thisMonth = 0;
  for (const t of transactions) {
    if (t.type === 'expense') total += t.amount; else income += t.amount;
    if (t.date.startsWith(nowM) && t.type === 'expense') thisMonth += t.amount;
  }
  const totalEl = $('#kpi-total');
  const incomeEl = $('#kpi-income');
  const monthEl = $('#kpi-month');
  if (totalEl) totalEl.textContent = formatCurrency(total);
  if (incomeEl) incomeEl.textContent = formatCurrency(income);
  if (monthEl) monthEl.textContent = formatCurrency(thisMonth);
}

function renderCharts() {
  const catCanvas = $('#catChart');
  const monthCanvas = $('#monthChart');
  const netCanvas = $('#netChart');
  if (!catCanvas || !monthCanvas || !netCanvas) return;

  const byCategory = {};
  const byMonthTotals = {};
  const byMonthNet = {};

  for (const t of transactions) {
    const m = monthKey(t.date);
    const sign = t.type === 'expense' ? -1 : 1;

    if (t.type === 'expense') {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      byMonthTotals[m] = (byMonthTotals[m] || 0) + t.amount;
    }
    byMonthNet[m] = (byMonthNet[m] || 0) + sign * t.amount;
  }

  const months = Object.keys({ ...byMonthTotals, ...byMonthNet }).sort();
  const totals = months.map(m => byMonthTotals[m] || 0);
  const net = months.map(m => byMonthNet[m] || 0);

  const catLabels = Object.keys(byCategory);
  const catData = catLabels.map(k => byCategory[k]);

  const makeGradient = (ctx, colorA, colorB) => {
    const g = ctx.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, colorA);
    g.addColorStop(1, colorB);
    return g;
  };

  // Destroy old charts
  Object.values(charts).forEach(c => c && c.destroy());

  // Category Doughnut
  const catCtx = catCanvas.getContext('2d');
  charts.cat = new Chart(catCtx, {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: catData,
        backgroundColor: catLabels.map((_, i) => `hsl(${(i * 57) % 360} 80% 60%)`),
        borderWidth: 0
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.parsed)}` } }
      },
      cutout: '60%'
    }
  });

  // Monthly Totals Bar
  const mCtx = monthCanvas.getContext('2d');
  const g1 = makeGradient(mCtx, 'rgba(14,165,233,.7)', 'rgba(14,165,233,.15)');
  charts.month = new Chart(mCtx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Expenses',
        data: totals,
        backgroundColor: g1,
        borderColor: '#0ea5e9'
      }]
    },
    options: {
      scales: {
        y: { ticks: { callback: v => '$' + v } }
      },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatCurrency(ctx.parsed.y) } } }
    }
  });

  // Net Cumulative Area
  const netCtx = netCanvas.getContext('2d');
  const cumulative = [];
  let sum = 0;
  for (let i = 0; i < net.length; i++) {
    sum += net[i];
    cumulative.push(sum);
  }
  const g2 = makeGradient(netCtx, 'rgba(16,185,129,.6)', 'rgba(16,185,129,.1)');
  charts.net = new Chart(netCtx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Cumulative Net',
        data: cumulative,
        fill: true,
        backgroundColor: g2,
        borderColor: '#10b981',
        tension: .25
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatCurrency(ctx.parsed.y) } } },
      scales: { y: { ticks: { callback: v => '$' + v } } }
    }
  });
}

// ====== Excel Export (robust) ======
function exportExcel() {
  try {
    if (typeof XLSX === 'undefined') {
      console.warn('XLSX not available — falling back to CSV.');
      return exportCSVFallback();
    }

    // Sheet 1: Transactions
    const txRows = transactions.map(t => ({
      Date: t.date,
      Description: t.desc,
      Category: t.category,
      Type: t.type,
      Amount: t.amount
    }));
    const ws1 = XLSX.utils.json_to_sheet(txRows);
    autosize(ws1, ['Date','Description','Category','Type','Amount']);

    // Sheet 2: Summary (Totals by Category)
    const byCat = groupSum(transactions.filter(t => t.type === 'expense'), t => t.category, t => t.amount);
    const summaryRows = Object.entries(byCat).map(([k, v]) => ({ Category: k, Expense: v }));
    const totalExpense = summaryRows.reduce((a, r) => a + r.Expense, 0);
    summaryRows.push({ Category: 'TOTAL', Expense: totalExpense });
    const ws2 = XLSX.utils.json_to_sheet(summaryRows);
    autosize(ws2, ['Category','Expense']);

    // Sheet 3: Pivot by Month
    const byMonth = groupSum(transactions, t => monthKey(t.date) + '|' + t.type, t => t.amount);
    const months = [...new Set(transactions.map(t => monthKey(t.date)))].sort();
    const pivot = [['Month','Income','Expense','Net']];
    for (const m of months) {
      const inc = byMonth[`${m}|income`] || 0;
      const exp = byMonth[`${m}|expense`] || 0;
      pivot.push([m, inc, exp, inc - exp]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(pivot);
    autosize(ws3, ['Month','Income','Expense','Net']);

    // Build workbook and download via Blob
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Transactions');
    XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
    XLSX.utils.book_append_sheet(wb, ws3, 'By Month');

    const arrayBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([arrayBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    triggerDownload(blob, 'expenses.xlsx');
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export failed. A CSV fallback will be downloaded instead.');
    exportCSVFallback();
  }
}

// Helper: programmatic download
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// CSV fallback (Transactions only — safe & simple)
function exportCSVFallback() {
  const header = ['Date','Description','Category','Type','Amount'];
  const rows = transactions.map(t => [t.date, t.desc, t.category, t.type, t.amount]);
  const csv = [header, ...rows]
    .map(r => r.map(cell => {
      const s = String(cell ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, 'expenses.csv');
}

// ====== Utilities ======
function groupSum(arr, keyFn, valFn) {
  return arr.reduce((acc, item) => {
    const k = keyFn(item);
    acc[k] = (acc[k] || 0) + valFn(item);
    return acc;
  }, {});
}
function autosize(ws, headers) {
  ws['!cols'] = headers.map(h => ({ wch: Math.max(10, String(h).length + 2) }));
}
function asISO(v) {
  if (!v && v !== 0) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Try Excel serial date
  const n = Number(s);
  if (!Number.isNaN(n) && n > 20000 && n < 80000 && typeof XLSX !== 'undefined' && XLSX.SSF?.parse_date_code) {
    const date = XLSX.SSF.parse_date_code(n);
    if (date) return `${date.y.toString().padStart(4,'0')}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}`;
  }
  // Try generic parse
  const d = new Date(s);
  if (!isNaN(d)) {
    const tzOffset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - tzOffset * 60000);
    return local.toISOString().slice(0, 10);
  }
  return null;
}
function parseCSV(text) {
  // Simple CSV (no quoted commas). For complex CSVs, a parser lib is recommended.
  const lines = text.split(/\r?\n/).filter(l => l.length);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i]);
    return obj;
  });
}
function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const t of arr) {
    const key = `${t.date}|${t.desc}|${t.category}|${t.type}|${t.amount}`;
    if (!seen.has(key)) { seen.add(key); out.push(t); }
  }
  return out;
}
```

// ============ STATE ============
const state = {
  user: null,
  date: todayStr(),
  dashboard: null,
  filters: { entity: '', department: '', status: '' },
  selected: new Set(),
  empMaster: [],
  filterOptions: { entities: [], departments: [] }
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }

// ============ TOAST ============
function toast(msg, isError) {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ============ AUTH ============
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Checking...';
  try {
    const res = await API.login(username, password);
    if (res.success) {
      state.user = { username, role: res.role, displayName: res.displayName };
      sessionStorage.setItem('acc_user', JSON.stringify(state.user));
      boot();
    } else {
      toast(res.error || 'Login failed', true);
    }
  } catch (e) {
    toast('Cannot reach server. Check API_URL in config.js', true);
  }
  btn.disabled = false; btn.textContent = 'Sign In';
}

function logout() {
  sessionStorage.removeItem('acc_user');
  location.reload();
}

// ============ NAV ============
function showTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== 'view-' + tab));
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'leave') loadLeaveTab();
  if (tab === 'empmaster') loadEmpMasterTab();
  if (tab === 'trends') loadTrendsTab();
}

// ============ BOOT ============
async function boot() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('userTag').textContent = state.user.displayName + ' · ' + state.user.role;
  document.getElementById('dateInput').value = state.date;

  try {
    const f = await API.getFilters();
    state.filterOptions = f;
    renderFilterChips();
  } catch (e) { /* non-fatal */ }

  showTab('dashboard');
}

// ============ DASHBOARD ============
async function loadDashboard() {
  const wrap = document.getElementById('dashboardBody');
  wrap.innerHTML = '<div class="empty-state">Loading compliance data…</div>';
  try {
    const d = await API.getDashboard(state.date);
    state.dashboard = d;
    state.selected.clear();
    
    renderKpis(d); 
    renderSections(d);
  } catch (e) {
    wrap.innerHTML = '<div class="empty-state">Failed to load: ' + e.message + '</div>';
  }
}

function renderKpis(d) {
  const box = document.getElementById('kpiRow');
  const s = d.summary;

  const items = [
    ['Active Employees', s.totalActive, 'var(--ink-dim)'],
    ['Pending Compliance', s.pending, 'var(--red)'],
    ['Resolved Today', s.resolved, 'var(--accent)']
  ];

  const statusCounts = {};
  d.all.forEach(r => {
    if (r.Status) { 
      statusCounts[r.Status] = (statusCounts[r.Status] || 0) + 1;
    }
  });

  Object.keys(statusCounts).sort().forEach(st => {
    const meta = STATUS_META[st] || { label: st, color: 'var(--slate)' };
    items.push([meta.label, statusCounts[st], meta.color]);
  });

  box.style.gridTemplateColumns = `repeat(auto-fit, minmax(180px, 1fr))`;

  box.innerHTML = items.map(([l, n, c]) =>
    `<div class="kpi" style="--rail:${c}"><div class="n">${n}</div><div class="l">${l}</div></div>`
  ).join('');
}

function applyFilters(rows) {
  return rows.filter(r => {
    if (state.filters.entity && r.Entity !== state.filters.entity) return false;
    if (state.filters.department && r.Department !== state.filters.department) return false;
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      if (!(String(r.Name).toLowerCase().includes(q) || String(r.EmpID).includes(q))) return false;
    }
    return true;
  });
}

function renderSections(d) {
  const wrap = document.getElementById('dashboardBody');
  const pending = applyFilters(d.pending);
  const present = applyFilters(d.present);
  const resolved = applyFilters(d.resolved);
  const onLeave = applyFilters(d.onLeave);
  const weekOff = applyFilters(d.weekOff);

  let html = '';

  if (state.selected.size > 0) {
    html += `<div class="bulk-bar">
      <b>${state.selected.size}</b> selected
      <button class="btn btn-sm btn-primary" onclick="openBulkModal()">Set status for selected</button>
      <button class="btn btn-sm" onclick="state.selected.clear(); renderSections(state.dashboard);">Clear</button>
    </div>`;
  }

  html += section('⚠️ Pending Compliance', pending, true);
  html += section('✅ Present (editable)', present, false);
  html += section('📝 Resolved Today', resolved, false);
  html += section('🌴 On Leave', onLeave, false);
  html += section('🛋️ Week Off', weekOff, false);

  wrap.innerHTML = html;
}

function section(title, rows, selectable) {
  if (!rows.length) return '';
  const cards = rows.map(r => card(r, selectable)).join('');
  return `<div class="section">
    <div class="section-head"><h2>${title} <span class="count">${rows.length}</span></h2></div>
    <div class="card-grid">${cards}</div>
  </div>`;
}

function card(r, selectable) {
  const meta = STATUS_META[r.Status] || null;
  const color = meta ? meta.color : 'var(--ink-faint)';
  const isSelected = state.selected.has(r.EmpID);
  const statusBadge = r.Status ? `<span class="badge" style="--c:${color}">${meta.label}</span>` : `<span class="badge" style="--c:var(--red)">Action needed</span>`;
  return `<div class="emp-card" style="--rail:${color}" onclick="cardClick(event,'${r.EmpID}')">
    ${selectable ? `<input type="checkbox" class="checkbox" ${isSelected ? 'checked' : ''} onclick="toggleSelect(event,'${r.EmpID}')">` : ''}
    <div class="top">
      <div>
        <div class="name">${escapeHtml(r.Name)}</div>
        <div class="id">#${r.EmpID}</div>
      </div>
      ${statusBadge}
    </div>
    <div class="meta">${escapeHtml(r.Entity || '')}${r.Department ? ' · ' + escapeHtml(r.Department) : ''}</div>
    ${r.Remark ? `<div class="remark">${escapeHtml(r.Remark)}</div>` : ''}
  </div>`;
}

function toggleSelect(ev, empId) {
  ev.stopPropagation();
  if (state.selected.has(empId)) state.selected.delete(empId); else state.selected.add(empId);
  renderSections(state.dashboard);
}

function cardClick(ev, empId) {
  if (ev.target.type === 'checkbox') return;
  const row = state.dashboard.all.find(r => String(r.EmpID) === String(empId));
  openStatusModal(row);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderFilterChips() {
  const box = document.getElementById('filterChips');
  const entities = state.filterOptions.entities || [];
  box.innerHTML = `<input type="text" placeholder="Search name / ID..." id="searchInput" oninput="state.filters.search=this.value; renderSections(state.dashboard);" style="width:200px;">` +
    `<span class="chip ${!state.filters.entity ? 'active' : ''}" onclick="setEntityFilter('')">All Entities</span>` +
    entities.map(e => `<span class="chip ${state.filters.entity === e ? 'active' : ''}" onclick="setEntityFilter('${e}')">${escapeHtml(e)}</span>`).join('');
}
function setEntityFilter(e) {
  state.filters.entity = e;
  renderFilterChips();
  if (state.dashboard) renderSections(state.dashboard);
}

function changeDate(v) {
  state.date = v;
  loadDashboard();
}

// ============ STATUS MODAL ============
let modalTarget = null;
function openStatusModal(row) {
  modalTarget = row;
  document.getElementById('modalEmpName').textContent = row.Name + '  ·  #' + row.EmpID;
  document.getElementById('modalEmpMeta').textContent = (row.Entity || '') + (row.Department ? ' · ' + row.Department : '') + ' · ' + state.date;
  renderStatusPicker('statusPicker', row.Status);
  document.getElementById('modalRemark').value = row.Remark && !row.Remark.startsWith('Auto -') ? row.Remark : '';
  document.getElementById('statusModal').classList.remove('hidden');
}
function closeStatusModal() { document.getElementById('statusModal').classList.add('hidden'); modalTarget = null; }

function renderStatusPicker(elId, current) {
  const box = document.getElementById(elId);
  box.innerHTML = STATUS_LIST.map(s =>
    `<div class="opt ${s === current ? 'active' : ''}" style="--c:${STATUS_META[s].color}" data-status="${s}" onclick="pickStatus('${elId}', '${s}')">${s} · ${STATUS_META[s].label}</div>`
  ).join('');
  box.dataset.selected = current || '';
}
function pickStatus(elId, s) {
  const box = document.getElementById(elId);
  box.dataset.selected = s;
  [...box.children].forEach(c => c.classList.toggle('active', c.dataset.status === s));
}

async function saveStatus() {
  const status = document.getElementById('statusPicker').dataset.selected;
  const remark = document.getElementById('modalRemark').value.trim();
  if (!status) return toast('Pick a status', true);
  if (!remark && (modalTarget.Source === 'Missing' || status !== 'P')) {
    if (!confirm('No remark added. Save anyway?')) return;
  }
  try {
    await API.updateComplianceStatus(state.date, modalTarget.EmpID, status, remark, state.user.displayName);
    toast('Status updated');
    closeStatusModal();
    loadDashboard();
  } catch (e) { toast(e.message, true); }
}

// ============ BULK MODAL ============
function openBulkModal() {
  renderStatusPicker('bulkStatusPicker', '');
  document.getElementById('bulkRemark').value = '';
  document.getElementById('bulkCount').textContent = state.selected.size;
  document.getElementById('bulkModal').classList.remove('hidden');
}
function closeBulkModal() { document.getElementById('bulkModal').classList.add('hidden'); }
async function saveBulkStatus() {
  const status = document.getElementById('bulkStatusPicker').dataset.selected;
  const remark = document.getElementById('bulkRemark').value.trim();
  if (!status) return toast('Pick a status', true);
  try {
    const res = await API.bulkUpdateStatus(state.date, [...state.selected], status, remark, state.user.displayName);
    toast(res.updated + ' records updated');
    closeBulkModal();
    loadDashboard();
  } catch (e) { toast(e.message, true); }
}

// ============ UPLOAD ============
function openUploadModal() {
  document.getElementById('uploadDate').value = state.date;
  document.getElementById('uploadFile').value = '';
  document.getElementById('uploadPreview').innerHTML = '';
  window._parsedRows = null;
  document.getElementById('uploadModal').classList.remove('hidden');
}
function closeUploadModal() { document.getElementById('uploadModal').classList.add('hidden'); }

function handleFileSelect(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const sheetName = wb.SheetNames.find(n => /hours/i.test(n)) || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      let headerIdx = raw.findIndex(r => r.some(c => String(c).trim().toLowerCase() === 'employee id'));
      if (headerIdx === -1) { toast('Could not find "Employee Id" header in this file', true); return; }
      const headers = raw[headerIdx].map(h => String(h).trim().toLowerCase());
      const col = (name) => headers.indexOf(name);

      const rows = [];
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const r = raw[i];
        const empId = r[col('employee id')];
        if (empId === '' || empId === undefined || empId === null) continue;
        rows.push({
          empId: String(empId).trim(),
          name: r[col('employee name')] || '',
          email: r[col('email id')] || '',
          firstIn: r[col('first in')] || '',
          lastOut: r[col('last out')] || '',
          totalHours: r[col('total hours')] || '',
          earlyEntry: r[col('early entry')] || '',
          lateEntry: r[col('late entry')] || '',
          earlyExit: r[col('early exit')] || '',
          lateExit: r[col('late exit')] || '',
          netHours: r[col('net hours')] || '',
          officeInHours: r[col('office in hours')] || '',
          remoteInHours: r[col('remote in hours')] || '',
          mode: r[col('office in/remote in')] || '',
          shiftName: r[col('shift name')] || ''
        });
      }
      window._parsedRows = rows;
      document.getElementById('uploadPreview').innerHTML =
        `<div class="empty-state" style="border-color:var(--accent); color:var(--ink);">Parsed <b>${rows.length}</b> employee login records from "${sheetName}". Ready to import.</div>`;
    } catch (err) {
      toast('Could not read file: ' + err.message, true);
    }
  };
  reader.readAsArrayBuffer(file);
}

async function confirmUpload() {
  const date = document.getElementById('uploadDate').value;
  if (!date) return toast('Pick a date first', true);
  if (!window._parsedRows || !window._parsedRows.length) return toast('Upload a valid file first', true);
  const btn = document.getElementById('uploadConfirmBtn');
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const res = await API.uploadLoginReport(date, window._parsedRows, state.user.displayName);
    toast('Imported ' + res.rowsImported + ' records for ' + date);
    closeUploadModal();
    state.date = date;
    document.getElementById('dateInput').value = date;
    loadDashboard();
  } catch (e) {
    toast(e.message, true);
  }
  btn.disabled = false; btn.textContent = 'Import & Compute Compliance';
}

// ============ LEAVE TAB ============
async function loadLeaveTab() {
  await populateEmpDropdown('leaveEmpSelect');
  const list = await API.getLeaves();
  const box = document.getElementById('leaveList');
  if (!list.length) { box.innerHTML = '<div class="empty-state">No leave records yet.</div>'; return; }
  box.innerHTML = `<div class="table-wrap"><table><thead><tr>
    <th>Employee</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th>By</th><th></th>
  </tr></thead><tbody>` + list.map(l => `<tr>
    <td>${escapeHtml(l.Name)} <span style="color:var(--ink-faint)">#${l.EmpID}</span></td>
    <td>${fmtDate(l.FromDate)}</td><td>${fmtDate(l.ToDate)}</td>
    <td>${escapeHtml(l.Reason)}</td>
    <td><span class="badge" style="--c:${l.LeaveStatus === 'Cancelled' ? 'var(--red)' : 'var(--purple)'}">${l.LeaveStatus}</span></td>
    <td>${escapeHtml(l.CreatedBy)}</td>
    <td>${l.LeaveStatus !== 'Cancelled' ? `<button class="btn btn-sm btn-danger" onclick="cancelLeaveRow('${l.LeaveID}')">Cancel</button>` : ''}</td>
  </tr>`).join('') + '</tbody></table></div>';
}
function fmtDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return String(v).slice(0, 10);
  return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear();
}

async function submitLeave() {
  const empId = document.getElementById('leaveEmpSelect').value;
  const from = document.getElementById('leaveFrom').value;
  const to = document.getElementById('leaveTo').value;
  const reason = document.getElementById('leaveReason').value.trim();
  if (!empId || !from || !to) return toast('Fill employee, from and to date', true);
  try {
    await API.scheduleLeave({ empId, fromDate: from, toDate: to, reason, createdBy: state.user.displayName });
    toast('Leave scheduled');
    document.getElementById('leaveReason').value = '';
    loadLeaveTab();
  } catch (e) { toast(e.message, true); }
}
async function cancelLeaveRow(id) {
  if (!confirm('Cancel this leave record?')) return;
  await API.cancelLeave(id);
  toast('Leave cancelled');
  loadLeaveTab();
}

// ============ EMP MASTER TAB ============
async function loadEmpMasterTab() {
  const list = await API.getEmpMaster();
  state.empMaster = list;
  const box = document.getElementById('empMasterList');
  box.innerHTML = `<div class="table-wrap"><table><thead><tr>
    <th>ID</th><th>Name</th><th>Email</th><th>Entity</th><th>Department</th><th>Status</th><th></th>
  </tr></thead><tbody>` + list.map(e => `<tr>
    <td class="mono">${e.EmpID}</td><td>${escapeHtml(e.Name)}</td><td style="color:var(--ink-dim)">${escapeHtml(e.Email)}</td>
    <td>${escapeHtml(e.Entity)}</td><td>${escapeHtml(e.Department)}</td>
    <td><span class="badge" style="--c:${e.Status === 'Active' ? 'var(--green)' : 'var(--ink-faint)'}">${e.Status}</span></td>
    <td><button class="btn btn-sm" onclick='toggleEmpStatus("${e.EmpID}","${e.Status}")'>${e.Status === 'Active' ? 'Deactivate' : 'Activate'}</button></td>
  </tr>`).join('') + '</tbody></table></div>';
}
async function toggleEmpStatus(empId, current) {
  await API.updateEmployee({ empId, status: current === 'Active' ? 'Inactive' : 'Active' });
  toast('Updated');
  loadEmpMasterTab();
}
async function addEmployeeSubmit() {
  const empId = document.getElementById('newEmpId').value.trim();
  const name = document.getElementById('newEmpName').value.trim();
  const email = document.getElementById('newEmpEmail').value.trim();
  const entity = document.getElementById('newEmpEntity').value.trim();
  const department = document.getElementById('newEmpDept').value.trim();
  if (!empId || !name) return toast('Employee ID and Name are required', true);
  try {
    const res = await API.addEmployee({ empId, name, email, entity, department, status: 'Active' });
    if (res.error) return toast(res.error, true);
    toast('Employee added');
    ['newEmpId', 'newEmpName', 'newEmpEmail', 'newEmpEntity', 'newEmpDept'].forEach(id => document.getElementById(id).value = '');
    loadEmpMasterTab();
  } catch (e) { toast(e.message, true); }
}

async function populateEmpDropdown(elId) {
  if (!state.empMaster.length) state.empMaster = await API.getEmpMaster();
  const sel = document.getElementById(elId);
  sel.innerHTML = '<option value="">Select employee...</option>' +
    state.empMaster.filter(e => e.Status === 'Active').map(e => `<option value="${e.EmpID}">${escapeHtml(e.Name)} (#${e.EmpID})</option>`).join('');
}

// ============ TRENDS TAB (ADVANCED) ============
let trendLineChartInstance = null;
let trendPieChartInstance = null;
let trendColChartInstance = null;
let wfhChartInstance = null;

// Helper to format those long GMT dates to clean DD-MM-YYYY
function cleanDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return String(dateStr).substring(0, 10);
  return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear();
}

async function loadTrendsTab() {
  const to = state.date;
  const fromD = new Date(state.date); fromD.setDate(fromD.getDate() - 30);
  const from = fromD.getFullYear() + '-' + pad(fromD.getMonth() + 1) + '-' + pad(fromD.getDate());
  document.getElementById('trendFrom').value = from;
  document.getElementById('trendTo').value = to;
  await refreshTrends();
}

async function refreshTrends() {
  const from = document.getElementById('trendFrom').value;
  const to = document.getElementById('trendTo').value;
  const [trends, chronic] = await Promise.all([API.getTrends(from, to), API.getChronicOffenders(30, 3)]);

  let totalRecords = 0, totalPresentGroup = 0, totalAbsentGroup = 0, totalWfh = 0;
  
  trends.byDate.forEach(d => {
    totalRecords += d.total;
    // Present = P + HD + WFH
    totalPresentGroup += (d.present + d.hd + d.wfh); 
    // Absent = WO + Leave + Absent + Missing
    totalAbsentGroup += (d.wo + d.leave + d.absent + d.pendingUnresolved); 
    totalWfh += d.wfh;
  });

  const presentRate = totalRecords ? ((totalPresentGroup / totalRecords) * 100).toFixed(1) : 0;

  // Render KPIs
  document.getElementById('trendKpis').innerHTML = `
    <div class="kpi" style="--rail:var(--blue)"><div class="n">${totalRecords}</div><div class="l">Total Tracked Days</div></div>
    <div class="kpi" style="--rail:var(--green)"><div class="n">${presentRate}%</div><div class="l">Avg Present Rate</div></div>
    <div class="kpi" style="--rail:var(--red)"><div class="n">${totalAbsentGroup}</div><div class="l">Total Absences & Leaves</div></div>
    <div class="kpi" style="--rail:var(--amber)"><div class="n">${totalWfh}</div><div class="l">Total WFH</div></div>
  `;

  // Render all UI components
  renderCharts(trends.byDate);
  renderDetailedTable(trends.byDate);
  renderProgressBars('entityBars', trends.byEntity, 'entity');

  const chronicBox = document.getElementById('chronicList');
  chronicBox.innerHTML = chronic.length ? `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Entity</th><th>Absences (Count)</th></tr></thead><tbody>` +
    chronic.map(c => `<tr><td>${escapeHtml(c.name)} <span style="color:var(--ink-faint)">#${c.empId}</span></td><td>${escapeHtml(c.entity)}</td><td><span class="badge" style="--c:var(--red)">${c.count} Times</span></td></tr>`).join('') +
    '</tbody></table></div>' : '<div class="empty-state">No chronic offenders in this window. 🎉</div>';
}

function renderCharts(byDateData) {
  if(trendLineChartInstance) trendLineChartInstance.destroy();
  if(trendPieChartInstance) trendPieChartInstance.destroy();
  if(trendColChartInstance) trendColChartInstance.destroy();
  if(wfhChartInstance) wfhChartInstance.destroy();

  // CLEAN DATES FOR X-AXIS
  const labels = byDateData.map(d => cleanDate(d.date).substring(0, 5)); // DD-MM for charts

  const presentData = byDateData.map(d => d.present + d.hd + d.wfh);
  const absentData = byDateData.map(d => d.wo + d.leave + d.absent + d.pendingUnresolved);
  const wfhData = byDateData.map(d => d.wfh);

  Chart.defaults.color = '#8B93A7';
  Chart.defaults.font.family = 'Manrope';
  const gridOptions = { color: '#232938' };

  // 1. LINE CHART (Present vs Absent)
  const ctxLine = document.getElementById('trendLineChart').getContext('2d');
  trendLineChartInstance = new Chart(ctxLine, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Present (P, HD, WFH)', data: presentData, borderColor: '#3DD68C', backgroundColor: 'rgba(61, 214, 140, 0.1)', fill: true, tension: 0.3 },
        { label: 'Absent (WO, Leave, A, Miss)', data: absentData, borderColor: '#F2495C', backgroundColor: 'transparent', tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: gridOptions }, x: { grid: { display: false } } } }
  });

  // 2. PIE CHART
  const totalP = presentData.reduce((a,b)=>a+b, 0);
  const totalA = absentData.reduce((a,b)=>a+b, 0);
  const ctxPie = document.getElementById('trendPieChart').getContext('2d');
  trendPieChartInstance = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels: ['Present Group', 'Absent Group'],
      datasets: [{ data: [totalP, totalA], backgroundColor: ['#3ED9C6', '#F2495C'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
  });

  // 3. COLUMN CHART (Present vs Absent Bars)
  const ctxCol = document.getElementById('trendColChart').getContext('2d');
  trendColChartInstance = new Chart(ctxCol, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Present Group', data: presentData, backgroundColor: '#3DD68C', borderRadius: 4 },
        { label: 'Absent Group', data: absentData, backgroundColor: '#F2495C', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: gridOptions }, x: { grid: { display: false } } } }
  });

  // 4. WFH BAR CHART
  const ctxWfh = document.getElementById('wfhChart').getContext('2d');
  wfhChartInstance = new Chart(ctxWfh, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'WFH Count', data: wfhData, backgroundColor: '#4EA1FF', borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: gridOptions }, x: { grid: { display: false } } } }
  });
}

// 5. DETAILED DATA TABLE WITH ROW & COL TOTALS
function renderDetailedTable(byDateData) {
  let sumP = 0, sumHD = 0, sumWFH = 0, sumLeave = 0, sumWO = 0, sumA = 0, sumMissing = 0, grandTotal = 0;

  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Present (P)</th>
            <th>Half Day (HD)</th>
            <th>WFH</th>
            <th>Leave</th>
            <th>Week Off (WO)</th>
            <th>Absent (A)</th>
            <th>Missing</th>
            <th style="color:var(--accent);">Row Total</th>
          </tr>
        </thead>
        <tbody>
  `;

  byDateData.forEach(d => {
    const rowTotal = d.present + d.hd + d.wfh + d.leave + d.wo + d.absent + d.pendingUnresolved;
    
    sumP += d.present; sumHD += d.hd; sumWFH += d.wfh; sumLeave += d.leave; 
    sumWO += d.wo; sumA += d.absent; sumMissing += d.pendingUnresolved; grandTotal += rowTotal;

    html += `
      <tr>
        <td style="font-family:var(--mono);">${cleanDate(d.date)}</td>
        <td>${d.present}</td>
        <td>${d.hd}</td>
        <td>${d.wfh}</td>
        <td>${d.leave}</td>
        <td>${d.wo}</td>
        <td>${d.absent}</td>
        <td>${d.pendingUnresolved}</td>
        <td style="font-weight:bold; color:var(--accent);">${rowTotal}</td>
      </tr>
    `;
  });

  // ADD COLUMN TOTALS AT THE END
  html += `
        <tr style="background:var(--panel-2); font-weight:bold; font-size:14px;">
          <td>GRAND TOTAL</td>
          <td>${sumP}</td>
          <td>${sumHD}</td>
          <td>${sumWFH}</td>
          <td>${sumLeave}</td>
          <td>${sumWO}</td>
          <td>${sumA}</td>
          <td>${sumMissing}</td>
          <td style="color:var(--accent);">${grandTotal}</td>
        </tr>
      </tbody>
    </table>
  </div>`;

  document.getElementById('detailedTableWrap').innerHTML = html;
}

function renderProgressBars(elementId, dataArray, labelKey) {
  document.getElementById(elementId).innerHTML = dataArray.map(e => {
    const rate = ((e.present / Math.max(1, e.total)) * 100).toFixed(0);
    return `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(e[labelKey] || 'Unknown')}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${rate}%; background: ${rate < 75 ? 'var(--red)' : 'var(--accent)'}"></div></div>
      <div class="bar-val" style="width:70px;">${rate}% (${e.present})</div>
    </div>`;
  }).join('') || '<div class="empty-state">No data available.</div>';
}

// ============ EXPORT ============
async function exportCurrentDay() {
  const rows = await API.exportDay(state.date);
  const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
    Date: r.Date, EmpID: r.EmpID, Name: r.Name, Entity: r.Entity, Department: r.Department,
    Status: r.Status || 'PENDING', Remark: r.Remark, UpdatedBy: r.UpdatedBy, UpdatedAt: r.UpdatedAt
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Compliance');
  XLSX.writeFile(wb, `Compliance_${state.date}.xlsx`);
}

// ============ INIT ============
window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('acc_user');
  if (saved) { state.user = JSON.parse(saved); boot(); }
});

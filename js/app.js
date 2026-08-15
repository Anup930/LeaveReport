// ============ STATE ============
const state = {
  user: null,
  date: todayStr(),
  dashboard: null,
  filters: { entity: '', department: '', search: '', advanced: new Set() },
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

// ============ RUN BTN TASK (Double click prevention) ============
async function runBtnTask(btn, taskFn) {
  if (!btn || btn.disabled) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.style.opacity = '0.7';
  btn.innerHTML = 'working on your req...';
  try {
    await taskFn();
  } catch (e) {
    toast('Error: ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.innerHTML = originalHtml;
  }
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
  if (tab === 'showleave') loadShowLeaveTab();
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

  try {
    state.empMaster = await API.getEmpMaster();
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
    
    if (state.filters.advanced && state.filters.advanced.size > 0) {
      let passAdv = false;
      
      const emp = state.empMaster && state.empMaster.find(e => String(e.EmpID) === String(r.EmpID));
      const baseWt = emp ? (emp['Work Type'] || 'WFO') : 'WFO';
      const remark = r.Remark || '';
      const modeWfh = remark.includes('[Mode: WFH]');
      const modeWfo = remark.includes('[Mode: WFO]');
      
      if (state.filters.advanced.has('perm_wfh') && baseWt === 'WFH') passAdv = true;
      if (state.filters.advanced.has('temp_wfh') && baseWt !== 'WFH' && modeWfh) passAdv = true;
      if (state.filters.advanced.has('wfh_wfo') && baseWt.includes('WFH') && modeWfo) passAdv = true;
      
      if (state.filters.advanced.has('status_P') && r.Status === 'P') passAdv = true;
      if (state.filters.advanced.has('status_A') && r.Status === 'A') passAdv = true;
      if (state.filters.advanced.has('status_HD') && r.Status === 'HD') passAdv = true;
      if (state.filters.advanced.has('status_Leave') && r.Status === 'Leave') passAdv = true;
      if (state.filters.advanced.has('status_WO') && r.Status === 'WO') passAdv = true;
      
      if (!passAdv) return false;
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

const ADVANCED_OPTIONS = [
  { id: 'perm_wfh', label: 'Permanent WFH' },
  { id: 'temp_wfh', label: 'Temp WFH' },
  { id: 'wfh_wfo', label: 'WFH to WFO' },
  { id: 'status_P', label: 'Present' },
  { id: 'status_A', label: 'Absent' },
  { id: 'status_HD', label: 'Half Day' },
  { id: 'status_Leave', label: 'Leave' },
  { id: 'status_WO', label: 'Week Off' }
];

function renderFilterChips() {
  const box = document.getElementById('filterChips');
  const entities = state.filterOptions.entities || [];
  box.innerHTML = `<input type="text" placeholder="Search name / ID..." id="searchInput" oninput="state.filters.search=this.value; renderSections(state.dashboard);" style="width:200px;">` +
    `<span class="chip ${!state.filters.entity ? 'active' : ''}" onclick="setEntityFilter('')">All Entities</span>` +
    entities.map(e => `<span class="chip ${state.filters.entity === e ? 'active' : ''}" onclick="setEntityFilter('${e}')">${escapeHtml(e)}</span>`).join('');
    
  const advBox = document.getElementById('advancedFilterChips');
  if (advBox) {
    let html = `<label style="font-size:11px; font-weight:700; color:var(--ink-dim); margin-right:12px;">ADVANCED VIEWS:</label>`;
    html += ADVANCED_OPTIONS.map(opt => 
      `<span class="chip ${state.filters.advanced.has(opt.id) ? 'active' : ''}" onclick="toggleAdvFilter('${opt.id}')">${opt.label}</span>`
    ).join('');
    advBox.innerHTML = html;
  }
}
window.toggleAdvFilter = function(id) {
  if (state.filters.advanced.has(id)) {
    state.filters.advanced.delete(id);
  } else {
    state.filters.advanced.add(id);
  }
  renderFilterChips();
  if (state.dashboard) renderSections(state.dashboard);
};
function setEntityFilter(e) {
  state.filters.entity = e;
  renderFilterChips();
  if (state.dashboard) renderSections(state.dashboard);
}

function changeDate(v) {
  state.date = v;
  loadDashboard();
}

const STATUS_SUBCATEGORIES = {
  'P': ['Checkin not captured in Zoho', 'Emp login before download data', 'Other'],
  'A': ['Emp not inform us', 'Emp not informed to HR for leave neither Login', 'Other'],
  'HD': ['Emp present in first half', 'Emp present in 2nd half', 'Emp present from', 'Other'],
  'WFH': ['Permanent WFH', 'Temporary WFH', 'Other'],
  'Leave': ['Approved', 'Informed', 'Not Approved', 'Not Informed'],
  'WO': ['Regular off', 'Sudden Off', 'Received from HR Team']
};

// ============ STATUS MODAL ============
let modalTarget = null;
function openStatusModal(row) {
  modalTarget = row;
  document.getElementById('modalEmpName').textContent = row.Name + '  ·  #' + row.EmpID;
  document.getElementById('modalEmpMeta').textContent = (row.Entity || '') + (row.Department ? ' · ' + row.Department : '') + ' · ' + state.date;
  
  // Resolve base work type
  const emp = state.empMaster && state.empMaster.find(e => String(e.EmpID) === String(row.EmpID));
  const baseWt = emp ? (emp['Work Type'] || 'WFO') : 'WFO';
  document.getElementById('modalBaseWorkType').textContent = baseWt;
  
  // Default "Today's Mode"
  if (baseWt === 'WFH') {
    document.querySelector('input[name="todayMode"][value="WFH"]').checked = true;
  } else {
    document.querySelector('input[name="todayMode"][value="WFO"]').checked = true;
  }
  handleTodayModeChange(); // Initialize approval UI if needed
  
  renderStatusPicker('statusPicker', row.Status);
  const remarkEl = document.getElementById('statusRemark') || document.getElementById('modalRemark');
  if(remarkEl) remarkEl.value = ''; // Always clear on open so dynamic remark logic works cleanly
  document.getElementById('statusDynamicForm').innerHTML = ''; // Reset dynamic form
  
  const alertEl = document.getElementById('statusModalAlert');
  if(alertEl) alertEl.style.display = 'none';
  
  document.getElementById('statusModal').classList.remove('hidden');
}
function closeStatusModal() { document.getElementById('statusModal').classList.add('hidden'); modalTarget = null; }

window.handleTodayModeChange = function() {
  const baseWt = document.getElementById('modalBaseWorkType').textContent;
  const selectedMode = document.querySelector('input[name="todayMode"]:checked').value;
  const wfhApprovalBox = document.getElementById('wfhApprovalBox');
  const wfoVerifyBox = document.getElementById('wfoVerifyBox');
  
  if (baseWt === 'WFO' && selectedMode === 'WFH') {
    wfhApprovalBox.classList.remove('hidden');
    wfoVerifyBox.classList.add('hidden');
  } else if (baseWt.includes('WFH') && selectedMode === 'WFO') {
    wfhApprovalBox.classList.add('hidden');
    wfoVerifyBox.classList.remove('hidden');
  } else {
    wfhApprovalBox.classList.add('hidden');
    wfoVerifyBox.classList.add('hidden');
    // reset approvals
    document.getElementById('wfhApproveHOD').checked = false;
    document.getElementById('wfhApproveArvind').checked = false;
    document.getElementById('wfoVerified').checked = false;
    handleHODToggle();
  }
};

window.handleHODToggle = function() {
  const hodChecked = document.getElementById('wfhApproveHOD').checked;
  const nameBox = document.getElementById('wfhApproveNameBox');
  if (hodChecked) {
    nameBox.classList.remove('hidden');
  } else {
    nameBox.classList.add('hidden');
    document.getElementById('wfhApproveName').value = '';
  }
};

function renderStatusPicker(elId, current) {
  const box = document.getElementById(elId);
  box.innerHTML = STATUS_LIST.map(s =>
    `<div class="opt ${s === current ? 'active' : ''}" style="--c:${STATUS_META[s].color}" data-status="${s}" onclick="pickStatus('${elId}', '${s}')">${s} · ${STATUS_META[s].label}</div>`
  ).join('');
  box.dataset.selected = current || '';
}
window.renderDynamicSubForm = function() {
  const container = document.getElementById('statusDynamicExtra');
  if (!container) return;
  const subOption = document.querySelector('input[name="statusSub"]:checked');
  if (!subOption) { container.innerHTML = ''; return; }
  
  const val = subOption.value;
  let html = '';
  
  if (['Emp present in first half', 'Emp present in 2nd half', 'Emp present from'].includes(val)) {
    html = `
      <div style="display:flex; gap:12px; margin-top:12px;">
        <div class="field" style="flex:1;"><label>From Time</label><input type="time" id="hdFromTime"></div>
        <div class="field" style="flex:1;"><label>To Time</label><input type="time" id="hdToTime"></div>
      </div>
    `;
  } else if (val === 'Temporary WFH') {
    html = `
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px;">
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="wfhAware"> Emp aware with our WFH policy?</label>
        <label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" id="wfhTrack"> We are tracking his activity in our App?</label>
        <div class="field" style="margin-top:4px;">
          <label>Team logger is working</label>
          <select id="wfhLogger"><option value="">-- Select --</option><option value="Yes">Yes</option><option value="No">No</option></select>
        </div>
      </div>
    `;
  } else if (val === 'Other') {
    html = `<div style="margin-top:12px; color:var(--amber); font-size:12px; font-weight:600;">⚠️ Please mention the real issue in the Remark box below.</div>`;
  }
  
  container.innerHTML = html;
}

function pickStatus(elId, s) {
  const box = document.getElementById(elId);
  box.dataset.selected = s;
  [...box.children].forEach(c => c.classList.toggle('active', c.dataset.status === s));
  const alertEl = document.getElementById('statusModalAlert');
  if(alertEl) alertEl.style.display = 'none';
  
  // Render sub-options
  const dynamicForm = document.getElementById('statusDynamicForm');
  if (STATUS_SUBCATEGORIES[s]) {
    const opts = STATUS_SUBCATEGORIES[s];
    let html = `<div style="background:var(--panel-2); padding:12px; border-radius:8px; border:1px solid var(--line);">`;
    html += `<div style="font-size:12px; color:var(--ink-dim); font-weight:700; margin-bottom:8px;">SELECT REASON / DETAILS</div>`;
    opts.forEach((opt, idx) => {
      html += `<label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer;">
        <input type="radio" name="statusSub" value="${opt}" onchange="renderDynamicSubForm()"> ${opt}
      </label>`;
    });
    html += `<div id="statusDynamicExtra"></div>`;
    html += `</div>`;
    dynamicForm.innerHTML = html;
  } else {
    dynamicForm.innerHTML = '';
  }
}

async function saveStatus(btn) {
  const status = document.getElementById('statusPicker').dataset.selected;
  let extraRemark = (document.getElementById('statusRemark') || document.getElementById('modalRemark')).value.trim();
  
  if (!status) {
    const alertEl = document.getElementById('statusModalAlert');
    if (alertEl) {
      alertEl.textContent = `Please pick a status for ${modalTarget.Name} before saving.`;
      alertEl.style.display = 'block';
    } else {
      toast('Pick a status', true);
    }
    return;
  }

  // Compile Dynamic Form Data
  let compiledRemark = '';
  const subOptionEl = document.querySelector('input[name="statusSub"]:checked');
  
  if (STATUS_SUBCATEGORIES[status]) {
    if (!subOptionEl) {
      const alertEl = document.getElementById('statusModalAlert');
      alertEl.textContent = `Please select a reason/detail option for ${status}.`;
      alertEl.style.display = 'block';
      return;
    }
    const subVal = subOptionEl.value;
    compiledRemark += subVal;
    
    // Check specific required fields
    if (subVal === 'Other' && !extraRemark) {
      const alertEl = document.getElementById('statusModalAlert');
      alertEl.textContent = `You selected 'Other'. Please mention the real issue in the REMARK box below.`;
      alertEl.style.display = 'block';
      return;
    }
    
    if (['Emp present in first half', 'Emp present in 2nd half', 'Emp present from'].includes(subVal)) {
      const f = document.getElementById('hdFromTime')?.value;
      const t = document.getElementById('hdToTime')?.value;
      if (!f || !t) {
        document.getElementById('statusModalAlert').textContent = `Please provide both From and To times.`;
        document.getElementById('statusModalAlert').style.display = 'block';
        return;
      }
      compiledRemark += ` from ${f} TO ${t}`;
    }
    
    if (subVal === 'Temporary WFH') {
      const aw = document.getElementById('wfhAware')?.checked ? 'Yes' : 'No';
      const tr = document.getElementById('wfhTrack')?.checked ? 'Yes' : 'No';
      const log = document.getElementById('wfhLogger')?.value;
      if (!log) {
        document.getElementById('statusModalAlert').textContent = `Please select if Team Logger is working.`;
        document.getElementById('statusModalAlert').style.display = 'block';
        return;
      }
      compiledRemark += ` (Aware: ${aw}, Tracking: ${tr}, Logger: ${log})`;
    }
  }
  
  // Combine compiled remark with extra remark
  let finalRemark = compiledRemark;
  if (extraRemark) {
    finalRemark = finalRemark ? `${finalRemark} | ${extraRemark}` : extraRemark;
  }
  
  if (!finalRemark && (modalTarget.Source === 'Missing' || status !== 'P')) {
    if (!confirm('No additional remark added. Save anyway?')) return;
  }
  
  // Prepend Today's Mode & Approvals
  const todayMode = document.querySelector('input[name="todayMode"]:checked').value;
  let modeStr = `[Mode: ${todayMode}]`;
  
  const wfhApprovalBox = document.getElementById('wfhApprovalBox');
  const wfoVerifyBox = document.getElementById('wfoVerifyBox');
  if (!wfhApprovalBox.classList.contains('hidden')) {
    const hod = document.getElementById('wfhApproveHOD').checked;
    const arvind = document.getElementById('wfhApproveArvind').checked;
    const name = document.getElementById('wfhApproveName').value.trim();
    
    if (hod || arvind) {
      modeStr += ` (Apprv: `;
      const apps = [];
      if (hod) apps.push('HOD' + (name ? `-${name}` : ''));
      if (arvind) apps.push('Arvind');
      modeStr += apps.join(', ') + `)`;
    } else {
      modeStr += ` (Pending Apprv)`;
    }
  } else if (!wfoVerifyBox.classList.contains('hidden')) {
    const verified = document.getElementById('wfoVerified').checked;
    modeStr += verified ? ` (Verified: Yes)` : ` (Verified: No)`;
  }
  
  finalRemark = modeStr + ' ' + (finalRemark || '');
  
  await runBtnTask(btn, async () => {
    await API.updateComplianceStatus(state.date, modalTarget.EmpID, status, finalRemark, state.user.displayName);
    toast('Status updated');
    closeStatusModal();
    loadDashboard();
  });
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

async function submitLeave(btn) {
  const empId = document.getElementById('leaveEmpSelect').value;
  const from = document.getElementById('leaveFrom').value;
  const to = document.getElementById('leaveTo').value;
  const reason = document.getElementById('leaveReason').value.trim();
  if (!empId || !from || !to) return toast('Fill employee, from and to date', true);
  await runBtnTask(btn, async () => {
    await API.scheduleLeave({ empId, fromDate: from, toDate: to, reason, createdBy: state.user.displayName });
    toast('Leave scheduled');
    document.getElementById('leaveReason').value = '';
    loadLeaveTab();
  });
}
async function cancelLeaveRow(id) {
  if (!confirm('Cancel this leave record?')) return;
  await API.cancelLeave(id);
  toast('Leave cancelled');
  loadLeaveTab();
}

// ============ EMP MASTER TAB ============
async function loadEmpMasterTab() {
  const box = document.getElementById('empMasterList');
  box.innerHTML = '<div class="empty-state">Loading employees...</div>';
  document.getElementById('empMasterSearch').value = '';
  const list = await API.getEmpMaster();
  state.empMaster = list;
  renderEmpMasterList();
}

window.renderEmpMasterList = function(query = '') {
  const box = document.getElementById('empMasterList');
  const q = query.toLowerCase().trim();
  
  const filtered = state.empMaster.filter(e => {
    if (!q) return true;
    return String(e.Name).toLowerCase().includes(q) || 
           String(e.EmpID).toLowerCase().includes(q) || 
           String(e.Email).toLowerCase().includes(q) || 
           String(e.Department).toLowerCase().includes(q) ||
           String(e.Entity).toLowerCase().includes(q);
  });

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">No employees found matching your search.</div>';
    return;
  }

  box.innerHTML = `<div class="table-wrap"><table><thead><tr>
    <th>ID</th><th>Name</th><th>Email</th><th>Entity</th><th>Department</th><th>Work Type</th><th>Status</th>
  </tr></thead><tbody>` + filtered.map(e => `<tr style="cursor:pointer;" onclick="openEmpDetails('${e.EmpID}')">
    <td class="mono">${e.EmpID}</td><td>${escapeHtml(e.Name)}</td><td style="color:var(--ink-dim)">${escapeHtml(e.Email)}</td>
    <td>${escapeHtml(e.Entity)}</td><td>${escapeHtml(e.Department)}</td>
    <td><span class="badge" style="--c:var(--ink-faint);">${escapeHtml(e['Work Type'] || 'WFO')}</span></td>
    <td><span class="badge" style="--c:${e.Status === 'Active' ? 'var(--green)' : 'var(--ink-faint)'}">${e.Status}</span></td>
  </tr>`).join('') + '</tbody></table></div>';
}

let currentDetEmp = null;

function openEmpDetails(empId) {
  const emp = state.empMaster.find(e => String(e.EmpID) === String(empId));
  if (!emp) return;
  currentDetEmp = emp;
  
  document.getElementById('detEmpName').textContent = emp.Name;
  document.getElementById('detEmpId').textContent = '#' + emp.EmpID;
  document.getElementById('detEmpEmail').textContent = emp.Email || 'N/A';
  document.getElementById('detEmpEntity').textContent = emp.Entity || 'N/A';
  
  const wt = emp['Work Type'] || 'WFO';
  document.getElementById('detEmpDept').innerHTML = `${escapeHtml(emp.Department || 'N/A')} <br><span style="font-size:11px; color:var(--ink-dim);">${escapeHtml(wt)}</span>`;
  
  const badgeColor = emp.Status === 'Active' ? 'var(--green)' : 'var(--ink-faint)';
  document.getElementById('detEmpStatusBadge').innerHTML = `<span class="badge" style="--c:${badgeColor}">${emp.Status}</span>`;
  
  const btn = document.getElementById('detEmpToggleBtn');
  if (emp.Status === 'Active') {
    btn.textContent = 'Mark Deactivate';
    btn.className = 'btn btn-danger';
  } else {
    btn.textContent = 'Mark Active';
    btn.className = 'btn btn-primary';
  }
  
  document.getElementById('empDetailsModal').classList.remove('hidden');
}

function closeEmpDetailsModal() {
  document.getElementById('empDetailsModal').classList.add('hidden');
  currentDetEmp = null;
}

async function toggleEmpDetailsStatus(btn) {
  if (!currentDetEmp) return;
  const newStatus = currentDetEmp.Status === 'Active' ? 'Inactive' : 'Active';
  await runBtnTask(btn, async () => {
    await API.updateEmployee({ empId: currentDetEmp.EmpID, status: newStatus });
    toast('Updated employee status');
    closeEmpDetailsModal();
    loadEmpMasterTab();
  });
}
async function toggleEmpStatus(empId, current) {
  await API.updateEmployee({ empId, status: current === 'Active' ? 'Inactive' : 'Active' });
  toast('Updated');
  loadEmpMasterTab();
}
let isEditMode = false;

function openAddEmpModal() {
  isEditMode = false;
  document.getElementById('aeModalTitle').textContent = 'Add New Employee';
  document.getElementById('aeModalSub').textContent = 'Enter details to register a new employee.';
  
  const idField = document.getElementById('aeEmpId');
  idField.value = '';
  idField.disabled = false;
  
  document.getElementById('aeName').value = '';
  document.getElementById('aeEmail').value = '';
  document.getElementById('aeEntity').value = '';
  document.getElementById('aeDept').value = '';
  document.getElementById('aeWorkType').value = 'WFO';
  handleWorkTypeChange();
  document.querySelectorAll('.ae-day').forEach(cb => cb.checked = false);
  
  document.getElementById('aeBtnAddAnother').style.display = 'block';
  document.getElementById('aeBtnSave').textContent = 'Save & Close';
  
  document.getElementById('addEmpModal').classList.remove('hidden');
}

function openEditEmpModal() {
  if (!currentDetEmp) return;
  isEditMode = true;
  document.getElementById('aeModalTitle').textContent = 'Edit Employee';
  document.getElementById('aeModalSub').textContent = 'Update details for ' + currentDetEmp.Name;
  
  const idField = document.getElementById('aeEmpId');
  idField.value = currentDetEmp.EmpID;
  idField.disabled = true; // Cannot edit ID
  
  document.getElementById('aeName').value = currentDetEmp.Name || '';
  document.getElementById('aeEmail').value = currentDetEmp.Email || '';
  document.getElementById('aeEntity').value = currentDetEmp.Entity || '';
  document.getElementById('aeDept').value = currentDetEmp.Department || '';
  
  // Parse Work Type
  let wt = currentDetEmp['Work Type'] || 'WFO';
  document.querySelectorAll('.ae-day').forEach(cb => cb.checked = false);
  
  if (wt.startsWith('Hybrid')) {
    document.getElementById('aeWorkType').value = 'Hybrid';
    const match = wt.match(/WFH:\s*(.+)\)/);
    if (match) {
      const days = match[1].split(',').map(d => d.trim());
      document.querySelectorAll('.ae-day').forEach(cb => {
        if (days.includes(cb.value)) cb.checked = true;
      });
    }
  } else if (wt === 'WFH') {
    document.getElementById('aeWorkType').value = 'WFH';
  } else {
    document.getElementById('aeWorkType').value = 'WFO';
  }
  
  handleWorkTypeChange();
  
  document.getElementById('aeBtnAddAnother').style.display = 'none'; // Hide add another button in edit mode
  document.getElementById('aeBtnSave').textContent = 'Save Changes';
  
  closeEmpDetailsModal();
  document.getElementById('addEmpModal').classList.remove('hidden');
}

function closeAddEmpModal() {
  document.getElementById('addEmpModal').classList.add('hidden');
}

window.handleWorkTypeChange = function() {
  const wt = document.getElementById('aeWorkType').value;
  if (wt === 'Hybrid') {
    document.getElementById('aeHybridDays').classList.remove('hidden');
  } else {
    document.getElementById('aeHybridDays').classList.add('hidden');
  }
}

async function submitAddEmployee(btn, addAnother) {
  const empId = document.getElementById('aeEmpId').value.trim();
  const name = document.getElementById('aeName').value.trim();
  const email = document.getElementById('aeEmail').value.trim();
  const entity = document.getElementById('aeEntity').value.trim();
  const department = document.getElementById('aeDept').value.trim();
  let workType = document.getElementById('aeWorkType').value;
  
  if (!empId || !name) return toast('Employee ID and Name are required', true);
  
  if (!isEditMode) {
    if (state.empMaster.find(e => String(e.EmpID) === empId)) {
      return toast('Employee ID already exists!', true);
    }
  }
  
  if (workType === 'Hybrid') {
    const days = Array.from(document.querySelectorAll('.ae-day:checked')).map(cb => cb.value);
    if (days.length === 0) return toast('Please select at least one WFH day for Hybrid.', true);
    workType = `Hybrid (WFH: ${days.join(', ')})`;
  }
  
  await runBtnTask(btn, async () => {
    if (isEditMode) {
      await API.updateEmployee({ empId, name, email, entity, department, workType });
      toast('Employee updated');
      
      const existing = state.empMaster.find(e => String(e.EmpID) === empId);
      if (existing) {
        existing.Name = name;
        existing.Email = email;
        existing.Entity = entity;
        existing.Department = department;
        existing['Work Type'] = workType;
      }
    } else {
      await API.addEmployee({ empId, name, email, entity, department, workType });
      toast('Employee added');
      
      state.empMaster.push({
        EmpID: empId, Name: name, Email: email, Entity: entity, 
        Department: department, Status: 'Active', 'Work Type': workType
      });
    }
    
    renderEmpMasterList(document.getElementById('empMasterSearch').value);
    
    if (addAnother && !isEditMode) {
      document.getElementById('aeEmpId').value = '';
      document.getElementById('aeName').value = '';
      document.getElementById('aeEmail').value = '';
      document.getElementById('aeEmpId').focus();
    } else {
      closeAddEmpModal();
    }
  });
}

async function populateEmpDropdown(elId) {
  if (!state.empMaster.length) state.empMaster = await API.getEmpMaster();
  const sel = document.getElementById(elId);
  sel.innerHTML = '<option value="">Select employee...</option>' +
    state.empMaster.filter(e => e.Status === 'Active').map(e => `<option value="${e.EmpID}">${escapeHtml(e.Name)} (#${e.EmpID})</option>`).join('');
}

// ============ SHOW LEAVE TAB ============
async function loadShowLeaveTab() {
  const wrap = document.getElementById('showLeaveList');
  wrap.innerHTML = '<div class="empty-state">Loading employees...</div>';
  document.getElementById('showLeaveSearch').value = '';
  
  if (!state.empMaster.length) {
    try {
      state.empMaster = await API.getEmpMaster();
    } catch(e) {
      return wrap.innerHTML = `<div class="empty-state" style="color:var(--red);">Failed to load employees: ${e.message}</div>`;
    }
  }
  
  renderShowLeaveCards();
}

window.renderShowLeaveCards = function(query = '') {
  const wrap = document.getElementById('showLeaveList');
  const q = query.toLowerCase().trim();
  
  const filtered = state.empMaster.filter(e => {
    if (e.Status !== 'Active') return false;
    if (!q) return true;
    return String(e.Name).toLowerCase().includes(q) || String(e.EmpID).toLowerCase().includes(q);
  });
  
  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty-state">No employees found.</div>';
    return;
  }

  const html = filtered.map(r => `
    <div class="emp-card" style="--rail:var(--accent);" onclick="openAttendanceCalendar('${r.EmpID}', '${escapeHtml(r.Name)}', '${escapeHtml(r.Entity || '')}')">
      <div class="top">
        <div>
          <div class="name">${escapeHtml(r.Name)}</div>
          <div class="id">#${r.EmpID}</div>
        </div>
        <span class="badge" style="--c:var(--accent)">View Calendar</span>
      </div>
      <div class="meta">${escapeHtml(r.Entity || '')}${r.Department ? ' · ' + escapeHtml(r.Department) : ''}</div>
    </div>
  `).join('');
  
  wrap.innerHTML = `<div class="card-grid">${html}</div>`;
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

  // Sort chronologically (oldest to newest) for charts
  trends.byDate.sort((a, b) => new Date(a.date) - new Date(b.date));

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

  const tableData = [...byDateData].reverse(); // Newest first for the table
  
  tableData.forEach(d => {
    const rowTotal = d.present + d.hd + d.wfh + d.leave + d.wo + d.absent + d.pendingUnresolved;
    
    sumP += d.present; sumHD += d.hd; sumWFH += d.wfh; sumLeave += d.leave; 
    sumWO += d.wo; sumA += d.absent; sumMissing += d.pendingUnresolved; grandTotal += rowTotal;

    html += `
      <tr>
        <td style="font-family:var(--mono); color:var(--ink); font-weight:600;">${cleanDate(d.date)}</td>
        <td style="${d.present > 0 ? 'color:var(--green);' : ''}">${d.present}</td>
        <td style="${d.hd > 0 ? 'color:var(--amber);' : ''}">${d.hd}</td>
        <td style="${d.wfh > 0 ? 'color:var(--blue);' : ''}">${d.wfh}</td>
        <td style="${d.leave > 0 ? 'color:var(--purple);' : ''}">${d.leave}</td>
        <td>${d.wo}</td>
        <td style="${d.absent > 0 ? 'color:var(--red); font-weight:600;' : ''}">${d.absent}</td>
        <td style="${d.pendingUnresolved > 0 ? 'color:var(--red); font-weight:600;' : ''}">${d.pendingUnresolved}</td>
        <td style="font-weight:bold; color:var(--accent); background:var(--panel-2);">${rowTotal}</td>
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

// ============ ATTENDANCE CALENDAR ============
let calCurrentDate = new Date();
let calCurrentEmpId = null;

async function openAttendanceCalendar(empId, empName, empMeta) {
  // Use passed params, or fallback to modalTarget if invoked from Status Modal
  const id = empId || (modalTarget ? modalTarget.EmpID : null);
  const name = empName || (modalTarget ? modalTarget.Name : '');
  let meta = empMeta;
  if (!meta && modalTarget) {
    meta = (modalTarget.Entity || '') + (modalTarget.Department ? ' · ' + modalTarget.Department : '');
  }

  if (!id) return toast('No employee selected', true);
  
  calCurrentEmpId = id;
  calCurrentDate = new Date(); // Reset to current month
  document.getElementById('calEmpName').textContent = name + '  ·  #' + id;
  document.getElementById('calEmpMeta').textContent = meta || '';
  document.getElementById('attendanceCalendarModal').classList.remove('hidden');
  await renderCalendar();
}

function closeAttendanceCalendar() {
  document.getElementById('attendanceCalendarModal').classList.add('hidden');
}

async function changeCalendarMonth(offset) {
  calCurrentDate.setMonth(calCurrentDate.getMonth() + offset);
  await renderCalendar();
}

async function renderCalendar() {
  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth(); // 0-11
  
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  document.getElementById('calMonthYear').textContent = `${monthNames[month]} ${year}`;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const fromDate = `${year}-${pad(month+1)}-01`;
  const toDate = `${year}-${pad(month+1)}-${pad(lastDay.getDate())}`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '<div style="padding:40px;text-align:center;grid-column:1/-1;">Loading...</div>';

  try {
    const res = await API.getEmployeeAttendance(calCurrentEmpId, fromDate, toDate);
    
    let html = '';
    const dows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dows.forEach(d => html += `<div class="dow">${d}</div>`);
    
    // Calculate starting offset (Monday=0, Sunday=6)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;
    
    // Add empty cells for days before the 1st
    for (let i = 0; i < startDayOfWeek; i++) {
      html += `<div class="calendar-cell other-month"></div>`;
    }
    
    const recordsMap = {};
    if (res.records) {
      res.records.forEach(r => {
        // Google Apps Script sends dates as UTC ISO strings (e.g. 2026-08-04T18:30:00.000Z)
        // We must parse it back to a local date to avoid shifting by 1 day backward in IST
        let localDateStr = '';
        const d = new Date(r.Date);
        if (!isNaN(d) && String(r.Date).includes('T')) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          localDateStr = `${y}-${m}-${day}`;
        } else {
          localDateStr = String(r.Date).substring(0, 10);
        }
        recordsMap[localDateStr] = r;
      });
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dStr = `${year}-${pad(month+1)}-${pad(day)}`;
      const rec = recordsMap[dStr];
      
      let eventHtml = '';
      if (rec && rec.Status) {
        let cls = '';
        let label = rec.Status;
        let sub = '';
        
        // Format login time if available, handling Apps Script date string if it's a time
        if (rec.FirstIn) {
            let fi = String(rec.FirstIn);
            if (fi.includes('T')) {
                const d = new Date(fi);
                if (!isNaN(d)) {
                    sub = 'In: ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }
            } else {
                sub = 'In: ' + fi;
            }
        }

        if (rec.Status === 'P') { cls = 'present'; label = 'Present'; }
        else if (rec.Status === 'A') { cls = 'absent'; label = 'Absent'; sub = ''; }
        else if (rec.Status === 'HD') { cls = 'half-day'; label = '0.5 day Present'; }
        else if (rec.Status === 'WFH') { cls = 'wfh'; label = 'Present (Remote In)'; }
        else if (rec.Status === 'Leave') { cls = 'leave'; label = 'Leave'; sub = ''; }
        else if (rec.Status === 'WO') { cls = 'wo'; label = 'Week Off'; sub = ''; }
        
        eventHtml = `<div class="event ${cls}">${label} ${sub ? `<div class="event-sub">${sub}</div>` : ''}</div>`;
      }
      
      html += `
        <div class="calendar-cell">
          <div class="date">${day}</div>
          ${eventHtml}
        </div>
      `;
    }
    
    // Fill remaining cells for a complete grid
    const totalCells = startDayOfWeek + lastDay.getDate();
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remaining; i++) {
      html += `<div class="calendar-cell other-month"></div>`;
    }
    
    grid.innerHTML = html;
  } catch (e) {
    grid.innerHTML = `<div style="padding:40px;text-align:center;grid-column:1/-1;color:var(--red);">Error: ${e.message}</div>`;
  }
}

// ============ THEME ============
function setTheme(mode) {
  localStorage.setItem('acc_theme', mode);
  applyTheme();
}

function applyTheme() {
  const mode = localStorage.getItem('acc_theme') || 'system';
  const root = document.documentElement;
  
  let isDark = true;
  if (mode === 'light') {
    isDark = false;
  } else if (mode === 'system') {
    isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');

  const btnD = document.getElementById('themeBtnDark');
  const btnS = document.getElementById('themeBtnSystem');
  const btnL = document.getElementById('themeBtnLight');
  
  if (btnD) {
    const actColor = 'var(--accent)';
    btnD.style.borderColor = mode === 'dark' ? actColor : '';
    btnD.style.color = mode === 'dark' ? actColor : '';
    btnD.style.background = mode === 'dark' ? 'var(--accent-dim)' : '';
    
    btnS.style.borderColor = mode === 'system' ? actColor : '';
    btnS.style.color = mode === 'system' ? actColor : '';
    btnS.style.background = mode === 'system' ? 'var(--accent-dim)' : '';
    
    btnL.style.borderColor = mode === 'light' ? actColor : '';
    btnL.style.color = mode === 'light' ? actColor : '';
    btnL.style.background = mode === 'light' ? 'var(--accent-dim)' : '';
  }
  
  if (window.Chart) {
    Chart.defaults.color = isDark ? '#8B93A7' : '#475569';
    if (typeof trendLineChartInstance !== 'undefined' && trendLineChartInstance) trendLineChartInstance.update();
    if (typeof trendPieChartInstance !== 'undefined' && trendPieChartInstance) trendPieChartInstance.update();
    if (typeof trendColChartInstance !== 'undefined' && trendColChartInstance) trendColChartInstance.update();
    if (typeof wfhChartInstance !== 'undefined' && wfhChartInstance) wfhChartInstance.update();
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (localStorage.getItem('acc_theme') === 'system') applyTheme();
});

// ============ INIT ============
window.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  const saved = sessionStorage.getItem('acc_user');
  if (saved) { state.user = JSON.parse(saved); boot(); }
});

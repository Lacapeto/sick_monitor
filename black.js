// ═══════════════════════════════════════════════════════
//  FIREBASE CONFIG - REPLACE WITH YOUR PROJECT CONFIG
// ═══════════════════════════════════════════════════════
const firebaseConfig = {
  // Get this from Firebase Console → Project Settings → Your apps → Web app
  apiKey: "AIzaSyCeDKfrBbaRi9jRsQYbabN4KV0r-NUmyEs",
  authDomain: "vitals-a16cb.firebaseapp.com",
  projectId: "vitals-a16cb",
  storageBucket: "vitals-a16cb.firebasestorage.app",
  messagingSenderId: "722474839734",
  appId: "1:722474839734:web:4035171a84dc4a9d220017"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ═══════════════════════════════════════════════════════
//  STATE & REALTIME LISTENERS
// ═══════════════════════════════════════════════════════
let patients = [], vitalsLog = [], alertsLog = [], hrHistory = [], sbpHistory = [], dbpHistory = [];
let autoSimTimer = null, readingCount = 0, isDbConnected = false;
const charts = {};

// Real-time listeners
db.collection('patients').orderBy('registered', 'desc').onSnapshot(snapshot => {
  patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  document.getElementById('dbStatus').textContent = 'Synced';
  document.getElementById('dbStatus').parentElement.classList.add('status-pill');
  renderPatientTable();
});

db.collection('vitals').orderBy('timestamp', 'desc').limit(200).onSnapshot(snapshot => {
  vitalsLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (vitalsLog.length) {
    const last = vitalsLog[0];
    processVitalsDisplay(last);
  }
  renderHistoryTable();
});

db.collection('alerts').orderBy('time', 'desc').onSnapshot(snapshot => {
  alertsLog = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  document.getElementById('alertCount').textContent = alertsLog.length;
  renderAlertsList();
});

// Connection status
db.enablePersistence().catch(err => console.log('Persistence failed:', err));
window.addEventListener('online', () => document.getElementById('dbStatus').textContent = 'Online');
window.addEventListener('offline', () => document.getElementById('dbStatus').textContent = 'Offline');

// ═══════════════════════════════════════════════════════
//  CHARTS (same as original)
const hrCtx = document.getElementById('hrChart').getContext('2d');
const bpCtx = document.getElementById('bpChart').getContext('2d');

charts.hr = new Chart(hrCtx, {
  type: 'line', data: { labels: [], datasets: [{ label: 'HR', data: [], borderColor: '#ef4444', backgroundColor: '#ef444422', fill: true, tension: .4, pointRadius: 2, borderWidth: 2 }] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { color: '#1e2d45' }, ticks: { color: '#94a3b8', font: { size: 10 } } } } }
});

charts.bp = new Chart(bpCtx, {
  type: 'line', data: { labels: [], datasets: [
    { label: 'Systolic', data: [], borderColor: '#3b82f6', fill: false, tension: .4, pointRadius: 2, borderWidth: 2 },
    { label: 'Diastolic', data: [], borderColor: '#06b6d4', fill: false, tension: .4, pointRadius: 2, borderWidth: 2 }
  ] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } }, scales: { x: { display: false }, y: { grid: { color: '#1e2d45' }, ticks: { color: '#94a3b8', font: { size: 10 } } } } }
});

function pushChart(chart, value, extra = null) {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  chart.data.labels.push(t);
  chart.data.datasets[0].data.push(value);
  if (extra !== null) chart.data.datasets[1].data.push(extra);
  if (chart.data.labels.length > 20) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(d => d.data.shift());
  }
  chart.update('none');
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION (same)
function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (el && el.classList) el.classList.add('active');
  if (name === 'patients') renderPatientTable();
  if (name === 'history') renderHistoryTable();
  if (name === 'alerts') renderAlertsList();
}

// ═══════════════════════════════════════════════════════
//  DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════
async function savePatient(student) {
  await db.collection('patients').doc(student.matric).set(student);
  showToast(`✅ ${student.name} registered successfully`);
  addLog(`✅ New student registered: ${student.name} (${student.matric}) — Device: ${student.device || 'Unassigned'}`, 'log-ok');
  clearRegForm();
}

async function saveVitals(data) {
  readingCount++;
  data.id = readingCount;
  data.time = new Date().toLocaleTimeString();
  await db.collection('vitals').add(data);
}

async function saveAlert(data) {
  await db.collection('alerts').add(data);
}

async function clearAlerts() {
  const batch = db.batch();
  alertsLog.forEach(alert => batch.delete(db.collection('alerts').doc(alert.id)));
  await batch.commit();
}

// ═══════════════════════════════════════════════════════
//  REGISTER STUDENT (now saves to Firestore)
async function registerStudent() {
  const name = document.getElementById('reg_name').value.trim();
  const matric = document.getElementById('reg_matric').value.trim();
  const phone = document.getElementById('reg_phone').value.trim();
  
  if (!name || !matric || !phone) {
    showToast('❌ Fill required fields (Name, Matric, Phone)');
    return;
  }

  // Check if student exists
  const existing = patients.find(p => p.matric === matric);
  if (existing) {
    showToast('⚠️ Student already registered');
    return;
  }

  const student = {
    id: Date.now(),
    name, matric, phone,
    dob: document.getElementById('reg_dob').value,
    gender: document.getElementById('reg_gender').value,
    dept: document.getElementById('reg_dept').value,
    faculty: document.getElementById('reg_faculty').value,
    level: document.getElementById('reg_level').value,
    bloodgroup: document.getElementById('reg_bloodgroup').value,
    emergency: document.getElementById('reg_emergency').value,
    device: document.getElementById('reg_device').value,
    conditions: document.getElementById('reg_conditions').value,
    notes: document.getElementById('reg_notes').value,
    registered: new Date().toLocaleDateString(),
    last_hr: '--', last_temp: '--', last_sbp: '--', last_dbp: '--',
    last_seen: 'Never', critical: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await savePatient(student);
  } catch (error) {
    showToast('❌ Registration failed: ' + error.message);
  }
}

function clearRegForm() {
  document.querySelectorAll('#page-register input, #page-register select, #page-register textarea').forEach(el => {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = '';
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
  });
}

// ═══════════════════════════════════════════════════════
//  VITAL PROCESSING (now saves to Firestore)
async function processVitals(data) {
  const { device_id, student_id, heart_rate, body_temp, systolic, diastolic, is_critical, timestamp } = data;
  const timeStr = new Date().toLocaleTimeString();

  // Update display
  processVitalsDisplay({ heart_rate, body_temp, systolic, diastolic });

  // Save to database
  const vitalsData = { device_id, student_id, heart_rate, body_temp, systolic, diastolic, is_critical, timestamp: Date.now() };
  await saveVitals(vitalsData);

  // Update patient last reading
  const patient = patients.find(p => p.matric === student_id || p.device === device_id);
  if (patient) {
    await db.collection('patients').doc(patient.matric).update({
      last_hr: heart_rate, last_temp: body_temp, last_sbp: systolic, 
      last_dbp: diastolic, last_seen: timeStr, critical: is_critical
    });
  }

  // Critical alert
  if (is_critical) await triggerAlert({ ...data, name: patient?.name || student_id });

  renderActivePatient(patient, data);
  addLog(is_critical
    ? `⚠️ [${timeStr}] CRITICAL — ${student_id} | HR:${heart_rate} Tmp:${body_temp} BP:${systolic}/${diastolic}`
    : `✓ [${timeStr}] ${student_id} | HR:${heart_rate}bpm | ${body_temp}°C | BP:${systolic}/${diastolic}`,
    is_critical ? 'log-crit' : 'log-ok');
}

function processVitalsDisplay(data) {
  document.getElementById('hrVal').textContent = data.heart_rate || '--';
  document.getElementById('tempVal').textContent = data.body_temp ? data.body_temp.toFixed(1) : '--';
  document.getElementById('sbpVal').textContent = data.systolic || '--';
  document.getElementById('dbpVal').textContent = data.diastolic || '--';

  setBadge('hrBadge', data.heart_rate, 50, 110);
  setBadge('tempBadge', data.body_temp, 35, 38.5);
  setBadge('sbpBadge', data.systolic, 90, 140);
  setBadge('dbpBadge', data.diastolic, 60, 90);

  setProgress('hrProg', data.heart_rate, 50, 110);
  setProgress('tempProg', data.body_temp, 35, 38.5);
  setProgress('sbpProg', data.systolic, 90, 140);

  pushChart(charts.hr, data.heart_rate);
  pushChart(charts.bp, data.systolic, data.diastolic);
}

// Utility functions (same as original)
function setBadge(id, val, lo, hi) {
  const el = document.getElementById(id);
  if (!val && val !== 0) return;
  const critical = val < lo || val > hi;
  el.textContent = critical ? 'Critical' : 'Normal';
  el.className = 'stat-badge ' + (critical ? 'badge-warn' : 'badge-ok');
}

function setProgress(id, val, lo, hi) {
  const el = document.getElementById(id);
  if (!val) return;
  const pct = Math.min(100, Math.max(0, ((val - lo) / (hi - lo)) * 100));
  el.style.width = pct + '%';
}

// Alert system (same logic, saves to Firestore)
async function triggerAlert(data) {
  const timeStr = new Date().toLocaleTimeString();
  const pt = patients.find(p => p.matric === data.student_id || p.device === data.device_id);
  const name = pt ? pt.name : data.student_id;

  // Show banner
  const banner = document.getElementById('alertBanner');
  banner.classList.remove('hidden');
  document.getElementById('alertTitle').textContent = `🚨 CRITICAL: ${name} (${data.device_id})`;
  document.getElementById('alertDetail').textContent = `HR: ${data.heart_rate}bpm | Temp: ${data.body_temp}°C | BP: ${data.systolic}/${data.diastolic} mmHg`;

  // Save alert
  const alertData = {
    time: timeStr, name, device: data.device_id, student_id: data.student_id,
    hr: data.heart_rate, temp: data.body_temp, sbp: data.systolic, dbp: data.diastolic,
    phone: pt ? pt.phone : 'Unknown', timestamp: Date.now()
  };
  await saveAlert(alertData);

  sendBrowserNotification(name, data);
  showToast(`🚨 CRITICAL ALERT: ${name}`);
  addLog(`🚨 ALERT SENT for ${name} — Phone: ${alertData.phone}`, 'log-crit');
}

function dismissAlert() {
  document.getElementById('alertBanner').classList.add('hidden');
}

// Render functions (updated to use global arrays)
function renderPatientTable() {
  const tb = document.getElementById('patientTable');
  if (!patients.length) {
    tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--sub);padding:30px">No patients registered yet</td></tr>';
    return;
  }
  tb.innerHTML = patients.map(p => `
    <tr class="${p.critical ? 'crit-row' : ''}">
      <td><div style="font-weight:600">${p.name}</div><div style="font-size:.75rem;color:var(--sub)">${p.level||''} ${p.dept||''}</div></td>
      <td><span style="font-family:monospace;font-size:.8rem">${p.matric}</span></td>
      <td>${p.dept||'—'}</td>
      <td>${p.phone}</td>
      <td>${p.last_hr||'—'}</td>
      <td>${p.last_temp||'—'}</td>
      <td>${p.last_sbp&&p.last_dbp&&p.last_sbp!=='--'?p.last_sbp+'/'+p.last_dbp:'—'}</td>
      <td><span class="badge ${p.critical?'badge-critical':'badge-normal'}">${p.critical?'Critical':'Normal'}</span></td>
    </tr>`).join('');
}

function renderHistoryTable() {
  const tb = document.getElementById('historyTable');
  if (!vitalsLog.length) {
    tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--sub);padding:30px">No data received yet</td></tr>';
    return;
  }
  tb.innerHTML = vitalsLog.slice(0, 100).map(v => `
    <tr class="${v.is_critical?'crit-row':''}">
      <td style="color:var(--sub);font-size:.78rem">${v.id}</td>
      <td style="font-size:.8rem">${v.time}</td>
      <td>${v.student_id}</td>
      <td><span class="tag">${v.device_id}</span></td>
      <td>${v.heart_rate}</td>
      <td>${typeof v.body_temp==='number'?v.body_temp.toFixed(1):v.body_temp}</td>
      <td>${v.systolic}</td>
      <td>${v.diastolic}</td>
      <td><span class="badge ${v.is_critical?'badge-critical':'badge-normal'}">${v.is_critical?'Critical':'Normal'}</span></td>
    </tr>`).join('');
}

function renderAlertsList() {
  const el = document.getElementById('alertsList');
  if (!alertsLog.length) {
    el.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg><p>No alerts yet — all vitals normal</p></div>`;
    return;
  }
  el.innerHTML = alertsLog.map(a => `
    <div style="background:#1a0f0f;border:1px solid #7c2d12;border-radius:10px;padding:16px;margin-bottom:12px;display:flex;gap:14px;align-items:flex-start">
      <div style="font-size:1.6rem">🚨</div>
      <div style="flex:1">
        <div style="font-weight:700;color:#fca5a5">${a.name} — ${a.device}</div>
        <div style="font-size:.82rem;color:var(--sub);margin:4px 0">${a.time} · Matric: ${a.student_id}</div>
        <div style="font-size:.85rem">HR: <b>${a.hr}</b> BPM · Temp: <b>${a.temp}°C</b> · BP: <b>${a.sbp}/${a.dbp}</b> mmHg</div>
        <div style="font-size:.78rem;color:#f97316;margin-top:4px">📱 SMS sent to: ${a.phone}</div>
      </div>
    </div>`).join('');
}

function renderActivePatient(pt, data) {
  const el = document.getElementById('activePatientCard');
  if (!pt) {
    el.innerHTML = `<div style="font-size:.85rem;color:var(--sub)">Device <b>${data.device_id}</b> is transmitting — no matching registered student found.</div>`;
    return;
  }
  const initials = pt.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  el.innerHTML = `
    <div class="patient-card">
      <div class="avatar">${initials}</div>
      <div class="patient-info">
        <div class="name">${pt.name}</div>
        <div class="meta">${pt.level || ''} · ${pt.dept || ''}</div>
        <div class="meta">📱 ${pt.phone}</div>
        <div class="meta">🩸 ${pt.bloodgroup || 'Unknown'} · ${pt.gender || ''}</div>
        <div class="id-tag">${pt.matric}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
//  SIMULATION (same as original but uses processVitals)
function injectSimReading(overrideData = null) {
  const data = overrideData || {
    device_id: document.getElementById('sim_device').value || 'WW-001',
    student_id: document.getElementById('sim_student').value || 'ABU/ENG/2021/001',
    heart_rate: parseFloat(document.getElementById('sim_hr').value),
    body_temp: parseFloat(document.getElementById('sim_temp').value),
    systolic: parseFloat(document.getElementById('sim_sbp').value),
    diastolic: parseFloat(document.getElementById('sim_dbp').value),
    is_critical: false,
    timestamp: Date.now()
  };
  data.is_critical = (data.heart_rate < 50 || data.heart_rate > 110 || data.body_temp < 35 || data.body_temp > 38.5 || data.systolic > 140 || data.systolic < 90 || data.diastolic > 90 || data.diastolic < 60);

  processVitals(data);
  simLog(`→ POST /api/vitals | ${JSON.stringify(data)}`, data.is_critical ? 'log-crit' : 'log-ok');
  showToast('📡 Reading injected');
}

function injectCritical() {
  injectSimReading({
    device_id: 'WW-001', student_id: document.getElementById('sim_student').value || 'ABU/ENG/2021/001',
    heart_rate: 135, body_temp: 39.8, systolic: 155, diastolic: 100,
    is_critical: true, timestamp: Date.now()
  });
}

let autoSimInterval = null;
function startAutoSim() {
  if (autoSimInterval) return;
  simLog('▶ Auto-simulation started (every 5s)', 'log-info');
  autoSimInterval = setInterval(() => {
    const hr = 60 + Math.floor(Math.random() * 50);
    const temp = 36 + Math.random() * 2;
    const sbp = 100 + Math.floor(Math.random() * 50);
    const dbp = 60 + Math.floor(Math.random() * 30);
    injectSimReading({
      device_id: document.getElementById('sim_device').value || 'WW-001',
      student_id: document.getElementById('sim_student').value || 'ABU/ENG/2021/001',
      heart_rate: hr, body_temp: parseFloat(temp.toFixed(1)),
      systolic: sbp, diastolic: dbp, is_critical: false, timestamp: Date.now()
    });
  }, 5000);
}

function stopAutoSim() {
  if (autoSimInterval) { clearInterval(autoSimInterval); autoSimInterval = null; }
  simLog('⏹ Auto-simulation stopped', 'log-info');
}

function simLog(msg, cls = 'log-info') {
  const el = document.getElementById('simLog');
  const t = new Date().toLocaleTimeString();
  el.innerHTML += `<p class="${cls}">[${t}] ${msg}</p>`;
  el.scrollTop = el.scrollHeight;
}

// Utilities (same)
function addLog(msg, cls = 'log-info') {
  const el = document.getElementById('rtLog');
  el.innerHTML += `<p class="${cls}">${msg}</p>`;
  if (el.children.length > 80) el.removeChild(el.firstChild);
  el.scrollTop = el.scrollHeight;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function sendBrowserNotification(name, data) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(`🚨 ABU Sick Bay ALERT`, {
      body: `${name}: HR ${data.heart_rate}bpm, Temp ${data.body_temp}°C, BP ${data.systolic}/${data.diastolic}`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text y="20" font-size="20">❤</text></svg>'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') sendBrowserNotification(name, data);
    });
  }
}

function updateClock() {
  document.getElementById('clockDisplay').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// INIT
(function init() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  addLog('🟢 ABU Sick Bay connected to CLOUD DATABASE', 'log-ok');
  addLog('⏳ Real-time sync enabled across all systems...', 'log-info');
})();
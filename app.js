// ===================== 공통: API 호출 =====================
function apiGet(action, params) {
  const qs = new URLSearchParams(Object.assign({ action }, params || {})).toString();
  return fetch(`${window.BIZTRIP_API_URL}?${qs}`, { method: 'GET' })
    .then(r => r.json())
    .then(r => { if (!r.ok) throw new Error(r.error); return r.data; });
}

function apiPost(action, payload) {
  // Content-Type을 text/plain으로 보내야 Apps Script 웹앱에서 preflight(OPTIONS) 없이 처리됨
  return fetch(window.BIZTRIP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  })
    .then(r => r.json())
    .then(r => { if (!r.ok) throw new Error(r.error); return r.data; });
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ===================== 탭 전환 =====================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
  });
});

// ===================== 국내/국외 토글 =====================
document.querySelectorAll('input[name=f_domestic]').forEach(r => {
  r.addEventListener('change', () => {
    const abroad = document.querySelector('input[name=f_domestic]:checked').value === '국외';
    document.querySelectorAll('.abroad-only').forEach(el => el.classList.toggle('show', abroad));
  });
});

// 연구비카드 결제시 결제금액 입력 비활성화 (작성요령 규칙 그대로 반영)
document.querySelectorAll('input[name=f_paymentType]').forEach(r => {
  r.addEventListener('change', () => {
    const isPersonal = document.querySelector('input[name=f_paymentType]:checked').value === '개인결제';
    const input = document.getElementById('f_paymentAmount');
    input.disabled = !isPersonal;
    if (!isPersonal) input.value = '';
  });
});
document.getElementById('f_paymentAmount').disabled = true;

// ===================== 출장 일정 (출장 기간에 맞춰 날짜별로 자동 생성, 날짜마다 시간대별 일정 여러 개 추가) =====================
const scheduleDaysEl = document.getElementById('scheduleDays');
let scheduleData = {}; // { 'YYYY-MM-DD': [{start:'10:00', end:'14:00', text:'용산역->여수엑스포역'}, ...] }

function formatDateLabelKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function buildScheduleItemRow(dateStr, itemIdx, item) {
  const row = document.createElement('div');
  row.className = 'schedule-item-row';
  row.innerHTML = `
    <input type="time" class="sch-start" value="${item.start || ''}">
    <span>-</span>
    <input type="time" class="sch-end" value="${item.end || ''}">
    <input type="text" class="sch-text" placeholder="예: 용산역 → 여수엑스포역 / AI에이전트 검증 및 평가 세션 참석" value="${item.text || ''}" style="flex:1">
    <button type="button" class="ghost sch-remove">삭제</button>`;
  row.querySelector('.sch-start').addEventListener('input', e => { scheduleData[dateStr][itemIdx].start = e.target.value; });
  row.querySelector('.sch-end').addEventListener('input', e => { scheduleData[dateStr][itemIdx].end = e.target.value; });
  row.querySelector('.sch-text').addEventListener('input', e => { scheduleData[dateStr][itemIdx].text = e.target.value; });
  row.querySelector('.sch-remove').addEventListener('click', () => {
    scheduleData[dateStr].splice(itemIdx, 1);
    if (scheduleData[dateStr].length === 0) scheduleData[dateStr].push({ start: '', end: '', text: '' });
    renderScheduleDays();
  });
  return row;
}

function renderScheduleDays() {
  const dates = Object.keys(scheduleData).sort();
  scheduleDaysEl.innerHTML = '';
  if (dates.length === 0) {
    scheduleDaysEl.innerHTML = '<p class="hint">출장 기간을 먼저 선택해주세요.</p>';
    return;
  }
  dates.forEach((dateStr, idx) => {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'schedule-day';
    dayDiv.innerHTML = `<div class="schedule-day-header">${idx + 1}. ${formatDateLabelKo(dateStr)}</div>
      <div class="schedule-items" data-date="${dateStr}"></div>
      <button type="button" class="ghost addScheduleItemBtn">+ 일정 추가</button>`;
    scheduleDaysEl.appendChild(dayDiv);

    const itemsEl = dayDiv.querySelector('.schedule-items');
    scheduleData[dateStr].forEach((item, itemIdx) => {
      itemsEl.appendChild(buildScheduleItemRow(dateStr, itemIdx, item));
    });

    dayDiv.querySelector('.addScheduleItemBtn').addEventListener('click', () => {
      scheduleData[dateStr].push({ start: '', end: '', text: '' });
      renderScheduleDays();
    });
  });
}

// 출장 기간(시작~종료)을 입력하면 하루 1개 섹션씩 자동으로 만들어줌.
// 날짜 범위가 겹치는 날짜는 기존에 입력한 시간대별 일정이 그대로 유지됨.
function rebuildScheduleFromDates() {
  const startVal = document.getElementById('f_tripStart').value;
  const endVal = document.getElementById('f_tripEnd').value;
  if (!startVal || !endVal) return;

  const start = new Date(startVal + 'T00:00:00');
  const end = new Date(endVal + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return;

  const MAX_DAYS = 10; // 출장계획서 템플릿이 최대 10일까지 지원
  const newDates = [];
  const cur = new Date(start);
  let count = 0;
  while (cur <= end && count < MAX_DAYS) {
    newDates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
    count++;
  }

  const newScheduleData = {};
  newDates.forEach(dateStr => {
    newScheduleData[dateStr] = scheduleData[dateStr] || [{ start: '', end: '', text: '' }];
  });
  scheduleData = newScheduleData;
  renderScheduleDays();

  if (count === MAX_DAYS && cur <= end) {
    toast(`출장일정은 최대 ${MAX_DAYS}일까지만 자동 생성됩니다.`);
  }
}

document.getElementById('f_tripStart').addEventListener('change', rebuildScheduleFromDates);
document.getElementById('f_tripEnd').addEventListener('change', rebuildScheduleFromDates);

// ===================== 교통수단 "기타" 직접입력 토글 =====================
document.getElementById('f_transport').addEventListener('change', (e) => {
  document.getElementById('transportOtherField').style.display = e.target.value === '기타' ? 'block' : 'none';
});

// ===================== 이메일 입력 시 기존 서명 조회 =====================
document.getElementById('f_email').addEventListener('blur', (e) => {
  const email = e.target.value.trim();
  if (!email) return;
  checkExistingSignature(email);
});

// ===================== 증빙 파일 =====================
const evidenceFiles = {}; // { category: [{name, mimeType, base64}] }
document.querySelectorAll('.evidenceInput').forEach(input => {
  input.addEventListener('change', async (e) => {
    const box = e.target.closest('.evidence-box');
    const category = box.dataset.category;
    evidenceFiles[category] = evidenceFiles[category] || [];
    for (const file of e.target.files) {
      const base64 = await fileToBase64(file);
      evidenceFiles[category].push({ name: file.name, mimeType: file.type, base64 });
    }
    box.querySelector('.files').textContent = evidenceFiles[category].map(f => f.name).join(', ');
  });
});

// ===================== 서명 패드 =====================
const canvas = document.getElementById('sigCanvas');
const ctx = canvas.getContext('2d');
ctx.lineWidth = 2;
ctx.lineCap = 'round';
let drawing = false;
let hasDrawn = false;

function pos(evt) {
  const rect = canvas.getBoundingClientRect();
  const t = evt.touches ? evt.touches[0] : evt;
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}
canvas.addEventListener('pointerdown', (e) => { drawing = true; hasDrawn = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
window.addEventListener('pointerup', () => drawing = false);

document.getElementById('sigClear').addEventListener('click', () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hasDrawn = false;
});

async function checkExistingSignature(email) {
  const sigStatus = document.getElementById('sigStatus');
  try {
    const sig = await apiGet('getSignature', { role: '출장자', email });
    if (sig) {
      sigStatus.textContent = '✓ 등록된 서명이 있습니다. (재서명하면 갱신됩니다)';
      sigStatus.style.color = '#2e7d32';
    } else {
      sigStatus.textContent = '등록된 서명이 없습니다. 아래에 서명 후 저장해주세요.';
      sigStatus.style.color = '#8a6d00';
    }
  } catch (err) { /* ignore */ }
}

document.getElementById('sigSave').addEventListener('click', async () => {
  if (!hasDrawn) { toast('서명을 먼저 입력해주세요.'); return; }
  const email = document.getElementById('f_email').value.trim();
  const name = document.getElementById('f_name').value.trim();
  if (!email || !name) { toast('이름/이메일을 먼저 입력해주세요.'); return; }
  const base64 = canvas.toDataURL('image/png');
  try {
    await apiPost('registerSignature', { role: '출장자', name, email, imageBase64: base64, imageMimeType: 'image/png' });
    toast('서명이 저장되었습니다.');
    checkExistingSignature(email);
  } catch (err) {
    toast('서명 저장 실패: ' + err.message);
  }
});

// ===================== 제출 =====================
document.getElementById('submitBtn').addEventListener('click', async () => {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  try {
    const schedule = Object.keys(scheduleData).sort().map(dateStr => ({
      date: dateStr,
      items: scheduleData[dateStr]
        .filter(it => it.start || it.end || it.text)
        .map(it => ({ start: it.start || '', end: it.end || '', text: it.text || '' })),
    })).filter(day => day.items.length > 0);

    const payload = {
      name: val('f_name'),
      email: val('f_email'),
      tripStart: val('f_tripStart'),
      tripEnd: val('f_tripEnd'),
      domesticOrAbroad: checkedVal('f_domestic'),
      region: val('f_region'),
      purpose: val('f_purpose'),
      transportMeans: val('f_transport') === '기타' ? val('f_transportOther') : val('f_transport'),
      paymentType: checkedVal('f_paymentType'),
      paymentAmount: val('f_paymentAmount'),
      mealsProvided: val('f_mealsProvided'),
      mealsRequested: val('f_mealsRequested'),
      mealsInflight: val('f_mealsInflight'),
      roommate: val('f_roommate'),
      inflightStay: val('f_inflightStay') || 'X',
      insuranceYn: checkedVal('f_insuranceYn'),
      insuranceCost: val('f_insuranceCost'),
      visaYn: checkedVal('f_visaYn'),
      visaCost: val('f_visaCost'),
      schedule,
      evidence: {}, // 아래에서 업로드 후 채움
    };

    toast('증빙자료 업로드 중...');
    // 임시 requestId 없이 먼저 업로드 (경로는 이메일+타임스탬프로 구분)
    const tempId = `${payload.email}_${Date.now()}`;
    for (const category of Object.keys(evidenceFiles)) {
      payload.evidence[category] = [];
      for (const f of evidenceFiles[category]) {
        const result = await apiPost('uploadEvidence', {
          category, fileName: f.name, mimeType: f.mimeType, base64Content: f.base64, requestId: tempId,
        });
        payload.evidence[category].push(result.url);
      }
    }

    toast('신청서 제출 중...');
    const result = await apiPost('submitRequest', payload);
    toast(`제출 완료! (신청번호: ${result.id})`);
  } catch (err) {
    toast('제출 실패: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

function val(id) { return document.getElementById(id).value; }
function checkedVal(name) { const el = document.querySelector(`input[name=${name}]:checked`); return el ? el.value : ''; }

// ===================== 내 신청 내역 =====================
document.getElementById('mineLoadBtn').addEventListener('click', async () => {
  const email = document.getElementById('mine_email').value.trim();
  const list = document.getElementById('mineList');
  list.innerHTML = '불러오는 중...';
  try {
    const rows = await apiGet('listRequests', { email });
    list.innerHTML = rows.length ? rows.map(renderRequestItem).join('') : '<p class="hint">신청 내역이 없습니다.</p>';
  } catch (err) {
    list.innerHTML = '불러오기 실패: ' + err.message;
  }
});

function renderRequestItem(r) {
  const docs = [];
  if (r.docUrlExpense) docs.push(`<a href="${r.docUrlExpense}" target="_blank">여비지급요청서.docx</a>`);
  if (r.docUrlPlan) docs.push(`<a href="${r.docUrlPlan}" target="_blank">출장계획서.docx</a>`);
  return `
  <div class="req-item">
    <div class="top">
      <strong>${r.id}</strong>
      <span class="status-pill ${r.status}">${r.status}</span>
    </div>
    <div class="meta">${r.name} · ${r.tripStart} ~ ${r.tripEnd} · ${r.region} · ${r.purpose}</div>
    ${r.status === '반려' ? `<div class="hint" style="color:#c0392b">반려 사유: ${r.rejectReason}</div>` : ''}
    ${docs.length ? `<div class="doc-links">${docs.join('')}</div>` : ''}
    <details><summary>상세 보기</summary>${detailTable(r)}</details>
  </div>`;
}

function detailTable(r) {
  const fields = [
    ['교통수단', r.transportMeans], ['결제구분', r.paymentType], ['결제금액', r.paymentAmount],
    ['제공식사', r.mealsProvided], ['신청식사', r.mealsRequested], ['기내식', r.mealsInflight], ['동숙인', r.roommate],
    ['기내숙박', r.inflightStay], ['보험가입', r.insuranceYn], ['보험비용', r.insuranceCost],
    ['비자발급', r.visaYn], ['비자비용', r.visaCost],
  ];
  const table = '<table style="width:100%;font-size:13px;margin-top:8px;">' +
    fields.map(([k, v]) => `<tr><td style="color:#777;padding:2px 8px 2px 0;">${k}</td><td>${v ?? '-'}</td></tr>`).join('') +
    '</table>';
  return table + scheduleDetailHtml(r.schedule);
}

function scheduleDetailHtml(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) return '';
  const days = schedule.map((day, idx) => {
    // 이전 버전(날짜+설명 한 줄짜리 문자열) 데이터가 남아있어도 깨지지 않도록 호환 처리
    if (typeof day === 'string') {
      return `<div style="margin-top:6px;"><strong>${idx + 1}.</strong> <span style="color:#444;">${day}</span></div>`;
    }
    const items = (day.items || []).map(it => `${it.start || ''}-${it.end || ''} ${it.text || ''}`.trim()).join('<br>');
    return `<div style="margin-top:6px;"><strong>${idx + 1}. ${day.date || ''}</strong><div style="color:#444;">${items}</div></div>`;
  }).join('');
  return `<div style="margin-top:8px;"><div style="color:#777;font-size:13px;">출장일정</div>${days}</div>`;
}

// ===================== 관리자 로그인 (세션 동안 1회만 입력) =====================
let adminSession = null; // { email, password }

document.getElementById('adminLoginBtn').addEventListener('click', async () => {
  const email = document.getElementById('admin_email').value.trim();
  const password = document.getElementById('admin_password').value;
  if (!email || !password) { toast('아이디/비밀번호를 모두 입력해주세요.'); return; }

  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true;
  try {
    await apiPost('adminLogin', { email, password });
    adminSession = { email, password };
    document.getElementById('adminWhoami').textContent = `${email}님으로 로그인됨`;
    document.getElementById('adminLoginCard').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    document.getElementById('admin_password').value = '';
    document.getElementById('adminLoadBtn').click();
  } catch (err) {
    toast('로그인 실패: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
  adminSession = null;
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminLoginCard').style.display = 'block';
  document.getElementById('adminList').innerHTML = '';
});

// ===================== 관리자 승인 =====================
document.getElementById('adminLoadBtn').addEventListener('click', async () => {
  const list = document.getElementById('adminList');
  list.innerHTML = '불러오는 중...';
  try {
    const rows = await apiGet('listRequests', { status: '제출완료' });
    list.innerHTML = rows.length ? rows.map(renderAdminItem).join('') : '<p class="hint">대기중인 신청이 없습니다.</p>';
    rows.forEach(bindAdminActions);
  } catch (err) {
    list.innerHTML = '불러오기 실패: ' + err.message;
  }
});

function renderAdminItem(r) {
  return `
  <div class="req-item" id="admin-${r.id}">
    <div class="top">
      <strong>${r.id}</strong>
      <span class="status-pill ${r.status}">${r.status}</span>
    </div>
    <div class="meta">${r.name} (${r.email}) · ${r.tripStart} ~ ${r.tripEnd} · ${r.region} · ${r.purpose}</div>
    <details><summary>상세 보기</summary>${detailTable(r)}</details>
    <div class="actions">
      <button class="primary approveBtn" data-id="${r.id}">승인</button>
      <button class="ghost rejectBtn" data-id="${r.id}">반려</button>
    </div>
  </div>`;
}

function bindAdminActions(r) {
  const container = document.getElementById('admin-' + r.id);
  container.querySelector('.approveBtn').addEventListener('click', async () => {
    if (!adminSession) { toast('관리자 로그인이 필요합니다.'); return; }
    try {
      toast('승인 처리 및 문서 생성 중... (시간이 다소 걸릴 수 있습니다)');
      await apiPost('approveRequest', {
        id: r.id,
        approverEmail: adminSession.email,
        password: adminSession.password,
      });
      toast('승인 완료, 문서가 생성되었습니다.');
      document.getElementById('adminLoadBtn').click();
    } catch (err) {
      toast('승인 실패: ' + err.message);
    }
  });
  container.querySelector('.rejectBtn').addEventListener('click', async () => {
    if (!adminSession) { toast('관리자 로그인이 필요합니다.'); return; }
    const reason = prompt('반려 사유를 입력하세요');
    if (!reason) return;
    try {
      await apiPost('rejectRequest', {
        id: r.id,
        approverEmail: adminSession.email,
        reason,
        password: adminSession.password,
      });
      toast('반려 처리되었습니다.');
      document.getElementById('adminLoadBtn').click();
    } catch (err) {
      toast('반려 실패: ' + err.message);
    }
  });
}

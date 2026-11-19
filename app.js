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
    updateMeals();
    updateExtraTotal();
    updateEvidenceRequired();
  });
});

// 연구비카드 결제(선결제) 시 결제금액 대신 "청구 금액 없음" 표시 (작성요령 규칙 반영)
function isCardPaymentSelected() {
  return checkedVal('f_paymentType').indexOf('연구비카드') === 0;
}
function updatePaymentAmount() {
  const input = document.getElementById('f_paymentAmount');
  const unit = document.getElementById('paymentUnit');
  if (isCardPaymentSelected()) {
    input.disabled = true;
    input.value = '청구 금액 없음';
    unit.style.display = 'none';
  } else {
    if (input.disabled) input.value = '';
    input.disabled = false;
    unit.style.display = '';
  }
}
document.querySelectorAll('input[name=f_paymentType]').forEach(r => r.addEventListener('change', updatePaymentAmount));
document.getElementById('f_paymentAmount').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^0-9]/g, '');
});
updatePaymentAmount();

// ===================== 출장 목적 유형: 발표 참석이면 논문 제목 입력칸 표시 =====================
document.querySelectorAll('input[name=f_purposeType]').forEach(r => {
  r.addEventListener('change', () => {
    const presenting = checkedVal('f_purposeType').indexOf('발표') !== -1;
    document.getElementById('paperTitleField').style.display = presenting ? 'block' : 'none';
    if (!presenting) document.getElementById('f_paperTitle').value = '';
  });
});

// ===================== 식비 자동 계산 =====================
// 지급 신청 식사 = (출장 일수 × 3) − 제공된 식사 − 기내식(국외만), 0 미만이면 0
function tripDays() {
  const sv = val('f_tripStart'), ev = val('f_tripEnd');
  if (!sv || !ev) return 0;
  const toUtc = (x) => { const t = x.split('-'); return Date.UTC(+t[0], +t[1] - 1, +t[2]); };
  const days = Math.round((toUtc(ev) - toUtc(sv)) / 86400000) + 1;
  return days > 0 ? days : 0;
}
function isAbroad() { return checkedVal('f_domestic') === '국외'; }
function calcMealsRequested() {
  const days = tripDays();
  if (!days) return 0;
  const provided = Number(val('f_mealsProvided')) || 0;
  const inflight = isAbroad() ? (Number(val('f_mealsInflight')) || 0) : 0;
  return Math.max(0, days * 3 - provided - inflight);
}
function updateMeals() {
  const days = tripDays();
  const out = document.getElementById('mealsRequestedDisplay');
  const formula = document.getElementById('mealsFormula');
  if (!days) {
    out.textContent = '-';
    formula.textContent = '출장 기간을 입력하면 계산됩니다. (1일 3회 기준)';
    return;
  }
  const provided = Number(val('f_mealsProvided')) || 0;
  const inflight = isAbroad() ? (Number(val('f_mealsInflight')) || 0) : 0;
  out.textContent = calcMealsRequested() + '회';
  formula.textContent = `${days}일 × 3회 = ${days * 3}회` +
    ` − 제공된 식사 ${provided}회` + (isAbroad() ? ` − 기내식 ${inflight}회` : '');
  updateEvidenceRequired();
}
['f_tripStart', 'f_tripEnd', 'f_mealsProvided', 'f_mealsInflight'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateMeals);
  document.getElementById(id).addEventListener('change', updateMeals);
});

// ===================== 추가 지급 (보험/비자): 가입·발급 시에만 비용 입력, 합계 표시 =====================
function updateExtraTotal() {
  let total = 0;
  [['f_insuranceYn', 'f_insuranceCost'], ['f_visaYn', 'f_visaCost']].forEach(([yn, cost]) => {
    const input = document.getElementById(cost);
    const on = checkedVal(yn) === 'O';
    input.disabled = !on;
    if (!on) input.value = '';
    if (on) total += Number(input.value) || 0;
  });
  document.getElementById('extraTotal').textContent = total.toLocaleString();
  updateEvidenceRequired();
}
['f_insuranceYn', 'f_visaYn'].forEach(name => {
  document.querySelectorAll(`input[name=${name}]`).forEach(r => r.addEventListener('change', updateExtraTotal));
});
['f_insuranceCost', 'f_visaCost'].forEach(id => document.getElementById(id).addEventListener('input', updateExtraTotal));

// ===================== 증빙자료 필수 항목 =====================
// 작성한 항목에 대해 최소 1개 이상의 증빙자료가 필요:
//  교통비(항상) / 식비(지급 신청 식사가 있을 때) / 숙박비(숙박 정보를 적었을 때) / 보험·비자(국외에서 가입·발급 시)
function requiredEvidenceCategories() {
  const req = ['교통비'];
  if (calcMealsRequested() > 0) req.push('식비');
  if (val('f_roommate').trim()) req.push('숙박비');
  if (isAbroad() && checkedVal('f_insuranceYn') === 'O') req.push('보험');
  if (isAbroad() && checkedVal('f_visaYn') === 'O') req.push('비자');
  return req;
}
function updateEvidenceRequired() {
  const req = requiredEvidenceCategories();
  document.querySelectorAll('.evidence-box').forEach(box => {
    const badge = box.querySelector('.req-badge');
    if (badge) badge.style.display = req.indexOf(box.dataset.category) !== -1 ? 'inline-block' : 'none';
  });
}
document.getElementById('f_roommate').addEventListener('input', updateEvidenceRequired);
updateEvidenceRequired();

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
    // toISOString()은 UTC 기준이라 한국 시간에서 하루 앞당겨지므로, 로컬 날짜 값으로 직접 만듦
    newDates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
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

// ===================== 교통수단 (체크박스, 복수 선택) — "기타" 선택 시 직접 입력 =====================
function selectedTransports() {
  return Array.from(document.querySelectorAll('input[name=f_transport]:checked')).map(el => el.value);
}
document.querySelectorAll('input[name=f_transport]').forEach(el => {
  el.addEventListener('change', () => {
    document.getElementById('transportOtherField').style.display = selectedTransports().indexOf('기타') !== -1 ? 'block' : 'none';
  });
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

  // ---- 제출 전 확인 (빠진 항목이 있으면 팝업) ----
  const problems = [];
  if (!checkedVal('f_purposeType')) problems.push('출장 목적 유형을 선택해주세요.');
  if (checkedVal('f_purposeType').indexOf('발표') !== -1 && !val('f_paperTitle').trim()) problems.push('발표 논문 제목을 입력해주세요.');
  if (selectedTransports().length === 0) problems.push('교통수단을 1개 이상 선택해주세요.');
  const missingEvidence = requiredEvidenceCategories().filter(c => !(evidenceFiles[c] && evidenceFiles[c].length));
  if (missingEvidence.length) {
    const label = { '보험': '여행자보험' };
    problems.push('다음 항목의 증빙자료를 최소 1개 이상 첨부해주세요:\n   - ' + missingEvidence.map(c => label[c] || c).join('\n   - '));
  }
  if (problems.length) {
    alert(problems.join('\n\n'));
    return;
  }

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
      purposeType: checkedVal('f_purposeType'),
      purpose: val('f_purpose'),
      paperTitle: val('f_paperTitle'),
      transportMeans: selectedTransports().map(t => t === '기타' ? (val('f_transportOther').trim() || '기타') : t).join(', '),
      paymentType: checkedVal('f_paymentType'),
      paymentAmount: isCardPaymentSelected() ? '' : val('f_paymentAmount'),
      mealsProvided: val('f_mealsProvided'),
      mealsRequested: calcMealsRequested(), // 서버에서도 다시 계산해서 저장함
      mealsInflight: isAbroad() ? val('f_mealsInflight') : 0,
      roommate: val('f_roommate'),
      inflightStay: val('f_inflightStay') || 'X',
      insuranceYn: checkedVal('f_insuranceYn'),
      insuranceCost: val('f_insuranceCost'),
      visaYn: checkedVal('f_visaYn'),
      visaCost: val('f_visaCost'),
      schedule,
      evidence: {}, // 아래에서 업로드 후 채움
    };

    // 임시 requestId 없이 먼저 업로드 (경로는 이메일+타임스탬프로 구분)
    // 파일을 한 개씩 순서대로 올리면 오래 걸려서, 동시에 올리고 진행 상황을 보여줌
    const tempId = `${payload.email}_${Date.now()}`;
    const jobs = [];
    for (const category of Object.keys(evidenceFiles)) {
      payload.evidence[category] = [];
      evidenceFiles[category].forEach((f, idx) => jobs.push({ category, f, idx }));
    }
    const total = jobs.length;
    let done = 0;
    if (total > 0) {
      btn.textContent = `증빙자료 업로드 중 (0/${total})`;
      toast(`증빙자료 ${total}개 업로드 중...`);
      const urls = await Promise.all(jobs.map(async ({ category, f }) => {
        const result = await apiPost('uploadEvidence', {
          category, fileName: f.name, mimeType: f.mimeType, base64Content: f.base64, requestId: tempId,
        });
        done++;
        btn.textContent = `증빙자료 업로드 중 (${done}/${total})`;
        return result.url;
      }));
      jobs.forEach((j, i) => payload.evidence[j.category][j.idx] = urls[i]);
    }

    btn.textContent = '신청서 제출 중...';
    toast('신청서 제출 중...');
    const result = await apiPost('submitRequest', payload);
    toast(`제출 완료! (신청번호: ${result.id})`);
  } catch (err) {
    toast('제출 실패: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '신청서 제출';
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
    ['출장목적 유형', r.purposeType], ['발표 논문', r.paperTitle], ['교통수단', r.transportMeans], ['결제구분', r.paymentType],
    ['결제금액', String(r.paymentType || '').indexOf('연구비카드') === 0 ? '청구 금액 없음' : r.paymentAmount],
    ['제공식사', r.mealsProvided], ['신청식사', r.mealsRequested], ['기내식', r.mealsInflight], ['동숙인', r.roommate],
    ['기내숙박', r.inflightStay], ['보험가입', r.insuranceYn], ['보험비용', r.insuranceCost],
    ['비자발급', r.visaYn], ['비자비용', r.visaCost],
  ];
  const table = '<table style="width:100%;font-size:13px;margin-top:8px;">' +
    fields.map(([k, v]) => `<tr><td style="color:#777;padding:2px 8px 2px 0;">${k}</td><td>${v ?? '-'}</td></tr>`).join('') +
    '</table>';
  return table + scheduleDetailHtml(r.schedule) + evidenceDetailHtml(r.evidence);
}

// 증빙자료: 카테고리별로 파일 링크를 보여줌 (Dropbox 링크 → 클릭하면 새 탭에서 열림)
function evidenceDetailHtml(evidence) {
  if (!evidence || typeof evidence !== 'object') return '';
  const cats = Object.keys(evidence).filter(c => Array.isArray(evidence[c]) && evidence[c].length > 0);
  if (cats.length === 0) {
    return '<div style="margin-top:10px;"><div style="color:#777;font-size:13px;">증빙자료</div><div class="hint">첨부된 증빙자료가 없습니다.</div></div>';
  }
  const rows = cats.map(cat => {
    const links = evidence[cat].map((url, i) => {
      let name = `파일 ${i + 1}`;
      try { name = decodeURIComponent(String(url).split('?')[0].split('/').pop()) || name; } catch (e) { /* 이름 추출 실패 시 기본값 */ }
      return `<a href="${url}" target="_blank" rel="noopener">${name}</a>`;
    }).join(' · ');
    return `<div style="margin-top:4px;"><strong style="font-size:13px;">${cat}</strong> <span class="doc-links">${links}</span></div>`;
  }).join('');
  return `<div style="margin-top:10px;"><div style="color:#777;font-size:13px;">증빙자료</div>${rows}</div>`;
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

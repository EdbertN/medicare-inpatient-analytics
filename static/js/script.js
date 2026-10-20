// ── THEME ────────────────────────────────────────────────────────────────────
Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels = { display: false };

let dark = false;

function toggleTheme() {
  dark = !dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  applyThemeToCharts();
  redrawAll();
}

function switchPanel(id, btn) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');

  document.getElementById('p1-sidebar').style.display = id === 'p1' ? '' : 'none';
  document.getElementById('p2-sidebar').style.display = id === 'p2' ? '' : 'none';
  document.getElementById('p3-sidebar').style.display = id === 'p3' ? '' : 'none';

  const main = document.getElementById('main-content');
  main.style.flex = '1';
  main.style.minWidth = '0';
}

// ── COLORS ───────────────────────────────────────────────────────────────────
const PALETTE = [
  '#0EA5A0',  // teal kuat
  '#3B82F6',  // biru royal
  '#F59E0B',  // amber hangat
  '#8B5CF6',  // violet
  '#10B981',  // emerald
  '#EF4444',  // merah — ok untuk data, bukan UI element
  '#06B6D4',  // cyan
  '#F97316',  // orange
  '#6366F1',  // indigo
  '#84CC16',  // lime
];

function gridColor() { return dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; }
function textColor()  { return dark ? '#8892A4' : '#6B7280'; }

// ── STATS ────────────────────────────────────────────────────────────────────
fetch('/api/stats').then(r=>r.json()).then(d=>{
  document.getElementById('s-patients').textContent = d.total_patients;
  document.getElementById('s-hospitals').textContent = d.hospitals;
  document.getElementById('s-los').textContent      = d.avg_los + ' hr';
  document.getElementById('s-charge').textContent   = d.avg_charge;
});

// ── SIDEBAR FILTERS ───────────────────────────────────────────────────────────
function initSidebarFilters() {
  const areas = [...new Set(losData.map(d => d.area))].sort();
  const areaSelect = document.getElementById('filter-area');
  areas.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    areaSelect.appendChild(opt);
  });

  const ages = [...new Set(losData.map(d => d.age_group))].sort();
  const ageSelect = document.getElementById('filter-age');
  ages.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    ageSelect.appendChild(opt);
  });

  // const types = [...new Set(admissionData.map(d => d.type_of_admission))].filter(Boolean).sort();
  const admissionOrder = ['Elective', 'Urgent', 'Emergency', 'Trauma', 'Newborn', 'Not Available'];
  const allTypes = [...new Set(admissionData.map(d => d.type_of_admission))].filter(Boolean);
  const types = admissionOrder.filter(t => allTypes.includes(t));
  const admSelect = document.getElementById('filter-admission');
  types.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    admSelect.appendChild(opt);
  });

  // Populate Disease Category
  const categories = diseaseCategoryData.summary.map(d => d.category);
  const catSelect = document.getElementById('filter-category');
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    catSelect.appendChild(opt);
  });
  catSelect.addEventListener('change', () => {
    const selected = catSelect.value;
    if (selected === 'all') {
      renderCategoryOverview();
    } else {
      const idx = diseaseCategoryData.summary.findIndex(d => d.category === selected);
      renderCategoryDetail(selected, idx);
    }
  });

  areaSelect.addEventListener('change', applyFilters);
  ageSelect.addEventListener('change', applyFilters);
  admSelect.addEventListener('change', applyFilters);
}

// ── SIDEBAR PANEL 2 ───────────────────────────────────────────────────────────
function initP2Sidebar() {
  // Populate service area dari chargesAreaData
  const areas = Object.keys(chargesAreaData).sort();
  const areaSelect = document.getElementById('p2-filter-area');
  areas.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    areaSelect.appendChild(opt);
  });

  areaSelect.addEventListener('change', () => {
    const selected = areaSelect.value;
    if (selected !== 'all') {
      activeChargesArea = selected;
      // sync filter button juga
      const filterRow = document.getElementById('charges-area-filters');
      filterRow.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('on', b.textContent === selected);
      });
      updateChargesArea();
    } else {
      activeChargesArea = Object.keys(chargesAreaData).sort()[0];
      updateChargesArea();
    }
  });

  document.getElementById('p2-filter-severity').addEventListener('change', applyP2Filters);
}

function applyP2Filters() {
  const severity = document.getElementById('p2-filter-severity').value;
  updateSeverityChart(severity);
}

function resetP2Filters() {
  document.getElementById('p2-filter-area').value = 'all';
  document.getElementById('p2-filter-severity').value = 'all';
  activeChargesArea = Object.keys(chargesAreaData).sort()[0];
  updateChargesArea();
  updateSeverityChart('all');
}

function generateP1Insight() {
  const area = document.getElementById('filter-area').value;
  if (area === 'all') {
    document.getElementById('p1-insight-box').style.display = 'none';
    return;
  }

  // Ambil ED ratio dari endpoint cache
  fetch('/api/ed-ratio').then(r => r.json()).then(edData => {
    const edRow = edData.find(d => d.area === area);
    if (!edRow) return;

    const edPct = edRow.ed_pct;

    // Ambil avg LOS untuk area yang dipilih
    const losRows = losData.filter(d => d.area === area);
    const avgLOS = losRows.length
      ? (losRows.reduce((sum, d) => sum + parseFloat(d.avg_los), 0) / losRows.length).toFixed(1)
      : null;

    // Rata-rata statewide
    const stateAvgLOS = (losData.reduce((sum, d) => sum + parseFloat(d.avg_los), 0) / losData.length).toFixed(1);

    let insight = `<b>${area}</b><br>`;
    insight += `ED Ratio: <b>${edPct}%</b> | Avg LOS: <b>${avgLOS} hari</b><br><br>`;

    if (edPct > 60 && parseFloat(avgLOS) > parseFloat(stateAvgLOS)) {
      insight += `<b>Beban UGD kritis.</b> ED ratio tinggi dan LOS di atas rata-rata statewide (${stateAvgLOS} hari). Rekomendasi: percepat discharge planning dan tambah kapasitas transit bed.`;
    } else if (edPct > 60 && parseFloat(avgLOS) <= parseFloat(stateAvgLOS)) {
      insight += `<b>ED tinggi, turnover oke.</b> Bed cepat tersedia tapi UGD tetap ramai. Rekomendasi: tambah staf UGD dan percepat triase.`;
    } else if (edPct <= 60 && parseFloat(avgLOS) > parseFloat(stateAvgLOS)) {
      insight += `<b>LOS tinggi, bukan dari UGD.</b> Antrian bukan dari emergency. Rekomendasi: evaluasi efisiensi rawat inap dan percepat proses discharge.`;
    } else {
      insight += `<b>Kondisi relatif baik.</b> ED ratio dan LOS dalam batas normal. Pantau tren secara berkala.`;
    }

    document.getElementById('p1-insight-text').innerHTML = insight;
    document.getElementById('p1-insight-box').style.display = 'block';
  });
}

let edByTypeChart = null;
fetch('/api/ed-by-admission-type').then(r => r.json()).then(data => {
  document.getElementById('ed-by-type-loading').style.display = 'none';
  document.getElementById('ed-by-type-chart').style.display = 'block';

  const labels = data.map(d => d.type);
  const values = data.map(d => d.ed_pct);

  edByTypeChart = new Chart(document.getElementById('ed-by-type-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'ED Entry Rate (%)',
        data: values,
        backgroundColor: values.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: values.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('ED Entry Rate (%)', false),
      indexAxis: 'y',
      plugins: {
        ...chartOpts('', false).plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = data[ctx.dataIndex];
              return [`ED Entry: ${d.ed_pct}%`, `Total cases: ${d.total.toLocaleString()}`];
            }
          }
        }
      }
    }
  });

  // Insight dinamis
  const highest = data[0];
  const lowest = data[data.length - 1];
  const insightEl = document.getElementById('ed-by-type-insight');
  insightEl.innerHTML = `<strong>Insight:</strong> <strong>${highest.type}</strong> admissions are almost entirely (${highest.ed_pct}%) routed through the ED, while most <strong>${lowest.type}</strong> cases (${(100 - lowest.ed_pct).toFixed(1)}% non-ED) follow a separate clinical pathway — highlighting that ED entry doesn't always align with administrative urgency categories.`;
});

function applyFilters() {

  const area = document.getElementById('filter-area').value;
  const age  = document.getElementById('filter-age').value;
  const adm  = document.getElementById('filter-admission').value;

  // LOS
  activeAge = age;
  updateLOS();

  // Diagnosis Area
  if (area === 'all') {

    activeArea = [
      ...new Set(
        diagnosisAreaData.map(d => d.area)
      )
    ].sort()[0];

  } else {
    activeArea = area;
  }

  updateDiagnosisArea();

  // Admission
  updateAdmissionChart(adm);
  generateP1Insight();
}

function resetFilters() {
  document.getElementById('filter-area').value     = 'all';
  document.getElementById('filter-age').value      = 'all';
  document.getElementById('filter-admission').value = 'all';
  document.getElementById('p1-insight-box').style.display = 'none';
  activeAge  = 'all';
  activeArea = [...new Set(diagnosisAreaData.map(d => d.area))].sort()[0];
  updateLOS();
  updateDiagnosisArea();
  updateAdmissionChart('all');
}

// ── SIDEBAR PANEL 3 ───────────────────────────────────────────────────────────

function initP3Sidebar(data) {
  const payers = [...new Set(data.map(d => d.payer))].sort();
  const payerSelect = document.getElementById('p3-filter-payer');
  payers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    payerSelect.appendChild(opt);
  });

  payerSelect.addEventListener('change', () => {
    const selected = payerSelect.value;
    updatePayerCharts(selected);
  });
}

function updatePayerCharts(filterPayer) {
  // Update Chart 1 — Disposition per Payer
  const filtered = filterPayer === 'all'
    ? payerDataCache
    : payerDataCache.filter(d => d.payer === filterPayer);

  const payers = [...new Set(filtered.map(d => d.payer))].slice(0, 6);
  const disps = [...new Set(filtered.map(d => d.disposition))].slice(0, 6);

  const datasets = disps.map((disp, i) => ({
    label: disp,
    data: payers.map(p => {
      const row = filtered.find(d => d.payer === p && d.disposition === disp);
      return row ? row.count : 0;
    }),
    backgroundColor: PALETTE[i % PALETTE.length] + 'CC',
    borderColor: PALETTE[i % PALETTE.length],
    borderWidth: 1,
    borderRadius: 4,
  }));

  if (payerChart) payerChart.destroy();
  payerChart = new Chart(document.getElementById('payer-chart'), {
    type: 'bar',
    data: { labels: payers, datasets },
    options: {
      ...chartOpts('Number of Patients', true),
      plugins: {
        ...chartOpts('', true).plugins,
        legend: { display: true, labels: { color: textColor(), font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } }
      }
    }
  });

  // Update Chart 2 — LOS per Payer
  const losFiltered = filterPayer === 'all'
    ? losPayerCache
    : losPayerCache.filter(d => d.payer === filterPayer);

  const losLabels = losFiltered.map(d => d.payer);
  const losValues = losFiltered.map(d => d.avg_los);

  if (losPayerChart) losPayerChart.destroy();
  losPayerChart = new Chart(document.getElementById('los-payer-chart'), {
    type: 'bar',
    data: {
      labels: losLabels,
      datasets: [{
        label: 'Avg LOS (days)',
        data: losValues,
        backgroundColor: losValues.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: losValues.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Avg LOS (days)', false),
      indexAxis: 'y',
      plugins: {
        ...chartOpts('', false).plugins,
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = losFiltered[ctx.dataIndex];
              return [`Avg LOS: ${d.avg_los} days`, `Cases: ${d.total_cases.toLocaleString()}`];
            }
          }
        }
      }
    }
  });
}

function resetP3Filters() {
  document.getElementById('p3-filter-payer').value = 'all';
  updatePayerCharts('all');
}

let losData = [];
let losChart = null;
let activeAge = 'all';
let heatmapChart = null;
let admissionChart = null;
let admissionData = [];
let diagnosisAreaChart = null;
let diagnosisAreaData = [];
let activeArea = null;
let seasonalChart = null;
let edChart = null;
let treemapChart = null;
let scatterChart = null;
let chargesAreaChart = null;
let severityChart = null;
let procedureChart = null;
let mortalityChart = null;
let severityDataCache = [];
let losPayerChart = null;
let coordinationChart = null;
let coordinationMode = 'sankey';
let coordinationDataCache = [];
let losPayerCache = [];
let payerDataCache = [];
let countyDataCache = {};

// Fetch county breakdown data
fetch('/api/patient-distribution-county').then(r => r.json()).then(data => {
  countyDataCache = data;
});

function setCoordinationMode(mode) {
  coordinationMode = mode;
  document.getElementById('btn-sankey').style.background = mode === 'sankey' ? '#0EA5A0' : 'transparent';
  document.getElementById('btn-sankey').style.color = mode === 'sankey' ? 'white' : '#6B7280';
  document.getElementById('btn-matrix').style.background = mode === 'matrix' ? '#0EA5A0' : 'transparent';
  document.getElementById('btn-matrix').style.color = mode === 'matrix' ? 'white' : '#6B7280';
  renderCoordination(coordinationDataCache);
}

function renderCoordination(data) {
  if (coordinationMode === 'sankey') {
    document.getElementById('coordination-matrix').style.display = 'none';
    document.getElementById('coordination-chart').style.display = 'block';
    document.getElementById('coordination-wrap').style.height = '500px';
    document.getElementById('coordination-wrap').style.width = '100%'; 
    document.getElementById('coordination-wrap').style.overflow = 'hidden'; 
    // document.querySelector('#coordination-chart').closest('.chart-wrap').classList.remove('heatmap-mode');

    const sankeyData = data
      .filter(d => d.secondary !== 'None' && d.count > 5000)
      .map(d => ({ from: d.primary, to: d.secondary, flow: d.count }));

    if (coordinationChart) coordinationChart.destroy();
    coordinationChart = new Chart(document.getElementById('coordination-chart'), {
      type: 'sankey',
      data: {
        datasets: [{
          label: 'Payment Flow',
          data: sankeyData,
          colorFrom: (c) => PALETTE[Math.abs(c.dataIndex) % PALETTE.length] + 'CC',
          colorTo: (c) => PALETTE[(Math.abs(c.dataIndex) + 3) % PALETTE.length] + 'CC',
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.raw.from} → ${ctx.raw.to}: ${ctx.raw.flow.toLocaleString()} patients`
            }
          }
        }
      }
    });

  } else {
    document.getElementById('coordination-chart').style.display = 'none';
    document.getElementById('coordination-wrap').style.height = 'auto';
    // document.querySelector('#coordination-chart').closest('.chart-wrap').classList.add('heatmap-mode');
    document.getElementById('coordination-matrix').style.display = 'block';

    const primaries = [...new Set(data.map(d => d.primary))].slice(0, 6);
    const secondaries = [...new Set(data.map(d => d.secondary))].slice(0, 6);
    const maxVal = Math.max(...data.map(d => d.count));

    let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'DM Mono',monospace;">`;
    html += `<thead><tr><th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);">Primary → Secondary</th>`;
    secondaries.forEach(s => {
      html += `<th style="text-align:center;padding:8px 6px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;">${s}</th>`;
    });
    html += `</tr></thead><tbody>`;

    primaries.forEach(pri => {
      html += `<tr style="border-bottom:1px solid var(--border);">`;
      html += `<td style="padding:8px 10px;font-weight:500;color:var(--text);white-space:nowrap;">${pri}</td>`;
      secondaries.forEach((sec, sIdx) => {
        const row = data.find(d => d.primary === pri && d.secondary === sec);
        const val = row ? row.count : 0;
        const intensity = maxVal > 0 ? val / maxVal : 0;
        const alpha = (0.05 + intensity * 0.75).toFixed(2);
        const hex = PALETTE[sIdx % PALETTE.length];
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        html += `<td style="text-align:center;padding:8px 6px;background:rgba(${r},${g},${b},${alpha});border-radius:4px;">
          <div style="font-weight:600;color:var(--text);">${val > 0 ? val.toLocaleString() : '—'}</div>
        </td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table>`;
    document.getElementById('coordination-matrix').innerHTML = html;
  }
}

function makeFilterBtn(label, active, fn) {
  const b = document.createElement('button');
  b.className = 'filter-btn' + (active ? ' on' : '');
  b.textContent = label;
  b.onclick = fn;
  return b;
}

function setActive(row, btn) {
  row.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
}

function updateLOS() {
  const filtered = activeAge === 'all' ? losData : losData.filter(d => d.age_group === activeAge);
  const areas = [...new Set(filtered.map(d => d.area))].sort();

  let values;
  if (activeAge === 'all') {
    values = areas.map(a => {
      const rows = filtered.filter(d => d.area === a);
      const avg = rows.reduce((sum, d) => sum + parseFloat(d.avg_los), 0) / rows.length;
      return avg;
    });
  } else {
    values = areas.map(a => {
      const row = filtered.find(d => d.area === a);
      return row ? parseFloat(row.avg_los) : 0;
    });
  }

  // Urutkan dari tertinggi ke terendah biar lebih mudah dibaca
  const combined = areas.map((a, i) => ({ area: a, value: values[i] }));
  combined.sort((a, b) => b.value - a.value);

  const sortedAreas = combined.map(c => c.area);
  const sortedValues = combined.map(c => c.value);

  const datasets = [{
    label: activeAge === 'all' ? 'Avg LOS (semua usia)' : activeAge,
    data: sortedValues,
    backgroundColor: sortedValues.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
    borderColor: sortedValues.map((_, i) => PALETTE[i % PALETTE.length]),
    borderWidth: 1,
    borderRadius: 6,
  }];

  if (losChart) losChart.destroy();
  losChart = new Chart(document.getElementById('los-chart'), {
    type: 'bar',
    data: { labels: sortedAreas, datasets },
    options: {
      ...chartOpts('Avg LOS (days)', false),
      plugins: {
        ...chartOpts('', false).plugins,
        legend: { display: false }
      }
    }
  });

  updateLOSInsight(combined, activeAge);
}

function updateLOSInsight(combined, age) {
  const highest = combined[0];
  const lowest = combined[combined.length - 1];
  const ageLabel = age === 'all' ? 'all ages' : age;

  const insightEl = document.querySelector('#p1 .chart-card.p1-narrow .insight');
  if (insightEl) {
    insightEl.innerHTML = `<strong>Insight:</strong> For <strong>${ageLabel}</strong>, <strong>${highest.area}</strong> has the highest LOS (${highest.value.toFixed(1)} days), while <strong>${lowest.area}</strong> has the lowest (${lowest.value.toFixed(1)} days).`;
  }
}

// ── FETCH ALL PANEL 1 DATA ────────────────────────────────────────────────────
Promise.all([
  fetch('/api/los').then(r => r.json()),
  fetch('/api/admission-flow').then(r => r.json()),
  fetch('/api/top-diagnosis-area').then(r => r.json()),
  fetch('/api/disease-category').then(r => r.json()),
]).then(([losResult, admissionResult, diagnosisResult, categoryResult]) => {

  // ── LOS ──────────────────────────────────────────────────────────────────
  losData = losResult;
  const ages = [...new Set(losData.map(d => d.age_group))].sort();
  const filterRow = document.getElementById('age-filters');
  const allBtn = makeFilterBtn('All', true, () => { activeAge = 'all'; updateLOS(); setActive(filterRow, allBtn); });
  filterRow.appendChild(allBtn);
  ages.forEach(a => {
    const btn = makeFilterBtn(a, false, () => { activeAge = a; updateLOS(); setActive(filterRow, btn); });
    filterRow.appendChild(btn);
  });
  document.getElementById('los-loading').style.display = 'none';
  document.getElementById('los-chart').style.display = 'block';
  updateLOS();

  // Heatmap pakai losData juga
  document.getElementById('heatmap-loading').style.display = 'none';
  renderLOSHeatmapTable();
  // document.getElementById('heatmap-loading').style.display = 'none';
  // document.getElementById('heatmap-chart').style.display = 'block';
  // const areas = [...new Set(losData.map(d => d.area))].sort();
  // const ageGroups = [...new Set(losData.map(d => d.age_group))].sort();
  // const maxLOS = Math.max(...losData.map(d => parseFloat(d.avg_los)));
  // const heatDatasets = ageGroups.map(age => ({
  //   label: age,
  //   data: areas.map(a => {
  //     const row = losData.find(d => d.area === a && d.age_group === age);
  //     return row ? parseFloat(row.avg_los) : 0;
  //   }),
  //   backgroundColor: areas.map(a => {
  //     const row = losData.find(d => d.area === a && d.age_group === age);
  //     const val = row ? parseFloat(row.avg_los) / maxLOS : 0;
  //     return `rgba(14, 165, 160, ${val.toFixed(2)})`;
  //   }),
  //   borderColor: 'transparent',
  //   borderWidth: 2,
  //   borderRadius: 4,
  //   barThickness: 28,
  // }));
  // heatmapChart = new Chart(document.getElementById('heatmap-chart'), {
  //   type: 'bar',
  //   data: { labels: areas, datasets: heatDatasets },
  //   options: {
  //     ...chartOpts('Avg LOS (days)', true),
  //     plugins: {
  //       ...chartOpts('', true).plugins,
  //       legend: { display: true, labels: { color: textColor(), font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
  //       tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} days` } }
  //     }
  //   }
  // });

  // ── ADMISSION ─────────────────────────────────────────────────────────────
  admissionData = admissionResult;
  document.getElementById('admission-loading').style.display = 'none';
//   document.getElementById('admission-chart').style.display = 'block';
  updateAdmissionChart('all');

  // ── TOP DIAGNOSIS ─────────────────────────────────────────────────────────
  diagnosisAreaData = diagnosisResult;
  activeArea = [...new Set(diagnosisAreaData.map(d => d.area))].sort()[0];
  const areaFilterRow = document.getElementById('area-filters');
  const areaList = [...new Set(diagnosisAreaData.map(d => d.area))].sort();
  areaList.forEach((a, i) => {
    const btn = makeFilterBtn(a, i === 0, () => {
      activeArea = a;
      updateDiagnosisArea();
      setActive(areaFilterRow, btn);
    });
    areaFilterRow.appendChild(btn);
  });
  document.getElementById('diagnosis-area-loading').style.display = 'none';
  document.getElementById('diagnosis-area-chart').style.display = 'block';
  updateDiagnosisArea();

  diseaseCategoryData = categoryResult;
  document.getElementById('seasonal-loading').style.display = 'none';
  document.getElementById('seasonal-chart').style.display = 'block';
  renderCategoryOverview();

  // ── INIT SIDEBAR (semua data sudah siap) ──────────────────────────────────
  initSidebarFilters();
});

// ── CHART 2: CHARGES ─────────────────────────────────────────────────────────
let chargeChart = null;
fetch('/api/charges').then(r=>r.json()).then(data=>{
  document.getElementById('charge-loading').style.display = 'none';
  document.getElementById('charge-chart').style.display = 'block';

  const labels = data.map(d => d.diagnosis);
  const values = data.map(d=>parseFloat(d.avg_charges));

  chargeChart = new Chart(document.getElementById('charge-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Total Charges ($)',
        data: values,
        backgroundColor: values.map((_,i)=> PALETTE[i % PALETTE.length] + 'CC'),
        borderColor:      values.map((_,i)=> PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Avg Total Charges ($)', false),
      indexAxis: 'y',
    }
  });
});

// ── CHART: CHARGES BY AREA ────────────────────────────────────────────────────
// let chargesAreaChart = null;
let chargesAreaData = {};
let activeChargesArea = null;

fetch('/api/charges-by-area').then(r => r.json()).then(data => {
  chargesAreaData = data;
  const areas = Object.keys(data).sort();
  activeChargesArea = areas[0];

  const filterRow = document.getElementById('charges-area-filters');
  areas.forEach((a, i) => {
    const btn = makeFilterBtn(a, i === 0, () => {
      activeChargesArea = a;
      updateChargesArea();
      setActive(filterRow, btn);
    });
    filterRow.appendChild(btn);
  });

  document.getElementById('charges-area-loading').style.display = 'none';
  document.getElementById('charges-area-chart').style.display = 'block';
  updateChargesArea();

  if (severityDataCache.length) initP2Sidebar();
});

function updateChargesArea() {
  const data = chargesAreaData[activeChargesArea] || [];
  const labels = data.map(d => d.diagnosis);
  const values = data.map(d => d.avg_charges);

  if (chargesAreaChart) chargesAreaChart.destroy();
  chargesAreaChart = new Chart(document.getElementById('charges-area-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Charges ($)',
        data: values,
        backgroundColor: values.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: values.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Avg Charges ($)', false),
      indexAxis: 'y',
      plugins: {
        ...chartOpts('', false).plugins,
        tooltip: {
          callbacks: {
            label: ctx => `$${ctx.parsed.x.toLocaleString()}`
          }
        }
      }
    }
  });
}

// ── CHART: SCATTER — Avg Charges vs Total Cases ───────────────────────────────
// let scatterChart = null;

fetch('/api/charges-treemap').then(r => r.json()).then(data => {
  document.getElementById('treemap-loading').style.display = 'none';
  document.getElementById('treemap-chart').style.display = 'block';
  document.getElementById('scatter-loading').style.display = 'none';
  document.getElementById('scatter-chart').style.display = 'block';

  // ── TREEMAP ──────────────────────────────────────────────────────────────
  treemapChart = new Chart(document.getElementById('treemap-chart'), {
    type: 'treemap',
    data: {
      datasets: [{
        label: 'Diagnosis Cost Burden',
        tree: data,
        key: 'total_charges',
        // labels: {
        //   display: true,
        //   formatter: (ctx) => {
        //     if (!ctx.raw || !ctx.raw._data) return '';
        //     if (ctx.raw.w < 80) return '';
            
        //     const words = ctx.raw._data.diagnosis.split(' ');
        //     // Maksimal 3 kata, tiap baris max 2 kata
        //     const line1 = words.slice(0, 2).join(' ');
        //     const line2 = words.slice(2, 4).join(' ');
        //     return line2 ? [line1, line2] : [line1];
        //   },
        //   color: '#fff',
        //   font: { size: 10, family: 'DM Sans', weight: '600' },
        //   padding: 6,
        // },
        labels: {
          display: true,
          formatter: (ctx) => {
            if (!ctx.raw || !ctx.raw._data) return '';
            if (ctx.raw.w < 80 || ctx.raw.h < 50) return '';

            const d = ctx.raw._data;
            const words = d.diagnosis.split(' ');
            const line1 = words.slice(0, 2).join(' ');
            const line2 = words.slice(2, 4).join(' ');

            const avgFormatted = '$' + Number(d.avg_charges).toLocaleString();

            const lines = line2 ? [line1, line2] : [line1];
            lines.push(avgFormatted);
            return lines;
          },
          color: '#fff',
          font: (ctx) => {
            // Baris terakhir (avg charge) dibuat sedikit lebih kecil & tipis
            return { size: 10, family: 'DM Sans', weight: '600' };
          },
          padding: 6,
        },
        // backgroundColor: (ctx) => {
        //   if (!ctx.raw || !ctx.raw._data) return '#94a3b8';
        //   const max = Math.max(...data.map(d => d.avg_charges));
        //   const min = Math.min(...data.map(d => d.avg_charges));
        //   const val = (ctx.raw._data.avg_charges - min) / (max - min);

        //   // Gradient: biru muda (murah) → teal (medium) → merah (mahal)
        //   if (val < 0.33) {
        //     const t = val / 0.33;
        //     const r = Math.round(59 + t * (14 - 59));
        //     const g = Math.round(130 + t * (165 - 130));
        //     const b = Math.round(246 + t * (160 - 246));
        //     return `rgba(${r},${g},${b},0.85)`;
        //   } else if (val < 0.66) {
        //     const t = (val - 0.33) / 0.33;
        //     const r = Math.round(14 + t * (245 - 14));
        //     const g = Math.round(165 + t * (158 - 165));
        //     const b = Math.round(160 + t * (11 - 160));
        //     return `rgba(${r},${g},${b},0.85)`;
        //   } else {
        //     const t = (val - 0.66) / 0.34;
        //     const r = Math.round(245 + t * (239 - 245));
        //     const g = Math.round(158 + t * (68 - 158));
        //     const b = Math.round(11 + t * (68 - 11));
        //     return `rgba(${r},${g},${b},0.85)`;
        //   }
        // },
        backgroundColor: (ctx) => {
          if (!ctx.raw || !ctx.raw._data) return '#94a3b8';
          const max = Math.max(...data.map(d => d.avg_charges));
          const min = Math.min(...data.map(d => d.avg_charges));
          const val = (ctx.raw._data.avg_charges - min) / (max - min);

          // Gradasi 1 warna: teal muda (murah) → teal gelap (mahal)
          const r = Math.round(204 + val * (14 - 204));
          const g = Math.round(235 + val * (165 - 235));
          const b = Math.round(230 + val * (160 - 230));
          return `rgba(${r},${g},${b},0.92)`;
        },
        borderColor: '#fff',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio || 2,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].raw._data.diagnosis,
            label: (ctx) => {
              const d = ctx.raw._data;
              return [
                `Total: $${Number(d.total_charges).toLocaleString()}`,
                `Avg: $${Number(d.avg_charges).toLocaleString()}`,
                `Cases: ${Number(d.total_cases).toLocaleString()}`
              ];
            }
          }
        }
      }
    }
  });

  // ── SCATTER ───────────────────────────────────────────────────────────────
  const scatterData = data.map((d, i) => ({
    x: d.total_cases,
    y: d.avg_charges,
    label: d.diagnosis,
  }));

  // scatterChart = new Chart(document.getElementById('scatter-chart'), {
  //   type: 'scatter',
  //   data: {
  //     datasets: [{
  //       label: 'Diagnosis',
  //       data: scatterData,
  //       backgroundColor: scatterData.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
  //       borderColor: scatterData.map((_, i) => PALETTE[i % PALETTE.length]),
  //       pointRadius: 8,
  //       pointHoverRadius: 11,
  //     }]
  //   },
  //   options: {
  //     ...chartOpts('Avg Charges ($)', false),
  //     plugins: {
  //       ...chartOpts('', false).plugins,
  //       legend: { display: false },
  //       tooltip: {
  //         callbacks: {
  //           label: ctx => {
  //             const d = ctx.raw;
  //             return [
  //               d.label,
  //               `Cases: ${d.x.toLocaleString()}`,
  //               `Avg Charges: $${d.y.toLocaleString()}`
  //             ];
  //           }
  //         }
  //       }
  //     },
  //     scales: {
  //       x: {
  //         title: { display: true, text: 'Total Cases', color: textColor(), font: { family: 'DM Sans', size: 12 } },
  //         grid: { color: gridColor() },
  //         ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 }, callback: v => v.toLocaleString() }
  //       },
  //       y: {
  //         title: { display: true, text: 'Avg Charges ($)', color: textColor(), font: { family: 'DM Sans', size: 12 } },
  //         grid: { color: gridColor() },
  //         ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 }, callback: v => '$' + v.toLocaleString() }
  //       }
  //     }
  //   }
  // });
  scatterChart = new Chart(document.getElementById('scatter-chart'), {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Diagnosis',
        data: scatterData,
        backgroundColor: scatterData.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: scatterData.map((_, i) => PALETTE[i % PALETTE.length]),
        pointRadius: 8,
        pointHoverRadius: 11,
      }]
    },
    options: {
      ...chartOpts('Avg Charges ($)', false),
      layout: {
        padding: { top: 30, right: 20 }
      },
      plugins: {
        ...chartOpts('', false).plugins,
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return [
                d.label,
                `Cases: ${d.x.toLocaleString()}`,
                `Avg Charges: $${d.y.toLocaleString()}`
              ];
            }
          }
        },
        datalabels: {
          display: (ctx) => {
            const d = ctx.dataset.data[ctx.dataIndex];
            // Hanya tampilkan label untuk outlier signifikan
            const sortedByCharges = [...scatterData].sort((a, b) => b.y - a.y);
            const sortedByCases = [...scatterData].sort((a, b) => b.x - a.x);

            const top3ByCharges = sortedByCharges.slice(0, 3).map(p => p.label);
            const top3ByCases = sortedByCases.slice(0, 3).map(p => p.label);

            return top3ByCharges.includes(d.label) || top3ByCases.includes(d.label);
          },
          align: 'top',
          anchor: 'end',
          offset: 4,
          font: { size: 10, family: 'DM Sans', weight: '600' },
          color: textColor(),
          formatter: (value) => {
            const words = value.label.split(' ');
            return words.slice(0, 2).join(' ');
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Total Cases', color: textColor(), font: { family: 'DM Sans', size: 12 } },
          grid: { color: gridColor() },
          ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 }, callback: v => v.toLocaleString() }
        },
        y: {
          title: { display: true, text: 'Avg Charges ($)', color: textColor(), font: { family: 'DM Sans', size: 12 } },
          grid: { color: gridColor() },
          ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 }, callback: v => '$' + v.toLocaleString() }
        }
      }
    }
  });
  renderScatterOutliers(scatterData);
});

// ── UPDATE SEVERITY CHART ─────────────────────────────────────────────────────
function updateSeverityChart(filterSeverity) {
  const severityOrder = ['Minor', 'Moderate', 'Major', 'Extreme'];
  const colors = ['#10B981', '#F59E0B', '#F97316', '#EF4444'];

  const filtered = filterSeverity === 'all'
    ? severityDataCache
    : severityDataCache.filter(d => d.severity === filterSeverity);

  const labels = filtered.map(d => d.severity);
  const values = filtered.map(d => d.avg_charges);
  const bgColors = filtered.map(d => colors[severityOrder.indexOf(d.severity)] + 'CC');
  const brColors = filtered.map(d => colors[severityOrder.indexOf(d.severity)]);

  if (severityChart) severityChart.destroy();
  severityChart = new Chart(document.getElementById('severity-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Charges ($)',
        data: values,
        backgroundColor: bgColors,
        borderColor: brColors,
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Avg Charges ($)', false),
      plugins: {
        ...chartOpts('', false).plugins,
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = filtered[ctx.dataIndex];
              return [
                `Avg Charges: $${d.avg_charges.toLocaleString()}`,
                `Total Cases: ${d.total_cases.toLocaleString()}`
              ];
            }
          }
        }
      }
    }
  });
}

// ── CHART: SEVERITY VS CHARGES ────────────────────────────────────────────────
// let severityChart = null;

fetch('/api/severity-charges').then(r => r.json()).then(data => {
  severityDataCache = data;
  document.getElementById('severity-loading').style.display = 'none';
  document.getElementById('severity-chart').style.display = 'block';
  updateSeverityChart('all');

  if (Object.keys(chargesAreaData).length) initP2Sidebar();
});

// ── CHART 3: PAYER ───────────────────────────────────────────────────────────
let payerChart = null;
fetch('/api/payer').then(r=>r.json()).then(data=>{
  payerDataCache = data;
  document.getElementById('payer-loading').style.display = 'none';
  document.getElementById('payer-chart').style.display = 'none'; // sembunyikan canvas

  const payers = [...new Set(data.map(d=>d.payer))].sort();
  const disps = [...new Set(data.map(d=>d.disposition))].sort();

  // Hitung total per payer untuk normalisasi
  const payerTotals = {};
  payers.forEach(p => {
    payerTotals[p] = disps.reduce((sum, disp) => {
      const row = data.find(d => d.payer === p && d.disposition === disp);
      return sum + (row ? row.count : 0);
    }, 0);
  });

  // Build heatmap table
  let html = `<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:'DM Mono',monospace;">`;
  html += `<thead><tr>`;
  html += `<th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;min-width:140px;">Payer</th>`;
  disps.forEach(d => {
    html += `<th style="text-align:center;padding:8px 6px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;font-size:10px;">${d}</th>`;
  });
  html += `</tr></thead><tbody>`;

  payers.forEach(payer => {
    html += `<tr style="border-bottom:1px solid var(--border);">`;
    html += `<td style="padding:8px 10px;font-weight:600;color:var(--text);white-space:nowrap;">${payer}</td>`;

    disps.forEach((disp, dIdx) => {
      const row = data.find(d => d.payer === payer && d.disposition === disp);
      const count = row ? row.count : 0;
      const pct = payerTotals[payer] > 0 ? (count / payerTotals[payer] * 100) : 0;
      const intensity = pct / 100;
      const alpha = (0.08 + intensity * 0.75).toFixed(2);

      const hex = PALETTE[dIdx % PALETTE.length];
      const r = parseInt(hex.slice(1,3), 16);
      const g = parseInt(hex.slice(3,5), 16);
      const b = parseInt(hex.slice(5,7), 16);

      html += `<td style="text-align:center;padding:8px 6px;background:rgba(${r},${g},${b},${alpha});border-radius:4px;">
        <div style="font-weight:600;color:var(--text);font-size:11px;">${pct.toFixed(1)}%</div>
        <div style="font-size:9px;color:var(--muted);">${count.toLocaleString()}</div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</tbody></table>`;

  // Render ke div khusus
  let heatDiv = document.getElementById('payer-heatmap');
  if (!heatDiv) {
    heatDiv = document.createElement('div');
    heatDiv.id = 'payer-heatmap';
    heatDiv.style.overflowX = 'auto';
    document.getElementById('payer-chart').parentNode.appendChild(heatDiv);
  }
  heatDiv.innerHTML = html;

  // Update chart-wrap height
  document.getElementById('payer-chart').closest('.chart-wrap').style.height = 'auto';

  initP3Sidebar(data);
});

// ── CHART: LOS BY PAYER ───────────────────────────────────────────────────────
// let losPayerChart = null;
fetch('/api/los-by-payer').then(r => r.json()).then(data => {
  losPayerCache = data;
  document.getElementById('los-payer-loading').style.display = 'none';
  document.getElementById('los-payer-chart').style.display = 'block';

  const labels = data.map(d => d.payer);
  const values = data.map(d => d.avg_los);

  losPayerChart = new Chart(document.getElementById('los-payer-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg LOS (days)',
        data: values,
        backgroundColor: values.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: values.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio || 2,
      animation: { duration: 600, easing: 'easeOutQuart' },
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = data[ctx.dataIndex];
              return [
                `Avg LOS: ${d.avg_los} days`,
                `Cases: ${d.total_cases.toLocaleString()}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          max: 10,
          grace: '10%',
          grid: { color: gridColor() },
          ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 } },
          title: { display: true, text: 'Avg LOS (days)', color: textColor(), font: { family: 'DM Sans', size: 12 } }
        },
        y: {
          grid: { color: gridColor() },
          ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 } }
        }
      }
    }
  });
});

// ── CHART: PAYMENT COORDINATION ───────────────────────────────────────────────
fetch('/api/payment-coordination').then(r => r.json()).then(data => {
  document.getElementById('coordination-loading').style.display = 'none';
  coordinationDataCache = data;
  renderCoordination(data);
});

// ── CHART: PROCEDURE CHARGES ──────────────────────────────────────────────────
fetch('/api/procedure-charges').then(r => r.json()).then(data => {
  document.getElementById('procedure-loading').style.display = 'none';
  document.getElementById('procedure-chart').style.display = 'block';

  const labels = data.map(d => d.procedure);
  const values = data.map(d => d.avg_charges);

  procedureChart = new Chart(document.getElementById('procedure-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Charges ($)',
        data: values,
        backgroundColor: values.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: values.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Avg Charges ($)', false),
      indexAxis: 'y',
      plugins: {
        ...chartOpts('', false).plugins,
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = data[ctx.dataIndex];
              return [
                `Avg: $${d.avg_charges.toLocaleString()}`,
                `Cases: ${d.total_cases.toLocaleString()}`
              ];
            }
          }
        }
      }
    }
  });
});

// ── CHART: MORTALITY VS CHARGES ───────────────────────────────────────────────
fetch('/api/mortality-charges').then(r => r.json()).then(data => {
  document.getElementById('mortality-loading').style.display = 'none';
  document.getElementById('mortality-chart').style.display = 'block';

  const labels = data.map(d => d.risk);
  const values = data.map(d => d.avg_charges);
  const colors = ['#10B981', '#F59E0B', '#F97316', '#EF4444'];

  mortalityChart = new Chart(document.getElementById('mortality-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Avg Charges ($)',
        data: values,
        backgroundColor: colors.map(c => c + 'CC'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Avg Charges ($)', false),
      plugins: {
        ...chartOpts('', false).plugins,
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = data[ctx.dataIndex];
              return [
                `Avg Charges: $${d.avg_charges.toLocaleString()}`,
                `Total Cases: ${d.total_cases.toLocaleString()}`
              ];
            }
          }
        }
      }
    }
  });
});

// ── SHARED CHART OPTIONS ──────────────────────────────────────────────────────
function chartOpts(yLabel, stacked=false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    devicePixelRatio: window.devicePixelRatio || 2,
    animation: { duration: 600, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: stacked, labels: { color: textColor(), font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
      tooltip: { backgroundColor: dark?'#1C2333':'#fff', titleColor: dark?'#F0F4FF':'#111', bodyColor: textColor(), borderColor: 'rgba(0,201,167,0.3)', borderWidth: 1, cornerRadius: 8, padding: 10 }
    },
    scales: {
      x: { stacked, grid: { color: gridColor() }, ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 } } },
      y: { stacked, grid: { color: gridColor() }, ticks: { color: textColor(), font: { family: 'DM Mono', size: 11 } }, title: { display: !!yLabel, text: yLabel, color: textColor(), font: { family: 'DM Sans', size: 12 } } }
    }
  };
}

function redrawAll() {
  if (edChart) edChart.resize();

  if (losChart) {
    losChart.resize();
  }
  if (chargeChart) {
    chargeChart.resize();
  }
  if (payerChart) {
    payerChart.resize();
  }
  if (heatmapChart) {
    heatmapChart.resize();
  }
  if (admissionChart) {
    admissionChart.resize();
  }
  if (diagnosisAreaChart) {
    diagnosisAreaChart.resize();
  }
  if (seasonalChart) {
    seasonalChart.resize();
  }

  if (chargesAreaChart) chargesAreaChart.resize();
  if (treemapChart) treemapChart.resize();  
  if (severityChart) severityChart.resize();

  if (scatterChart) scatterChart.resize();

  if (losPayerChart) losPayerChart.resize();
  if (coordinationChart) coordinationChart.resize();
  if (edByTypeChart) edByTypeChart.resize();
}

function applyThemeToCharts() {
  if (losChart) {
    losChart.options = { ...chartOpts('Avg LOS (days)', true) };
    losChart.update();
  }

  if (chargeChart) {
    chargeChart.options = {
      ...chartOpts('Avg Total Charges ($)', false),
      indexAxis: 'y',
    };
    chargeChart.update();
  }

  if (payerChart) {
    payerChart.options = {
      ...chartOpts('Jumlah Pasien', true),
      plugins: {
        ...chartOpts('', true).plugins,
        legend: { display: true, labels: { color: textColor(), font: { family: 'DM Sans', size: 11 } } }
      }
    };
    payerChart.update();
  }

  if (heatmapChart) {
    heatmapChart.options = {
      ...chartOpts('Avg LOS (days)', true),
      plugins: {
        ...chartOpts('', true).plugins,
        legend: { display: true, labels: { color: textColor(), font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} days` } }
      }
    };
    heatmapChart.update();
  }

  if (admissionChart) {
    admissionChart.options = {
      ...chartOpts('Number of Patients', true),
      plugins: {
        ...chartOpts('', true).plugins,
        legend: { display: true, labels: { color: textColor(), font: { family: 'DM Sans', size: 11 }, boxWidth: 12 } }
      }
    };
    admissionChart.update();
  }

  if (diagnosisAreaChart) {
    diagnosisAreaChart.options = { ...chartOpts('Total Cases', false), indexAxis: 'y' };
    diagnosisAreaChart.update();
  }

  if (seasonalChart) {
    seasonalChart.options = { ...chartOpts('Total Cases', false), indexAxis: 'y' };
    seasonalChart.update();
  }

  if (edChart) {
    edChart.options = { ...chartOpts('Percentage (%)', true) };
    edChart.update();
  }

  if (chargesAreaChart) {
  chargesAreaChart.options = { ...chartOpts('Avg Charges ($)', false), indexAxis: 'y' };
  chargesAreaChart.update();
  }
  if (treemapChart) {
    treemapChart.options = { ...chartOpts('Total Charges ($)', false), indexAxis: 'y' };
    treemapChart.update();
  }
  if (severityChart) {
    severityChart.options = { ...chartOpts('Avg Charges ($)', false) };
    severityChart.update();
  }

  if (scatterChart) {
    scatterChart.options = { ...chartOpts('Avg Charges ($)', false) };
    scatterChart.update();
  }

  if (procedureChart) {
    procedureChart.options = { ...chartOpts('Avg Charges ($)', false), indexAxis: 'y' };
    procedureChart.update();
  }

  if (mortalityChart) {
    mortalityChart.options = { ...chartOpts('Avg Charges ($)', false) };
    mortalityChart.update();
  }

  if (losPayerChart) {
  losPayerChart.options = { ...chartOpts('Avg LOS (days)', false), indexAxis: 'y' };
  losPayerChart.update();
  }
  if (coordinationChart) {
    coordinationChart.options = { ...chartOpts('Number of Patients', true) };
    coordinationChart.update();
  }

  if (edByTypeChart) {
    edByTypeChart.options = { ...chartOpts('ED Entry Rate (%)', false), indexAxis: 'y' };
    edByTypeChart.update();
  } 
}

// ── CHART MAP: Patient Distribution ──────────────────────────────────────────
let mapInstance = null;
let resizeTimeout = null;

function handleResize() {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
    redrawAll();
  }, 150);
}

window.addEventListener('resize', handleResize);

fetch('/api/patient-distribution').then(r => r.json()).then(data => {
  document.getElementById('map-loading').style.display = 'none';
  document.getElementById('los-map').style.display = 'block';

  const map = L.map('los-map');

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    subdomains: 'abc',
    maxZoom: 19
  }).addTo(map);

  const max = Math.max(...data.map(d => d.total_patients));
  const markerBounds = [];

  data.forEach(d => {
    const radius = (d.total_patients / max) * 50 + 10;
    const marker = L.circleMarker([d.lat, d.lng], {
      radius,
      fillColor: '#0EA5A0',
      color: '#0EA5A0',
      weight: 1.5,
      opacity: 0.9,
      fillOpacity: 0.35
    })
    .bindPopup(`<b>${d.service_area}</b><br>${d.total_patients.toLocaleString()} patients`)
    .addTo(map);

    marker.on('click', () => {
      renderCountyBreakdown(d.service_area);
    });

    markerBounds.push([d.lat, d.lng]);
  });

  // Otomatis fokus ke seluruh marker NY, dengan padding
  map.fitBounds(markerBounds, { padding: [50, 50] });

  mapInstance = map;
});

function updateAdmissionChart(filterType) {
  if (!admissionData || !admissionData.length) return;

  const areas = [...new Set(admissionData.map(d => d.area))].sort();
  // const types = [...new Set(admissionData.map(d => d.type_of_admission))].filter(Boolean).sort();

  const admissionOrder = ['Elective', 'Urgent', 'Emergency', 'Trauma', 'Newborn', 'Not Available'];
  const allTypes = [...new Set(admissionData.map(d => d.type_of_admission))].filter(Boolean);
  const types = admissionOrder.filter(t => allTypes.includes(t));

if (filterType === 'all') {
  if (admissionChart) { admissionChart.destroy(); admissionChart = null; }

  document.getElementById('admission-chart').style.display = 'none';
  document.querySelector('#admission-chart').closest('.chart-wrap').classList.add('heatmap-mode');
  document.getElementById('admission-heatmap').style.display = 'block';

  const toggleWrapper = document.getElementById('admission-toggle-wrapper');
  if (toggleWrapper) toggleWrapper.style.display = 'none';

  const allVals = areas.flatMap(a =>
    types.map(t => {
      const r = admissionData.find(d => d.area === a && d.type_of_admission === t);
      return r ? r.total : 0;
    })
  );
  const maxVal = Math.max(...allVals);

  // Build thead
  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'DM Mono',monospace;">`;
  html += `<thead><tr><th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);">Service Area</th>`;
  types.forEach(t => {
    html += `<th style="text-align:center;padding:8px 6px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;">${t}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // Build tbody — dengan warna per tipe
  areas.forEach(area => {
    const rowTotal = types.reduce((sum, t) => {
      const r = admissionData.find(d => d.area === area && d.type_of_admission === t);
      return sum + (r ? r.total : 0);
    }, 0);

    html += `<tr style="border-bottom:1px solid var(--border);">`;
    html += `<td style="padding:8px 10px;font-weight:500;color:var(--text);white-space:nowrap;">${area}</td>`;

    types.forEach((t, tIdx) => {
      const r = admissionData.find(d => d.area === area && d.type_of_admission === t);
      const val = r ? r.total : 0;
      const pct = rowTotal > 0 ? (val / rowTotal * 100).toFixed(1) : '0.0';
      const intensity = maxVal > 0 ? val / maxVal : 0;
      const alpha = (0.1 + intensity * 0.7).toFixed(2);

      const hex = PALETTE[tIdx % PALETTE.length];
      const r2 = parseInt(hex.slice(1,3), 16);
      const g2 = parseInt(hex.slice(3,5), 16);
      const b2 = parseInt(hex.slice(5,7), 16);

      html += `<td style="text-align:center;padding:8px 6px;background:rgba(${r2},${g2},${b2},${alpha});border-radius:4px;">
        <div style="font-weight:600;color:var(--text);">${val.toLocaleString()}</div>
        <div style="font-size:10px;color:var(--muted);">${pct}%</div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</tbody></table>`;
  document.getElementById('admission-heatmap').innerHTML = html;

  updateAdmissionInsight(areas, types);

  } else {
    document.getElementById('admission-heatmap').style.display = 'none';
    document.querySelector('#admission-chart').closest('.chart-wrap').classList.remove('heatmap-mode');
    document.getElementById('admission-chart').style.display = 'block';

    const filtered = admissionData.filter(d => d.type_of_admission === filterType);

    const datasets = [{
      label: filterType,
      data: areas.map(a => {
        const row = filtered.find(d => d.area === a);
        return row ? row.total : 0;
      }),
      backgroundColor: '#3B82F6CC',
      borderColor: '#3B82F6',
      borderWidth: 1,
      borderRadius: 6,
    }];

    if (admissionChart) admissionChart.destroy();
    admissionChart = new Chart(document.getElementById('admission-chart'), {
      type: 'bar',
      data: { labels: areas, datasets },
      options: chartOpts('Number of Patients', false)
    });
  }
}

function updateDiagnosisArea() {

  if (!diagnosisAreaData.length) return;
  if (!activeArea) return;

  const filtered = diagnosisAreaData.filter(
    d => d.area === activeArea
  );

  if (!filtered.length) return;

  const labels = filtered.map(d => d.diagnosis);
  const values = filtered.map(d => d.total);

  if (diagnosisAreaChart)
    diagnosisAreaChart.destroy();

  diagnosisAreaChart = new Chart(
    document.getElementById('diagnosis-area-chart'),
    {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Total Cases',
          data: values,
          backgroundColor: values.map(
            (_, i) => PALETTE[i % PALETTE.length] + 'CC'
          ),
          borderColor: values.map(
            (_, i) => PALETTE[i % PALETTE.length]
          ),
          borderWidth: 1,
          borderRadius: 6,
        }]
      },
      options: {
        ...chartOpts('Total Cases', false),
        indexAxis: 'y',
      }
    }
  );
}

// ── CHART 6: SEASONAL PROXY ───────────────────────────────────────────────────
// let seasonalChart = null;
let diseaseCategoryData = {};
let categoryViewMode = 'overview'; // 'overview' | 'detail'
let activeCategory = null;

fetch('/api/disease-category').then(r => r.json()).then(data => {
  document.getElementById('seasonal-loading').style.display = 'none';
  document.getElementById('seasonal-chart').style.display = 'block';

  diseaseCategoryData = data;
  renderCategoryOverview();
});

function renderCategoryOverview() {
  categoryViewMode = 'overview';
  activeCategory = null;

  const labels = diseaseCategoryData.summary.map(d => d.category);
  const values = diseaseCategoryData.summary.map(d => d.total);

  if (seasonalChart) seasonalChart.destroy();
  seasonalChart = new Chart(document.getElementById('seasonal-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Cases',
        data: values,
        backgroundColor: values.map((_, i) => PALETTE[i % PALETTE.length] + 'CC'),
        borderColor: values.map((_, i) => PALETTE[i % PALETTE.length]),
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Total Cases', false),
      indexAxis: 'y',
    }
  });
}

function renderCategoryDetail(category, colorIdx) {
  categoryViewMode = 'detail';
  activeCategory = category;

  const detail = diseaseCategoryData.details[category] || [];
  const labels = detail.map(d => d.diagnosis);
  const values = detail.map(d => d.total);
  const color = PALETTE[colorIdx % PALETTE.length];

  if (seasonalChart) seasonalChart.destroy();
  seasonalChart = new Chart(document.getElementById('seasonal-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Cases in ${category}`,
        data: values,
        backgroundColor: color + 'CC',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 6,
      }]
    },
    options: {
      ...chartOpts('Total Cases', false),
      indexAxis: 'y',
    }
  });
}

// ── CHART ED RATIO ────────────────────────────────────────────────────────────
// let edChart = null;
let edExplorerData = [];
let activeEDArea = null;

fetch('/api/ed-ratio').then(r => r.json()).then(data => {
  edExplorerData = data.sort((a, b) => b.ed_pct - a.ed_pct);
  document.getElementById('ed-loading').style.display = 'none';
  document.getElementById('ed-explorer-body').style.display = 'block';

  // Build pill selector
  const pillRow = document.getElementById('ed-area-pills');
  pillRow.innerHTML = '';
  const allBtn = makeFilterBtn('All Areas', true, () => {
    activeEDArea = null;
    setActive(pillRow, allBtn);
    renderEDExplorer();
  });
  pillRow.appendChild(allBtn);
  edExplorerData.forEach(d => {
    const btn = makeFilterBtn(d.area, false, () => {
      activeEDArea = d.area;
      setActive(pillRow, btn);
      renderEDExplorer();
    });
    pillRow.appendChild(btn);
  });

  renderEDExplorer();
});

function edStatusBadge(pct) {
  if (pct >= 65) return { label: 'High Pressure', cls: 'badge-high' };
  if (pct >= 55) return { label: 'Moderate', cls: 'badge-moderate' };
  return { label: 'Low', cls: 'badge-low' };
}

function renderEDExplorer() {
  const statewideTotal = edExplorerData.reduce((sum, d) => sum + d.total, 0);
  const statewideED = edExplorerData.reduce((sum, d) => sum + d.ed, 0);
  const statewideAvgPct = (statewideED / statewideTotal * 100).toFixed(1);

  let current;
  if (activeEDArea) {
    current = edExplorerData.find(d => d.area === activeEDArea);
  } else {
    current = {
      area: 'All Areas',
      ed: statewideED,
      non_ed: statewideTotal - statewideED,
      total: statewideTotal,
      ed_pct: parseFloat(statewideAvgPct)
    };
  }

  // Stat cards
  document.getElementById('ed-stat-pct').textContent = current.ed_pct + '%';
  document.getElementById('ed-stat-nonpct').textContent = (100 - current.ed_pct).toFixed(1) + '%';
  document.getElementById('ed-stat-vol').textContent = current.ed.toLocaleString();
  document.getElementById('ed-stat-nonvol').textContent = current.non_ed.toLocaleString();

  // Insight kontekstual
  const status = edStatusBadge(current.ed_pct);
  const insightEl = document.getElementById('ed-explorer-insight');
  const diffFromAvg = (current.ed_pct - statewideAvgPct).toFixed(1);

  if (!activeEDArea) {
    insightEl.innerHTML = `<strong>Insight:</strong> Statewide, ED entries average <strong>${statewideAvgPct}%</strong> of all admissions. Select a service area above to see its specific pressure level and ranking.`;
  } else if (current.ed_pct > statewideAvgPct) {
    insightEl.innerHTML = `<strong>Insight:</strong> <strong>${current.area}</strong> runs <strong>${Math.abs(diffFromAvg)} points above</strong> the statewide average (${statewideAvgPct}%) — classified as <strong>${status.label}</strong>. Consider reinforcing ED nurse-to-patient ratios here.`;
  } else {
    insightEl.innerHTML = `<strong>Insight:</strong> <strong>${current.area}</strong> runs <strong>${Math.abs(diffFromAvg)} points below</strong> the statewide average (${statewideAvgPct}%) — classified as <strong>${status.label}</strong>. ED pressure is relatively manageable here.`;
  }

  // Ranking list
  const maxPct = Math.max(...edExplorerData.map(d => d.ed_pct));
  const rankList = document.getElementById('ed-rank-list');
  rankList.innerHTML = '';

  edExplorerData.forEach(d => {
    const badge = edStatusBadge(d.ed_pct);
    const isActive = d.area === activeEDArea;
    const width = (d.ed_pct / maxPct * 100).toFixed(1);

    const row = document.createElement('div');
    row.className = 'ed-rank-row' + (isActive ? ' is-active' : '');
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <div class="ed-rank-area">${d.area}</div>
      <div class="ed-rank-bar-track">
        <div class="ed-rank-bar-fill" style="width:${width}%;"></div>
      </div>
      <div class="ed-rank-pct">${d.ed_pct}%</div>
      <div class="ed-rank-badge ${badge.cls}">${badge.label}</div>
    `;
    row.addEventListener('click', () => {
      activeEDArea = d.area;
      const pillRow = document.getElementById('ed-area-pills');
      pillRow.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.toggle('on', b.textContent === d.area);
      });
      renderEDExplorer();
    });
    rankList.appendChild(row);
  });
}

function renderCountyBreakdown(area) {
  const counties = countyDataCache[area];
  if (!counties || !counties.length) {
    document.getElementById('county-breakdown').style.display = 'none';
    return;
  }

  const max = Math.max(...counties.map(c => c.total_patients));
  document.getElementById('county-breakdown-area').textContent = area;

  let html = '';
  counties.forEach(c => {
    const pct = (c.total_patients / max * 100).toFixed(0);
    html += `
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:110px; font-size:12px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.county}</div>
        <div style="flex:1; height:8px; background:var(--border); border-radius:4px; overflow:hidden;">
          <div style="width:${pct}%; height:100%; background:#0EA5A0;"></div>
        </div>
        <div style="width:70px; text-align:right; font-size:12px; font-family:'DM Mono',monospace; color:var(--muted);">${c.total_patients.toLocaleString()}</div>
      </div>
    `;
  });

  document.getElementById('county-breakdown-list').innerHTML = html;
  document.getElementById('county-breakdown').style.display = 'block';
}

function renderLOSHeatmapTable() {
  const areas = [...new Set(losData.map(d => d.area))].sort();
  const ageGroups = ['0 to 17', '18 to 29', '30 to 49', '50 to 69', '70 or Older'];

  const maxPerAge = {};
  const minPerAge = {};
  ageGroups.forEach(age => {
    const vals = losData.filter(d => d.age_group === age).map(d => parseFloat(d.avg_los));
    maxPerAge[age] = Math.max(...vals);
    minPerAge[age] = Math.min(...vals);
  });

  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'DM Mono',monospace;">`;
  html += `<thead><tr><th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);">Service Area</th>`;
  ageGroups.forEach(age => {
    html += `<th style="text-align:center;padding:8px 6px;color:var(--muted);font-weight:500;border-bottom:1px solid var(--border);white-space:nowrap;">${age}</th>`;
  });
  html += `</tr></thead><tbody>`;

  areas.forEach(area => {
    html += `<tr style="border-bottom:1px solid var(--border);">`;
    html += `<td style="padding:8px 10px;font-weight:500;color:var(--text);white-space:nowrap;">${area}</td>`;

    ageGroups.forEach(age => {
      const row = losData.find(d => d.area === area && d.age_group === age);
      const val = row ? parseFloat(row.avg_los) : 0;

      const range = maxPerAge[age] - minPerAge[age];
      const rawIntensity = range > 0 ? (val - minPerAge[age]) / range : 0;
      // Smoothing: sqrt membuat gradasi lebih landai di bagian tengah-rendah
      const intensity = Math.sqrt(rawIntensity);
      const alpha = (0.15 + intensity * 0.75).toFixed(2);

      html += `<td style="text-align:center;padding:10px 6px;background:rgba(14,165,160,${alpha});border-radius:4px;">
        <div style="font-weight:600;color:var(--text);">${val.toFixed(1)}</div>
        <div style="font-size:9px;color:var(--muted);">days</div>
      </td>`;
    });

    html += `</tr>`;
  });

  html += `</tbody></table>`;

  document.getElementById('heatmap-chart').style.display = 'none';
  document.querySelector('#heatmap-chart').closest('.chart-wrap').classList.add('heatmap-mode');

  let heatDiv = document.getElementById('los-heatmap-table');
  if (!heatDiv) {
    heatDiv = document.createElement('div');
    heatDiv.id = 'los-heatmap-table';
    heatDiv.style.overflowX = 'auto';
    document.getElementById('heatmap-chart').parentNode.appendChild(heatDiv);
  }
  heatDiv.innerHTML = html;
}

function updateAdmissionInsight(areas, types) {
  let maxEmergencyPct = -1, maxEmergencyArea = '';
  let maxNewbornPct = -1, maxNewbornArea = '';

  areas.forEach(area => {
    const rowTotal = types.reduce((sum, t) => {
      const r = admissionData.find(d => d.area === area && d.type_of_admission === t);
      return sum + (r ? r.total : 0);
    }, 0);

    const emergencyRow = admissionData.find(d => d.area === area && d.type_of_admission === 'Emergency');
    const emergencyPct = emergencyRow && rowTotal > 0 ? (emergencyRow.total / rowTotal * 100) : 0;
    if (emergencyPct > maxEmergencyPct) {
      maxEmergencyPct = emergencyPct;
      maxEmergencyArea = area;
    }

    const newbornRow = admissionData.find(d => d.area === area && d.type_of_admission === 'Newborn');
    const newbornPct = newbornRow && rowTotal > 0 ? (newbornRow.total / rowTotal * 100) : 0;
    if (newbornPct > maxNewbornPct) {
      maxNewbornPct = newbornPct;
      maxNewbornArea = area;
    }
  });

  const insightEl = document.getElementById('admission-chart').closest('.chart-card').querySelector('.insight');
  if (insightEl) {
    insightEl.innerHTML = `<strong>Insight:</strong> <strong>${maxEmergencyArea}</strong> has the highest Emergency admission rate (${maxEmergencyPct.toFixed(1)}%), suggesting a need for increased ED nurse-to-patient ratios. Meanwhile, <strong>${maxNewbornArea}</strong> records the highest proportion of Newborn admissions (${maxNewbornPct.toFixed(1)}%), which are largely scheduled and pose lower strain on emergency capacity.`;
  }
}

function updateEDRatioInsight(data) {
  // Area dengan % ED tertinggi
  const highestPct = data.reduce((max, d) => d.ed_pct > max.ed_pct ? d : max, data[0]);
  // Area dengan volume ED absolut tertinggi
  const highestVolume = data.reduce((max, d) => d.ed > max.ed ? d : max, data[0]);
  // Rata-rata statewide
  const avgPct = (data.reduce((sum, d) => sum + d.ed_pct, 0) / data.length).toFixed(1);

  const insightEl = document.getElementById('ed-ratio-insight');
  if (!insightEl) return;

  if (highestPct.area === highestVolume.area) {
    insightEl.innerHTML = `<strong>Insight:</strong> <strong>${highestPct.area}</strong> has both the highest ED entry rate (${highestPct.ed_pct}%) and the highest absolute ED volume (${highestPct.ed.toLocaleString()} patients), making it the top priority for ED nurse-to-patient ratio reinforcement. Statewide, ED entries average ${avgPct}% of all admissions.`;
  } else {
    insightEl.innerHTML = `<strong>Insight:</strong> <strong>${highestPct.area}</strong> has the highest ED entry rate (${highestPct.ed_pct}%) relative to its population, while <strong>${highestVolume.area}</strong> handles the highest absolute ED volume (${highestVolume.ed.toLocaleString()} patients) — both should be weighed when allocating ED nursing staff, since rate alone may understate the burden on high-volume regions.`;
  }
}

/// ── BED CAPACITY EXPLORER ─────────────────────────────────────────────────────
Promise.all([
  fetch('/api/bed-occupancy').then(r => r.json()),
  fetch('/api/bed-occupancy-facility').then(r => r.json())
]).then(([occupancyData, facilityData]) => {

  // Build lookup: area → { occ, r20, r30, los }
  const areaMap = {};
  occupancyData.forEach(d => {
    areaMap[d.area] = {
      occ: d.avg_occupied_beds,
      r20: d.recommended_beds_20pct_buffer,
      r30: d.recommended_beds_30pct_buffer,
      los: d.avg_los,
    };
  });

  // Build lookup: area → [ { name, occ, rec } ]
  const hospitalMap = {};
  facilityData.forEach(d => {
    if (!hospitalMap[d.hospital_service_area]) hospitalMap[d.hospital_service_area] = [];
    hospitalMap[d.hospital_service_area].push({
        name: d.facility_name,
        occ: d.avg_occupied_beds,
        rec: parseFloat(d.recommended_beds || d.recommended_beds_20pct_buffer || d.avg_occupied_beds * 1.25),
    });
  });

  const areas = occupancyData.map(d => d.area);
  let activeArea = areas[0];
  let sortMode = 'needed';

  function fmt(n) { return Number(n).toLocaleString(); }

  function getStatus(occ, rec) {
    const ratio = occ / rec;
    if (ratio >= 0.92) return 'Critical';
    if (ratio >= 0.75) return 'Monitor';
    return 'Adequate';
  }

  function renderExplorer() {
    const d = areaMap[activeArea] || {};
    const hosps = (hospitalMap[activeArea] || []).map(h => ({
      ...h,
      needed: Math.round(h.rec - h.occ),
      status: getStatus(h.occ, h.rec),
    }));

    const sorted = sortMode === 'needed'
      ? [...hosps].sort((a, b) => b.needed - a.needed)
      : [...hosps].sort((a, b) => a.name.localeCompare(b.name));

    const gap = Math.round(d.r20 - d.occ);

    const dotMap    = { Critical: '#EF4444', Monitor: '#F59E0B', Adequate: '#10B981' };
    const colorMap  = { Critical: '#EF4444', Monitor: '#F59E0B', Adequate: '#10B981' };
    const bgMap     = { Critical: 'rgba(239,68,68,0.08)',   Monitor: 'rgba(245,158,11,0.08)',  Adequate: 'rgba(16,185,129,0.08)' };
    const borderMap = { Critical: 'rgba(239,68,68,0.3)',    Monitor: 'rgba(245,158,11,0.3)',   Adequate: 'rgba(16,185,129,0.3)' };

    const pillsHtml = areas.map(a => `
      <button onclick="bceSetArea('${a}')" class="bce-pill ${a === activeArea ? 'bce-pill-active' : ''}">${a}</button>
    `).join('');

    const hospHtml = sorted.map(h => `
      <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <span style="width:8px;height:8px;border-radius:50%;background:${dotMap[h.status]};flex-shrink:0;display:inline-block;"></span>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text);">${h.name}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Occupied: ${fmt(h.occ)} &nbsp;·&nbsp; Recommended: ${fmt(h.rec)}</div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:14px;font-weight:600;color:${colorMap[h.status]};">+${fmt(h.needed)} needed</div>
          <span style="display:inline-block;margin-top:4px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:500;color:${colorMap[h.status]};background:${bgMap[h.status]};border:1px solid ${borderMap[h.status]};">${h.status}</span>
        </div>
      </div>
    `).join('');

    document.getElementById('bed-capacity-explorer').innerHTML = `
    
      <p style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Service area</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px;">${pillsHtml}</div>

      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px;">
        <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Avg occupied</div>
          <div style="font-size:26px;font-weight:700;line-height:1;color:var(--text);">${fmt(d.occ)}</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Recommended +20%</div>
          <div style="font-size:26px;font-weight:700;line-height:1;color:#0EA5A0;">${fmt(d.r20)}</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Recommended +30%</div>
          <div style="font-size:26px;font-weight:700;line-height:1;color:#3B82F6;">${fmt(d.r30)}</div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:14px 16px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Avg LOS</div>
          <div style="font-size:26px;font-weight:700;line-height:1;color:#8B5CF6;">${d.los} <span style="font-size:13px;font-weight:400;color:var(--muted);">days</span></div>
        </div>
      </div>

      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-size:13px;color:var(--text);line-height:1.6;margin-bottom:20px;">
        Area ini butuh tambahan <strong>${fmt(gap)} bed</strong> untuk buffer 20% surge capacity, dari ${fmt(d.occ)} menjadi ${fmt(d.r20)} recommended.
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:500;color:var(--muted);display:flex;align-items:center;gap:14px;">
          <span>Hospitals</span>
          <span style="display:flex;align-items:center;gap:10px;">
            <span><span style="width:8px;height:8px;border-radius:50%;background:#EF4444;display:inline-block;margin-right:4px;"></span>Critical</span>
            <span><span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;display:inline-block;margin-right:4px;"></span>Monitor</span>
            <span><span style="width:8px;height:8px;border-radius:50%;background:#10B981;display:inline-block;margin-right:4px;"></span>Adequate</span>
          </span>
        </div>
        <div style="display:flex;gap:6px;">
          <button onclick="bceSetSort('needed')" class="bce-sort-btn ${sortMode === 'needed' ? 'bce-sort-active' : ''}">Most needed</button>
          <button onclick="bceSetSort('az')" class="bce-sort-btn ${sortMode === 'az' ? 'bce-sort-active' : ''}">A–Z</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;">${hospHtml}</div>
    `;

    // Re-apply pill click events (innerHTML wipes them)
    document.querySelectorAll('.bce-pill').forEach(btn => {
      btn.addEventListener('click', () => { activeArea = btn.textContent; renderExplorer(); });
    });
    document.querySelectorAll('.bce-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => { sortMode = btn.textContent === 'A–Z' ? 'az' : 'needed'; renderExplorer(); });
    });
  }

  // Expose for inline onclick fallback
  window.bceSetArea = (a) => { activeArea = a; renderExplorer(); };
  window.bceSetSort = (m) => { sortMode = m; renderExplorer(); };

  renderExplorer();
});

function renderScatterOutliers(scatterData) {
  const sortedByCharges = [...scatterData].sort((a, b) => b.y - a.y);
  const sortedByCases = [...scatterData].sort((a, b) => b.x - a.x);

  const highestCharge = sortedByCharges[0];
  const lowestCharge = sortedByCharges[sortedByCharges.length - 1];
  const highestVolume = sortedByCases[0];
  const lowestVolume = sortedByCases[sortedByCases.length - 1];

  const cards = [
    { label: 'Highest Avg Charge', item: highestCharge, metric: `$${highestCharge.y.toLocaleString()} avg · ${highestCharge.x.toLocaleString()} cases` },
    { label: 'Highest Case Volume', item: highestVolume, metric: `${highestVolume.x.toLocaleString()} cases · $${highestVolume.y.toLocaleString()} avg` },
    { label: 'Lowest Avg Charge', item: lowestCharge, metric: `$${lowestCharge.y.toLocaleString()} avg · ${lowestCharge.x.toLocaleString()} cases` },
    { label: 'Lowest Case Volume', item: lowestVolume, metric: `${lowestVolume.x.toLocaleString()} cases · $${lowestVolume.y.toLocaleString()} avg` },
  ];

  const html = cards.map(c => `
    <div class="outlier-card">
      <div class="outlier-label">${c.label}</div>
      <div class="outlier-name">${c.item.label}</div>
      <div class="outlier-detail">${c.metric}</div>
    </div>
  `).join('');

  document.getElementById('scatter-outliers').innerHTML = html;
}
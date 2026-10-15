// ==========================================================================
// SBPDCL Unified Meter Analytics Dashboard - Frontend Application
// Supports: Consumer Meters (1.11M), DT Meters (79.3K), Feeder Meters (3.3K)
// Dynamic Multi-Dimensional Slicing & Multi-Report Downloader Hub
// ==========================================================================

// Register Chart.js DataLabels plugin
if (window.ChartDataLabels) {
  Chart.register(ChartDataLabels);
}

const state = {
  category: 'consumer',  // 'consumer' | 'dt' | 'feeder'
  voltage: 'ALL',        // 'ALL' | '11 KV' | '33 KV' (for feeder)
  inactive: 'exclude',   // 'exclude' | 'include' | 'only' (for feeder)
  baselineOverview: null,
  currentData: null,
  filters: {
    circle: 'ALL',
    division: 'ALL',
    section: 'ALL',
    phase: 'ALL',        // Also acts as dtr_rating for DT, voltage_level for Feeder
    make: 'ALL',
    communication: 'ALL',// Also acts as dtr_type for DT, feeder_type for Feeder
    status: 'ALL',
    aging: 'ALL',
    search: ''
  },
  metersPage: 1,
  metersLimit: 50,
  charts: {},
  isFetching: false
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  setupTheme();
  setupEventListeners();
  setupCategorySwitcher();
  setupCorrelationFilters();
  setupDownloaderHub();
  await loadReportStatuses();
  await loadInitialData();
});

// --- Theme Toggle ---
function setupTheme() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('theme') || 'dark';

  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  toggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    rebuildCharts();
  });
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  }
}

// --- Category Switcher (Consumer / DT / Feeder) ---
function setupCategorySwitcher() {
  const pills = document.querySelectorAll('.category-pill');
  pills.forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      switchCategory(cat);
    });
  });

  const voltageBtns = document.querySelectorAll('.voltage-btn');
  voltageBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      voltageBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.voltage = btn.dataset.voltage;
      onFiltersChanged();
    });
  });

  const inactiveBtns = document.querySelectorAll('.inactive-toggle-btn');
  inactiveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      inactiveBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.inactive = btn.dataset.inactive;
      onFiltersChanged();
    });
  });

  const dtInactiveBtns = document.querySelectorAll('.dt-inactive-toggle-btn');
  dtInactiveBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dtInactiveBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.inactive = btn.dataset.inactive;
      onFiltersChanged();
    });
  });
}

function switchCategory(cat) {
  if (state.category === cat) return;
  state.category = cat;
  state.voltage = 'ALL';
  state.inactive = 'exclude';
  state.metersPage = 1;

  // Update category pills
  document.querySelectorAll('.category-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === cat);
  });

  // Voltage & Inactive sub-toggle visibility for Feeder
  const vToggle = document.getElementById('feederVoltageToggle');
  if (vToggle) {
    vToggle.classList.toggle('hidden', cat !== 'feeder');
  }
  document.querySelectorAll('.voltage-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.voltage === 'ALL');
  });
  document.querySelectorAll('.inactive-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.inactive === 'exclude');
  });

  // Inactive sub-toggle visibility for DT
  const dtToggle = document.getElementById('dtInactiveToggle');
  if (dtToggle) {
    dtToggle.classList.toggle('hidden', cat !== 'dt');
  }
  document.querySelectorAll('.dt-inactive-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.inactive === 'exclude');
  });

  // Update Filter Labels
  updateFilterLabelsForCategory();

  // Reset filter values
  resetFiltersToAll();

  // Load new category data
  loadInitialData();
}

function updateFilterLabelsForCategory() {
  const lblPhase = document.getElementById('lblFilterPhase');
  const lblComm = document.getElementById('lblFilterCommunication');
  const headerSubtitle = document.getElementById('appHeaderSubtitle');
  const filterTitle = document.getElementById('filterStripTitle');

  const tabDimensions = document.getElementById('navTabDimensions');
  const tabAging = document.getElementById('navTabAging');
  const tabMeters = document.getElementById('navTabMeters');

  const circleTitle = document.getElementById('circleTableTitle');
  const circleSubtitle = document.getElementById('circleTableSubtitle');
  const divisionTitle = document.getElementById('divisionTableTitle');
  const divisionSubtitle = document.getElementById('divisionTableSubtitle');
  const sectionTitle = document.getElementById('sectionTableTitle');
  const sectionSubtitle = document.getElementById('sectionTableSubtitle');

  const tab5T1Title = document.getElementById('tab5Table1Title');
  const tab5T1Subtitle = document.getElementById('tab5Table1Subtitle');
  const tab5T1ColHead = document.getElementById('tab5Table1ColHead');

  const tab6T1Title = document.getElementById('tab6Table1Title');
  const tab6T1Subtitle = document.getElementById('tab6Table1Subtitle');
  const tab6Col1 = document.getElementById('tab6Col1');
  const tab6Col2 = document.getElementById('tab6Col2');

  const explorerTitle = document.getElementById('explorerHeaderTitle');
  const searchInput = document.getElementById('filterSearch');
  const exportBtnText = document.getElementById('exportBtnText');

  if (state.category === 'consumer') {
    if (headerSubtitle) headerSubtitle.textContent = 'Consumer Smart Meter Communication & Aging Executive Analytics';
    if (filterTitle) filterTitle.textContent = 'Consumer Hierarchy & Dimension Filters';
    if (lblPhase) lblPhase.textContent = 'Phase';
    if (lblComm) lblComm.textContent = 'Communication Tech';

    if (tabDimensions) tabDimensions.innerHTML = '<i data-lucide="cpu"></i> Phase &amp; Make';
    if (tabAging) tabAging.innerHTML = '<i data-lucide="hourglass"></i> Aging &amp; Technology';
    if (tabMeters) tabMeters.innerHTML = '<i data-lucide="list-filter"></i> Consumer Explorer';

    if (circleTitle) circleTitle.textContent = 'Circle Performance Summary';
    if (circleSubtitle) circleSubtitle.textContent = 'Comprehensive analysis across all circles';
    if (divisionTitle) divisionTitle.textContent = 'Division Breakdown Summary';
    if (divisionSubtitle) divisionSubtitle.textContent = 'Division metrics with dynamic hierarchy filtering';
    if (sectionTitle) sectionTitle.textContent = 'Section Drilldown Table';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Section-level communication tracking across SBPDCL';

    if (tab5T1Title) tab5T1Title.textContent = 'Phase-wise Analytics';
    if (tab5T1Subtitle) tab5T1Subtitle.textContent = 'Communication breakdown by meter phase';
    if (tab5T1ColHead) tab5T1ColHead.textContent = 'Phase';

    if (tab6T1Title) tab6T1Title.textContent = 'Technology & Network Architecture';
    if (tab6T1Subtitle) tab6T1Subtitle.textContent = 'HES-Airtel (GPRS) vs HES-Cyan (RF) performance';
    if (tab6Col1) tab6Col1.textContent = 'HES Source';
    if (tab6Col2) tab6Col2.textContent = 'Technology';

    if (explorerTitle) explorerTitle.textContent = 'Consumer Meter Explorer';
    if (searchInput) searchInput.placeholder = 'Search MSN, Consumer ID, Name, Feeder, DT...';
    if (exportBtnText) exportBtnText.textContent = 'Export Consumers CSV';

  } else if (state.category === 'dt') {
    if (headerSubtitle) headerSubtitle.textContent = 'Distribution Transformer (DTR) Meter Communication & Performance Dashboard';
    if (filterTitle) filterTitle.textContent = 'DTR Hierarchy & Rating Filters';
    if (lblPhase) lblPhase.textContent = 'DTR Rating (kVA)';
    if (lblComm) lblComm.textContent = 'DTR Type';

    if (tabDimensions) tabDimensions.innerHTML = '<i data-lucide="cpu"></i> Capacity &amp; Make';
    if (tabAging) tabAging.innerHTML = '<i data-lucide="hourglass"></i> Aging &amp; DTR Type';
    if (tabMeters) tabMeters.innerHTML = '<i data-lucide="list-filter"></i> DTR Explorer';

    if (circleTitle) circleTitle.textContent = 'Circle DTR Performance Summary';
    if (circleSubtitle) circleSubtitle.textContent = 'Distribution Transformer communication across circles';
    if (divisionTitle) divisionTitle.textContent = 'Division DTR Breakdown Summary';
    if (divisionSubtitle) divisionSubtitle.textContent = 'Division level transformer health and communication';
    if (sectionTitle) sectionTitle.textContent = 'Section DTR Drilldown Table';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Section level distribution transformer tracking';

    if (tab5T1Title) tab5T1Title.textContent = 'DTR Capacity Analytics';
    if (tab5T1Subtitle) tab5T1Subtitle.textContent = 'Performance across transformer ratings (16, 25, 63, 100, 200 kVA)';
    if (tab5T1ColHead) tab5T1ColHead.textContent = 'DTR Rating (kVA)';

    if (tab6T1Title) tab6T1Title.textContent = 'DTR Type & Modem Installation';
    if (tab6T1Subtitle) tab6T1Subtitle.textContent = 'Distribution Transformer type and modem communication';
    if (tab6Col1) tab6Col1.textContent = 'DTR Type';
    if (tab6Col2) tab6Col2.textContent = 'Modem Installed';

    if (explorerTitle) explorerTitle.textContent = 'DTR Meter Explorer';
    if (searchInput) searchInput.placeholder = 'Search MSN, DTR Code, DTR Name, Substation, Feeder...';
    if (exportBtnText) exportBtnText.textContent = 'Export DTR CSV';

  } else if (state.category === 'feeder') {
    if (headerSubtitle) headerSubtitle.textContent = '11 kV & 33 kV Feeder Meter Communication & Transmission Monitoring';
    if (filterTitle) filterTitle.textContent = 'Feeder Hierarchy & Voltage Filters';
    if (lblPhase) lblPhase.textContent = 'Voltage Level';
    if (lblComm) lblComm.textContent = 'Feeder Type';

    if (tabDimensions) tabDimensions.innerHTML = '<i data-lucide="cpu"></i> Voltage &amp; Make';
    if (tabAging) tabAging.innerHTML = '<i data-lucide="hourglass"></i> Aging &amp; Feeder Type';
    if (tabMeters) tabMeters.innerHTML = '<i data-lucide="list-filter"></i> Feeder Explorer';

    if (circleTitle) circleTitle.textContent = 'Circle Feeder Performance Summary';
    if (circleSubtitle) circleSubtitle.textContent = 'Feeder communication performance across circles';
    if (divisionTitle) divisionTitle.textContent = 'Division Feeder Breakdown Summary';
    if (divisionSubtitle) divisionSubtitle.textContent = 'Division level feeder communication metrics';
    if (sectionTitle) sectionTitle.textContent = 'Section Feeder Drilldown Table';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Section level feeder communication tracking';

    if (tab5T1Title) tab5T1Title.textContent = 'Voltage Level Analytics';
    if (tab5T1Subtitle) tab5T1Subtitle.textContent = '11 kV vs 33 kV feeder communication performance';
    if (tab5T1ColHead) tab5T1ColHead.textContent = 'Voltage Level';

    if (tab6T1Title) tab6T1Title.textContent = 'Voltage & Feeder Classification';
    if (tab6T1Subtitle) tab6T1Subtitle.textContent = 'Rural vs Urban feeder communication breakdown';
    if (tab6Col1) tab6Col1.textContent = 'Voltage Level';
    if (tab6Col2) tab6Col2.textContent = 'Feeder Type';

    if (explorerTitle) explorerTitle.textContent = 'Feeder Meter Explorer';
    if (searchInput) searchInput.placeholder = 'Search MSN, Feeder Code, Feeder Name, Substation...';
    if (exportBtnText) exportBtnText.textContent = 'Export Feeder CSV';

  } else if (state.category === 'complaint') {
    if (headerSubtitle) headerSubtitle.textContent = 'O&M Complaint / Ticket Resolution, Aging & Remarks Analytics';
    if (filterTitle) filterTitle.textContent = 'Ticket Hierarchy, Status & Remarks Filters';
    if (lblPhase) lblPhase.textContent = 'Main Remarks';
    if (lblComm) lblComm.textContent = 'Sub Remarks';

    if (tabDimensions) tabDimensions.innerHTML = '<i data-lucide="message-square"></i> Main &amp; Sub Remarks';
    if (tabAging) tabAging.innerHTML = '<i data-lucide="hourglass"></i> Aging &amp; Ticket Status';
    if (tabMeters) tabMeters.innerHTML = '<i data-lucide="list-filter"></i> Ticket Explorer';

    if (circleTitle) circleTitle.textContent = 'Circle Complaint Resolution Summary';
    if (circleSubtitle) circleSubtitle.textContent = 'Ticket volume, resolution rates, and pending backlog across circles';
    if (divisionTitle) divisionTitle.textContent = 'Division Complaint Breakdown';
    if (divisionSubtitle) divisionSubtitle.textContent = 'Division level ticket distribution and resolution efficiency';
    if (sectionTitle) sectionTitle.textContent = 'Section Complaint Drilldown';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Section level complaint resolution and aging analysis';

    if (tab5T1Title) tab5T1Title.textContent = 'Main Remarks Analytics';
    if (tab5T1Subtitle) tab5T1Subtitle.textContent = 'Top failure categories & field remarks performance';
    if (tab5T1ColHead) tab5T1ColHead.textContent = 'Main Remarks';

    if (tab6T1Title) tab6T1Title.textContent = 'Sub Remarks Breakdown';
    if (tab6T1Subtitle) tab6T1Subtitle.textContent = 'Root cause analysis and sub remarks resolution rate';
    if (tab6Col1) tab6Col1.textContent = 'Main Remarks';
    if (tab6Col2) tab6Col2.textContent = 'Sub Remarks';

    if (explorerTitle) explorerTitle.textContent = 'O&M Complaint Ticket Explorer';
    if (searchInput) searchInput.placeholder = 'Search Ticket No, Consumer ID, MSN, Remarks, Feeder, DTR...';
    if (exportBtnText) exportBtnText.textContent = 'Export Complaints CSV';
  }

  renderExplorerThead();
  if (window.lucide) lucide.createIcons();
}

function renderExplorerThead() {
  const thead = document.getElementById('meterExplorerThead');
  if (!thead) return;

  if (state.category === 'consumer') {
    thead.innerHTML = `
      <tr>
        <th>MSN</th>
        <th>Consumer ID</th>
        <th>Consumer Name</th>
        <th>Hierarchy (Circle/Div/Sec)</th>
        <th>Feeder / DT</th>
        <th>Phase / Make</th>
        <th>Ageing</th>
        <th>Comm Status</th>
        <th class="text-center">Ticket Raised?</th>
        <th>Ticket Status</th>
        <th>Ticket No</th>
        <th>Category / Remarks</th>
        <th>Ticket Date</th>
      </tr>
    `;
  } else if (state.category === 'dt') {
    thead.innerHTML = `
      <tr>
        <th>MSN</th>
        <th>DTR Code</th>
        <th>DTR Name</th>
        <th>Circle</th>
        <th>Division</th>
        <th>Section</th>
        <th>Sub Station / Feeder</th>
        <th>Rating (kVA)</th>
        <th>Make</th>
        <th>Modem Installed</th>
        <th>Last Comm Timestamp</th>
        <th>Aging (Days)</th>
        <th>Status</th>
      </tr>
    `;
  } else if (state.category === 'feeder') {
    thead.innerHTML = `
      <tr>
        <th>MSN</th>
        <th>Feeder Code</th>
        <th>Feeder Name</th>
        <th>Circle</th>
        <th>Division</th>
        <th>Section</th>
        <th>Substation Name</th>
        <th>Voltage Level</th>
        <th>Make</th>
        <th>Feeder Type</th>
        <th>Last Comm Timestamp</th>
        <th>Aging (Days)</th>
        <th>Status</th>
      </tr>
    `;
  } else if (state.category === 'complaint') {
    thead.innerHTML = `
      <tr>
        <th>Ticket No</th>
        <th>Ticket Date</th>
        <th>Consumer ID</th>
        <th>Consumer Name</th>
        <th>Circle</th>
        <th>Division</th>
        <th>Section</th>
        <th>Feeder / DTR</th>
        <th>MSN</th>
        <th>Status</th>
        <th>Aging (Days)</th>
        <th>Main Remarks</th>
        <th>Sub Remarks</th>
      </tr>
    `;
  }
}

function resetFiltersToAll() {
  state.filters = {
    circle: 'ALL',
    division: 'ALL',
    section: 'ALL',
    phase: 'ALL',
    make: 'ALL',
    communication: 'ALL',
    status: 'ALL',
    aging: 'ALL',
    search: ''
  };

  const cSel = document.getElementById('filterCircle');
  const dSel = document.getElementById('filterDivision');
  const sSel = document.getElementById('filterSection');
  const pSel = document.getElementById('filterPhase');
  const mSel = document.getElementById('filterMake');
  const comSel = document.getElementById('filterCommunication');
  const stSel = document.getElementById('filterStatus');
  const agSel = document.getElementById('filterAging');
  const srch = document.getElementById('filterSearch');

  if (cSel) cSel.value = 'ALL';
  if (dSel) dSel.value = 'ALL';
  if (sSel) sSel.value = 'ALL';
  if (pSel) pSel.value = 'ALL';
  if (mSel) mSel.value = 'ALL';
  if (comSel) comSel.value = 'ALL';
  if (stSel) stSel.value = 'ALL';
  if (agSel) agSel.value = 'ALL';
  if (srch) srch.value = '';
}

// --- Initial Data Load for Active Category ---
async function loadInitialData() {
  try {
    state.isFetching = true;
    const [filterRes, dataRes] = await Promise.all([
      fetch(`/api/filters?category=${state.category}`),
      fetch(`/api/analytics/filtered?category=${state.category}&voltage=${state.voltage}&inactive=${state.inactive || 'exclude'}`)
    ]);

    const filterJson = await filterRes.json();
    const dataJson = await dataRes.json();

    if (filterJson.success) {
      populateFilterOptions(filterJson);
    }

    if (dataJson.success) {
      state.baselineOverview = dataJson;
      state.currentData = dataJson;
      renderAllViews();
      loadMetersTable();
    }
  } catch (err) {
    showToast(`Error loading ${state.category} analytics: ` + err.message, 'error');
  } finally {
    state.isFetching = false;
  }
}

// --- Populate Filter Dropdowns dynamically ---
function populateFilterOptions(data) {
  // Circles
  const circleSelect = document.getElementById('filterCircle');
  if (circleSelect) {
    circleSelect.innerHTML = '<option value="ALL">All Circles (SBPDCL)</option>';
    (data.circles || []).forEach(c => {
      circleSelect.innerHTML += `<option value="${c}">${c}</option>`;
    });
  }

  // Makes
  const makeSelect = document.getElementById('filterMake');
  if (makeSelect) {
    makeSelect.innerHTML = '<option value="ALL">All Makes</option>';
    (data.makes || []).forEach(m => {
      makeSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });
  }

  // Dynamic Phase / Rating / Voltage
  const phaseSelect = document.getElementById('filterPhase');
  if (phaseSelect) {
    if (state.category === 'consumer') {
      phaseSelect.innerHTML = `
        <option value="ALL">All Phases</option>
        <option value="1 PH">1 PH (Single Phase)</option>
        <option value="3 PH">3 PH (3-Phase Combined)</option>
      `;
    } else if (state.category === 'dt') {
      phaseSelect.innerHTML = '<option value="ALL">All Ratings (kVA)</option>';
      (data.dtr_ratings || []).forEach(r => {
        phaseSelect.innerHTML += `<option value="${r}">${r} kVA</option>`;
      });
    } else if (state.category === 'feeder') {
      phaseSelect.innerHTML = `
        <option value="ALL">All Voltage Levels</option>
        <option value="11 KV">11 KV Feeders</option>
        <option value="33 KV">33 KV Feeders</option>
      `;
    } else if (state.category === 'complaint') {
      phaseSelect.innerHTML = '<option value="ALL">All Main Remarks</option>';
      (data.main_remarks || []).forEach(r => {
        phaseSelect.innerHTML += `<option value="${r}">${r}</option>`;
      });
    }
  }

  // Dynamic Comm Tech / Feeder Type / DTR Type / Sub Remarks
  const commSelect = document.getElementById('filterCommunication');
  if (commSelect) {
    if (state.category === 'consumer') {
      commSelect.innerHTML = `
        <option value="ALL">All Technologies</option>
        <option value="GPRS">GPRS (HES-Airtel)</option>
        <option value="RF">RF (HES-Cyan)</option>
      `;
    } else if (state.category === 'dt') {
      commSelect.innerHTML = `
        <option value="ALL">All DTR Types</option>
        <option value="General">General</option>
        <option value="Other">Other</option>
      `;
    } else if (state.category === 'feeder') {
      commSelect.innerHTML = '<option value="ALL">All Feeder Types</option>';
      (data.feeder_types || ['Rural', 'Urban']).forEach(t => {
        commSelect.innerHTML += `<option value="${t}">${t}</option>`;
      });
    } else if (state.category === 'complaint') {
      commSelect.innerHTML = '<option value="ALL">All Sub Remarks</option>';
      (data.sub_remarks || []).forEach(sr => {
        commSelect.innerHTML += `<option value="${sr}">${sr}</option>`;
      });
    }
  }

  // Dynamic Status Select Options
  const statusSelect = document.getElementById('filterStatus');
  if (statusSelect) {
    if (state.category === 'complaint') {
      statusSelect.innerHTML = `
        <option value="ALL">All Ticket Statuses</option>
        <option value="Closed">Closed / Resolved</option>
        <option value="Pending">Pending</option>
        <option value="Attended">Attended</option>
        <option value="Notify to Discom">Notify to Discom</option>
        <option value="MR Required">MR Required</option>
        <option value="Notify to SI">Notify to SI</option>
      `;
    } else {
      statusSelect.innerHTML = `
        <option value="ALL">All Meters (Installed Base)</option>
        <option value="ALL_NON_COMM">Non-Communicating</option>
        <option value="3-7D">3 – 7 Days</option>
        <option value=">7D">&gt; 7 Days</option>
        <option value="COMM_LTE_3D">Communicating</option>
        <option value="NEVER">Never Communicated</option>
      `;
    }
  }

  // Dynamic Aging Select Options
  const agingSelect = document.getElementById('filterAging');
  if (agingSelect) {
    if (state.category === 'complaint') {
      agingSelect.innerHTML = `
        <option value="ALL">All Aging Buckets</option>
        <option value="<= 2 Days">&le; 2 Days</option>
        <option value="3 - 7 Days">3 - 7 Days</option>
        <option value="8 - 15 Days">8 - 15 Days</option>
        <option value="16 - 30 Days">16 - 30 Days</option>
        <option value="> 30 Days">&gt; 30 Days</option>
      `;
    } else {
      agingSelect.innerHTML = `
        <option value="ALL">All Intervals</option>
        <option value="<= 3 Days">&le; 3 Days (Comm)</option>
        <option value="4 - 7 Days">4 - 7 Days</option>
        <option value="8 - 15 Days">8 - 15 Days</option>
        <option value="16 - 30 Days">16 - 30 Days</option>
        <option value="31 - 60 Days">31 - 60 Days</option>
        <option value="61 - 90 Days">61 - 90 Days</option>
        <option value="91 - 180 Days">91 - 180 Days</option>
        <option value="> 180 Days">&gt; 180 Days</option>
        <option value="Never Communicated">Never Communicated</option>
      `;
    }
  }
}

// --- Cascade Division & Section Dropdowns ---
function updateDivisionDropdown() {
  const divSelect = document.getElementById('filterDivision');
  if (!divSelect) return;
  divSelect.innerHTML = '<option value="ALL">All Divisions</option>';
  if (!state.currentData || !state.currentData.divisions) return;

  const circle = state.filters.circle;
  let divisions = state.currentData.divisions || [];
  if (circle !== 'ALL') {
    divisions = divisions.filter(d => d.circle === circle);
  }

  const uniqueDivs = [...new Set(divisions.map(d => d.division).filter(Boolean))].sort();
  uniqueDivs.forEach(d => {
    divSelect.innerHTML += `<option value="${d}">${d}</option>`;
  });

  updateSectionDropdown();
}

function updateSectionDropdown() {
  const secSelect = document.getElementById('filterSection');
  if (!secSelect) return;
  secSelect.innerHTML = '<option value="ALL">All Sections</option>';
  if (!state.currentData || !state.currentData.sections) return;

  const { circle, division } = state.filters;
  let sections = state.currentData.sections || [];
  if (circle !== 'ALL') sections = sections.filter(s => s.circle === circle);
  if (division !== 'ALL') sections = sections.filter(s => s.division === division);

  const uniqueSecs = [...new Set(sections.map(s => s.section).filter(Boolean))].sort();
  uniqueSecs.forEach(s => {
    secSelect.innerHTML += `<option value="${s}">${s}</option>`;
  });
}

// --- Fetch Filtered Analytics (Dynamic Slicing) ---
let filterDebounce = null;
async function fetchFilteredAnalytics() {
  try {
    const params = new URLSearchParams({
      category: state.category,
      voltage: state.voltage,
      inactive: state.inactive || 'exclude',
      circle: state.filters.circle,
      division: state.filters.division,
      section: state.filters.section,
      phase: state.filters.phase,
      dtr_rating: state.filters.phase,
      make: state.filters.make,
      communication: state.filters.communication,
      feeder_type: state.filters.communication,
      status: state.filters.status,
      aging_bucket: state.filters.aging,
      search: state.filters.search
    });

    const res = await fetch(`/api/analytics/filtered?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to slice analytics');

    state.currentData = json;
    renderAllViews();
    loadMetersTable();

  } catch (err) {
    showToast('Filter error: ' + err.message, 'error');
  }
}

function renderAllViews() {
  renderKPIs();
  renderCharts();
  renderAllTables();
}

// --- Render KPI Cards (7 Core Metrics in Single Row) ---
function renderKPIs() {
  if (!state.currentData) return;
  const kpi = state.currentData.kpi || state.currentData.kpis || state.currentData.overview || {};

  if (state.category === 'complaint') {
    const totalTickets = Number(kpi.total_tickets || kpi.total_installed) || 0;
    const closedTickets = Number(kpi.closed_tickets || kpi.total_communicating) || 0;
    const openTickets = Number(kpi.open_tickets || kpi.total_non_comm) || 0;
    const resRate = kpi.resolution_pct !== undefined ? kpi.resolution_pct : (totalTickets > 0 ? ((closedTickets / totalTickets) * 100).toFixed(2) : 0);
    const pendingTickets = Number(kpi.pending_tickets) || 0;
    const attendedTickets = Number(kpi.attended_tickets) || 0;
    const discomTickets = Number(kpi.notify_discom_tickets) || 0;
    const age3_7d = Number(kpi.age_3_7d) || 0;
    const ageGt7d = (Number(kpi.age_8_15d) || 0) + (Number(kpi.age_16_30d) || 0) + (Number(kpi.age_gt_30d) || 0);
    const ageGt30d = Number(kpi.age_gt_30d) || 0;

    // 1. Total Installation -> Total Complaints
    const elTotal = document.getElementById('kpiTotalInstalled');
    if (elTotal) elTotal.textContent = formatNum(totalTickets);
    const elSubTotal = document.getElementById('kpiSubtextTotal');
    if (elSubTotal) elSubTotal.textContent = 'O&M Complaint Base';

    // 2. Communicating -> Closed / Resolved
    const elComm = document.getElementById('kpiTotalComm') || document.getElementById('kpiCommunicating');
    if (elComm) elComm.textContent = formatNum(closedTickets);
    const elSubComm = document.getElementById('kpiSubtextComm');
    if (elSubComm) elSubComm.textContent = 'Resolved / Closed Tickets';
    const elCommPill = document.getElementById('kpiCommRatePill');
    if (elCommPill) elCommPill.innerHTML = `<i data-lucide="check-circle-2"></i> ${resRate}% Resolution`;

    // 3. Non-Communicating -> Open / Pending
    const elNonComm = document.getElementById('kpiTotalNonComm');
    if (elNonComm) elNonComm.textContent = formatNum(openTickets);
    const elNonCommRate = document.getElementById('kpiNonCommPctPill') || document.getElementById('kpiNonCommRate');
    if (elNonCommRate) {
      const openPct = totalTickets > 0 ? ((openTickets / totalTickets) * 100).toFixed(2) : 0;
      elNonCommRate.textContent = `${openPct}% Open Backlog`;
    }
    const elSplit = document.getElementById('kpiNonCommSplit');
    if (elSplit) {
      elSplit.innerHTML = `<span>Pending: ${formatNum(pendingTickets)}</span> • <span>Attended: ${formatNum(attendedTickets)}</span> • <span>Discom: ${formatNum(discomTickets)}</span>`;
    }

    // 4. % Communication -> % Resolution Rate
    const elRate = document.getElementById('kpiCommRate');
    if (elRate) elRate.textContent = `${resRate}%`;
    const elBar = document.getElementById('kpiCommRateBar');
    if (elBar) elBar.style.width = `${Math.min(100, Math.max(0, resRate))}%`;

    // 5. 3 - 7 Days
    const el4_7 = document.getElementById('kpiNonComm4_7D');
    if (el4_7) el4_7.textContent = formatNum(age3_7d);

    // 6. > 7 Days
    const elGt7 = document.getElementById('kpiNonCommGt7D');
    if (elGt7) elGt7.textContent = formatNum(ageGt7d);

    // 7. Never Communicated -> >30 Days Critical
    const elNever = document.getElementById('kpiNeverComm');
    if (elNever) elNever.textContent = formatNum(ageGt30d);
    const elNeverPill = document.getElementById('kpiNeverCommPill');
    if (elNeverPill) elNeverPill.innerHTML = `<i data-lucide="alert-circle"></i> >30 Days Aging`;

    if (window.lucide) lucide.createIcons();
    return;
  }

  const totalInstalled = Number(kpi.total_installed) || 0;
  const totalComm = Number(kpi.total_communicating) || 0;
  const totalNonComm = Number(kpi.total_non_comm) || 0;
  const commRate = totalInstalled > 0 ? (kpi.comm_percentage !== undefined ? kpi.comm_percentage : ((totalComm / totalInstalled) * 100).toFixed(2)) : 0;
  const nonComm4_7D = Number(kpi.non_comm_4_7d) || 0;
  const nonCommGt7D = Number(kpi.non_comm_gt_7d) || 0;
  const neverComm = Number(kpi.never_communicated) || 0;
  const neverCommPct = totalInstalled > 0 ? ((neverComm / totalInstalled) * 100).toFixed(2) : 0;

  // 1. Total Installation
  const elTotal = document.getElementById('kpiTotalInstalled');
  if (elTotal) elTotal.textContent = formatNum(totalInstalled);
  const elSubTotal = document.getElementById('kpiSubtextTotal');
  if (elSubTotal) {
    if (state.category === 'consumer') elSubTotal.textContent = 'Consumer Smart Meters';
    else if (state.category === 'dt') elSubTotal.textContent = 'Distribution Transformers (DTR)';
    else if (state.category === 'feeder') elSubTotal.textContent = '11 kV & 33 kV Feeders';
  }

  // 2. Communicating
  const elComm = document.getElementById('kpiTotalComm') || document.getElementById('kpiCommunicating');
  if (elComm) elComm.textContent = formatNum(totalComm);
  const elSubComm = document.getElementById('kpiSubtextComm');
  if (elSubComm) {
    if (state.category === 'consumer') elSubComm.textContent = 'Active within 3 days';
    else if (state.category === 'dt') elSubComm.textContent = 'Active DTR meters';
    else if (state.category === 'feeder') elSubComm.textContent = 'Active feeder meters';
  }
  const elCommPill = document.getElementById('kpiCommRatePill');
  if (elCommPill) elCommPill.innerHTML = `<i data-lucide="check-circle-2"></i> ${commRate}% Communication`;

  // 3. Non-Communicating
  const elNonComm = document.getElementById('kpiTotalNonComm');
  if (elNonComm) elNonComm.textContent = formatNum(totalNonComm);
  const elNonCommRate = document.getElementById('kpiNonCommPctPill') || document.getElementById('kpiNonCommRate');
  if (elNonCommRate) {
    const ncPct = totalInstalled > 0 ? ((totalNonComm / totalInstalled) * 100).toFixed(2) : 0;
    elNonCommRate.textContent = `${ncPct}% Non-Comm`;
  }
  const elSplit = document.getElementById('kpiNonCommSplit');
  if (elSplit) {
    if (state.category === 'consumer') {
      const airtel = formatNum(kpi.non_comm_airtel || 0);
      const cyan = formatNum(kpi.non_comm_cyan || 0);
      elSplit.innerHTML = `<span>Airtel: ${airtel}</span> • <span>Cyan: ${cyan}</span>`;
    } else if (state.category === 'feeder') {
      const v11 = formatNum(kpi.non_comm_11kv || 0);
      const v33 = formatNum(kpi.non_comm_33kv || 0);
      elSplit.innerHTML = `<span>11 KV: ${v11}</span> • <span>33 KV: ${v33}</span>`;
    } else {
      elSplit.innerHTML = `<span>Non-Comm: ${formatNum(totalNonComm - neverComm)}</span> • <span>Never: ${formatNum(neverComm)}</span>`;
    }
  }

  // 4. % Communication
  const elRate = document.getElementById('kpiCommRate');
  if (elRate) elRate.textContent = `${commRate}%`;
  const elBar = document.getElementById('kpiCommRateBar');
  if (elBar) elBar.style.width = `${Math.min(100, Math.max(0, commRate))}%`;

  // 5. 3 - 7 Days
  const el4_7 = document.getElementById('kpiNonComm4_7D');
  if (el4_7) el4_7.textContent = formatNum(nonComm4_7D);

  // 6. > 7 Days
  const elGt7 = document.getElementById('kpiNonCommGt7D');
  if (elGt7) elGt7.textContent = formatNum(nonCommGt7D);

  // 7. Never Communicated
  const elNever = document.getElementById('kpiNeverComm');
  if (elNever) elNever.textContent = formatNum(neverComm);
  const elNeverPill = document.getElementById('kpiNeverCommPill');
  if (elNeverPill) elNeverPill.innerHTML = `<i data-lucide="wifi-off"></i> ${neverCommPct}% of Base`;

  if (window.lucide) lucide.createIcons();
}

// --- Render Charts ---
function renderCharts() {
  renderCircleCommChart();
  renderAgingChart();
  renderDateWiseCharts();
}

function renderDateWiseCharts() {
  const trendCtx = document.getElementById('chartDateTrend')?.getContext('2d');
  const resCtx = document.getElementById('chartDateResolution')?.getContext('2d');
  if (!trendCtx || !resCtx) return;

  if (state.charts.dateTrend) state.charts.dateTrend.destroy();
  if (state.charts.dateResolution) state.charts.dateResolution.destroy();

  const trendData = (state.currentData?.date_trend || []).slice(-30); // show last 30 active days
  if (trendData.length === 0) return;

  const labels = trendData.map(d => d.day);
  const totalTickets = trendData.map(d => Number(d.total_tickets) || 0);
  const closedTickets = trendData.map(d => Number(d.closed_tickets) || 0);
  const resPcts = trendData.map(d => Number(d.resolution_pct) || 0);

  state.charts.dateTrend = new Chart(trendCtx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Created',
          data: totalTickets,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        },
        {
          label: 'Closed / Resolved',
          data: closedTickets,
          backgroundColor: '#10b981',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#9ca3af', boxWidth: 12 } },
        datalabels: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } } }
      }
    }
  });

  state.charts.dateResolution = new Chart(resCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '% Resolution Rate',
          data: resPcts,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#9ca3af', boxWidth: 12 } },
        datalabels: { display: false }
      },
      scales: {
        y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
        x: { grid: { display: false }, ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } } }
      }
    }
  });
}

function renderCircleCommChart() {
  const ctx = document.getElementById('chartCircleComm')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.circleComm) {
    state.charts.circleComm.destroy();
  }

  const circles = state.currentData.circles || [];
  const sorted = [...circles].sort((a, b) => (b.comm_pct || 0) - (a.comm_pct || 0));

  const labels = sorted.map(c => c.circle);
  const data = sorted.map(c => Number(c.comm_pct) || 0);

  state.charts.circleComm = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: state.category === 'complaint' ? 'Resolution %' : 'Communication %',
        data,
        backgroundColor: data.map(v => v >= 95 ? '#10b981' : v >= 90 ? '#06b6d4' : v >= 85 ? '#f59e0b' : '#ef4444'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: v => `${v}%`,
          font: { weight: 'bold', size: 10 },
          color: '#9ca3af'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function renderAgingChart() {
  const ctx = document.getElementById('chartAging')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.aging) {
    state.charts.aging.destroy();
  }

  const buckets = state.currentData.aging_buckets || state.currentData.aging || [];
  const labels = buckets.map(b => b.bucket);
  const data = buckets.map(b => Number(b.total_count) || 0);

  state.charts.aging = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: state.category === 'complaint' ? 'Tickets Count' : 'Meters Count',
        data,
        backgroundColor: '#06b6d4',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          anchor: 'end',
          align: 'top',
          formatter: v => formatK(v),
          font: { weight: 'bold', size: 10 },
          color: '#9ca3af'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function rebuildCharts() {
  renderCharts();
}

// --- Render Tables ---
function renderAllTables() {
  renderDateWiseTable();
  renderCircleTable();
  renderDivisionTable();
  renderSectionTable();
  renderDimensionsTable();
  renderMakeTable();
  renderTechTable();
  renderAgingTable();
}

function renderDateWiseTable() {
  const tbody = document.getElementById('dateWiseTableBody');
  if (!tbody) return;
  const trendData = state.currentData?.date_trend || [];

  if (trendData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">No date records found for selected filters</td></tr>';
    return;
  }

  // Sort descending by date (most recent first)
  const sorted = [...trendData].sort((a, b) => (b.day || '').localeCompare(a.day || ''));
  let totTickets = 0, totClosed = 0, totOpen = 0;

  const rows = sorted.map(d => {
    const t = Number(d.total_tickets) || 0;
    const c = Number(d.closed_tickets) || 0;
    const o = Number(d.open_tickets) || 0;
    const rPct = d.resolution_pct !== undefined ? d.resolution_pct : (t > 0 ? ((c / t) * 100).toFixed(2) : 0);
    totTickets += t;
    totClosed += c;
    totOpen += o;

    return `
      <tr>
        <td><strong>${d.day}</strong></td>
        <td>${formatNum(t)}</td>
        <td class="text-emerald font-semibold">${formatNum(c)}</td>
        <td class="text-amber font-semibold">${formatNum(o)}</td>
        <td><span class="badge ${rPct >= 80 ? 'badge-success' : (rPct >= 50 ? 'badge-warning' : 'badge-danger')}">${rPct}%</span></td>
        <td>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">
            Closed: ${formatNum(c)} (${rPct}%) • Open: ${formatNum(o)}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const overallPct = totTickets > 0 ? ((totClosed / totTickets) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td><strong>TOTAL (${sorted.length} Days)</strong></td>
      <td>${formatNum(totTickets)}</td>
      <td class="text-emerald font-bold">${formatNum(totClosed)}</td>
      <td class="text-amber font-bold">${formatNum(totOpen)}</td>
      <td><span class="badge ${overallPct >= 80 ? 'badge-success' : 'badge-warning'}">${overallPct}%</span></td>
      <td>--</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderCircleTable() {
  const tbody = document.getElementById('circleTableBody');
  if (!tbody) return;
  const circles = state.currentData.circles || [];

  if (circles.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No matching records</td></tr>';
    return;
  }

  if (state.category === 'complaint') {
    let totTickets = 0, totClosed = 0, totOpen = 0, totLte2 = 0, tot3_7 = 0, totGt7 = 0;
    const rows = circles.map(c => {
      const tickets = Number(c.total_tickets || c.total_installed) || 0;
      const closed = Number(c.closed_tickets || c.communicating) || 0;
      const open = Number(c.open_tickets || c.total_non_comm) || 0;
      const resPct = c.resolution_pct !== undefined ? c.resolution_pct : c.comm_pct;
      const lte2 = Number(c.age_lte_2d) || 0;
      const d3_7 = Number(c.age_3_7d) || 0;
      const gt7 = (Number(c.age_8_15d) || 0) + (Number(c.age_16_30d) || 0) + (Number(c.age_gt_30d) || 0);

      totTickets += tickets;
      totClosed += closed;
      totOpen += open;
      totLte2 += lte2;
      tot3_7 += d3_7;
      totGt7 += gt7;

      return `
        <tr>
          <td><strong>${c.circle}</strong></td>
          <td>${formatNum(tickets)}</td>
          <td class="text-emerald font-semibold">${formatNum(closed)}</td>
          <td class="text-amber font-semibold">${formatNum(open)}</td>
          <td><span class="badge ${resPct >= 80 ? 'badge-success' : (resPct >= 50 ? 'badge-warning' : 'badge-danger')}">${resPct}%</span></td>
          <td>${formatNum(lte2)}</td>
          <td>${formatNum(d3_7)}</td>
          <td class="text-crimson">${formatNum(gt7)}</td>
        </tr>
      `;
    }).join('');

    const overallResPct = totTickets > 0 ? ((totClosed / totTickets) * 100).toFixed(2) : 0;
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL</strong></td>
        <td>${formatNum(totTickets)}</td>
        <td class="text-emerald font-bold">${formatNum(totClosed)}</td>
        <td class="text-amber font-bold">${formatNum(totOpen)}</td>
        <td><span class="badge ${overallResPct >= 80 ? 'badge-success' : 'badge-warning'}">${overallResPct}%</span></td>
        <td>${formatNum(totLte2)}</td>
        <td>${formatNum(tot3_7)}</td>
        <td class="text-crimson">${formatNum(totGt7)}</td>
      </tr>
    `;
    tbody.innerHTML = rows + totalRow;
    return;
  }

  let totInst = 0, totComm = 0, totNonComm = 0, tot4_7 = 0, totGt7 = 0, totNever = 0;

  const rows = circles.map(c => {
    totInst += Number(c.total_installed) || 0;
    totComm += Number(c.communicating) || 0;
    totNonComm += Number(c.total_non_comm) || 0;
    tot4_7 += Number(c.non_comm_4_7d) || 0;
    totGt7 += Number(c.non_comm_gt_7d) || 0;
    totNever += Number(c.never_communicated) || 0;

    return `
      <tr>
        <td><strong>${c.circle}</strong></td>
        <td>${formatNum(c.total_installed)}</td>
        <td class="text-emerald font-semibold">${formatNum(c.communicating)}</td>
        <td class="text-amber font-semibold">${formatNum(c.total_non_comm)}</td>
        <td><span class="badge ${c.comm_pct >= 95 ? 'badge-success' : 'badge-warning'}">${c.comm_pct}%</span></td>
        <td>${formatNum(c.non_comm_4_7d || 0)}</td>
        <td class="text-crimson">${formatNum(c.non_comm_gt_7d || 0)}</td>
        <td class="text-rose">${formatNum(c.never_communicated || 0)}</td>
      </tr>
    `;
  }).join('');

  const overallCommPct = totInst > 0 ? ((totComm / totInst) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td><strong>TOTAL</strong></td>
      <td>${formatNum(totInst)}</td>
      <td class="text-emerald font-bold">${formatNum(totComm)}</td>
      <td class="text-amber font-bold">${formatNum(totNonComm)}</td>
      <td><span class="badge ${overallCommPct >= 95 ? 'badge-success' : 'badge-warning'}">${overallCommPct}%</span></td>
      <td>${formatNum(tot4_7)}</td>
      <td class="text-crimson">${formatNum(totGt7)}</td>
      <td class="text-rose">${formatNum(totNever)}</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderDivisionTable() {
  const tbody = document.getElementById('divisionTableBody');
  if (!tbody) return;
  const divisions = state.currentData.divisions || [];

  if (divisions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No matching records</td></tr>';
    return;
  }

  let totInst = 0, totComm = 0, totNonComm = 0, tot4_7 = 0, totGt7 = 0, totNever = 0;

  const rows = divisions.map(d => {
    totInst += Number(d.total_installed) || 0;
    totComm += Number(d.communicating) || 0;
    totNonComm += Number(d.total_non_comm) || 0;
    tot4_7 += Number(d.non_comm_4_7d) || 0;
    totGt7 += Number(d.non_comm_gt_7d) || 0;
    totNever += Number(d.never_communicated) || 0;

    return `
      <tr>
        <td>${d.circle}</td>
        <td><strong>${d.division}</strong></td>
        <td>${formatNum(d.total_installed)}</td>
        <td class="text-emerald">${formatNum(d.communicating)}</td>
        <td class="text-amber">${formatNum(d.total_non_comm)}</td>
        <td><span class="badge ${d.comm_pct >= 95 ? 'badge-success' : 'badge-warning'}">${d.comm_pct}%</span></td>
        <td>${formatNum(d.non_comm_4_7d || 0)}</td>
        <td class="text-crimson">${formatNum(d.non_comm_gt_7d || 0)}</td>
        <td class="text-rose">${formatNum(d.never_communicated || 0)}</td>
      </tr>
    `;
  }).join('');

  const overallCommPct = totInst > 0 ? ((totComm / totInst) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td colspan="2"><strong>TOTAL (${divisions.length} Divisions)</strong></td>
      <td>${formatNum(totInst)}</td>
      <td class="text-emerald font-bold">${formatNum(totComm)}</td>
      <td class="text-amber font-bold">${formatNum(totNonComm)}</td>
      <td><span class="badge ${overallCommPct >= 95 ? 'badge-success' : 'badge-warning'}">${overallCommPct}%</span></td>
      <td>${formatNum(tot4_7)}</td>
      <td class="text-crimson">${formatNum(totGt7)}</td>
      <td class="text-rose">${formatNum(totNever)}</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderSectionTable() {
  const tbody = document.getElementById('sectionTableBody');
  if (!tbody) return;
  const sections = state.currentData.sections || [];

  if (sections.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No matching records</td></tr>';
    return;
  }

  let totInst = 0, totComm = 0, totNonComm = 0, tot4_7 = 0, totGt7 = 0;

  const rows = sections.slice(0, 150).map(s => {
    totInst += Number(s.total_installed) || 0;
    totComm += Number(s.communicating) || 0;
    totNonComm += Number(s.total_non_comm) || 0;
    tot4_7 += Number(s.non_comm_4_7d) || 0;
    totGt7 += Number(s.non_comm_gt_7d) || 0;

    return `
      <tr>
        <td>${s.circle}</td>
        <td>${s.division}</td>
        <td><strong>${s.section}</strong></td>
        <td>${formatNum(s.total_installed)}</td>
        <td class="text-emerald">${formatNum(s.communicating)}</td>
        <td class="text-amber">${formatNum(s.total_non_comm)}</td>
        <td><span class="badge ${s.comm_pct >= 95 ? 'badge-success' : 'badge-warning'}">${s.comm_pct}%</span></td>
        <td>${formatNum(s.non_comm_4_7d || 0)}</td>
        <td class="text-crimson">${formatNum(s.non_comm_gt_7d || 0)}</td>
      </tr>
    `;
  }).join('');

  const overallCommPct = totInst > 0 ? ((totComm / totInst) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td colspan="3"><strong>TOTAL (Displayed Sections)</strong></td>
      <td>${formatNum(totInst)}</td>
      <td class="text-emerald font-bold">${formatNum(totComm)}</td>
      <td class="text-amber font-bold">${formatNum(totNonComm)}</td>
      <td><span class="badge ${overallCommPct >= 95 ? 'badge-success' : 'badge-warning'}">${overallCommPct}%</span></td>
      <td>${formatNum(tot4_7)}</td>
      <td class="text-crimson">${formatNum(totGt7)}</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderDimensionsTable() {
  const tbody = document.getElementById('phaseTableBody');
  if (!tbody) return;
  const dims = state.currentData.dimensions || state.currentData.phases || [];

  if (dims.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No matching records</td></tr>';
    return;
  }

  let totInst = 0, totComm = 0, totNonComm = 0, tot4_7 = 0, totGt7 = 0;

  const rows = dims.map(d => {
    const dimName = d.dimension_name || d.phase || 'N/A';
    totInst += Number(d.total_installed) || 0;
    totComm += Number(d.communicating) || 0;
    totNonComm += Number(d.total_non_comm) || 0;
    tot4_7 += Number(d.non_comm_4_7d) || 0;
    totGt7 += Number(d.non_comm_gt_7d) || 0;

    return `
      <tr>
        <td><strong>${dimName}</strong></td>
        <td>${formatNum(d.total_installed)}</td>
        <td class="text-emerald">${formatNum(d.communicating)}</td>
        <td class="text-amber">${formatNum(d.total_non_comm)}</td>
        <td><span class="badge ${d.comm_pct >= 95 ? 'badge-success' : 'badge-warning'}">${d.comm_pct}%</span></td>
        <td>${formatNum(d.non_comm_4_7d || 0)}</td>
        <td class="text-crimson">${formatNum(d.non_comm_gt_7d || 0)}</td>
      </tr>
    `;
  }).join('');

  const overallCommPct = totInst > 0 ? ((totComm / totInst) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td><strong>TOTAL</strong></td>
      <td>${formatNum(totInst)}</td>
      <td class="text-emerald font-bold">${formatNum(totComm)}</td>
      <td class="text-amber font-bold">${formatNum(totNonComm)}</td>
      <td><span class="badge ${overallCommPct >= 95 ? 'badge-success' : 'badge-warning'}">${overallCommPct}%</span></td>
      <td>${formatNum(tot4_7)}</td>
      <td class="text-crimson">${formatNum(totGt7)}</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderMakeTable() {
  const tbody = document.getElementById('makeTableBody');
  if (!tbody) return;
  const makes = state.currentData.makes || [];

  if (makes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No matching records</td></tr>';
    return;
  }

  let totInst = 0, totComm = 0, totNonComm = 0, tot4_7 = 0, totGt7 = 0;

  const rows = makes.map(m => {
    totInst += Number(m.total_installed) || 0;
    totComm += Number(m.communicating) || 0;
    totNonComm += Number(m.total_non_comm) || 0;
    tot4_7 += Number(m.non_comm_4_7d) || 0;
    totGt7 += Number(m.non_comm_gt_7d) || 0;

    return `
      <tr>
        <td><strong>${m.make || 'Unknown'}</strong></td>
        <td>${formatNum(m.total_installed)}</td>
        <td class="text-emerald">${formatNum(m.communicating)}</td>
        <td class="text-amber">${formatNum(m.total_non_comm)}</td>
        <td><span class="badge ${m.comm_pct >= 95 ? 'badge-success' : 'badge-warning'}">${m.comm_pct}%</span></td>
        <td>${formatNum(m.non_comm_4_7d || 0)}</td>
        <td class="text-crimson">${formatNum(m.non_comm_gt_7d || 0)}</td>
      </tr>
    `;
  }).join('');

  const overallCommPct = totInst > 0 ? ((totComm / totInst) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td><strong>TOTAL (${makes.length} Makes)</strong></td>
      <td>${formatNum(totInst)}</td>
      <td class="text-emerald font-bold">${formatNum(totComm)}</td>
      <td class="text-amber font-bold">${formatNum(totNonComm)}</td>
      <td><span class="badge ${overallCommPct >= 95 ? 'badge-success' : 'badge-warning'}">${overallCommPct}%</span></td>
      <td>${formatNum(tot4_7)}</td>
      <td class="text-crimson">${formatNum(totGt7)}</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderTechTable() {
  const tbody = document.getElementById('commTableBody');
  if (!tbody) return;
  const tech = state.currentData.technology || [];

  if (tech.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center">No matching records</td></tr>';
    return;
  }

  let totInst = 0, totComm = 0, totNonComm = 0, tot4_7 = 0, totGt7 = 0;

  const rows = tech.map(t => {
    totInst += Number(t.total_installed) || 0;
    totComm += Number(t.communicating) || 0;
    totNonComm += Number(t.total_non_comm) || 0;
    tot4_7 += Number(t.non_comm_4_7d) || 0;
    totGt7 += Number(t.non_comm_gt_7d) || 0;

    return `
      <tr>
        <td><strong>${t.hes_source || '--'}</strong></td>
        <td>${t.communication_type || '--'}</td>
        <td>${formatNum(t.total_installed)}</td>
        <td class="text-emerald">${formatNum(t.communicating)}</td>
        <td class="text-amber">${formatNum(t.total_non_comm)}</td>
        <td><span class="badge ${t.comm_pct >= 95 ? 'badge-success' : 'badge-warning'}">${t.comm_pct}%</span></td>
        <td>${formatNum(t.non_comm_4_7d || 0)}</td>
        <td class="text-crimson">${formatNum(t.non_comm_gt_7d || 0)}</td>
        <td>${t.avg_ageing ? t.avg_ageing + ' D' : '--'}</td>
      </tr>
    `;
  }).join('');

  const overallCommPct = totInst > 0 ? ((totComm / totInst) * 100).toFixed(2) : 0;
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td colspan="2"><strong>TOTAL</strong></td>
      <td>${formatNum(totInst)}</td>
      <td class="text-emerald font-bold">${formatNum(totComm)}</td>
      <td class="text-amber font-bold">${formatNum(totNonComm)}</td>
      <td><span class="badge ${overallCommPct >= 95 ? 'badge-success' : 'badge-warning'}">${overallCommPct}%</span></td>
      <td>${formatNum(tot4_7)}</td>
      <td class="text-crimson">${formatNum(totGt7)}</td>
      <td>--</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderAgingTable() {
  const tbody = document.getElementById('agingTableBody');
  if (!tbody) return;
  const buckets = state.currentData.aging_buckets || state.currentData.aging || [];

  const total = buckets.reduce((acc, b) => acc + (Number(b.total_count) || 0), 0);

  const rows = buckets.map(b => {
    const cnt = Number(b.total_count) || 0;
    const pct = total > 0 ? ((cnt / total) * 100).toFixed(2) : 0;
    return `
      <tr>
        <td><strong>${b.bucket}</strong></td>
        <td>${formatNum(cnt)}</td>
        <td>${pct}%</td>
      </tr>
    `;
  }).join('');

  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td><strong>TOTAL SILENT BASE</strong></td>
      <td>${formatNum(total)}</td>
      <td>100.0%</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;
}

function renderMetersTable(meters) {
  const tbody = document.getElementById('meterExplorerTableBody');
  if (!tbody) return;

  if (meters.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="text-center">No meters matching criteria</td></tr>';
    return;
  }

  tbody.innerHTML = meters.map(m => {
    let statusPill = `<span class="status-pill status-${(m.comm_category || '').toLowerCase().replace(/[^a-z0-9]/g, '-')}">${m.comm_category || 'Communicating'}</span>`;
    if (state.category === 'feeder' && m.is_inactive === 1) {
      statusPill += ` <span class="pill pill-crimson" style="font-size: 0.68rem; margin-top: 2px; display: inline-flex;">Inactive Feeder</span>`;
    } else if (state.category === 'dt' && m.is_inactive === 1) {
      statusPill += ` <span class="pill pill-crimson" style="font-size: 0.68rem; margin-top: 2px; display: inline-flex;">Inactive DTR</span>`;
    }

    if (state.category === 'consumer') {
      const isRaised = m.ticket_raised === 'YES';
      const raisedBadge = isRaised
        ? `<span class="badge badge-success" style="font-size: 0.72rem; font-weight: 700; padding: 2px 7px;"><i data-lucide="check" style="width: 11px; height: 11px; vertical-align: middle;"></i> YES</span>`
        : `<span class="badge badge-crimson" style="font-size: 0.72rem; font-weight: 700; padding: 2px 7px;"><i data-lucide="x" style="width: 11px; height: 11px; vertical-align: middle;"></i> NO</span>`;

      let statusBadge = `<span class="status-pill status-neutral" style="font-size: 0.72rem;">No Ticket</span>`;
      if (isRaised) {
        const st = m.ticket_status || 'Pending';
        if (st === 'Pending') statusBadge = `<span class="status-pill status-3-7d font-semibold" style="font-size: 0.72rem;">Pending</span>`;
        else if (st === 'Notify to Discom') statusBadge = `<span class="status-pill" style="background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.3); font-size: 0.72rem; font-weight: 600;">Discom Action</span>`;
        else if (st === 'Attended') statusBadge = `<span class="status-pill" style="background: rgba(6,182,212,0.15); color: #22d3ee; border: 1px solid rgba(6,182,212,0.3); font-size: 0.72rem; font-weight: 600;">Attended</span>`;
        else if (st === 'Closed') statusBadge = `<span class="status-pill" style="background: rgba(168,85,247,0.15); color: #c084fc; border: 1px solid rgba(168,85,247,0.3); font-size: 0.72rem; font-weight: 600;" title="Closed in O&M but meter is currently silent">Closed (Silent)</span>`;
        else if (st === 'MR Required') statusBadge = `<span class="status-pill" style="background: rgba(249,115,22,0.15); color: #fb923c; border: 1px solid rgba(249,115,22,0.3); font-size: 0.72rem; font-weight: 600;">MR Required</span>`;
        else statusBadge = `<span class="status-pill status-neutral" style="font-size: 0.72rem;">${st}</span>`;
      }

      const ticketNoDisplay = isRaised && m.ticket_no && m.ticket_no !== '-'
        ? `<span class="mono-badge font-bold" style="color: var(--accent-cyan); font-size: 0.76rem;">${m.ticket_no}</span>`
        : `<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>`;

      const categoryRemarks = isRaised && m.main_remarks && m.main_remarks !== '-'
        ? `<div style="max-width: 170px; line-height: 1.25;"><span style="font-size: 0.78rem; font-weight: 600; color: #fff;">${m.main_remarks}</span>${m.sub_remarks && m.sub_remarks !== m.main_remarks && m.sub_remarks !== '-' ? `<div style="font-size: 0.72rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.sub_remarks}</div>` : ''}</div>`
        : `<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>`;

      const ticketDateDisplay = isRaised && m.ticket_date && m.ticket_date !== '-'
        ? `<div style="font-size: 0.76rem; white-space: nowrap;">${m.ticket_date}<div style="color: var(--text-muted); font-size: 0.7rem;">(${m.ticket_aging}d age)</div></div>`
        : `<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>`;

      return `
        <tr>
          <td><span class="mono-badge">${m.msn || '--'}</span></td>
          <td>${m.consumer_id || '--'}</td>
          <td><strong>${m.name || '--'}</strong></td>
          <td><span style="font-size: 0.78rem;">${m.circle || '--'} / ${m.division || '--'}<div style="color: var(--text-muted); font-size: 0.72rem;">${m.section || '--'}</div></span></td>
          <td><span style="font-size: 0.78rem;">${m.feeder || '--'}<div style="color: var(--text-muted); font-size: 0.72rem;">${m.dt_name || '--'}</div></span></td>
          <td><span style="font-size: 0.78rem;">${m.phase || '--'}<div style="color: var(--text-muted); font-size: 0.72rem;">${m.make || '--'} (${m.communication_type || '--'})</div></span></td>
          <td class="${m.ageing > 7 ? 'text-crimson font-semibold' : ''}">${m.ageing !== 999 ? m.ageing + 'd' : '--'}</td>
          <td>${statusPill}</td>
          <td class="text-center">${raisedBadge}</td>
          <td>${statusBadge}</td>
          <td>${ticketNoDisplay}</td>
          <td>${categoryRemarks}</td>
          <td>${ticketDateDisplay}</td>
        </tr>
      `;
    } else if (state.category === 'dt') {
      return `
        <tr>
          <td><span class="mono-badge">${m.msn || '--'}</span></td>
          <td>${m.dtr_code || '--'}</td>
          <td>${m.name || '--'}</td>
          <td>${m.circle || '--'}</td>
          <td>${m.division || '--'}</td>
          <td>${m.section || '--'}</td>
          <td>${m.feeder || '--'}</td>
          <td>${m.phase ? m.phase + ' kVA' : '--'}</td>
          <td>${m.make || '--'}</td>
          <td>${m.communication_type || 'Yes'}</td>
          <td>${m.last_reading_time || 'Never'}</td>
          <td class="${m.ageing > 7 ? 'text-crimson font-semibold' : ''}">${m.ageing !== 999 ? m.ageing + ' Days' : '--'}</td>
          <td>${statusPill}</td>
        </tr>
      `;
    } else if (state.category === 'complaint') {
      const statusClass = (m.comm_category === 'Closed' ? 'status-communicating' : (m.comm_category === 'Attended' ? 'status-comm_lte_3d' : 'status-3-7d'));
      const statusPill = `<span class="status-pill ${statusClass}">${m.comm_category || 'Pending'}</span>`;
      return `
        <tr>
          <td><span class="mono-badge">${m.msn || '--'}</span></td>
          <td>${m.installed_date || '--'}</td>
          <td>${m.consumer_id || '--'}</td>
          <td>${m.name || '--'}</td>
          <td>${m.circle || '--'}</td>
          <td>${m.division || '--'}</td>
          <td>${m.section || '--'}</td>
          <td>${m.feeder || m.dt_name || '--'}</td>
          <td>${m.meter_no || '--'}</td>
          <td>${statusPill}</td>
          <td class="${m.ageing > 7 ? 'text-crimson font-semibold' : ''}">${m.ageing !== undefined ? m.ageing + ' Days' : '--'}</td>
          <td>${m.phase || '--'}</td>
          <td>${m.make || '--'}</td>
        </tr>
      `;
    } else {
      // feeder
      return `
        <tr>
          <td><span class="mono-badge">${m.msn || '--'}</span></td>
          <td>${m.consumer_id || '--'}</td>
          <td>${m.name || '--'}</td>
          <td>${m.circle || '--'}</td>
          <td>${m.division || '--'}</td>
          <td>${m.section || '--'}</td>
          <td>${m.feeder || '--'}</td>
          <td>${m.phase || '--'}</td>
          <td>${m.make || '--'}</td>
          <td>${m.category || '--'}</td>
          <td>${m.last_reading_time || 'Never'}</td>
          <td class="${m.ageing > 7 ? 'text-crimson font-semibold' : ''}">${m.ageing !== 999 ? m.ageing + ' Days' : '--'}</td>
          <td>${statusPill}</td>
        </tr>
      `;
    }
  }).join('');
}

async function loadMetersTable() {
  const tbody = document.getElementById('meterExplorerTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="13" class="text-center" style="padding: 24px; color: var(--text-muted);"><i data-lucide="loader" class="spin"></i> Loading records...</td></tr>';
  if (window.lucide) lucide.createIcons();

  try {
    const ticketFilterEl = document.getElementById('filterMeterTicketStatus');
    const ticketStatusFilter = ticketFilterEl ? ticketFilterEl.value : 'ALL';

    const params = new URLSearchParams({
      category: state.category,
      voltage: state.voltage,
      inactive: state.inactive || 'exclude',
      page: state.metersPage || 1,
      limit: 50,
      search: state.filters.search || '',
      circle: state.filters.circle || 'ALL',
      division: state.filters.division || 'ALL',
      section: state.filters.section || 'ALL',
      phase: state.filters.phase || 'ALL',
      dtr_rating: state.filters.phase || 'ALL',
      make: state.filters.make || 'ALL',
      communication: state.filters.communication || 'ALL',
      feeder_type: state.filters.communication || 'ALL',
      main_remarks: state.filters.phase || 'ALL',
      sub_remarks: state.filters.communication || 'ALL',
      ticket_status: state.filters.status || 'ALL',
      status: state.filters.status || 'ALL',
      aging_bucket: state.filters.aging || 'ALL',
      ticket_status_filter: ticketStatusFilter
    });

    const res = await fetch(`/api/meters?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      renderMetersTable(json.meters || []);
      updatePagination(json.total || 0, json.page || 1, json.limit || 50, json.totalPages || 1);
    } else {
      tbody.innerHTML = `<tr><td colspan="13" class="text-center text-rose" style="padding: 20px;">Error: ${json.error || 'Failed to fetch meter records'}</td></tr>`;
    }
  } catch (err) {
    console.error('Error fetching meters:', err);
    tbody.innerHTML = `<tr><td colspan="13" class="text-center text-rose" style="padding: 20px;">Error loading records: ${err.message}</td></tr>`;
  }
}
window.loadMetersTable = loadMetersTable;
window.loadMeterTable = loadMetersTable;

function updatePagination(total, page, limit, totalPages) {
  const countHeader = document.getElementById('meterCountHeader');
  const pagInfo = document.getElementById('paginationInfo');
  const curSpan = document.getElementById('currentPageSpan');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (countHeader) countHeader.textContent = `Showing page ${page} of ${totalPages} (${formatNum(total)} matching ${state.category} meters)`;
  if (pagInfo) pagInfo.textContent = `Page ${page} of ${totalPages}`;
  if (curSpan) curSpan.textContent = page;

  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
}

// --- Setup Event Listeners ---
function setupEventListeners() {
  // Navigation Tabs
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');

      if (tab.dataset.tab === 'tab-correlation') {
        loadTicketCorrelationData();
      }
    });
  });

  // Ticket Status filter in Consumer Explorer
  const meterTicketSelect = document.getElementById('filterMeterTicketStatus');
  if (meterTicketSelect) {
    meterTicketSelect.addEventListener('change', () => {
      state.metersPage = 1;
      loadMetersTable();
    });
  }

  // Filter change handlers
  const filterInputs = [
    'filterCircle', 'filterDivision', 'filterSection',
    'filterPhase', 'filterMake', 'filterCommunication',
    'filterStatus', 'filterAging'
  ];

  filterInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        state.filters[id.replace('filter', '').toLowerCase()] = el.value;
        if (id === 'filterCircle') updateDivisionDropdown();
        if (id === 'filterDivision') updateSectionDropdown();
        onFiltersChanged();
      });
    }
  });

  // Search input in Meter Explorer
  const searchInput = document.getElementById('filterSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(meterSearchTimer);
      meterSearchTimer = setTimeout(() => {
        state.filters.search = searchInput.value.trim();
        state.metersPage = 1;
        loadMetersTable();
      }, 300);
    });
  }

  // Reset Filters
  const resetBtn = document.getElementById('resetFiltersBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetFiltersToAll();
      onFiltersChanged();
    });
  }

  // Pagination Controls
  document.getElementById('prevPageBtn')?.addEventListener('click', () => {
    if (state.metersPage > 1) {
      state.metersPage--;
      loadMetersTable();
    }
  });

  document.getElementById('nextPageBtn')?.addEventListener('click', () => {
    state.metersPage++;
    loadMetersTable();
  });

  // Export Filtered Meters
  document.getElementById('exportFilteredMetersBtn')?.addEventListener('click', () => {
    const params = new URLSearchParams({
      category: state.category,
      voltage: state.voltage,
      inactive: state.inactive || 'exclude',
      search: state.filters.search,
      circle: state.filters.circle,
      division: state.filters.division,
      section: state.filters.section,
      phase: state.filters.phase,
      dtr_rating: state.filters.phase,
      make: state.filters.make,
      communication: state.filters.communication,
      feeder_type: state.filters.communication,
      status: state.filters.status,
      aging_bucket: state.filters.aging
    });
    window.location.href = `/api/export?${params.toString()}`;
  });
}

function onFiltersChanged() {
  state.metersPage = 1;
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => {
    fetchFilteredAnalytics();
  }, 100);
}

// --- Downloader Hub & Multi-Report Synchronization ---
function setupDownloaderHub() {
  window.triggerSync = triggerSync;
  const syncModal = document.getElementById('syncModal');
  const openSyncBtn = document.getElementById('syncPortalBtn');
  const closeSyncBtn = document.getElementById('closeSyncModalBtn');
  const closeBottomBtn = document.getElementById('closeSyncModalBottomBtn');

  openSyncBtn?.addEventListener('click', () => {
    syncModal.classList.remove('hidden');
    loadReportStatuses();
    checkSyncStatus();
  });

  closeSyncBtn?.addEventListener('click', () => syncModal.classList.add('hidden'));
  closeBottomBtn?.addEventListener('click', () => syncModal.classList.add('hidden'));

  // Separate Download Quick Buttons (Top Bar)
  document.getElementById('quickSyncConsumerBtn')?.addEventListener('click', () => triggerSync('consumer'));
  document.getElementById('quickSyncDTBtn')?.addEventListener('click', () => triggerSync('dt'));
  document.getElementById('quickSyncFeederBtn')?.addEventListener('click', () => triggerSync('feeder'));
  document.getElementById('quickSyncComplaintBtn')?.addEventListener('click', () => triggerSync('complaint'));

  // Separate Download Buttons (Card Footers)
  document.getElementById('btnSyncConsumerOnly')?.addEventListener('click', () => triggerSync('consumer'));
  document.getElementById('btnSyncDTOnly')?.addEventListener('click', () => triggerSync('dt'));
  document.getElementById('btnSyncFeederOnly')?.addEventListener('click', () => triggerSync('feeder'));
  document.getElementById('btnSyncComplaintOnly')?.addEventListener('click', () => triggerSync('complaint'));

  // Refresh Status Button
  document.getElementById('btnRefreshReportStatus')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshReportStatus');
    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Checking...';
    if (window.lucide) lucide.createIcons();
    await loadReportStatuses();
    if (btn) btn.innerHTML = '<i data-lucide="refresh-cw"></i> Refresh Status';
    if (window.lucide) lucide.createIcons();
    showToast('Report disk statuses refreshed.', 'info');
  });

  // Batch Sync Selected Button
  document.getElementById('btnSyncSelected')?.addEventListener('click', () => {
    const cons = document.getElementById('chkConsumer')?.checked;
    const dt = document.getElementById('chkDT')?.checked;
    const fdr = document.getElementById('chkFeeder')?.checked;
    const comp = document.getElementById('chkComplaint')?.checked;

    if (cons && dt && fdr && comp) {
      triggerSync('all');
    } else if (comp && !cons && !dt && !fdr) {
      triggerSync('complaint');
    } else if (cons && !dt && !fdr && !comp) {
      triggerSync('consumer');
    } else if (!cons && dt && !fdr && !comp) {
      triggerSync('dt');
    } else if (!cons && !dt && fdr && !comp) {
      triggerSync('feeder');
    } else if (!cons && !dt && !fdr && !comp) {
      showToast('Please select at least one report category to sync.', 'warning');
    } else {
      triggerSync('all');
    }
  });
}

function renderReportItemList(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container || !items) return;

  container.innerHTML = items.map(item => `
    <div class="report-item">
      <div class="report-item-top">
        <div class="report-title-area">
          <span class="report-name">${item.name}</span>
          <span class="report-source-tag"><i data-lucide="compass"></i> ${item.source}</span>
        </div>
        <span class="report-status-badge ${item.exists ? 'badge-downloaded' : 'badge-missing'}">
          <i data-lucide="${item.exists ? 'check-circle-2' : 'alert-triangle'}"></i>
          ${item.exists ? 'Downloaded' : 'Not Downloaded'}
        </span>
      </div>
      <div class="report-meta-grid">
        <div class="report-meta-row">
          <span class="meta-label"><i data-lucide="clock"></i> Last Updated:</span>
          <span class="meta-value ${item.exists ? 'highlight-time' : ''}">${item.lastUpdated}</span>
        </div>
        <div class="report-meta-row">
          <span class="meta-label"><i data-lucide="hard-drive"></i> File Size:</span>
          <span class="meta-value">${item.sizeFormatted}</span>
        </div>
      </div>
      <div class="report-item-bottom">
        <div class="report-filename" title="${item.filename || 'No local archive found'}">
          <i data-lucide="file-text"></i> ${item.filename || 'File not available on disk'}
        </div>
        <button class="btn-download-single" onclick="window.triggerSync('${item.id}')" title="Download only ${item.name}">
          <i data-lucide="download"></i> Download
        </button>
      </div>
    </div>
  `).join('');
}

async function loadReportStatuses() {
  try {
    const res = await fetch('/api/reports/status');
    const json = await res.json();
    if (!json.success || !json.reports) return;

    const { consumer, dt, feeder, complaint } = json.reports;

    // Render Lists
    if (consumer && consumer.items) {
      renderReportItemList('listConsumerReports', consumer.items);
      const readyCount = consumer.items.filter(i => i.exists).length;
      const badge = document.getElementById('badgeStatusConsumer');
      if (badge) {
        badge.textContent = `${readyCount}/${consumer.items.length} Active`;
        badge.className = `report-status-badge ${readyCount === consumer.items.length ? 'badge-downloaded' : 'badge-missing'}`;
      }
    }

    if (dt && dt.items) {
      renderReportItemList('listDTReports', dt.items);
      const readyCount = dt.items.filter(i => i.exists).length;
      const badge = document.getElementById('badgeStatusDT');
      if (badge) {
        badge.textContent = `${readyCount}/${dt.items.length} Active`;
        badge.className = `report-status-badge ${readyCount === dt.items.length ? 'badge-downloaded' : 'badge-missing'}`;
      }
    }

    if (feeder && feeder.items) {
      renderReportItemList('listFeederReports', feeder.items);
      const readyCount = feeder.items.filter(i => i.exists).length;
      const badge = document.getElementById('badgeStatusFeeder');
      if (badge) {
        badge.textContent = `${readyCount}/${feeder.items.length} Active`;
        badge.className = `report-status-badge ${readyCount === feeder.items.length ? 'badge-downloaded' : 'badge-missing'}`;
      }
    }

    if (complaint && complaint.items) {
      renderReportItemList('listComplaintReports', complaint.items);
      const readyCount = complaint.items.filter(i => i.exists).length;
      const badge = document.getElementById('badgeStatusComplaint');
      if (badge) {
        badge.textContent = `${readyCount}/${complaint.items.length} Active`;
        badge.className = `report-status-badge ${readyCount === complaint.items.length ? 'badge-downloaded' : 'badge-missing'}`;
      }
    }

    // Top Overview Strip
    const totalCount = json.totalCount || 8;
    const downloadedCount = json.downloadedCount || 0;
    const countText = document.getElementById('hubTotalCountText');
    const totalBadge = document.getElementById('hubTotalReportsBadge');
    const lastCheckedVal = document.getElementById('hubLastCheckedVal');

    if (countText) countText.textContent = `${downloadedCount} of ${totalCount} Reports Active & Synchronized`;
    if (totalBadge) totalBadge.className = `report-status-badge ${downloadedCount === totalCount ? 'badge-downloaded' : 'badge-missing'}`;
    if (lastCheckedVal) lastCheckedVal.textContent = json.checkedAt || new Date().toLocaleTimeString();

    if (window.lucide) lucide.createIcons();

  } catch (e) {
    console.error('Error loading report statuses:', e);
  }
}

async function triggerSync(target = 'all') {
  window.triggerSync = triggerSync;
  const syncBtn = document.getElementById('btnSyncSelected');
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Syncing...';
    if (window.lucide) lucide.createIcons();
  }

  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    showToast(`Live sync for ${target.toUpperCase()} initiated.`, 'info');
    pollSyncProgress();
  } catch (err) {
    showToast('Sync trigger failed: ' + err.message, 'error');
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> <span>Sync Selected Reports</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

let syncPollTimer = null;
async function pollSyncProgress() {
  clearTimeout(syncPollTimer);
  try {
    const res = await fetch('/api/sync/status');
    const json = await res.json();
    if (!json.success) return;

    const bar = document.getElementById('syncProgressBar');
    const stepText = document.getElementById('syncStepText');
    const pctText = document.getElementById('syncPctText');
    const logBox = document.getElementById('syncConsoleLog');

    if (bar) bar.style.width = `${json.progress}%`;
    if (stepText) stepText.textContent = json.message || 'Processing...';
    if (pctText) pctText.textContent = `${json.progress}%`;

    if (logBox && json.message) {
      const time = new Date().toLocaleTimeString();
      const lastLine = logBox.lastElementChild ? logBox.lastElementChild.textContent : '';
      if (!lastLine.includes(json.message)) {
        const item = document.createElement('div');
        item.textContent = `[${time}] ${json.message}`;
        logBox.appendChild(item);
        logBox.scrollTop = logBox.scrollHeight;
      }
    }

    if (json.running) {
      syncPollTimer = setTimeout(pollSyncProgress, 2500);
    } else {
      const syncBtn = document.getElementById('btnSyncSelected');
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<i data-lucide="refresh-cw"></i> <span>Sync Selected Reports</span>';
        if (window.lucide) lucide.createIcons();
      }
      if (json.step === 'COMPLETE') {
        showToast('Portal sync completed! Refreshing active dashboard...', 'success');
        await loadReportStatuses();
        await loadInitialData();
      }
    }
  } catch (err) {
    console.error('Error polling sync:', err);
    syncPollTimer = setTimeout(pollSyncProgress, 3500);
  }
}

async function checkSyncStatus() {
  try {
    const res = await fetch('/api/sync/status');
    const json = await res.json();
    if (json.success && json.running) {
      pollSyncProgress();
    }
  } catch (e) {}
}

// --- Helper Functions ---
function formatNum(val) {
  if (val === undefined || val === null || isNaN(val)) return '0';
  return Number(val).toLocaleString('en-IN');
}

function formatK(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
  return val;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.className = 'toast hidden';
  }, 4000);
}

function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tr'));
  const csvContent = rows.map(row => {
    const cols = Array.from(row.querySelectorAll('th, td'));
    return cols.map(col => {
      let text = col.innerText.replace(/"/g, '""').trim();
      return `"${text}"`;
    }).join(',');
  }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename || 'export.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.exportTableToCSV = exportTableToCSV;

// ==========================================================================
// TICKET CORRELATION MODULE (Cross-analyzing Silent Meters x O&M Complaints)
// ==========================================================================

let corrState = {
  data: null,
  isFetching: false
};
let corrDebounceTimer = null;

async function loadTicketCorrelationData() {
  if (corrState.isFetching) return;
  corrState.isFetching = true;

  const circle = document.getElementById('corrFilterCircle')?.value || 'ALL';
  const division = document.getElementById('corrFilterDivision')?.value || 'ALL';
  const comm_status = document.getElementById('corrFilterCommStatus')?.value || 'ALL_NON_COMM';
  const ticket_filter = document.getElementById('corrFilterTicketStatus')?.value || 'ALL';
  const search = document.getElementById('corrFilterSearch')?.value || '';

  const params = new URLSearchParams({
    circle,
    division,
    comm_status,
    ticket_filter,
    search
  });

  try {
    const res = await fetch(`/api/analytics/ticket-correlation?${params.toString()}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch correlation data');

    corrState.data = json;
    renderCorrKPIs(json.kpis);
    renderCorrCharts(json);
    renderCorrTables(json);
    updateCorrCircleDropdown(json.circles);
    updateCorrDivisionDropdown(json.divisions);

  } catch (err) {
    console.error('Correlation fetch error:', err);
    showToast('Correlation Error: ' + err.message, 'error');
  } finally {
    corrState.isFetching = false;
    if (window.lucide) lucide.createIcons();
  }
}
window.loadTicketCorrelationData = loadTicketCorrelationData;

function renderCorrKPIs(kpis) {
  if (!kpis) return;
  const totalSilent = Number(kpis.total_non_comm) || 0;
  const ticketsRaised = Number(kpis.tickets_raised) || 0;
  const noTicket = Number(kpis.no_ticket_raised) || 0;
  const covPct = kpis.coverage_pct !== undefined ? kpis.coverage_pct : (totalSilent > 0 ? ((ticketsRaised / totalSilent) * 100).toFixed(2) : 0);
  const gapPct = (100 - covPct).toFixed(2);
  const pending = Number(kpis.pending_tickets) || 0;
  const notifyDiscom = Number(kpis.notify_discom_tickets) || 0;
  const attended = Number(kpis.attended_tickets) || 0;
  const closed = Number(kpis.closed_tickets) || 0;

  const elTotal = document.getElementById('corrKpiTotalSilent');
  if (elTotal) elTotal.textContent = formatNum(totalSilent);

  const elRaised = document.getElementById('corrKpiTicketsRaised');
  if (elRaised) elRaised.textContent = formatNum(ticketsRaised);
  const elCovPct = document.getElementById('corrKpiCoveragePct');
  if (elCovPct) elCovPct.textContent = `${covPct}% Coverage`;
  const elCovPill = document.getElementById('corrCoveragePill');
  if (elCovPill) elCovPill.innerHTML = `<i data-lucide="check-circle-2"></i> ${covPct}% Logged`;

  const elNoTicket = document.getElementById('corrKpiNoTicket');
  if (elNoTicket) elNoTicket.textContent = formatNum(noTicket);
  const elGapPct = document.getElementById('corrKpiGapPct');
  if (elGapPct) elGapPct.textContent = `${gapPct}% Action Required`;

  const elPending = document.getElementById('corrKpiPending');
  if (elPending) elPending.textContent = formatNum(pending);
  const elPendingPct = document.getElementById('corrKpiPendingPct');
  if (elPendingPct) elPendingPct.textContent = ticketsRaised > 0 ? `${((pending / ticketsRaised) * 100).toFixed(1)}% of Raised` : 'Awaiting visit';

  const elDiscom = document.getElementById('corrKpiNotifyDiscom');
  if (elDiscom) elDiscom.textContent = formatNum(notifyDiscom);

  const elAttended = document.getElementById('corrKpiAttended');
  if (elAttended) elAttended.textContent = formatNum(attended);

  const elClosed = document.getElementById('corrKpiClosed');
  if (elClosed) elClosed.textContent = formatNum(closed);
}

function updateCorrCircleDropdown(circles) {
  const select = document.getElementById('corrFilterCircle');
  if (!select || select.options.length > 1) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="ALL">All Circles (SBPDCL)</option>';
  (circles || []).forEach(c => {
    select.innerHTML += `<option value="${c.circle}">${c.circle} (${formatNum(c.total_non_comm)})</option>`;
  });
  select.value = currentVal;
}

function updateCorrDivisionDropdown(divisions) {
  const divSelect = document.getElementById('corrFilterDivision');
  if (!divSelect) return;
  const circleVal = document.getElementById('corrFilterCircle')?.value || 'ALL';
  const currentVal = divSelect.value;
  divSelect.innerHTML = '<option value="ALL">All Divisions</option>';

  let list = divisions || [];
  if (circleVal !== 'ALL') {
    list = list.filter(d => d.circle === circleVal);
  }

  const uniqueDivs = [...new Set(list.map(d => d.division).filter(Boolean))].sort();
  uniqueDivs.forEach(d => {
    divSelect.innerHTML += `<option value="${d}">${d}</option>`;
  });

  if (uniqueDivs.includes(currentVal)) {
    divSelect.value = currentVal;
  }
}

function renderCorrCharts(data) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  // Chart 1: Circle Ticket Coverage (Stacked Bar + Line)
  const ctxCoverage = document.getElementById('chartCorrCircleCoverage')?.getContext('2d');
  if (ctxCoverage) {
    if (state.charts['corrCircleCoverage']) state.charts['corrCircleCoverage'].destroy();
    const circles = data.circles || [];
    const labels = circles.map(c => c.circle);
    const raisedData = circles.map(c => c.tickets_raised);
    const gapData = circles.map(c => c.no_ticket_raised);
    const pctData = circles.map(c => c.coverage_pct);

    state.charts['corrCircleCoverage'] = new Chart(ctxCoverage, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tickets Raised',
            data: raisedData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4,
            stack: 'stack1',
            order: 2
          },
          {
            label: 'No Ticket (Action Gap)',
            data: gapData,
            backgroundColor: 'rgba(244, 63, 94, 0.8)',
            borderColor: '#f43f5e',
            borderWidth: 1,
            borderRadius: 4,
            stack: 'stack1',
            order: 3
          },
          {
            type: 'line',
            label: '% Ticket Coverage',
            data: pctData,
            borderColor: '#f59e0b',
            backgroundColor: '#f59e0b',
            borderWidth: 2.5,
            pointBackgroundColor: '#f59e0b',
            pointRadius: 4,
            pointHoverRadius: 6,
            yAxisID: 'y1',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 12, weight: 600 }, boxWidth: 14 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.type === 'line') return `${ctx.dataset.label}: ${ctx.raw}%`;
                return `${ctx.dataset.label}: ${formatNum(ctx.raw)}`;
              }
            }
          },
          datalabels: { display: false }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Inter', weight: 600 } }
          },
          y: {
            stacked: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (v) => formatK(v)
            }
          },
          y1: {
            position: 'right',
            min: 0,
            max: 100,
            grid: { display: false },
            ticks: {
              color: '#f59e0b',
              callback: (v) => `${v}%`
            }
          }
        }
      }
    });
  }

  // Chart 2: Ticket Status Donut
  const ctxDonut = document.getElementById('chartCorrStatusDonut')?.getContext('2d');
  if (ctxDonut) {
    if (state.charts['corrStatusDonut']) state.charts['corrStatusDonut'].destroy();
    const kpi = data.kpis || {};
    const pending = kpi.pending_tickets || 0;
    const notifyDiscom = kpi.notify_discom_tickets || 0;
    const attended = kpi.attended_tickets || 0;
    const closed = kpi.closed_tickets || 0;
    const mrRequired = kpi.mr_required_tickets || 0;

    state.charts['corrStatusDonut'] = new Chart(ctxDonut, {
      type: 'doughnut',
      data: {
        labels: ['Pending Field Action', 'Notify to Discom', 'Closed (Still Silent)', 'Attended', 'MR Required'],
        datasets: [{
          data: [pending, notifyDiscom, closed, attended, mrRequired],
          backgroundColor: [
            '#f59e0b',
            '#3b82f6',
            '#a855f7',
            '#06b6d4',
            '#f97316'
          ],
          borderColor: isDark ? '#1e293b' : '#ffffff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor, font: { family: 'Inter', size: 12 }, boxWidth: 12, padding: 12 }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                return `${ctx.label}: ${formatNum(ctx.raw)} (${pct}%)`;
              }
            }
          },
          datalabels: { display: false }
        },
        cutout: '62%'
      }
    });
  }

  // Chart 3: Non-Comm Duration vs Ticket Status (Grouped Bar)
  const ctxAgingVsTicket = document.getElementById('chartCorrAgingVsTicket')?.getContext('2d');
  if (ctxAgingVsTicket) {
    if (state.charts['corrAgingVsTicket']) state.charts['corrAgingVsTicket'].destroy();
    const commCats = data.commCategories || [];
    const labels = commCats.map(c => c.comm_category);
    const raisedData = commCats.map(c => c.tickets_raised);
    const gapData = commCats.map(c => c.no_ticket_raised);

    state.charts['corrAgingVsTicket'] = new Chart(ctxAgingVsTicket, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tickets Raised',
            data: raisedData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 4
          },
          {
            label: 'No Ticket Raised (Gap)',
            data: gapData,
            backgroundColor: 'rgba(244, 63, 94, 0.8)',
            borderColor: '#f43f5e',
            borderWidth: 1,
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 12 } }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatNum(ctx.raw)}`
            }
          },
          datalabels: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Inter', weight: 600 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (v) => formatK(v)
            }
          }
        }
      }
    });
  }

  // Chart 4: Top Issue Categories / Remarks (Horizontal Bar)
  const ctxRemarks = document.getElementById('chartCorrRemarksBar')?.getContext('2d');
  if (ctxRemarks) {
    if (state.charts['corrRemarksBar']) state.charts['corrRemarksBar'].destroy();
    const remarks = (data.remarks || []).slice(0, 8);
    const labels = remarks.map(r => r.main_remarks);
    const counts = remarks.map(r => r.count);

    state.charts['corrRemarksBar'] = new Chart(ctxRemarks, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Silent Meters Affected',
          data: counts,
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `Meters: ${formatNum(ctx.raw)}`
            }
          },
          datalabels: { display: false }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (v) => formatK(v)
            }
          },
          y: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 11, weight: 600 }
            }
          }
        }
      }
    });
  }
}

function renderCorrTables(data) {
  // Table 1: Circle Table
  const circleBody = document.getElementById('corrCircleTableBody');
  if (circleBody) {
    const circles = data.circles || [];
    if (circles.length === 0) {
      circleBody.innerHTML = '<tr><td colspan="11" class="text-center">No matching records</td></tr>';
    } else {
      let totNonComm = 0, totRaised = 0, totGap = 0, totPending = 0, totDiscom = 0, totAttended = 0, totClosed = 0, totMr = 0;
      const rows = circles.map(c => {
        totNonComm += c.total_non_comm;
        totRaised += c.tickets_raised;
        totGap += c.no_ticket_raised;
        totPending += c.pending_tickets;
        totDiscom += c.notify_discom_tickets;
        totAttended += c.attended_tickets;
        totClosed += c.closed_tickets;
        totMr += c.mr_required_tickets;

        const covBadge = c.coverage_pct >= 40 
          ? `<span class="badge badge-success">${c.coverage_pct}%</span>`
          : (c.coverage_pct >= 30 ? `<span class="badge badge-warning">${c.coverage_pct}%</span>` : `<span class="badge badge-crimson">${c.coverage_pct}%</span>`);

        return `
          <tr>
            <td><strong>${c.circle}</strong></td>
            <td>${formatNum(c.total_non_comm)}</td>
            <td class="text-emerald font-semibold">${formatNum(c.tickets_raised)}</td>
            <td class="text-crimson font-semibold">${formatNum(c.no_ticket_raised)}</td>
            <td>${covBadge}</td>
            <td class="text-amber">${formatNum(c.pending_tickets)}</td>
            <td class="text-blue">${formatNum(c.notify_discom_tickets)}</td>
            <td class="text-cyan">${formatNum(c.attended_tickets)}</td>
            <td class="text-purple">${formatNum(c.closed_tickets)}</td>
            <td>${formatNum(c.mr_required_tickets)}</td>
            <td>
              <button class="btn btn-sm btn-outline" style="padding: 3px 8px; font-size: 0.72rem;" onclick="drilldownCorrCircle('${c.circle}')">
                <i data-lucide="eye"></i> View Meters
              </button>
            </td>
          </tr>
        `;
      }).join('');

      const overallCov = totNonComm > 0 ? ((totRaised / totNonComm) * 100).toFixed(2) : 0;
      const totalRow = `
        <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
          <td><strong>TOTAL (${circles.length} Circles)</strong></td>
          <td>${formatNum(totNonComm)}</td>
          <td class="text-emerald font-bold">${formatNum(totRaised)}</td>
          <td class="text-crimson font-bold">${formatNum(totGap)}</td>
          <td><span class="badge ${overallCov >= 40 ? 'badge-success' : 'badge-warning'}">${overallCov}%</span></td>
          <td class="text-amber font-bold">${formatNum(totPending)}</td>
          <td class="text-blue font-bold">${formatNum(totDiscom)}</td>
          <td class="text-cyan font-bold">${formatNum(totAttended)}</td>
          <td class="text-purple font-bold">${formatNum(totClosed)}</td>
          <td>${formatNum(totMr)}</td>
          <td>-</td>
        </tr>
      `;
      circleBody.innerHTML = rows + totalRow;
    }
  }

  // Table 2: Division Table
  const divBody = document.getElementById('corrDivisionTableBody');
  if (divBody) {
    const divs = data.divisions || [];
    if (divs.length === 0) {
      divBody.innerHTML = '<tr><td colspan="11" class="text-center">No matching records</td></tr>';
    } else {
      let totNonComm = 0, totRaised = 0, totGap = 0, totPending = 0, totDiscom = 0, totAttended = 0, totClosed = 0, totMr = 0;
      const rows = divs.map(d => {
        totNonComm += d.total_non_comm;
        totRaised += d.tickets_raised;
        totGap += d.no_ticket_raised;
        totPending += d.pending_tickets;
        totDiscom += d.notify_discom_tickets;
        totAttended += d.attended_tickets;
        totClosed += d.closed_tickets;
        totMr += d.mr_required_tickets;

        const covBadge = d.coverage_pct >= 40 
          ? `<span class="badge badge-success">${d.coverage_pct}%</span>`
          : (d.coverage_pct >= 30 ? `<span class="badge badge-warning">${d.coverage_pct}%</span>` : `<span class="badge badge-crimson">${d.coverage_pct}%</span>`);

        return `
          <tr>
            <td>${d.circle}</td>
            <td><strong>${d.division}</strong></td>
            <td>${formatNum(d.total_non_comm)}</td>
            <td class="text-emerald font-semibold">${formatNum(d.tickets_raised)}</td>
            <td class="text-crimson font-semibold">${formatNum(d.no_ticket_raised)}</td>
            <td>${covBadge}</td>
            <td class="text-amber">${formatNum(d.pending_tickets)}</td>
            <td class="text-blue">${formatNum(d.notify_discom_tickets)}</td>
            <td class="text-cyan">${formatNum(d.attended_tickets)}</td>
            <td class="text-purple">${formatNum(d.closed_tickets)}</td>
            <td>${formatNum(d.mr_required_tickets)}</td>
          </tr>
        `;
      }).join('');

      const overallCov = totNonComm > 0 ? ((totRaised / totNonComm) * 100).toFixed(2) : 0;
      const totalRow = `
        <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
          <td colspan="2"><strong>TOTAL (${divs.length} Divisions)</strong></td>
          <td>${formatNum(totNonComm)}</td>
          <td class="text-emerald font-bold">${formatNum(totRaised)}</td>
          <td class="text-crimson font-bold">${formatNum(totGap)}</td>
          <td><span class="badge ${overallCov >= 40 ? 'badge-success' : 'badge-warning'}">${overallCov}%</span></td>
          <td class="text-amber font-bold">${formatNum(totPending)}</td>
          <td class="text-blue font-bold">${formatNum(totDiscom)}</td>
          <td class="text-cyan font-bold">${formatNum(totAttended)}</td>
          <td class="text-purple font-bold">${formatNum(totClosed)}</td>
          <td>${formatNum(totMr)}</td>
        </tr>
      `;
      divBody.innerHTML = rows + totalRow;
    }
  }

  // Table 3: Comm Category Matrix Table
  const catBody = document.getElementById('corrCommCatTableBody');
  if (catBody) {
    const cats = data.commCategories || [];
    catBody.innerHTML = cats.map(c => {
      const covBadge = c.coverage_pct >= 40 
        ? `<span class="badge badge-success">${c.coverage_pct}%</span>`
        : `<span class="badge badge-warning">${c.coverage_pct}%</span>`;

      return `
        <tr>
          <td><strong>${c.comm_category}</strong></td>
          <td>${formatNum(c.total_meters)}</td>
          <td class="text-emerald font-semibold">${formatNum(c.tickets_raised)}</td>
          <td class="text-crimson font-semibold">${formatNum(c.no_ticket_raised)}</td>
          <td>${covBadge}</td>
          <td class="text-amber">${formatNum(c.pending_tickets)}</td>
          <td class="text-blue">${formatNum(c.notify_discom_tickets)}</td>
          <td class="text-purple">${formatNum(c.closed_tickets)}</td>
        </tr>
      `;
    }).join('');
  }

  // Table 4: Remarks Table
  const remarksBody = document.getElementById('corrRemarksTableBody');
  if (remarksBody) {
    const rems = data.remarks || [];
    remarksBody.innerHTML = rems.map(r => `
      <tr>
        <td><strong>${r.main_remarks}</strong></td>
        <td>${r.sub_remarks || '-'}</td>
        <td class="font-bold">${formatNum(r.count)}</td>
        <td class="text-amber">${formatNum(r.pending)}</td>
        <td class="text-blue">${formatNum(r.notify_discom)}</td>
        <td class="text-cyan">${formatNum(r.attended)}</td>
        <td class="text-purple">${formatNum(r.closed)}</td>
      </tr>
    `).join('');
  }
}

function setupCorrelationFilters() {
  const circleSelect = document.getElementById('corrFilterCircle');
  if (circleSelect) {
    circleSelect.addEventListener('change', () => {
      updateCorrDivisionDropdown(corrState.data?.divisions || []);
      loadTicketCorrelationData();
    });
  }

  const divSelect = document.getElementById('corrFilterDivision');
  if (divSelect) {
    divSelect.addEventListener('change', () => {
      loadTicketCorrelationData();
    });
  }

  const statusSelect = document.getElementById('corrFilterCommStatus');
  if (statusSelect) {
    statusSelect.addEventListener('change', () => {
      loadTicketCorrelationData();
    });
  }

  const ticketSelect = document.getElementById('corrFilterTicketStatus');
  if (ticketSelect) {
    ticketSelect.addEventListener('change', () => {
      loadTicketCorrelationData();
    });
  }

  const searchInput = document.getElementById('corrFilterSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(corrDebounceTimer);
      corrDebounceTimer = setTimeout(loadTicketCorrelationData, 350);
    });
  }

  const resetBtn = document.getElementById('corrResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (circleSelect) circleSelect.value = 'ALL';
      if (divSelect) divSelect.value = 'ALL';
      if (statusSelect) statusSelect.value = 'ALL_NON_COMM';
      if (ticketSelect) ticketSelect.value = 'ALL';
      if (searchInput) searchInput.value = '';
      loadTicketCorrelationData();
    });
  }
}

function applyCorrPreset(preset) {
  const commSelect = document.getElementById('corrFilterCommStatus');
  const ticketSelect = document.getElementById('corrFilterTicketStatus');

  if (preset === 'all') {
    if (commSelect) commSelect.value = 'ALL_NON_COMM';
    if (ticketSelect) ticketSelect.value = 'ALL';
  } else if (preset === 'gap') {
    if (commSelect) commSelect.value = 'ALL_NON_COMM';
    if (ticketSelect) ticketSelect.value = 'NOT_RAISED';
  }
  loadTicketCorrelationData();
}
window.applyCorrPreset = applyCorrPreset;

function drilldownCorrCircle(circleName) {
  // 1. Switch to Consumer Explorer tab
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'tab-meters'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-meters'));

  // 2. Set filters
  const circleSelect = document.getElementById('filterCircle');
  if (circleSelect) circleSelect.value = circleName;
  state.filters.circle = circleName;

  const statusSelect = document.getElementById('filterStatus');
  if (statusSelect) statusSelect.value = 'ALL_NON_COMM';
  state.filters.status = 'ALL_NON_COMM';

  state.metersPage = 1;
  onFiltersChanged();
}
window.drilldownCorrCircle = drilldownCorrCircle;


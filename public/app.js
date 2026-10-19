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
  activeTab: 'tab-daily-churn',
  charts: {},
  isFetching: false
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  setupTheme();
  setupSidebar();
  setupEventListeners();
  setupCategorySwitcher();
  setupCorrelationFilters();
  setupDownloaderHub();
  setupDailyChurnEventListeners();
  updateTabVisibility();
  updateTopBreadcrumb();
  await loadReportStatuses();
  await loadInitialData();
});

// --- Theme Toggle ---
function setupTheme() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('theme') || 'dark';

  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      updateThemeIcon(next);
      rebuildCharts();
    });
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) lucide.createIcons();
  }
}

// --- Collapsible Sidebar & Smart Controls Setup ---
function setupSidebar() {
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const topbarToggleBtn = document.getElementById('sidebarToggleBtnTop');

  // Check saved collapsed state
  const isCollapsed = localStorage.getItem('sbpdcl_sidebar_collapsed') === '1';
  if (isCollapsed) {
    document.body.classList.add('sidebar-collapsed');
  }

  function toggleSidebar() {
    const collapsed = document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sbpdcl_sidebar_collapsed', collapsed ? '1' : '0');
    const icon = document.getElementById('sidebarCollapseIcon');
    if (icon) {
      icon.setAttribute('data-lucide', collapsed ? 'panel-left-open' : 'panel-left-close');
      if (window.lucide) lucide.createIcons();
    }
  }

  if (collapseBtn) collapseBtn.addEventListener('click', toggleSidebar);
  if (topbarToggleBtn) topbarToggleBtn.addEventListener('click', toggleSidebar);

  // Setup advanced filter drawer toggle
  const btnToggleAdv = document.getElementById('btnToggleAdvancedFilters');
  const advDrawer = document.getElementById('smartFilterAdvanced');
  const advChevron = document.getElementById('advFilterChevron');
  if (btnToggleAdv && advDrawer) {
    btnToggleAdv.addEventListener('click', () => {
      const isHidden = advDrawer.classList.toggle('hidden');
      btnToggleAdv.classList.toggle('active', !isHidden);
      if (advChevron) {
        advChevron.setAttribute('data-lucide', isHidden ? 'chevron-down' : 'chevron-up');
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Setup smart filter card hide/show toggle
  const btnToggleFilters = document.getElementById('btnToggleFilters');
  const filterCard = document.getElementById('smartFilterCard');
  if (btnToggleFilters && filterCard) {
    btnToggleFilters.addEventListener('click', () => {
      const isHidden = filterCard.classList.toggle('hidden');
      btnToggleFilters.classList.toggle('btn-primary', !isHidden);
    });
  }
}

// Switcher for Geographic Hierarchy subviews
function switchHierarchyView(subview) {
  // subview: 'circle' | 'division' | 'section'
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.subview-pill-btn').forEach(b => b.classList.remove('active'));

  const tabId = 'tab-' + subview;
  const pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');

  state.activeTab = tabId;

  // Highlight hierarchy in sidebar
  document.querySelectorAll('.sidebar-nav-item.nav-tab').forEach(t => {
    t.classList.toggle('active', t.id === 'navTabHierarchy' || t.dataset.tab === tabId);
  });

  updateTopBreadcrumb();
  renderActiveView();
}
window.switchHierarchyView = switchHierarchyView;

// Switcher for Technical Dimensions subviews
function switchTechDimensionsView(subview) {
  // subview: 'dimensions' | 'aging'
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.subview-pill-btn').forEach(b => b.classList.remove('active'));

  const tabId = 'tab-' + subview;
  const pane = document.getElementById(tabId);
  if (pane) pane.classList.add('active');

  state.activeTab = tabId;

  // Highlight dimensions in sidebar
  document.querySelectorAll('.sidebar-nav-item.nav-tab').forEach(t => {
    t.classList.toggle('active', t.id === 'navTabDimensions' || t.dataset.tab === tabId);
  });

  updateTopBreadcrumb();
  renderActiveView();
}
window.switchTechDimensionsView = switchTechDimensionsView;

function updateTopBreadcrumb() {
  const assetEl = document.getElementById('breadcrumbAsset');
  const moduleEl = document.getElementById('breadcrumbModule');
  const subEl = document.getElementById('appHeaderSubtitle');

  const assetNames = {
    consumer: 'Consumer Meters',
    dt: 'DT Meters',
    feeder: 'Feeder Meters',
    complaint: 'O&M Complaints'
  };

  const moduleNames = {
    'tab-daily-churn': { title: 'Daily Churn & Trend', sub: 'Comparing Current Sync with Yesterday\'s Final Sync across aging segments' },
    'tab-circle': { title: 'Geographic: Circle Performance', sub: 'Geographic hierarchy breakdown across all 7 Circles' },
    'tab-division': { title: 'Geographic: Division Breakdown', sub: 'Geographic hierarchy breakdown across all 26 Divisions' },
    'tab-section': { title: 'Geographic: Section Drilldown', sub: 'Section-level communication tracking across SBPDCL' },
    'tab-dimensions': { title: 'Technical: Phase & Make', sub: 'Dimensional analysis grouped by Phase rating and meter Make' },
    'tab-aging': { title: 'Technical: Tech & Aging', sub: 'HES Network Technology and non-communication aging buckets' },
    'tab-correlation': { title: 'Ticket Correlation & Backlog', sub: 'Cross-analyzing silent smart meters against O&M complaint tickets' },
    'tab-meters': { title: 'Consumer Explorer', sub: 'Live meter record drilldown and granular telemetry' },
    'tab-overview': { title: 'Executive Pulse Overview', sub: 'Executive bird\'s-eye view across hierarchy and aging matrix' },
    'tab-datewise': { title: 'Date-wise Analytics', sub: 'Daily ticket resolution rates and lifecycle tracking' }
  };

  if (assetEl) assetEl.textContent = assetNames[state.category] || 'Consumer Meters';
  const mod = moduleNames[state.activeTab] || { title: 'Analytics View', sub: 'SBPDCL Executive Dashboard' };
  if (moduleEl) moduleEl.textContent = mod.title;
  if (subEl) subEl.textContent = mod.sub;

  // Contextual Fleet KPI strip: hide when in Daily Churn or Correlation
  const fleetKpis = document.getElementById('fleetKpiStrip');
  if (fleetKpis) {
    const isChurnOrCorr = (state.activeTab === 'tab-daily-churn' || state.activeTab === 'tab-correlation');
    fleetKpis.style.display = isChurnOrCorr ? 'none' : 'grid';
  }
}
window.updateTopBreadcrumb = updateTopBreadcrumb;

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

  // Update Tab Visibility (Overview, Ticket Correlation, Date-wise only for O&M Complaints)
  updateTabVisibility();

  // Update Filter Labels
  updateFilterLabelsForCategory();

  // Reset filter values
  resetFiltersToAll();

  // Load new category data
  loadInitialData();
}

function updateTabVisibility() {
  const isOM = (state.category === 'complaint');
  
  // Date-wise Analytics tab is specific to O&M complaints
  const dateWiseEl = document.getElementById('navTabDateWise');
  if (dateWiseEl) {
    dateWiseEl.classList.toggle('hidden', !isOM);
    dateWiseEl.style.display = isOM ? 'flex' : 'none';
  }

  // If on Date-wise tab and switching away from O&M, fall back to Daily Churn
  if (!isOM && state.activeTab === 'tab-datewise') {
    state.activeTab = 'tab-daily-churn';
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-daily-churn'));
    document.querySelectorAll('.sidebar-nav-item.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'tab-daily-churn'));
  }

  updateTopBreadcrumb();
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
        <th class="text-right">Consumer ID</th>
        <th>Consumer Name</th>
        <th>Hierarchy (Circle/Div/Sec)</th>
        <th>Feeder / DT</th>
        <th>Phase / Make</th>
        <th>Ageing</th>
        <th>Comm Status</th>
        <th class="text-center">Ticket Raised?</th>
        <th>Ticket Status</th>
        <th class="text-center">Total / Open</th>
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
        <th class="text-right">Consumer ID</th>
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
      if (state.activeTab === 'tab-meters') {
        loadMetersTable();
      }
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
let currentAnalyticsAbortController = null;

async function fetchFilteredAnalytics() {
  if (currentAnalyticsAbortController) {
    currentAnalyticsAbortController.abort();
  }
  currentAnalyticsAbortController = new AbortController();
  const signal = currentAnalyticsAbortController.signal;

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

    const res = await fetch(`/api/analytics/filtered?${params.toString()}`, { signal });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to slice analytics');

    state.currentData = json;
    renderAllViews();

    if (state.activeTab === 'tab-meters') {
      loadMetersTable();
    }

  } catch (err) {
    if (err.name === 'AbortError') return;
    showToast('Filter error: ' + err.message, 'error');
  } finally {
    if (currentAnalyticsAbortController?.signal === signal) {
      currentAnalyticsAbortController = null;
    }
  }
}

function renderAllViews() {
  renderKPIs();
  renderActiveView();
}

function renderActiveView() {
  if (!state.currentData) return;
  const tab = state.activeTab || 'tab-overview';

  switch (tab) {
    case 'tab-overview':
      renderOverviewTables();
      renderCircleCommChart();
      renderAgingChart();
      break;
    case 'tab-circle':
      renderCircleTable();
      renderCircleCommChart();
      break;
    case 'tab-division':
      renderDivisionTable();
      break;
    case 'tab-section':
      renderSectionTable();
      break;
    case 'tab-dimensions':
      renderDimensionsTable();
      renderMakeTable();
      break;
    case 'tab-technology':
      renderTechTable();
      break;
    case 'tab-aging':
      renderAgingTable();
      renderAgingChart();
      break;
    case 'tab-datewise':
      renderDateWiseTable();
      renderDateWiseCharts();
      break;
    case 'tab-meters':
      loadMetersTable();
      break;
    case 'tab-correlation':
      loadTicketCorrelationData();
      break;
    case 'tab-daily-churn':
      loadDailyChurnView();
      break;
    default:
      renderOverviewTables();
      break;
  }
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
  renderOverviewTables();
  renderDateWiseTable();
  renderCircleTable();
  renderDivisionTable();
  renderSectionTable();
  renderDimensionsTable();
  renderMakeTable();
  renderTechTable();
  renderAgingTable();
}

function renderOverviewTables() {
  const circleBody = document.getElementById('overviewCircleTableBody');
  const agingBody = document.getElementById('overviewAgingTableBody');
  if (!circleBody || !agingBody) return;

  const circles = state.currentData?.circles || [];
  const isComplaint = state.category === 'complaint';

  // 1. Overview Table 1: Circle Benchmark Table
  if (circles.length === 0) {
    circleBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 16px;">No circle data available</td></tr>';
  } else {
    let totBase = 0, totComm = 0, totNonComm = 0, totGt7 = 0;
    const rows = circles.map(c => {
      const base = Number(isComplaint ? (c.total_tickets || c.total_installed) : c.total_installed) || 0;
      const comm = Number(isComplaint ? (c.closed_tickets || c.communicating) : c.communicating) || 0;
      const nonComm = Number(isComplaint ? (c.open_tickets || c.total_non_comm) : c.total_non_comm) || 0;
      const gt7 = Number(isComplaint ? (c.age_gt_7d || 0) : (c.comm_gt_7d || 0)) || 0;
      const rate = Number(isComplaint ? (c.resolution_pct || c.comm_pct) : c.comm_pct) || 0;

      totBase += base;
      totComm += comm;
      totNonComm += nonComm;
      totGt7 += gt7;

      const rateBadge = rate >= 90
        ? `<span class="badge badge-success">${rate}%</span>`
        : (rate >= 75 ? `<span class="badge badge-warning">${rate}%</span>` : `<span class="badge badge-crimson">${rate}%</span>`);

      return `
        <tr class="clickable-row" onclick="filterByCircle('${c.circle}')" title="Click to filter by ${c.circle}">
          <td><strong>${c.circle}</strong></td>
          <td class="text-right font-mono">${formatNum(base)}</td>
          <td class="text-right font-mono text-emerald">${formatNum(comm)}</td>
          <td class="text-right font-mono text-amber">${formatNum(nonComm)}</td>
          <td class="text-center">${rateBadge}</td>
          <td class="text-right font-mono text-crimson">${formatNum(gt7)}</td>
        </tr>
      `;
    }).join('');

    const overallRate = totBase > 0 ? ((totComm / totBase) * 100).toFixed(2) : 0;
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL (${circles.length} Circles)</strong></td>
        <td class="text-right font-mono font-bold">${formatNum(totBase)}</td>
        <td class="text-right font-mono text-emerald font-bold">${formatNum(totComm)}</td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totNonComm)}</td>
        <td class="text-center"><span class="badge ${overallRate >= 85 ? 'badge-success' : 'badge-warning'}">${overallRate}%</span></td>
        <td class="text-right font-mono text-crimson font-bold">${formatNum(totGt7)}</td>
      </tr>
    `;
    circleBody.innerHTML = rows + totalRow;
  }

  // 2. Overview Table 2: Aging & Resolution Matrix Table
  const agingBuckets = state.currentData?.aging_buckets || state.currentData?.aging || [];
  if (agingBuckets.length === 0) {
    agingBody.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 16px;">No aging records available</td></tr>';
  } else {
    const totalAging = agingBuckets.reduce((acc, b) => acc + (Number(b.total_count) || 0), 0);
    const rows = agingBuckets.map(b => {
      const count = Number(b.total_count) || 0;
      const share = totalAging > 0 ? ((count / totalAging) * 100).toFixed(1) : 0;
      const intervalName = b.bucket || b.label || '--';

      let actionText = 'Surveillance';
      if (intervalName.includes('> 30') || intervalName.includes('> 7') || intervalName.includes('Never')) {
        actionText = '<span class="text-crimson font-semibold">Priority Action</span>';
      } else if (intervalName.includes('8 - 15') || intervalName.includes('16 - 30') || intervalName.includes('3-7') || intervalName.includes('3 - 7')) {
        actionText = '<span class="text-amber font-semibold">Field Investigation</span>';
      } else {
        actionText = '<span class="text-cyan">Routine Monitoring</span>';
      }

      return `
        <tr class="clickable-row" onclick="filterByAging('${intervalName}')" title="Click to filter by ${intervalName}">
          <td><strong>${intervalName}</strong></td>
          <td class="text-right font-mono">${formatNum(count)}</td>
          <td class="text-center"><span class="badge ${Number(share) >= 25 ? 'badge-warning' : 'badge-info'}">${share}%</span></td>
          <td class="text-right">${actionText}</td>
        </tr>
      `;
    }).join('');

    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL</strong></td>
        <td class="text-right font-mono font-bold">${formatNum(totalAging)}</td>
        <td class="text-center"><span class="badge badge-success">100%</span></td>
        <td class="text-right font-semibold">Active Base</td>
      </tr>
    `;
    agingBody.innerHTML = rows + totalRow;
  }
}
window.renderOverviewTables = renderOverviewTables;

function filterByCircle(circleName) {
  const circleSelect = document.getElementById('filterCircle');
  if (circleSelect) {
    circleSelect.value = circleName;
    state.filters.circle = circleName;
    updateDivisionDropdown();
    onFiltersChanged();
  }
}
window.filterByCircle = filterByCircle;

function filterByAging(agingInterval) {
  const agingSelect = document.getElementById('filterAging');
  if (agingSelect) {
    let matched = false;
    for (let opt of agingSelect.options) {
      if (opt.value === agingInterval || opt.text.includes(agingInterval)) {
        agingSelect.value = opt.value;
        state.filters.aging = opt.value;
        matched = true;
        break;
      }
    }
    if (!matched) {
      state.filters.aging = agingInterval;
    }
    onFiltersChanged();
  }
}
window.filterByAging = filterByAging;

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

      const totalTickets = Number(m.total_tickets_count) || 0;
      const openTickets = Number(m.open_tickets_count) || 0;
      let ticketVolumeBadge = `<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>`;
      if (totalTickets > 0) {
        const isChronic = totalTickets >= 3;
        const isRepeat = totalTickets >= 2;
        const multiOpen = openTickets >= 2;
        ticketVolumeBadge = `
          <div style="font-size: 0.74rem; font-family: monospace; white-space: nowrap;">
            <span class="${isChronic ? 'text-crimson font-bold' : (isRepeat ? 'text-amber font-semibold' : 'text-emerald')}" title="${isChronic ? 'Chronic 3+ tickets' : (isRepeat ? 'Repeat complaint' : 'Single ticket')}">${totalTickets} Tot</span>
            <span style="color: var(--text-muted);">/</span>
            <span class="${multiOpen ? 'text-rose font-bold' : (openTickets > 0 ? 'text-blue' : 'text-muted')}" title="${multiOpen ? 'Multiple Open Tickets' : `${openTickets} open`}">${openTickets} Op</span>
          </div>
        `;
      }

      return `
        <tr>
          <td><span class="mono-badge">${m.msn || '--'}</span></td>
          <td class="font-mono text-right" style="font-variant-numeric: tabular-nums;">${formatConsumerId(m.consumer_id)}</td>
          <td><strong>${m.name || '--'}</strong></td>
          <td><span style="font-size: 0.78rem;">${m.circle || '--'} / ${m.division || '--'}<div style="color: var(--text-muted); font-size: 0.72rem;">${m.section || '--'}</div></span></td>
          <td><span style="font-size: 0.78rem;">${m.feeder || '--'}<div style="color: var(--text-muted); font-size: 0.72rem;">${m.dt_name || '--'}</div></span></td>
          <td><span style="font-size: 0.78rem;">${m.phase || '--'}<div style="color: var(--text-muted); font-size: 0.72rem;">${m.make || '--'} (${m.communication_type || '--'})</div></span></td>
          <td class="${m.ageing > 7 ? 'text-crimson font-semibold' : ''}">${m.ageing !== 999 ? m.ageing + 'd' : '--'}</td>
          <td>${statusPill}</td>
          <td class="text-center">${raisedBadge}</td>
          <td>${statusBadge}</td>
          <td class="text-center">${ticketVolumeBadge}</td>
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
          <td><span class="mono-badge font-bold" style="color: var(--accent-cyan); font-size: 0.76rem;">${m.msn || m.ticket_no || '--'}</span></td>
          <td>${m.installed_date || '--'}</td>
          <td class="font-mono text-right" style="font-variant-numeric: tabular-nums;">${formatConsumerId(m.consumer_id)}</td>
          <td><strong>${m.name || '--'}</strong></td>
          <td>${m.circle || '--'}</td>
          <td>${m.division || '--'}</td>
          <td>${m.section || '--'}</td>
          <td>${m.feeder || m.dt_name || '--'}</td>
          <td><span class="mono-badge">${m.meter_no || '--'}</span></td>
          <td>${statusPill}</td>
          <td class="${m.ageing > 7 ? 'text-crimson font-semibold' : ''}">${m.ageing !== undefined ? m.ageing + ' Days' : '--'}</td>
          <td><span style="font-size: 0.78rem; font-weight: 600; color: #fff;">${m.phase || '--'}</span></td>
          <td><span style="font-size: 0.72rem; color: var(--text-muted);">${m.make || '--'}</span></td>
        </tr>
      `;
    } else {
      // feeder
      return `
        <tr>
          <td><span class="mono-badge">${m.msn || '--'}</span></td>
          <td class="font-mono text-right">${formatConsumerId(m.consumer_id)}</td>
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

      state.activeTab = tab.dataset.tab;

      updateTopBreadcrumb();

      if (tab.dataset.tab === 'tab-correlation') {
        loadTicketCorrelationData();
      } else if (tab.dataset.tab === 'tab-meters') {
        loadMetersTable();
      } else if (tab.dataset.tab === 'tab-daily-churn') {
        loadDailyChurnView();
      } else {
        renderActiveView();
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
  }, 250);
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

function formatConsumerId(val) {
  if (val === undefined || val === null || val === '' || val === '--' || val === '-') return '--';
  let s = String(val).trim();
  // Strip trailing decimal zeroes from float imports e.g. 225103842996.0
  s = s.replace(/\.0+$/, '');
  // Expand any scientific notation e.g. 2.25103E+11 to full integer digits
  if (/e\+/i.test(s)) {
    try {
      const num = Number(s);
      if (!isNaN(num)) s = BigInt(Math.round(num)).toString();
    } catch (e) {}
  }
  return s;
}
window.formatConsumerId = formatConsumerId;

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
let corrAbortController = null;

async function loadTicketCorrelationData() {
  if (corrAbortController) {
    corrAbortController.abort();
  }
  corrAbortController = new AbortController();
  const signal = corrAbortController.signal;

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
    const res = await fetch(`/api/analytics/ticket-correlation?${params.toString()}`, { signal });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Failed to fetch correlation data');

    corrState.data = json;
    renderCorrKPIs(json.kpis);
    renderCorrCharts(json);
    renderCorrTables(json);
    updateCorrCircleDropdown(json.circles);
    updateCorrDivisionDropdown(json.divisions);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Correlation fetch error:', err);
    showToast('Correlation Error: ' + err.message, 'error');
  } finally {
    if (corrAbortController?.signal === signal) {
      corrAbortController = null;
      corrState.isFetching = false;
    }
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

  // Repeat Complaints & Multiple Open Tickets (Chronic Backlog)
  const repeatConsumers = Number(kpis.repeat_consumers) || 0;
  const repeatRate = kpis.repeat_rate_pct !== undefined ? kpis.repeat_rate_pct : (ticketsRaised > 0 ? ((repeatConsumers / ticketsRaised) * 100).toFixed(1) : 0);
  const multipleOpen = Number(kpis.multiple_open_tickets) || 0;

  const elRepeat = document.getElementById('corrKpiRepeatConsumers');
  if (elRepeat) elRepeat.textContent = formatNum(repeatConsumers);
  const elRepeatRate = document.getElementById('corrKpiRepeatRate');
  if (elRepeatRate) elRepeatRate.textContent = `${repeatRate}% Repeat Rate`;

  const elMultiOpen = document.getElementById('corrKpiMultipleOpen');
  if (elMultiOpen) elMultiOpen.textContent = formatNum(multipleOpen);
  const elMultiOpenSub = document.getElementById('corrKpiMultipleOpenSub');
  if (elMultiOpenSub) elMultiOpenSub.textContent = `${formatNum(multipleOpen)} Premise w/ ≥2 Open`;

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
  // User explicitly mandated removing charts and showing interactive tables only.
  // Kept as safe no-op to preserve caller compatibility.
}

function renderCorrTables(data) {
  // -------------------------------------------------------------
  // Table 1: Ticket Status Breakdown (Screenshot 1 Format)
  // -------------------------------------------------------------
  const statusBody = document.getElementById('corrStatusTableBody');
  if (statusBody) {
    let list = data.statusBreakdown || [];
    if (list.length === 0 && data.kpis) {
      const k = data.kpis;
      const totalRaised = Number(k.tickets_raised) || 1;
      list = [
        { ticket_status: 'Pending', count: Number(k.pending_tickets) || 0, pct_of_raised: ((Number(k.pending_tickets) || 0) * 100 / totalRaised).toFixed(2), status_definition: 'Ticket open in MDMS awaiting field team / technician site visit' },
        { ticket_status: 'Notify to Discom', count: Number(k.notify_discom_tickets) || 0, pct_of_raised: ((Number(k.notify_discom_tickets) || 0) * 100 / totalRaised).toFixed(2), status_definition: 'Consumer premise issue flagged to Discom (Line cut, door closed, PDCO)' },
        { ticket_status: 'Attended', count: Number(k.attended_tickets) || 0, pct_of_raised: ((Number(k.attended_tickets) || 0) * 100 / totalRaised).toFixed(2), status_definition: 'Technician has attended the site; under observation / pending closure' },
        { ticket_status: 'Closed', count: Number(k.closed_tickets) || 0, pct_of_raised: ((Number(k.closed_tickets) || 0) * 100 / totalRaised).toFixed(2), status_definition: 'Audit Flag: Ticket closed in MDMS, yet meter is still non-communicating in HES' },
        { ticket_status: 'MR Required', count: Number(k.mr_required_tickets) || 0, pct_of_raised: ((Number(k.mr_required_tickets) || 0) * 100 / totalRaised).toFixed(2), status_definition: 'Meter replacement recommended due to hardware/burnt failure' }
      ];
    }

    let totalCount = 0;
    const rows = list.map(s => {
      totalCount += Number(s.count) || 0;
      let dotClass = 'dot-amber';
      let statusDisplay = s.ticket_status;
      let badgeColor = 'badge-warning';

      if (s.ticket_status === 'Pending') {
        dotClass = 'dot-amber';
        badgeColor = 'badge-warning';
      } else if (s.ticket_status === 'Notify to Discom') {
        dotClass = 'dot-blue';
        badgeColor = 'badge-info';
      } else if (s.ticket_status === 'Attended') {
        dotClass = 'dot-cyan';
        badgeColor = 'badge-cyan';
      } else if (s.ticket_status === 'Closed') {
        dotClass = 'dot-purple';
        badgeColor = 'badge-purple';
        statusDisplay = 'Closed (Still Silent)';
      } else if (s.ticket_status === 'MR Required') {
        dotClass = 'dot-orange';
        badgeColor = 'badge-orange';
      }

      return `
        <tr class="clickable-row" onclick="setCorrTicketStatus('${s.ticket_status}')" title="Click to filter by ${s.ticket_status}">
          <td>
            <span style="display: inline-flex; align-items: center; gap: 8px;">
              <span class="status-dot ${dotClass}"></span>
              <strong>${statusDisplay}</strong>
            </span>
          </td>
          <td class="text-right font-mono font-bold">${formatNum(s.count)}</td>
          <td class="text-center"><span class="badge ${badgeColor}">${s.pct_of_raised}%</span></td>
          <td style="font-size: 0.82rem; color: var(--text-secondary);">${s.status_definition || '--'}</td>
        </tr>
      `;
    }).join('');

    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>Total Tickets Raised</strong></td>
        <td class="text-right font-mono font-bold text-emerald">${formatNum(totalCount)}</td>
        <td class="text-center"><span class="badge badge-success">100.00%</span></td>
        <td style="font-size: 0.82rem; font-weight: 600;">Operational queue across all 7 Circles</td>
      </tr>
    `;
    statusBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 2: Silent Duration vs Ticket Status Matrix (Screenshot 2 Format)
  // -------------------------------------------------------------
  const catBody = document.getElementById('corrCommCatTableBody');
  if (catBody) {
    const cats = data.commCategories || [];
    let totM = 0, totR = 0, totG = 0, totP = 0, totD = 0, totA = 0, totC = 0, totMr = 0;
    const rows = cats.map(c => {
      totM += Number(c.total_meters) || 0;
      totR += Number(c.tickets_raised) || 0;
      totG += Number(c.no_ticket_raised) || 0;
      totP += Number(c.pending_tickets) || 0;
      totD += Number(c.notify_discom_tickets) || 0;
      totA += Number(c.attended_tickets) || 0;
      totC += Number(c.closed_tickets) || 0;
      totMr += Number(c.mr_required_tickets) || 0;

      const cov = c.coverage_pct >= 40 
        ? `<span class="badge badge-success">${c.coverage_pct}%</span>`
        : (c.coverage_pct >= 25 ? `<span class="badge badge-warning">${c.coverage_pct}%</span>` : `<span class="badge badge-crimson">${c.coverage_pct}%</span>`);

      return `
        <tr>
          <td><strong>${c.comm_category}</strong></td>
          <td class="text-right font-mono">${formatNum(c.total_meters)}</td>
          <td class="text-right font-mono text-emerald font-semibold">${formatNum(c.tickets_raised)}</td>
          <td class="text-right font-mono text-crimson font-semibold">${formatNum(c.no_ticket_raised)}</td>
          <td class="text-center">${cov}</td>
          <td class="text-right font-mono text-amber">${formatNum(c.pending_tickets)}</td>
          <td class="text-right font-mono text-blue">${formatNum(c.notify_discom_tickets)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(c.attended_tickets)}</td>
          <td class="text-right font-mono text-purple">${formatNum(c.closed_tickets)}</td>
          <td class="text-right font-mono">${formatNum(c.mr_required_tickets)}</td>
        </tr>
      `;
    }).join('');

    const overallCov = totM > 0 ? ((totR / totM) * 100).toFixed(2) : 0;
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL (${cats.length} Categories)</strong></td>
        <td class="text-right font-mono font-bold">${formatNum(totM)}</td>
        <td class="text-right font-mono text-emerald font-bold">${formatNum(totR)}</td>
        <td class="text-right font-mono text-crimson font-bold">${formatNum(totG)}</td>
        <td class="text-center"><span class="badge ${overallCov >= 40 ? 'badge-success' : 'badge-warning'}">${overallCov}%</span></td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totP)}</td>
        <td class="text-right font-mono text-blue font-bold">${formatNum(totD)}</td>
        <td class="text-right font-mono text-cyan font-bold">${formatNum(totA)}</td>
        <td class="text-right font-mono text-purple font-bold">${formatNum(totC)}</td>
        <td class="text-right font-mono font-bold">${formatNum(totMr)}</td>
      </tr>
    `;
    catBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 3: Root Cause / Main Remark Breakdown (Screenshot 3 Format)
  // -------------------------------------------------------------
  const remarksBody = document.getElementById('corrRemarksTableBody');
  if (remarksBody) {
    const rems = data.remarks || [];
    let totCnt = 0, totP = 0, totD = 0, totA = 0, totC = 0;
    rems.forEach(r => totCnt += Number(r.count) || 0);

    const colors = ['dot-amber', 'dot-blue', 'dot-cyan', 'dot-purple', 'dot-orange', 'dot-red', 'dot-green'];
    const rows = rems.map((r, idx) => {
      const cnt = Number(r.count) || 0;
      totP += Number(r.pending) || 0;
      totD += Number(r.notify_discom) || 0;
      totA += Number(r.attended) || 0;
      totC += Number(r.closed) || 0;

      const share = totCnt > 0 ? ((cnt / totCnt) * 100).toFixed(1) : 0;
      const dot = colors[idx % colors.length];

      return `
        <tr class="clickable-row" onclick="setCorrSearch('${r.main_remarks.replace(/'/g, "\\'")}')" title="Click to filter by ${r.main_remarks}">
          <td>
            <span style="display: inline-flex; align-items: center; gap: 8px;">
              <span class="status-dot ${dot}"></span>
              <strong>${r.main_remarks}</strong>
            </span>
          </td>
          <td class="text-right font-mono font-bold">${formatNum(cnt)}</td>
          <td class="text-center"><span class="badge ${Number(share) >= 15 ? 'badge-warning' : 'badge-info'}">${share}%</span></td>
          <td class="text-right font-mono text-amber">${formatNum(r.pending)}</td>
          <td class="text-right font-mono text-blue">${formatNum(r.notify_discom)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(r.attended)}</td>
          <td class="text-right font-mono text-purple">${formatNum(r.closed)}</td>
        </tr>
      `;
    }).join('');

    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL (${rems.length} Causes)</strong></td>
        <td class="text-right font-mono font-bold">${formatNum(totCnt)}</td>
        <td class="text-center"><span class="badge badge-success">100%</span></td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totP)}</td>
        <td class="text-right font-mono text-blue font-bold">${formatNum(totD)}</td>
        <td class="text-right font-mono text-cyan font-bold">${formatNum(totA)}</td>
        <td class="text-right font-mono text-purple font-bold">${formatNum(totC)}</td>
      </tr>
    `;
    remarksBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 4: Circle Performance Benchmark Table (Screenshot 4 Format)
  // -------------------------------------------------------------
  const circleBody = document.getElementById('corrCircleTableBody');
  if (circleBody) {
    const circles = data.circles || [];
    let totNonComm = 0, totRaised = 0, totGap = 0, totPending = 0, totDiscom = 0, totAttended = 0, totClosed = 0, totMr = 0;
    const rows = circles.map(c => {
      totNonComm += Number(c.total_non_comm) || 0;
      totRaised += Number(c.tickets_raised) || 0;
      totGap += Number(c.no_ticket_raised) || 0;
      totPending += Number(c.pending_tickets) || 0;
      totDiscom += Number(c.notify_discom_tickets) || 0;
      totAttended += Number(c.attended_tickets) || 0;
      totClosed += Number(c.closed_tickets) || 0;
      totMr += Number(c.mr_required_tickets) || 0;

      const covBadge = c.coverage_pct >= 40 
        ? `<span class="badge badge-success">${c.coverage_pct}%</span>`
        : (c.coverage_pct >= 30 ? `<span class="badge badge-warning">${c.coverage_pct}%</span>` : `<span class="badge badge-crimson">${c.coverage_pct}%</span>`);

      return `
        <tr class="clickable-row" onclick="setCorrCircle('${c.circle}')" title="Click to filter by ${c.circle}">
          <td><strong>${c.circle}</strong></td>
          <td class="text-right font-mono">${formatNum(c.total_non_comm)}</td>
          <td class="text-right font-mono text-emerald font-semibold">${formatNum(c.tickets_raised)}</td>
          <td class="text-right font-mono text-crimson font-semibold">${formatNum(c.no_ticket_raised)}</td>
          <td class="text-center">${covBadge}</td>
          <td class="text-right font-mono text-amber">${formatNum(c.pending_tickets)}</td>
          <td class="text-right font-mono text-blue">${formatNum(c.notify_discom_tickets)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(c.attended_tickets)}</td>
          <td class="text-right font-mono text-purple">${formatNum(c.closed_tickets)}</td>
          <td class="text-right font-mono">${formatNum(c.mr_required_tickets)}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline" style="padding: 2px 8px; font-size: 0.72rem;" onclick="event.stopPropagation(); setCorrCircle('${c.circle}')">
              <i data-lucide="filter"></i> Filter
            </button>
          </td>
        </tr>
      `;
    }).join('');

    const overallCov = totNonComm > 0 ? ((totRaised / totNonComm) * 100).toFixed(2) : 0;
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL (${circles.length} Circles)</strong></td>
        <td class="text-right font-mono font-bold">${formatNum(totNonComm)}</td>
        <td class="text-right font-mono text-emerald font-bold">${formatNum(totRaised)}</td>
        <td class="text-right font-mono text-crimson font-bold">${formatNum(totGap)}</td>
        <td class="text-center"><span class="badge ${overallCov >= 40 ? 'badge-success' : 'badge-warning'}">${overallCov}%</span></td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totPending)}</td>
        <td class="text-right font-mono text-blue font-bold">${formatNum(totDiscom)}</td>
        <td class="text-right font-mono text-cyan font-bold">${formatNum(totAttended)}</td>
        <td class="text-right font-mono text-purple font-bold">${formatNum(totClosed)}</td>
        <td class="text-right font-mono font-bold">${formatNum(totMr)}</td>
        <td class="text-center">-</td>
      </tr>
    `;
    circleBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 5: Division Breakdown & Action Gap Table
  // -------------------------------------------------------------
  const divBody = document.getElementById('corrDivisionTableBody');
  if (divBody) {
    const divs = data.divisions || [];
    let totNonComm = 0, totRaised = 0, totGap = 0, totPending = 0, totDiscom = 0, totAttended = 0, totClosed = 0, totMr = 0;
    const rows = divs.map(d => {
      totNonComm += Number(d.total_non_comm) || 0;
      totRaised += Number(d.tickets_raised) || 0;
      totGap += Number(d.no_ticket_raised) || 0;
      totPending += Number(d.pending_tickets) || 0;
      totDiscom += Number(d.notify_discom_tickets) || 0;
      totAttended += Number(d.attended_tickets) || 0;
      totClosed += Number(d.closed_tickets) || 0;
      totMr += Number(d.mr_required_tickets) || 0;

      const covBadge = d.coverage_pct >= 40 
        ? `<span class="badge badge-success">${d.coverage_pct}%</span>`
        : (d.coverage_pct >= 30 ? `<span class="badge badge-warning">${d.coverage_pct}%</span>` : `<span class="badge badge-crimson">${d.coverage_pct}%</span>`);

      return `
        <tr class="clickable-row" onclick="setCorrDivision('${d.division}')" title="Click to filter by ${d.division}">
          <td>${d.circle}</td>
          <td><strong>${d.division}</strong></td>
          <td class="text-right font-mono">${formatNum(d.total_non_comm)}</td>
          <td class="text-right font-mono text-emerald font-semibold">${formatNum(d.tickets_raised)}</td>
          <td class="text-right font-mono text-crimson font-semibold">${formatNum(d.no_ticket_raised)}</td>
          <td class="text-center">${covBadge}</td>
          <td class="text-right font-mono text-amber">${formatNum(d.pending_tickets)}</td>
          <td class="text-right font-mono text-blue">${formatNum(d.notify_discom_tickets)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(d.attended_tickets)}</td>
          <td class="text-right font-mono text-purple">${formatNum(d.closed_tickets)}</td>
          <td class="text-right font-mono">${formatNum(d.mr_required_tickets)}</td>
        </tr>
      `;
    }).join('');

    const overallCov = totNonComm > 0 ? ((totRaised / totNonComm) * 100).toFixed(2) : 0;
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td colspan="2"><strong>TOTAL (${divs.length} Divisions)</strong></td>
        <td class="text-right font-mono font-bold">${formatNum(totNonComm)}</td>
        <td class="text-right font-mono text-emerald font-bold">${formatNum(totRaised)}</td>
        <td class="text-right font-mono text-crimson font-bold">${formatNum(totGap)}</td>
        <td class="text-center"><span class="badge ${overallCov >= 40 ? 'badge-success' : 'badge-warning'}">${overallCov}%</span></td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totPending)}</td>
        <td class="text-right font-mono text-blue font-bold">${formatNum(totDiscom)}</td>
        <td class="text-right font-mono text-cyan font-bold">${formatNum(totAttended)}</td>
        <td class="text-right font-mono text-purple font-bold">${formatNum(totClosed)}</td>
        <td class="text-right font-mono font-bold">${formatNum(totMr)}</td>
      </tr>
    `;
    divBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 6: Ticket Aging & Backlog Analysis
  // -------------------------------------------------------------
  const agingBody = document.getElementById('corrAgingTableBody');
  if (agingBody) {
    const buckets = data.agingBuckets || [];
    let totCnt = 0, totP = 0, totD = 0, totA = 0, totC = 0, totMr = 0;
    buckets.forEach(b => totCnt += Number(b.total_count) || 0);

    const rows = buckets.map(b => {
      const cnt = Number(b.total_count) || 0;
      totP += Number(b.pending) || 0;
      totD += Number(b.notify_discom) || 0;
      totA += Number(b.attended) || 0;
      totC += Number(b.closed) || 0;
      totMr += Number(b.mr_required) || 0;

      const share = b.pct_share !== undefined ? b.pct_share : (totCnt > 0 ? ((cnt / totCnt) * 100).toFixed(2) : 0);

      return `
        <tr>
          <td><strong>${b.aging_bucket}</strong></td>
          <td class="text-right font-mono font-bold">${formatNum(cnt)}</td>
          <td class="text-center"><span class="badge ${Number(share) >= 25 ? 'badge-warning' : 'badge-info'}">${share}%</span></td>
          <td class="text-right font-mono text-amber">${formatNum(b.pending)}</td>
          <td class="text-right font-mono text-blue">${formatNum(b.notify_discom)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(b.attended)}</td>
          <td class="text-right font-mono text-purple">${formatNum(b.closed)}</td>
          <td class="text-right font-mono">${formatNum(b.mr_required)}</td>
        </tr>
      `;
    }).join('');

    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL</strong></td>
        <td class="text-right font-mono font-bold text-emerald">${formatNum(totCnt)}</td>
        <td class="text-center"><span class="badge badge-success">100.00%</span></td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totP)}</td>
        <td class="text-right font-mono text-blue font-bold">${formatNum(totD)}</td>
        <td class="text-right font-mono text-cyan font-bold">${formatNum(totA)}</td>
        <td class="text-right font-mono text-purple font-bold">${formatNum(totC)}</td>
        <td class="text-right font-mono font-bold">${formatNum(totMr)}</td>
      </tr>
    `;
    agingBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 3B: Repeat Issues by Main Reason Bucket
  // -------------------------------------------------------------
  const repeatReasonBody = document.getElementById('corrRepeatReasonTableBody');
  if (repeatReasonBody) {
    const list = data.repeatReasonBuckets || [];
    let totSilent = 0, totSingle = 0, totRepeat = 0, totChronic = 0, totOpen = 0, totMultiOpen = 0;

    const rows = list.map(item => {
      const silent = Number(item.total_silent_with_ticket || item.total_silent_consumers) || 0;
      const single = Number(item.single_ticket_consumers) || 0;
      const repeat = Number(item.repeat_2_tickets || item.repeat_2_tickets_consumers) || 0;
      const chronic = Number(item.chronic_3plus_tickets || item.chronic_3plus_consumers) || 0;
      const open = Number(item.open_ticket_consumers) || 0;
      const multiOpen = Number(item.multiple_open_tickets || item.multi_open_ticket_consumers) || 0;

      totSilent += silent;
      totSingle += single;
      totRepeat += repeat;
      totChronic += chronic;
      totOpen += open;
      totMultiOpen += multiOpen;

      const repeatCount = repeat + chronic;
      const repPct = item.repeat_rate_pct !== undefined ? item.repeat_rate_pct : (silent > 0 ? ((repeatCount / silent) * 100).toFixed(1) : 0);
      const badgeClass = Number(repPct) >= 50 ? 'badge-crimson' : (Number(repPct) >= 25 ? 'badge-warning' : 'badge-info');

      return `
        <tr class="clickable-row" onclick="setCorrSearch('${(item.main_remarks || '').replace(/'/g, "\\'")}')" title="Click to filter by ${item.main_remarks}">
          <td><strong>${item.main_remarks || 'Unspecified'}</strong></td>
          <td class="text-right font-mono font-bold">${formatNum(silent)}</td>
          <td class="text-right font-mono text-emerald">${formatNum(single)}</td>
          <td class="text-right font-mono text-amber font-semibold">${formatNum(repeat)}</td>
          <td class="text-right font-mono text-crimson font-bold">${formatNum(chronic)}</td>
          <td class="text-right font-mono text-blue">${formatNum(open)}</td>
          <td class="text-right font-mono text-rose font-bold">${formatNum(multiOpen)}</td>
          <td class="text-center"><span class="badge ${badgeClass}">${repPct}%</span></td>
        </tr>
      `;
    }).join('');

    const totRepPct = totSilent > 0 ? (((totRepeat + totChronic) / totSilent) * 100).toFixed(1) : 0;
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL (${list.length} Reason Buckets)</strong></td>
        <td class="text-right font-mono font-bold text-amber">${formatNum(totSilent)}</td>
        <td class="text-right font-mono text-emerald font-bold">${formatNum(totSingle)}</td>
        <td class="text-right font-mono text-amber font-bold">${formatNum(totRepeat)}</td>
        <td class="text-right font-mono text-crimson font-bold">${formatNum(totChronic)}</td>
        <td class="text-right font-mono text-blue font-bold">${formatNum(totOpen)}</td>
        <td class="text-right font-mono text-rose font-bold">${formatNum(totMultiOpen)}</td>
        <td class="text-center"><span class="badge badge-warning">${totRepPct}%</span></td>
      </tr>
    `;
    repeatReasonBody.innerHTML = rows + totalRow;
  }

  // -------------------------------------------------------------
  // Table 3C: Open Tickets Volume per Consumer Distribution
  // -------------------------------------------------------------
  const openDistBody = document.getElementById('corrOpenTicketDistTableBody');
  if (openDistBody) {
    const list = data.openTicketDistribution || [];
    let totConsumers = 0;
    list.forEach(item => totConsumers += Number(item.consumer_count) || 0);

    const directiveMap = {
      '0 Open Tickets': { severity: '<span class="badge badge-success">Resolved / Attended</span>', action: 'All previous complaints closed; confirm physical modem communication or investigate meter status' },
      '1 Open Ticket': { severity: '<span class="badge badge-info">Single Open</span>', action: 'Standard field visit ticket in dispatch queue; monitor standard SLA' },
      '2 Open Tickets': { severity: '<span class="badge badge-warning">Dual Open (Repeat)</span>', action: 'Repeated ticket logged; escalate to Division O&M Supervisor for expedited premises check' },
      '>= 3 Open Tickets': { severity: '<span class="badge badge-crimson">Chronic (≥3 Open)</span>', action: 'High priority backlog; requires Joint Inspection by Discom JE & IntelliSmart Field Lead' },
      '3 Open Tickets': { severity: '<span class="badge badge-crimson">Chronic (3 Open)</span>', action: 'High priority backlog; requires Joint Inspection by Discom JE & IntelliSmart Field Lead' },
      '4+ Open Tickets': { severity: '<span class="badge badge-rose">Severe Chronic (4+)</span>', action: 'Critical premise anomaly / persistent bypass / burnt meter candidate; mandatory site audit' }
    };

    const rows = list.map(item => {
      const cnt = Number(item.consumer_count) || 0;
      const share = item.pct_share !== undefined ? item.pct_share : (totConsumers > 0 ? ((cnt / totConsumers) * 100).toFixed(1) : 0);
      const meta = directiveMap[item.open_ticket_bucket] || { 
        severity: item.priority_level ? `<span class="badge ${item.priority_level === 'CRITICAL' ? 'badge-crimson' : (item.priority_level === 'HIGH' ? 'badge-warning' : 'badge-info')}">${item.priority_level}</span>` : '<span class="badge badge-secondary">Standard</span>', 
        action: item.operational_definition || 'Monitor and review' 
      };

      return `
        <tr>
          <td><strong>${item.open_ticket_bucket}</strong></td>
          <td class="text-right font-mono font-bold">${formatNum(cnt)}</td>
          <td class="text-center"><span class="badge badge-info">${share}%</span></td>
          <td class="text-center">${meta.severity}</td>
          <td style="font-size: 0.83rem; color: var(--text-secondary);">${meta.action}</td>
        </tr>
      `;
    }).join('');

    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL</strong></td>
        <td class="text-right font-mono font-bold text-amber">${formatNum(totConsumers)}</td>
        <td class="text-center"><span class="badge badge-success">100.0%</span></td>
        <td class="text-center">--</td>
        <td style="font-size: 0.83rem; font-weight: 600;">Full silent meter population breakdown</td>
      </tr>
    `;
    openDistBody.innerHTML = rows + totalRow;
  }
}

function setCorrCircle(circle) {
  const sel = document.getElementById('corrFilterCircle');
  if (sel) {
    sel.value = circle;
    updateCorrDivisionDropdown(corrState.data?.divisions || []);
    loadTicketCorrelationData();
  }
}
window.setCorrCircle = setCorrCircle;

function setCorrDivision(division) {
  const sel = document.getElementById('corrFilterDivision');
  if (sel) {
    sel.value = division;
    loadTicketCorrelationData();
  }
}
window.setCorrDivision = setCorrDivision;

function setCorrTicketStatus(status) {
  const sel = document.getElementById('corrFilterTicketStatus');
  if (sel) {
    if (status === 'Pending') sel.value = 'PENDING';
    else if (status === 'Notify to Discom') sel.value = 'NOTIFY_DISCOM';
    else if (status === 'Attended') sel.value = 'ATTENDED';
    else if (status === 'Closed') sel.value = 'CLOSED';
    else if (status === 'MR Required') sel.value = 'MR_REQUIRED';
    else sel.value = 'ALL';
    loadTicketCorrelationData();
  }
}
window.setCorrTicketStatus = setCorrTicketStatus;

function setCorrSearch(term) {
  const inp = document.getElementById('corrFilterSearch');
  if (inp) {
    inp.value = term;
    loadTicketCorrelationData();
  }
}
window.setCorrSearch = setCorrSearch;

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

// ==========================================================================
// DAILY CHURN & 10-DAY TREND ACCUMULATOR MODULE
// Comparing Current Sync (Today) with Yesterday's Final Sync
// ==========================================================================

let dailyChurnState = {
  data: null,
  isFetching: false,
  circleFilter: 'ALL',
  divisionSearch: ''
};

async function loadDailyChurnView() {
  const container = document.getElementById('tab-daily-churn');
  if (!container) return;

  dailyChurnState.isFetching = true;
  const currentCategory = (state.category === 'complaint') ? 'consumer' : state.category;

  try {
    const res = await fetch(`/api/daily-churn?category=${currentCategory}`);
    const json = await res.json();
    if (!json.success) {
      console.error('Failed to load daily churn:', json.message);
      return;
    }

    dailyChurnState.data = json;
    renderDailyChurnView();
  } catch (err) {
    console.error('Error fetching daily churn data:', err);
  } finally {
    dailyChurnState.isFetching = false;
  }
}
window.loadDailyChurnView = loadDailyChurnView;

function renderDailyChurnView() {
  const data = dailyChurnState.data;
  if (!data) return;

  const summary = data.summary || {};
  const agingMatrix = data.agingMatrix || [];
  const circleTable = data.circleTable || [];
  const divisionTable = data.divisionTable || [];
  const trendHistory = data.trendHistory || [];

  // 1. Sync Timestamp Labels (Explicitly confirming Yesterday Final Sync vs Current Sync)
  const lblYesterday = document.getElementById('churnYesterdaySyncLabel');
  if (lblYesterday) {
    lblYesterday.textContent = `${data.yesterdayDate || '--'} (${data.yesterdayTime || '--'}) [Yesterday Final Sync]`;
  }
  const lblToday = document.getElementById('churnTodaySyncLabel');
  if (lblToday) {
    lblToday.textContent = `${data.todayDate || '--'} (${data.todayTime || '--'}) [Current Sync]`;
  }

  // 2. Executive KPI Cards
  const elYesterdaySilent = document.getElementById('churnKpiYesterdaySilent');
  if (elYesterdaySilent) elYesterdaySilent.textContent = formatNum(summary.yesterdaySilent || 0);

  const elYesterdayTimeSub = document.getElementById('churnKpiYesterdayTimeSub');
  if (elYesterdayTimeSub) elYesterdayTimeSub.textContent = `Yesterday Last Sync (${summary.yesterdayTime || '--'})`;

  const elClearedToday = document.getElementById('churnKpiClearedToday');
  if (elClearedToday) elClearedToday.textContent = formatNum(summary.clearedToday || 0);

  const elClearedPctSub = document.getElementById('churnKpiClearedPctSub');
  if (elClearedPctSub) elClearedPctSub.textContent = `${summary.recoveryRatePct || '0.00'}% of Yesterday Base Restored`;

  const elNewAdditions = document.getElementById('churnKpiNewAdditions');
  if (elNewAdditions) elNewAdditions.textContent = formatNum(summary.newAdditionsToday || 0);

  const elNetChange = document.getElementById('churnKpiNetChange');
  if (elNetChange) {
    const net = Number(summary.netChange || 0);
    elNetChange.textContent = `${net > 0 ? '+' : ''}${formatNum(net)}`;
    elNetChange.className = `kpi-value ${net <= 0 ? 'text-emerald' : 'text-rose'}`;
  }

  const elNetSub = document.getElementById('churnKpiNetSub');
  if (elNetSub) {
    const net = Number(summary.netChange || 0);
    elNetSub.textContent = net <= 0 ? `Backlog reduced by ${formatNum(Math.abs(net))}` : `Backlog increased by ${formatNum(net)}`;
  }

  const elTodaySilent = document.getElementById('churnKpiTodaySilent');
  if (elTodaySilent) elTodaySilent.textContent = formatNum(summary.todaySilent || 0);

  const elTodayTimeSub = document.getElementById('churnKpiTodayTimeSub');
  if (elTodayTimeSub) elTodayTimeSub.textContent = `Current Sync (${summary.todayTime || '--'})`;

  const elStillSilent = document.getElementById('churnKpiStillSilent');
  if (elStillSilent) elStillSilent.textContent = formatNum(summary.stillSilent || 0);

  // 3. Table 1: Aging Clearance Matrix Table
  const agingBody = document.getElementById('agingChurnTableBody');
  if (agingBody) {
    let totY = 0, totClr = 0, totStill = 0, totNew = 0, totT = 0, totNet = 0;
    const rows = agingMatrix.map(row => {
      totY += row.yesterdaySilent;
      totClr += row.clearedToday;
      totStill += row.stillSilent;
      totNew += row.newAdditionsToday;
      totT += row.todaySilent;
      totNet += row.netChange;

      return `
        <tr>
          <td><strong>${row.agingBucket}</strong></td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(row.yesterdaySilent)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(row.clearedToday)}</td>
          <td class="text-center font-mono"><span class="badge ${Number(row.clearanceRatePct) >= 5 ? 'badge-success' : 'badge-secondary'}">${row.clearanceRatePct}%</span></td>
          <td class="text-right font-mono" style="color: var(--text-muted);">${formatNum(row.stillSilent)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(row.newAdditionsToday)}</td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(row.todaySilent)}</td>
          <td class="text-right font-mono font-bold ${row.netChange <= 0 ? 'text-emerald' : 'text-rose'}">${row.netChange > 0 ? '+' : ''}${formatNum(row.netChange)}</td>
        </tr>
      `;
    }).join('');

    const totClrRate = totY > 0 ? ((totClr / totY) * 100).toFixed(2) : '0.00';
    const totalRow = `
      <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
        <td><strong>TOTAL (ALL INTERVALS)</strong></td>
        <td class="text-right font-mono font-bold text-amber">${formatNum(totY)}</td>
        <td class="text-right font-mono font-bold text-emerald">${formatNum(totClr)}</td>
        <td class="text-center font-mono"><span class="badge badge-success font-bold">${totClrRate}%</span></td>
        <td class="text-right font-mono text-muted font-bold">${formatNum(totStill)}</td>
        <td class="text-right font-mono font-bold text-rose">${formatNum(totNew)}</td>
        <td class="text-right font-mono font-bold text-amber">${formatNum(totT)}</td>
        <td class="text-right font-mono font-bold ${totNet <= 0 ? 'text-emerald' : 'text-rose'}">${totNet > 0 ? '+' : ''}${formatNum(totNet)}</td>
      </tr>
    `;
    agingBody.innerHTML = rows + totalRow;
  }

  // 4. Table 2: Circle-Wise Recovery & Churn Table
  const circleBody = document.getElementById('circleChurnTableBody');
  const circleFoot = document.getElementById('circleChurnTableFoot');
  if (circleBody) {
    let totY = 0, totC47 = 0, totC830 = 0, totCgt30 = 0, totCnever = 0, totClr = 0, totNew = 0, totNet = 0, totT = 0;

    const rows = circleTable.map(row => {
      totY += row.yesterdaySilent;
      totC47 += row.cleared_4_7d;
      totC830 += row.cleared_8_30d;
      totCgt30 += row.cleared_gt30d;
      totCnever += row.cleared_never;
      totClr += row.clearedToday;
      totNew += row.newAdditionsToday;
      totNet += row.netChange;
      totT += row.todaySilent;

      return `
        <tr class="clickable-row" onclick="filterChurnDivisionByCircle('${(row.circle || '').replace(/'/g, "\\'")}')" title="Click to filter divisions for ${row.circle}">
          <td><strong>${row.circle}</strong></td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(row.yesterdaySilent)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(row.cleared_4_7d)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(row.cleared_8_30d)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(row.cleared_gt30d)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(row.cleared_never)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(row.clearedToday)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(row.newAdditionsToday)}</td>
          <td class="text-right font-mono font-bold ${row.netChange <= 0 ? 'text-emerald' : 'text-rose'}">${row.netChange > 0 ? '+' : ''}${formatNum(row.netChange)}</td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(row.todaySilent)}</td>
          <td class="text-center font-mono"><span class="badge ${Number(row.recoveryRatePct) >= 5 ? 'badge-success' : 'badge-secondary'}">${row.recoveryRatePct}%</span></td>
        </tr>
      `;
    }).join('');

    circleBody.innerHTML = rows;

    if (circleFoot) {
      const totRecPct = totY > 0 ? ((totClr / totY) * 100).toFixed(2) : '0.00';
      circleFoot.innerHTML = `
        <tr class="table-total-row" style="font-weight: 700; border-top: 2px solid var(--border-color);">
          <td><strong>TOTAL (${circleTable.length} CIRCLES)</strong></td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(totY)}</td>
          <td class="text-right font-mono text-cyan font-bold">${formatNum(totC47)}</td>
          <td class="text-right font-mono text-cyan font-bold">${formatNum(totC830)}</td>
          <td class="text-right font-mono text-cyan font-bold">${formatNum(totCgt30)}</td>
          <td class="text-right font-mono text-cyan font-bold">${formatNum(totCnever)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(totClr)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(totNew)}</td>
          <td class="text-right font-mono font-bold ${totNet <= 0 ? 'text-emerald' : 'text-rose'}">${totNet > 0 ? '+' : ''}${formatNum(totNet)}</td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(totT)}</td>
          <td class="text-center font-mono"><span class="badge badge-success font-bold">${totRecPct}%</span></td>
        </tr>
      `;
    }
  }

  // Populate Division Circle Dropdown
  const divCircleSel = document.getElementById('churnDivisionCircleFilter');
  if (divCircleSel && divCircleSel.options.length <= 1) {
    const circles = Array.from(new Set(divisionTable.map(d => d.circle))).sort();
    circles.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      divCircleSel.appendChild(opt);
    });
  }

  renderDivisionChurnTable();

  // 5. Table 4: 10-Day Historical Trend Accumulation Table (Circle, Division, Overall Daywise)
  renderHistoricalTrendTable();

  if (window.lucide) lucide.createIcons();
}

// State for 10-Day Historical Trend Table (Daywise Circle, Division, Overall)
let trendTableState = {
  activeView: 'circle', // 'circle' | 'division' | 'overall'
  dateFilter: 'ALL',
  circleFilter: 'ALL',
  search: ''
};

function populateTrendFilters(data) {
  if (!data) return;

  const dateSel = document.getElementById('trendDateFilter');
  const circleSel = document.getElementById('trendCircleFilter');

  // Collect unique dates from circleTrendHistory / divisionTrendHistory / trendHistory
  const datesSet = new Set();
  (data.circleTrendHistory || []).forEach(r => { if (r.date) datesSet.add(r.date); });
  (data.divisionTrendHistory || []).forEach(r => { if (r.date) datesSet.add(r.date); });
  (data.trendHistory || []).forEach(r => { if (r.date) datesSet.add(r.date); });
  const sortedDates = Array.from(datesSet).sort().reverse();

  if (dateSel) {
    const curVal = dateSel.value || 'ALL';
    dateSel.innerHTML = '<option value="ALL">All Dates (' + sortedDates.length + ' Days)</option>';
    sortedDates.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      dateSel.appendChild(opt);
    });
    if (datesSet.has(curVal)) dateSel.value = curVal;
    else dateSel.value = 'ALL';
    trendTableState.dateFilter = dateSel.value;
  }

  // Collect unique circles
  const circlesSet = new Set();
  (data.circleTrendHistory || []).forEach(r => { if (r.circle) circlesSet.add(r.circle); });
  (data.circleTable || []).forEach(r => { if (r.circle) circlesSet.add(r.circle); });
  const sortedCircles = Array.from(circlesSet).sort();

  if (circleSel) {
    const curCircle = circleSel.value || 'ALL';
    circleSel.innerHTML = '<option value="ALL">All Circles (' + sortedCircles.length + ' Circles)</option>';
    sortedCircles.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      circleSel.appendChild(opt);
    });
    if (circlesSet.has(curCircle)) circleSel.value = curCircle;
    else circleSel.value = 'ALL';
    trendTableState.circleFilter = circleSel.value;
  }
}

function renderHistoricalTrendTable() {
  const data = dailyChurnState.data;
  if (!data) return;

  // Make sure filters are populated if not done yet
  const dateSel = document.getElementById('trendDateFilter');
  if (dateSel && dateSel.options.length <= 1) {
    populateTrendFilters(data);
  }

  const thead = document.getElementById('trendHistoryTableHead');
  const tbody = document.getElementById('trendHistoryTableBody');
  const tfoot = document.getElementById('trendHistoryTableFoot');
  const countBadge = document.getElementById('trendCountBadge');
  const circleFilterGroup = document.getElementById('trendCircleFilterGroup');
  const exportBtnText = document.getElementById('trendExportBtnText');

  if (!tbody || !thead) return;

  const view = trendTableState.activeView || 'circle';

  // Toggle Circle filter visibility: visible for circle & division views
  if (circleFilterGroup) {
    circleFilterGroup.style.display = (view === 'overall') ? 'none' : 'flex';
  }

  // Update export button label
  if (exportBtnText) {
    if (view === 'circle') exportBtnText.textContent = 'Export Circle Trend CSV';
    else if (view === 'division') exportBtnText.textContent = 'Export Division Trend CSV';
    else exportBtnText.textContent = 'Export Overall Trend CSV';
  }

  // Handle CIRCLE-WISE DAYWISE VIEW (User requested 4 metrics: Total Non Comm, Today Addition, Today Clear, Net Addition)
  if (view === 'circle') {
    thead.innerHTML = `
      <tr>
        <th style="min-width: 110px;">Date</th>
        <th style="min-width: 140px;">Circle</th>
        <th class="text-right" style="min-width: 130px;">Total Non Comm</th>
        <th class="text-right" style="min-width: 125px;">Today Addition</th>
        <th class="text-right" style="min-width: 120px;">Today Clear</th>
        <th class="text-right" style="min-width: 120px;">Net Addition</th>
      </tr>
    `;

    let rows = (data.circleTrendHistory || []);

    // Filter by Date
    if (trendTableState.dateFilter && trendTableState.dateFilter !== 'ALL') {
      rows = rows.filter(r => r.date === trendTableState.dateFilter);
    }
    // Filter by Circle
    if (trendTableState.circleFilter && trendTableState.circleFilter !== 'ALL') {
      rows = rows.filter(r => r.circle === trendTableState.circleFilter);
    }
    // Search
    if (trendTableState.search) {
      const q = trendTableState.search.toUpperCase();
      rows = rows.filter(r => (r.circle && r.circle.toUpperCase().includes(q)) || (r.date && r.date.includes(q)));
    }

    // Sort: Date DESC, Circle ASC
    rows.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return (a.circle || '').localeCompare(b.circle || '');
    });

    if (countBadge) countBadge.textContent = `Showing ${rows.length} circle records`;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding: 24px; color: var(--text-muted);">No circle trend records matching selected filters.</td></tr>';
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    let totNonComm = 0, totAdd = 0, totClr = 0, totNet = 0;

    tbody.innerHTML = rows.map(r => {
      totNonComm += (r.totalNonComm || 0);
      totAdd += (r.todayAddition || 0);
      totClr += (r.todayClear || 0);
      totNet += (r.netAddition || 0);

      const netCls = (r.netAddition <= 0) ? 'text-emerald' : 'text-rose';
      const netPrefix = (r.netAddition > 0) ? '+' : '';

      return `
        <tr>
          <td><span class="mono-badge font-bold">${r.date}</span></td>
          <td><strong>${r.circle}</strong></td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(r.totalNonComm)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(r.todayAddition)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(r.todayClear)}</td>
          <td class="text-right font-mono font-bold ${netCls}">${netPrefix}${formatNum(r.netAddition)}</td>
        </tr>
      `;
    }).join('');

    if (tfoot) {
      const totNetCls = (totNet <= 0) ? 'text-emerald' : 'text-rose';
      const totNetPrefix = (totNet > 0) ? '+' : '';
      tfoot.innerHTML = `
        <tr class="table-total-row" style="font-weight: 700; background: rgba(255, 255, 255, 0.05); border-top: 2px solid var(--border-color);">
          <td><strong>TOTAL (${rows.length} ROWS)</strong></td>
          <td>--</td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(totNonComm)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(totAdd)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(totClr)}</td>
          <td class="text-right font-mono font-bold ${totNetCls}">${totNetPrefix}${formatNum(totNet)}</td>
        </tr>
      `;
    }
  }

  // Handle DIVISION-WISE DAYWISE VIEW (User requested 4 metrics: Total Non Comm, Today Addition, Today Clear, Net Addition)
  else if (view === 'division') {
    thead.innerHTML = `
      <tr>
        <th style="min-width: 110px;">Date</th>
        <th style="min-width: 140px;">Circle</th>
        <th style="min-width: 150px;">Division</th>
        <th class="text-right" style="min-width: 130px;">Total Non Comm</th>
        <th class="text-right" style="min-width: 125px;">Today Addition</th>
        <th class="text-right" style="min-width: 120px;">Today Clear</th>
        <th class="text-right" style="min-width: 120px;">Net Addition</th>
      </tr>
    `;

    let rows = (data.divisionTrendHistory || []);

    // Filter by Date
    if (trendTableState.dateFilter && trendTableState.dateFilter !== 'ALL') {
      rows = rows.filter(r => r.date === trendTableState.dateFilter);
    }
    // Filter by Circle
    if (trendTableState.circleFilter && trendTableState.circleFilter !== 'ALL') {
      rows = rows.filter(r => r.circle === trendTableState.circleFilter);
    }
    // Search
    if (trendTableState.search) {
      const q = trendTableState.search.toUpperCase();
      rows = rows.filter(r => 
        (r.division && r.division.toUpperCase().includes(q)) ||
        (r.circle && r.circle.toUpperCase().includes(q)) ||
        (r.date && r.date.includes(q))
      );
    }

    // Sort: Date DESC, Circle ASC, Division ASC
    rows.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      if (a.circle !== b.circle) return (a.circle || '').localeCompare(b.circle || '');
      return (a.division || '').localeCompare(b.division || '');
    });

    if (countBadge) countBadge.textContent = `Showing ${rows.length} division records`;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding: 24px; color: var(--text-muted);">No division trend records matching selected filters.</td></tr>';
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    let totNonComm = 0, totAdd = 0, totClr = 0, totNet = 0;

    tbody.innerHTML = rows.map(r => {
      totNonComm += (r.totalNonComm || 0);
      totAdd += (r.todayAddition || 0);
      totClr += (r.todayClear || 0);
      totNet += (r.netAddition || 0);

      const netCls = (r.netAddition <= 0) ? 'text-emerald' : 'text-rose';
      const netPrefix = (r.netAddition > 0) ? '+' : '';

      return `
        <tr>
          <td><span class="mono-badge font-bold">${r.date}</span></td>
          <td><strong>${r.circle}</strong></td>
          <td><span class="mono-badge">${r.division}</span></td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(r.totalNonComm)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(r.todayAddition)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(r.todayClear)}</td>
          <td class="text-right font-mono font-bold ${netCls}">${netPrefix}${formatNum(r.netAddition)}</td>
        </tr>
      `;
    }).join('');

    if (tfoot) {
      const totNetCls = (totNet <= 0) ? 'text-emerald' : 'text-rose';
      const totNetPrefix = (totNet > 0) ? '+' : '';
      tfoot.innerHTML = `
        <tr class="table-total-row" style="font-weight: 700; background: rgba(255, 255, 255, 0.05); border-top: 2px solid var(--border-color);">
          <td><strong>TOTAL (${rows.length} ROWS)</strong></td>
          <td>--</td>
          <td>--</td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(totNonComm)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(totAdd)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(totClr)}</td>
          <td class="text-right font-mono font-bold ${totNetCls}">${totNetPrefix}${formatNum(totNet)}</td>
        </tr>
      `;
    }
  }

  // Handle OVERALL TREND VIEW
  else {
    thead.innerHTML = `
      <tr>
        <th style="min-width: 105px;">Date</th>
        <th style="min-width: 180px;">Compared With</th>
        <th style="min-width: 100px;">Category</th>
        <th class="text-right" style="min-width: 130px;">Base Silent (Yesterday)</th>
        <th class="text-right">Cleared (4-7D)</th>
        <th class="text-right">Cleared (8-15D)</th>
        <th class="text-right">Cleared (16-30D)</th>
        <th class="text-right">Cleared (>30D)</th>
        <th class="text-right">Cleared (Never)</th>
        <th class="text-right font-bold text-emerald">Total Cleared</th>
        <th class="text-right font-bold text-rose">New Additions</th>
        <th class="text-right font-bold">Net Change</th>
        <th class="text-right font-bold text-amber">Ending Silent</th>
        <th class="text-center">Recovery %</th>
      </tr>
    `;

    let rows = (data.trendHistory || []);

    if (trendTableState.dateFilter && trendTableState.dateFilter !== 'ALL') {
      rows = rows.filter(r => r.date === trendTableState.dateFilter);
    }
    if (trendTableState.search) {
      const q = trendTableState.search.toUpperCase();
      rows = rows.filter(r => (r.category && r.category.toUpperCase().includes(q)) || (r.date && r.date.includes(q)));
    }

    if (countBadge) countBadge.textContent = `Showing ${rows.length} overall cycles`;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="14" class="text-center" style="padding: 24px; color: var(--text-muted);">No multi-day history accumulated yet. Trend accumulates automatically with each daily sync cycle.</td></tr>';
      if (tfoot) tfoot.innerHTML = '';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const netCls = (r.netChange <= 0) ? 'text-emerald' : 'text-rose';
      const netPrefix = (r.netChange > 0) ? '+' : '';
      return `
        <tr>
          <td><strong>${r.date}</strong></td>
          <td><span class="mono-badge text-muted">${r.compareDate} [Yesterday Last Sync]</span></td>
          <td><span class="badge badge-info" style="text-transform: uppercase;">${r.category}</span></td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(r.yesterdaySilent)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(r.cleared_4_7d || 0)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(r.cleared_8_15d || 0)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(r.cleared_16_30d || 0)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(r.cleared_gt30d || 0)}</td>
          <td class="text-right font-mono text-cyan">${formatNum(r.cleared_never || 0)}</td>
          <td class="text-right font-mono font-bold text-emerald">${formatNum(r.clearedToday)}</td>
          <td class="text-right font-mono font-bold text-rose">${formatNum(r.newAdditionsToday)}</td>
          <td class="text-right font-mono font-bold ${netCls}">${netPrefix}${formatNum(r.netChange)}</td>
          <td class="text-right font-mono font-bold text-amber">${formatNum(r.todaySilent)}</td>
          <td class="text-center font-mono"><span class="badge ${Number(r.recoveryRatePct) >= 5 ? 'badge-success' : 'badge-secondary'}">${r.recoveryRatePct}%</span></td>
        </tr>
      `;
    }).join('');

    if (tfoot) tfoot.innerHTML = '';
  }
}

function renderDivisionChurnTable() {
  const data = dailyChurnState.data;
  if (!data) return;

  const divisionTable = data.divisionTable || [];
  const divCircleSel = document.getElementById('churnDivisionCircleFilter');
  const selCircle = divCircleSel ? divCircleSel.value : 'ALL';
  const searchInput = document.getElementById('churnDivisionSearch');
  const searchTerm = searchInput ? searchInput.value.trim().toUpperCase() : '';

  let filtered = divisionTable;
  if (selCircle && selCircle !== 'ALL') {
    filtered = filtered.filter(d => d.circle === selCircle);
  }
  if (searchTerm) {
    filtered = filtered.filter(d => (d.division && d.division.toUpperCase().includes(searchTerm)) || (d.circle && d.circle.toUpperCase().includes(searchTerm)));
  }

  const countHeader = document.getElementById('churnDivisionCountHeader');
  if (countHeader) {
    countHeader.textContent = `Showing ${filtered.length} of ${divisionTable.length} divisions${selCircle !== 'ALL' ? ' (' + selCircle + ')' : ''}`;
  }

  const divisionBody = document.getElementById('divisionChurnTableBody');
  if (!divisionBody) return;

  if (filtered.length === 0) {
    divisionBody.innerHTML = '<tr><td colspan="12" class="text-center" style="padding: 20px; color: var(--text-muted);">No divisions matching filters</td></tr>';
    return;
  }

  let totY = 0, totC47 = 0, totC830 = 0, totCgt30 = 0, totCnever = 0, totClr = 0, totNew = 0, totNet = 0, totT = 0;

  const rows = filtered.map(row => {
    totY += row.yesterdaySilent;
    totC47 += row.cleared_4_7d;
    totC830 += row.cleared_8_30d;
    totCgt30 += row.cleared_gt30d;
    totCnever += row.cleared_never;
    totClr += row.clearedToday;
    totNew += row.newAdditionsToday;
    totNet += row.netChange;
    totT += row.todaySilent;

    return `
      <tr>
        <td><strong>${row.circle}</strong></td>
        <td><span class="mono-badge">${row.division}</span></td>
        <td class="text-right font-mono font-bold text-amber">${formatNum(row.yesterdaySilent)}</td>
        <td class="text-right font-mono text-cyan">${formatNum(row.cleared_4_7d)}</td>
        <td class="text-right font-mono text-cyan">${formatNum(row.cleared_8_30d)}</td>
        <td class="text-right font-mono text-cyan">${formatNum(row.cleared_gt30d)}</td>
        <td class="text-right font-mono text-cyan">${formatNum(row.cleared_never)}</td>
        <td class="text-right font-mono font-bold text-emerald">${formatNum(row.clearedToday)}</td>
        <td class="text-right font-mono font-bold text-rose">${formatNum(row.newAdditionsToday)}</td>
        <td class="text-right font-mono font-bold ${row.netChange <= 0 ? 'text-emerald' : 'text-rose'}">${row.netChange > 0 ? '+' : ''}${formatNum(row.netChange)}</td>
        <td class="text-right font-mono font-bold text-amber">${formatNum(row.todaySilent)}</td>
        <td class="text-center font-mono"><span class="badge ${Number(row.recoveryRatePct) >= 5 ? 'badge-success' : 'badge-secondary'}">${row.recoveryRatePct}%</span></td>
      </tr>
    `;
  }).join('');

  const totRecPct = totY > 0 ? ((totClr / totY) * 100).toFixed(2) : '0.00';
  const totalRow = `
    <tr class="table-total-row" style="font-weight: 700; background: rgba(255,255,255,0.06); border-top: 2px solid var(--border-color);">
      <td><strong>TOTAL (${filtered.length} DIVISIONS)</strong></td>
      <td>--</td>
      <td class="text-right font-mono font-bold text-amber">${formatNum(totY)}</td>
      <td class="text-right font-mono text-cyan font-bold">${formatNum(totC47)}</td>
      <td class="text-right font-mono text-cyan font-bold">${formatNum(totC830)}</td>
      <td class="text-right font-mono text-cyan font-bold">${formatNum(totCgt30)}</td>
      <td class="text-right font-mono text-cyan font-bold">${formatNum(totCnever)}</td>
      <td class="text-right font-mono font-bold text-emerald">${formatNum(totClr)}</td>
      <td class="text-right font-mono font-bold text-rose">${formatNum(totNew)}</td>
      <td class="text-right font-mono font-bold ${totNet <= 0 ? 'text-emerald' : 'text-rose'}">${totNet > 0 ? '+' : ''}${formatNum(totNet)}</td>
      <td class="text-right font-mono font-bold text-amber">${formatNum(totT)}</td>
      <td class="text-center font-mono"><span class="badge badge-success font-bold">${totRecPct}%</span></td>
    </tr>
  `;

  divisionBody.innerHTML = rows + totalRow;
}

function filterChurnDivisionByCircle(circleName) {
  const sel = document.getElementById('churnDivisionCircleFilter');
  if (sel) {
    sel.value = circleName;
    renderDivisionChurnTable();
  }
}
window.filterChurnDivisionByCircle = filterChurnDivisionByCircle;

window.exportChurnData = function(type) {
  const cat = (state.category === 'complaint') ? 'consumer' : state.category;
  window.open(`/api/export/daily-churn?category=${cat}&type=${type}`, '_blank');
};

window.exportCurrentTrendData = function() {
  const cat = (state.category === 'complaint') ? 'consumer' : state.category;
  let type = 'trend';
  if (trendTableState.activeView === 'circle') type = 'circle_trend';
  else if (trendTableState.activeView === 'division') type = 'division_trend';
  window.open(`/api/export/daily-churn?category=${cat}&type=${type}`, '_blank');
};

function setupDailyChurnEventListeners() {
  // Division Table Circle & Search Filters
  const divCircleSel = document.getElementById('churnDivisionCircleFilter');
  if (divCircleSel) {
    divCircleSel.addEventListener('change', renderDivisionChurnTable);
  }
  const searchInput = document.getElementById('churnDivisionSearch');
  if (searchInput) {
    searchInput.addEventListener('input', renderDivisionChurnTable);
  }

  // Trend View Switcher Buttons (Overall / Circle / Division)
  const btnOverall = document.getElementById('btnTrendOverall');
  const btnCircle = document.getElementById('btnTrendCircle');
  const btnDivision = document.getElementById('btnTrendDivision');
  const switcherBtns = [btnOverall, btnCircle, btnDivision].filter(Boolean);

  switcherBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetView = btn.getAttribute('data-view');
      if (!targetView) return;
      trendTableState.activeView = targetView;

      switcherBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      renderHistoricalTrendTable();
    });
  });

  // Trend Filter Controls
  const trendDateSel = document.getElementById('trendDateFilter');
  if (trendDateSel) {
    trendDateSel.addEventListener('change', (e) => {
      trendTableState.dateFilter = e.target.value;
      renderHistoricalTrendTable();
    });
  }

  const trendCircleSel = document.getElementById('trendCircleFilter');
  if (trendCircleSel) {
    trendCircleSel.addEventListener('change', (e) => {
      trendTableState.circleFilter = e.target.value;
      renderHistoricalTrendTable();
    });
  }

  const trendSearch = document.getElementById('trendSearchInput');
  if (trendSearch) {
    trendSearch.addEventListener('input', (e) => {
      trendTableState.search = e.target.value.trim();
      renderHistoricalTrendTable();
    });
  }
}

// ==========================================================================
// INSTANT TABLE SCREENSHOT & CLIPBOARD SHARING MODULE
// Takes crisp high-resolution screenshot of summary table card and writes to
// system clipboard (PNG) for immediate pasting (Ctrl+V) into WhatsApp, Teams, Email.
// ==========================================================================

async function copyTableScreenshot(cardId, defaultFilename = 'Table_Summary', btn = null) {
  const card = document.getElementById(cardId);
  if (!card) {
    showToast('Table container not found', 'error');
    return;
  }

  if (typeof html2canvas === 'undefined') {
    showToast('Screenshot engine loading... please retry in a moment.', 'warning');
    return;
  }

  // 1. Button loading state
  let origBtnHtml = '';
  if (btn) {
    origBtnHtml = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('capturing');
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> <span>Snapping...</span>`;
    if (window.lucide) lucide.createIcons();
  }

  // 2. Prepare deferred promise for modern Chrome/Edge ClipboardItem
  // Calling navigator.clipboard.write SYNCHRONOUSLY inside user click handler ensures
  // transient user activation does NOT expire during html2canvas rendering!
  let resolveBlob, rejectBlob;
  const blobPromise = new Promise((resolve, reject) => {
    resolveBlob = resolve;
    rejectBlob = reject;
  });

  let clipboardWritePromise = null;
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      clipboardWritePromise = navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blobPromise })
      ]);
    } catch (err) {
      console.warn('Initial clipboard write initiation failed:', err);
    }
  }

  // 3. Prepare elements for clean screenshot:
  // - Temporarily hide action buttons so they don't appear in screenshot
  // - Temporarily unconstrain table overflow so wide tables aren't cut off
  const actionContainers = card.querySelectorAll('.table-actions, .btn-snap, .no-print');
  const responsiveContainers = card.querySelectorAll('.table-responsive');
  
  const savedRcStyles = [];
  responsiveContainers.forEach((rc) => {
    savedRcStyles.push({
      overflow: rc.style.overflow,
      maxWidth: rc.style.maxWidth,
      width: rc.style.width,
      display: rc.style.display
    });
    rc.style.overflow = 'visible';
    rc.style.maxWidth = 'none';
    rc.style.width = 'fit-content';
    rc.style.minWidth = '100%';
  });

  const savedCardStyle = {
    width: card.style.width,
    minWidth: card.style.minWidth,
    boxShadow: card.style.boxShadow,
    borderRadius: card.style.borderRadius
  };

  actionContainers.forEach(el => {
    el.style.visibility = 'hidden';
  });

  const targetWidth = Math.max(card.scrollWidth, card.offsetWidth, 1050);
  card.style.width = targetWidth + 'px';
  card.style.minWidth = targetWidth + 'px';
  card.style.borderRadius = '12px';

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const bgColor = isDark ? '#0b1120' : '#ffffff';

  try {
    // 4. Render Canvas at scale 1.5 (Crisp retina resolution, taint-free)
    const canvas = await html2canvas(card, {
      backgroundColor: bgColor,
      scale: 1.5,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: targetWidth + 60
    });

    // 5. Restore original DOM styles immediately
    responsiveContainers.forEach((rc, idx) => {
      rc.style.overflow = savedRcStyles[idx].overflow;
      rc.style.maxWidth = savedRcStyles[idx].maxWidth;
      rc.style.width = savedRcStyles[idx].width;
      rc.style.display = savedRcStyles[idx].display;
    });
    card.style.width = savedCardStyle.width;
    card.style.minWidth = savedCardStyle.minWidth;
    card.style.boxShadow = savedCardStyle.boxShadow;
    card.style.borderRadius = savedCardStyle.borderRadius;
    actionContainers.forEach(el => {
      el.style.visibility = '';
    });

    // 6. Robust binary Blob generation with DataURL fallback
    function dataUrlToBlob(url) {
      try {
        const arr = url.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
      } catch (e) {
        console.error('dataUrlToBlob failed:', e);
        return null;
      }
    }

    let blob = null;
    try {
      blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    } catch (e) {
      console.warn('canvas.toBlob failed, trying fallback:', e);
    }

    let dataUrl = '';
    try {
      dataUrl = canvas.toDataURL('image/png');
      if (!blob && dataUrl) {
        blob = dataUrlToBlob(dataUrl);
      }
    } catch (e) {
      console.warn('toDataURL failed:', e);
    }

    if (!blob) {
      if (rejectBlob) rejectBlob(new Error('Failed to create image blob'));
      showToast('Failed to create snapshot image', 'error');
      resetBtn();
      return;
    }

    // Resolve deferred blob promise to complete clipboard write
    if (resolveBlob) resolveBlob(blob);

    let wasCopied = false;
    if (clipboardWritePromise) {
      try {
        await clipboardWritePromise;
        wasCopied = true;
      } catch (clipErr) {
        console.warn('Promise-based clipboard write failed:', clipErr);
      }
    }

    // Update button state
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('capturing');
      btn.innerHTML = wasCopied ? `<i data-lucide="check"></i> <span>Copied! (Ctrl+V)</span>` : `<i data-lucide="camera"></i> <span>Snapshot Ready</span>`;
      if (wasCopied) btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
      if (window.lucide) lucide.createIcons();
      setTimeout(resetBtn, 3000);
    }

    if (wasCopied) {
      showToast('✓ Table screenshot copied to clipboard! Paste directly (Ctrl + V)', 'success');
    } else {
      showToast('Snapshot ready! Click Download or Copy below.', 'info');
    }

    // 7. Show Snapshot Preview Modal with direct copy & download options
    showSnapshotPreviewModal(blob, dataUrl, defaultFilename, wasCopied);

  } catch (err) {
    console.error('Snapshot capture failed:', err);
    if (rejectBlob) rejectBlob(err);
    responsiveContainers.forEach((rc, idx) => {
      rc.style.overflow = savedRcStyles[idx].overflow;
      rc.style.maxWidth = savedRcStyles[idx].maxWidth;
      rc.style.width = savedRcStyles[idx].width;
      rc.style.display = savedRcStyles[idx].display;
    });
    card.style.width = savedCardStyle.width;
    card.style.minWidth = savedCardStyle.minWidth;
    actionContainers.forEach(el => {
      el.style.visibility = '';
    });
    showToast('Snapshot failed: ' + err.message, 'error');
    resetBtn();
  }

  function resetBtn() {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('capturing');
      btn.innerHTML = origBtnHtml;
      btn.style.background = '';
      if (window.lucide) lucide.createIcons();
    }
  }
}
window.copyTableScreenshot = copyTableScreenshot;

// Modal dialog showing captured screenshot with 1-click Copy & Download
function showSnapshotPreviewModal(blob, dataUrl, filename, wasCopied) {
  let modal = document.getElementById('tableSnapshotModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'tableSnapshotModal';
    modal.className = 'snapshot-modal-overlay';
    document.body.appendChild(modal);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const fullName = `${filename}_${dateStr}`;

  modal.innerHTML = `
    <div class="snapshot-modal-card card">
      <div class="snapshot-modal-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div class="badge-icon-snap"><i data-lucide="camera"></i></div>
          <div>
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700;">Table Screenshot Ready for Management</h4>
            <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">${fullName}.png</p>
          </div>
        </div>
        <button class="btn-icon" id="btnCloseSnapshotModal" style="width: 32px; height: 32px; border-radius: 6px;"><i data-lucide="x"></i></button>
      </div>

      <div class="snapshot-modal-status ${wasCopied ? 'status-copied' : 'status-pending'}">
        <i data-lucide="${wasCopied ? 'check-circle' : 'info'}"></i>
        <span>${wasCopied 
          ? '✓ <strong>Copied directly to clipboard!</strong> You can now switch to WhatsApp, Teams, or Email and press <strong>Ctrl + V</strong>.' 
          : '⚠️ Clipboard write requires user confirmation. Click <strong>Copy Image to Clipboard</strong> or <strong>Download PNG</strong> below.'}</span>
      </div>

      <div class="snapshot-img-container">
        <img src="${dataUrl}" alt="Table Screenshot Preview" id="snapshotPreviewImg" title="Right-click and select 'Copy image' to paste anywhere" />
      </div>

      <div class="snapshot-modal-footer">
        <span style="font-size: 0.76rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
          <i data-lucide="mouse-pointer"></i> Tip: You can also right-click the image preview above and choose <em>"Copy Image"</em>.
        </span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-primary" id="btnSnapshotModalCopy">
            <i data-lucide="copy"></i> Copy Image (Ctrl+V)
          </button>
          <button class="btn btn-sm btn-secondary" id="btnSnapshotModalDownload">
            <i data-lucide="download"></i> Download PNG
          </button>
          <button class="btn btn-sm btn-outline" id="btnSnapshotModalClose">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  modal.classList.add('active');
  if (window.lucide) lucide.createIcons();

  // Close handlers
  const closeModal = () => modal.classList.remove('active');
  modal.querySelector('#btnCloseSnapshotModal')?.addEventListener('click', closeModal);
  modal.querySelector('#btnSnapshotModalClose')?.addEventListener('click', closeModal);
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };

  // Copy button inside modal (Fresh user click gesture)
  const copyBtn = modal.querySelector('#btnSnapshotModalCopy');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          showToast('✓ Image copied to clipboard! Paste directly (Ctrl + V)', 'success');
          copyBtn.innerHTML = '<i data-lucide="check"></i> Copied to Clipboard!';
          copyBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
          if (window.lucide) lucide.createIcons();
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i> Copy Image (Ctrl+V)';
            copyBtn.style.background = '';
            if (window.lucide) lucide.createIcons();
          }, 2500);
        }
      } catch (err) {
        showToast('Clipboard write failed: ' + err.message + '. Please use Download PNG.', 'error');
      }
    });
  }

  // Download button inside modal
  const dlBtn = modal.querySelector('#btnSnapshotModalDownload');
  if (dlBtn) {
    dlBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${fullName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('✓ High-res PNG image downloaded', 'info');
    });
  }
}
window.showSnapshotPreviewModal = showSnapshotPreviewModal;


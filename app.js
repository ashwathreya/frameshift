/* ══════════════════════════════════════════════════════════════
   FRAMESHIFT ARTIST FLOW — Step 2: Version & Task System
   • VersionStore — single source of truth for all version data
   • render.*     — stateless DOM updaters driven by the store
   • TabSystem    — panel switching with history tracking
   • UploadZone   — drag-and-drop + click-to-browse upload
   • Player       — basic playback scrubbing on the viewer
══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   VERSION STORE
───────────────────────────────────────────────────────── */
const DEFAULT_VERSIONS = [
    { tag:'v012', num:12, time:'2h ago',      status:'working',  notes:0, by:'Maya Patel',   size:'2.4 GB',  filename:'SH_0100_comp_v012.exr', task:'SH_0100' },
    { tag:'v011', num:11, time:'Yesterday',    status:'revise',   notes:2, by:'Maya Patel',   size:'2.1 GB',  filename:'SH_0100_comp_v011.exr', task:'SH_0100' },
    { tag:'v010', num:10, time:'2 days ago',   status:'revise',   notes:1, by:'Maya Patel',   size:'2.3 GB',  filename:'SH_0100_comp_v010.exr', task:'SH_0100' },
    { tag:'v009', num: 9, time:'3 days ago',   status:'approved', notes:0, by:'Maya Patel',   size:'2.0 GB',  filename:'SH_0100_comp_v009.exr', task:'SH_0100' },
    { tag:'v008', num: 8, time:'4 days ago',   status:'approved', notes:0, by:'Maya Patel',   size:'1.9 GB',  filename:'SH_0100_comp_v008.exr', task:'SH_0100' },
    { tag:'v007', num: 7, time:'5 days ago',   status:'revise',   notes:3, by:'Maya Patel',   size:'2.2 GB',  filename:'SH_0100_comp_v007.exr', task:'SH_0100' },
];
const Store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }
};

const ShellLayout = {
  storageKey: 'frameshift.shell.sidebarCollapsed',

  isCollapsed() {
    return !!Store.get(this.storageKey, false);
  },

  setCollapsed(collapsed) {
    Store.set(this.storageKey, !!collapsed);
    this.apply();
  },

  toggleSidebar(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.setCollapsed(!this.isCollapsed());
  },

  apply() {
    const rootApp = document.querySelector('#root .app');
    if (!rootApp) return;
    rootApp.classList.toggle('is-sidebar-collapsed', this.isCollapsed());
    this.updateTooltips(rootApp);
  },

  updateTooltips(rootApp) {
    const collapsed = rootApp.classList.contains('is-sidebar-collapsed');
    const setTitle = (el, label) => {
      if (!el || !label) return;
      if (collapsed) el.setAttribute('title', label);
      else el.removeAttribute('title');
    };

    rootApp.querySelectorAll('.sv-nav-item').forEach((item) => {
      const label = item.querySelector('.sv-nav-label')?.textContent?.trim();
      setTitle(item, label);
    });
    rootApp.querySelectorAll('.artist-app .nav-item').forEach((item) => {
      const label = item.textContent?.trim();
      setTitle(item, label);
    });

    const collapseBtn = rootApp.querySelector('.sv-collapse');
    if (collapseBtn) {
      const labelNode = collapseBtn.querySelector('.sv-nav-label');
      if (labelNode) {
        labelNode.textContent = collapsed ? 'Expand' : 'Collapse';
      }
      setTitle(collapseBtn, collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }
  }
};
window.ShellLayout = ShellLayout;

const User = {
  current: Store.get('frameshift.currentUser', {
    name: 'Maya Patel',
    role: 'artist',
    department: 'FX'
  }),

  setRole(role) {
    this.current.role = role;
    Store.set('frameshift.currentUser', this.current);
    this.applyRole();
    renderAppByRole();
    initAppForRole();
  },

  applyRole() {
    document.body.dataset.role = this.current.role;
    const name = document.querySelector('.user-name');
    const role = document.querySelector('.user-role');
    const av = document.querySelector('.user-av');
    if (name) name.textContent = this.current.name;
    if (role) {
      role.textContent = this.current.role === 'supervisor'
        ? 'FX Supervisor'
        : this.current.role === 'producer'
          ? 'Producer'
          : 'FX Artist';
    }
    if (av) av.textContent = this.current.name.split(' ').map(p => p[0]).join('').slice(0,2);
  },

  canReview() {
    return this.current.role === 'supervisor';
  }
};
window.User = User;

const AssignmentBridge = {
  _statusToArtist(status) {
    if (status === 'sim_running') return { label: 'In Progress', progress: 60, priority: 1 };
    if (status === 'revise') return { label: 'Needs Revision', progress: 40, priority: 2 };
    if (status === 'needs_review' || status === 'cache_ready') return { label: 'Assigned', progress: 20, priority: 3 };
    if (status === 'failed') return { label: 'Blocked', progress: 10, priority: 4 };
    return { label: 'Assigned', progress: 15, priority: 5 };
  },
  assignmentsForArtist(artistName) {
    if (!artistName || typeof SupervisorDashboard === 'undefined') return [];
    return SupervisorDashboard._allShots()
      .filter((shot) => shot.actor === artistName)
      .slice()
      .sort((a, b) => {
        const rank = (s) => (s.priority === 'high' ? 0 : s.priority === 'medium' ? 1 : 2);
        const byPriority = rank(a) - rank(b);
        if (byPriority !== 0) return byPriority;
        const urgency = (s) => (s.status === 'failed' ? 0 : s.status === 'revise' ? 1 : s.status === 'needs_review' ? 2 : 3);
        return urgency(a) - urgency(b);
      });
  },
  hydrateArtistTaskFlow() {
    if (typeof TaskFlow === 'undefined') return;
    const artistName = User.current.name;
    const assignments = this.assignmentsForArtist(artistName).slice(0, 5);
    if (!assignments.length) return;
    const queue = assignments.map((shot) => shot.shot);
    const details = {};
    assignments.forEach((shot, index) => {
      const mapped = this._statusToArtist(shot.status);
      details[shot.shot] = {
        description: `${shot.project} · ${shot.fxType}`,
        taskType: 'FX Simulation',
        department: User.current.department || 'FX',
        version: shot.version || `v${String(index + 1).padStart(3, '0')}`,
        deadline: mapped.priority <= 2 ? 'Today' : 'This Week',
        remaining: shot.updated ? `Updated ${shot.updated}` : 'Scheduled',
        progress: mapped.progress,
        statusLabel: mapped.label,
        priority: index + 1,
        project: shot.project,
        sourceShot: shot.shot
      };
    });
    TaskFlow.queue = queue;
    TaskFlow.dependencies = queue.reduce((acc, shot) => ({ ...acc, [shot]: [] }), {});
    TaskFlow.details = { ...TaskFlow.details, ...details };
    const persistedCurrent = Store.get('frameshift.currentTask', queue[0]);
    TaskFlow.current = queue.includes(persistedCurrent) ? persistedCurrent : queue[0];
    Store.set('frameshift.currentTask', TaskFlow.current);
    const known = new Set(queue);
    TaskFlow.completed = TaskFlow.completed.filter((shot) => known.has(shot));
    Store.set('frameshift.completedTasks', TaskFlow.completed);
    this.bindArtistTaskSlots(queue);
  },
  bindArtistTaskSlots(queue) {
    const slots = [
      document.querySelector('.current-task-card'),
      document.querySelector('.up-next-card'),
      ...Array.from(document.querySelectorAll('.task-row'))
    ].filter(Boolean);
    slots.forEach((node, idx) => {
      const shot = queue[idx];
      if (!shot) {
        node.style.display = 'none';
        return;
      }
      node.style.display = '';
      node.dataset.shot = shot;
      node.setAttribute('onclick', `openTask('${shot}')`);
    });
  }
};
window.AssignmentBridge = AssignmentBridge;

function mountRoleTemplate(templateId) {
  const root = document.getElementById('root');
  const template = document.getElementById(templateId);
  if (!root || !template) return;
  root.innerHTML = '';
  root.appendChild(template.content.cloneNode(true));
}

function renderArtistApp() {
  mountRoleTemplate('artist-app-template');
}

function renderSupervisorApp() {
  mountRoleTemplate('supervisor-app-template');
}

function renderProducerApp() {
  mountRoleTemplate('producer-app-template');
}

function applyRoleUI(role) {
  document.querySelectorAll('[data-role]').forEach((el) => {
    const isVisible = el.dataset.role === role;
    el.classList.toggle('is-role-hidden', !isVisible);
  });
}

function renderAppByRole() {
  switch (User.current.role) {
    case 'artist':
      renderArtistApp();
      break;
    case 'supervisor':
      renderSupervisorApp();
      break;
    case 'producer':
      renderProducerApp();
      break;
    default:
      renderArtistApp();
      break;
  }
  applyRoleUI(User.current.role);
  ShellLayout.apply();
}
window.renderAppByRole = renderAppByRole;

window.toggleRole = () => {
  const order = ['artist', 'supervisor', 'producer'];
  const index = order.indexOf(User.current.role);
  User.setRole(order[(index + 1) % order.length]);
};

function signOutToAuth() {
  try {
    localStorage.removeItem('frameshift.authRole');
    localStorage.removeItem('frameshift.currentUser');
  } catch (_error) {
    // Keep sign out flow resilient even if storage is unavailable.
  }
  window.location.replace('./pages/auth/login.html');
}

const UserMenu = {
  toggle(event) {
    event?.stopPropagation();
    document.getElementById('user-menu')?.classList.toggle('open');
  },

  close() {
    document.getElementById('user-menu')?.classList.remove('open');
  },

  profile(event) {
    event?.stopPropagation();
    showToast('info', `${User.current.name} · ${User.current.role} · ${User.current.department}`);
    this.close();
  },

  setRole(event, role) {
    event?.stopPropagation();
    User.setRole(role);
    this.close();
    showToast('info', `Switched to ${role} role`);
  },

  signOut(event) {
    event?.stopPropagation();
    this.close();
    signOutToAuth();
  }
};
window.UserMenu = UserMenu;
document.addEventListener('click', () => UserMenu.close());

const SupervisorUserMenu = {
  _avatarKey: 'frameshift.supervisorAvatar',

  toggle(event) {
    event?.stopPropagation();
    document.getElementById('sv-user-menu')?.classList.toggle('open');
  },

  close() {
    document.getElementById('sv-user-menu')?.classList.remove('open');
  },

  profile(event) {
    event?.stopPropagation();
    showToast('info', 'Supervisor profile settings');
    this.close();
  },

  notifications(event) {
    event?.stopPropagation();
    showToast('info', 'Supervisor notifications');
    this.close();
  },

  preferences(event) {
    event?.stopPropagation();
    showToast('info', 'Supervisor preferences');
    this.close();
  },

  uploadAvatar(event) {
    event?.stopPropagation();
    document.getElementById('sv-user-avatar-upload')?.click();
  },

  onAvatarSelected(event) {
    event?.stopPropagation();
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      Store.set(this._avatarKey, String(reader.result || ''));
      this.applyHeaderProfile();
      showToast('success', 'Supervisor profile picture updated');
    };
    reader.readAsDataURL(file);
    this.close();
  },

  applyHeaderProfile() {
    const avatar = document.getElementById('sv-user-avatar');
    const name = document.getElementById('sv-user-name');
    const role = document.getElementById('sv-user-role');
    if (name) name.textContent = User.current.name || 'Sarah Connor';
    if (role) {
      role.textContent = User.current.role === 'supervisor'
        ? 'FX Supervisor'
        : User.current.role === 'producer'
          ? 'Producer'
          : 'FX Artist';
    }
    const saved = Store.get(this._avatarKey, '');
    const fallback = `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(User.current.name || 'Sarah Connor')}`;
    if (avatar) avatar.src = saved || fallback;
  },

  setRole(event, role) {
    event?.stopPropagation();
    UserMenu.setRole(event, role);
    this.close();
  },

  signOut(event) {
    event?.stopPropagation();
    this.close();
    signOutToAuth();
  }
};
window.SupervisorUserMenu = SupervisorUserMenu;
document.addEventListener('click', () => SupervisorUserMenu.close());

// DATA
const DashboardData = {
  getInsights(ctx) {
    const { shots, counts } = ctx;
    const runningOrQueued = shots.filter(s => s.status === 'sim_running' || s.status === 'revise');
    const delayRisk = runningOrQueued.filter(s => SupervisorDashboard._hoursFromUpdated(s.updated) >= 3).length;
    const backlog = Math.max(0, counts.running - counts.cache);
    const failureTrend = Math.min(6, counts.failed + Math.ceil(backlog / 2));
    const queuePressure = backlog >= 3 ? 'High' : backlog > 0 ? 'Moderate' : 'Stable';
    const atRiskCount = shots.filter(s => (s.priority === 'high' && (s.status === 'sim_running' || s.status === 'revise')) || s.overdue).length;
    const shouldShowCritical = counts.failed > 0 || failureTrend >= 2 || atRiskCount >= 3;
    return [
      { level: shouldShowCritical ? 'critical' : 'high', icon: '⚠', title: `${failureTrend} simulations likely to fail in next 2 hours`, cta: 'Open Failed Queue', action: `SupervisorDashboard.applyQueueFilter('failed')` },
      { level: backlog >= 3 ? 'high' : 'medium', icon: '📊', title: `Queue pressure ${queuePressure.toLowerCase()} (${counts.running} running / ${counts.cache} ready)`, cta: 'Review Queue', action: `SupervisorDashboard.applyQueueFilter('needs-review')` },
      { level: delayRisk >= 3 ? 'high' : 'medium', icon: '⏱', title: `${delayRisk} simulations delayed past target cycle time`, cta: 'Check Delays', action: `SupervisorDashboard.applyQueueFilter('high-priority')` },
      { level: atRiskCount >= 3 ? 'high' : 'medium', icon: '🕒', title: `${atRiskCount} shots at risk of missing today's review window`, cta: 'Review Risk', action: `SupervisorDashboard.applyQueueFilter('needs-review')` }
    ];
  },
  getImmediateAttention(ctx) {
    const { shots } = ctx;
    return shots
      .filter(s => s.status === 'failed' || s.status === 'revise' || (s.priority === 'high' && (s.needsSupervisor || s.status === 'sim_running')))
      .sort((a, b) => SupervisorDashboard._priorityRank(a.priority) - SupervisorDashboard._priorityRank(b.priority))
      .slice(0, 5);
  },
  getReviewPipeline(ctx) {
    const { shots } = ctx;
    return {
      needs: shots.filter(s => s.status === 'needs_review' || s.status === 'cache_ready'),
      inReview: shots.filter(s => s.status === 'sim_running' || s.status === 'revise'),
      approved: shots.filter(s => s.status === 'approved')
    };
  }
};

// INSIGHTS
function generateInsights(data) {
  return DashboardData.getInsights(data);
}

function analyzeNotes(notes = []) {
  const keywordConfig = [
    { key: 'smoke', aliases: ['smoke', 'plume', 'fog'] },
    { key: 'fire', aliases: ['fire', 'flame', 'burn', 'embers'] },
    { key: 'debris', aliases: ['debris', 'shard', 'fragment', 'rubble'] }
  ];
  const byFrame = {};
  const recurring = {};
  const repeatedKeywords = {};
  (notes || []).forEach((n) => {
    const text = String(n.text || '').toLowerCase();
    const frame = Number(n.frame || 0);
    if (frame) {
      if (!byFrame[frame]) byFrame[frame] = [];
      byFrame[frame].push(n);
    }
    keywordConfig.forEach((k) => {
      if (k.aliases.some((a) => text.includes(a))) {
        repeatedKeywords[k.key] = (repeatedKeywords[k.key] || 0) + 1;
        recurring[k.key] = recurring[k.key] || [];
        recurring[k.key].push(n);
      }
    });
  });
  const clusteredFrames = Object.keys(byFrame)
    .map((f) => ({ frame: Number(f), count: byFrame[f].length, notes: byFrame[f] }))
    .sort((a, b) => b.count - a.count);
  return { repeatedKeywords, clusteredFrames, recurringIssues: recurring };
}

function generateSuggestions(analysis) {
  const suggestions = [];
  const rules = {
    smoke: 'Adjust smoke density breakup and add turbulence variation.',
    fire: 'Tune fire intensity falloff and shading response across the shot.',
    debris: 'Refine debris timing and velocity arcs for better readability.'
  };
  Object.entries(analysis.repeatedKeywords || {}).forEach(([key, count]) => {
    const rec = analysis.recurringIssues?.[key] || [];
    const frame = Number(rec[0]?.frame || analysis.clusteredFrames?.[0]?.frame || 1);
    const relatedNoteIds = rec.map((n) => n.id).filter(Boolean);
    suggestions.push({
      id: `sg-${key}-${frame}`,
      keyword: key,
      frame,
      severity: count >= 3 ? 'high' : 'medium',
      label: `${key.toUpperCase()} recurring in notes (${count})`,
      detail: rules[key] || 'Review recurring issue and apply targeted pass.',
      relatedNoteIds
    });
  });
  return suggestions;
}

// ATTENTION
function getImmediateAttention(data) {
  return DashboardData.getImmediateAttention(data);
}

// PIPELINE
function getReviewPipeline(data) {
  return DashboardData.getReviewPipeline(data);
}

const SupervisorDashboard = {
  currentProject: Store.get('frameshift.supervisorProject', 'all'),
  currentView: Store.get('frameshift.supervisorView', 'dashboard'),
  currentFilter: 'needs-review',
  activityFilter: 'errors',
  _liveSeconds: 0,
  reviewQueueState: Store.get('frameshift.reviewQueueState', {
    groupBy: 'shot',
    status: 'all',
    department: 'all',
    priority: 'all',
    query: '',
    sortBy: 'updated',
    sortDir: 'desc',
    page: 1,
    pageSize: 10
  }),
  reviewWorkspaceState: Store.get('frameshift.reviewWorkspaceState', {
    selectedShot: '',
    currentFrame: 125,
    reviewStatus: 'pending',
    activeTool: 'pointer',
    activeTab: 'notes',
    queueFilter: 'all',
    isPlaying: false,
    selectedVersion: '',
    currentVersion: '',
    previousVersion: '',
    compareMode: false,
    playbackSpeed: 1,
    loopEnabled: false,
    loopIn: 1,
    loopOut: 300,
    noteFilter: 'open',
    selectedShots: [],
    lastBulkSummary: '',
    lastSelectedShot: '',
    compareVersionTag: ''
    ,
    compareMode: 'off',
    compareOpacity: 0.45,
    wipePosition: 50,
    floatingNoteDraft: '',
    floatingNoteAt: null,
    expandedNoteId: '',
    focusedNoteId: '',
    drawingHiddenNoteIds: [],
    versionPanelOpen: false,
    activeSuggestionKeyword: '',
    compareState: {
      enabled: false,
      mode: 'off',
      baseVersion: '',
      compareVersion: '',
      wipeX: 50,
      opacity: 0.45
    },
    liveSession: {
      users: [],
      currentShot: '',
      currentFrame: 1,
      followMode: true,
      livePresenceOpen: false
    }
  }),
  artistAvatarMap: Store.get('frameshift.artistAvatarMap', {}),
  artistDirectory: [
    { name:'Maya Patel', title:'FX Artist' },
    { name:'Evan Brooks', title:'FX Artist' },
    { name:'Iris Lee', title:'FX Artist' },
    { name:'Noah Kim', title:'FX Artist' },
    { name:'Priya Nair', title:'FX Artist' },
    { name:'Diego Alvarez', title:'FX Artist' },
    { name:'Lena Volkova', title:'FX Artist' },
    { name:'Aiden Shaw', title:'FX Artist' },
    { name:'Farah Haddad', title:'FX Artist' },
    { name:'Tariq Rahman', title:'FX Artist' },
    { name:'Sofia Mendes', title:'FX Artist' },
    { name:'Jonah Price', title:'FX Artist' },
    { name:'Keiko Tanaka', title:'FX Artist' }
  ],
  shots: [
    { project:'Echo Point', shot:'SH_0102', fxType:'Debris Burst', version:'v012', status:'failed', priority:'high', issue:'CACHE FAILED — Particle overflow', needsSupervisor:true, overdue:true, updated:'2h ago', actor:'Sim Farm E2', event:'cache failed' },
    { project:'Echo Point', shot:'SH_0104', fxType:'City Burning', version:'v004', status:'sim_running', priority:'medium', issue:'Flame sim running on final camera', needsSupervisor:false, updated:'45m ago', actor:'Echo Runner', event:'simulation started' },
    { project:'Echo Point', shot:'SH_0105', fxType:'Smoke Plume', version:'v006', status:'revise', priority:'high', issue:'Needs density adjustment', needsSupervisor:true, updated:'5h ago', actor:'Maya Patel', event:'sent for revise' },
    { project:'Echo Point', shot:'SH_0106', fxType:'Spark Shower', version:'v008', status:'approved', priority:'low', issue:'Sparks pass signed off', needsSupervisor:false, updated:'2d ago', actor:'Iris Lee', event:'approved' },
    { project:'Echo Point', shot:'SH_0108', fxType:'Building Collapse', version:'v003', status:'needs_review', priority:'high', issue:'Building fracture pass ready for review', needsSupervisor:true, updated:'1h ago', actor:'Echo Artist 4', event:'submitted for review' },
    { project:'Echo Point', shot:'SH_0110', fxType:'Fire Blast', version:'v002', status:'revise', priority:'high', issue:'Flame curl timing mismatch', needsSupervisor:true, overdue:true, updated:'1d ago', actor:'Evan Brooks', event:'sent for revise' },
    { project:'Echo Point', shot:'SH_0111', fxType:'River Flood', version:'v005', status:'cache_ready', priority:'medium', issue:'River interaction cache ready', needsSupervisor:true, updated:'2h ago', actor:'Sim Farm E3', event:'cache completed' },
    { project:'Echo Point', shot:'SH_0113', fxType:'Dust Impact', version:'v007', status:'sim_running', priority:'medium', issue:'Ground impact dust in progress', needsSupervisor:false, updated:'3h ago', actor:'Echo Runner', event:'simulation started' },
    { project:'Echo Point', shot:'SH_0114', fxType:'Avalanche', version:'v003', status:'needs_review', priority:'medium', issue:'Avalanche interaction pass ready', needsSupervisor:true, updated:'4h ago', actor:'Echo Artist 6', event:'submitted for review' },
    { project:'Echo Point', shot:'SH_0116', fxType:'Sand Sweep', version:'v002', status:'cache_ready', priority:'low', issue:'Sand sweep pass approved for lighting handoff', needsSupervisor:false, updated:'9h ago', actor:'Sim Farm E1', event:'cache completed' },
    { project:'Echo Point', shot:'SH_0118', fxType:'Bridge Collapse', version:'v009', status:'failed', priority:'high', issue:'Substep instability on impact burst', needsSupervisor:true, overdue:true, updated:'6h ago', actor:'Sim Farm E5', event:'cache failed' },
    { project:'Echo Point', shot:'SH_0120', fxType:'Ember Trail', version:'v004', status:'approved', priority:'low', issue:'Energy trail pass approved', needsSupervisor:false, updated:'1d ago', actor:'Echo Artist 2', event:'approved' },

    { project:'Atlas', shot:'SH_0410', fxType:'Ocean Surface', version:'v012', status:'sim_running', priority:'medium', issue:'Long running ocean sim pass', needsSupervisor:false, updated:'30m ago', actor:'Atlas Runner', event:'simulation started' },
    { project:'Atlas', shot:'SH_0411', fxType:'Whitewater', version:'v005', status:'needs_review', priority:'medium', issue:'Foam breakup pass needs supervisor eye', needsSupervisor:true, updated:'2h ago', actor:'Atlas Artist 1', event:'submitted for review' },
    { project:'Atlas', shot:'SH_0413', fxType:'Dust Trail', version:'v006', status:'revise', priority:'medium', issue:'Holdout edges need cleanup', needsSupervisor:true, updated:'6h ago', actor:'Noah Kim', event:'sent for revise' },
    { project:'Atlas', shot:'SH_0414', fxType:'Building Blast', version:'v003', status:'failed', priority:'high', issue:'Rigid body explode pass diverged', needsSupervisor:true, overdue:true, updated:'3h ago', actor:'Sim Farm A6', event:'cache failed' },
    { project:'Atlas', shot:'SH_0416', fxType:'Debris Spray', version:'v004', status:'cache_ready', priority:'low', issue:'Ready for supervisor review', needsSupervisor:true, updated:'7h ago', actor:'Sim Farm A3', event:'cache completed' },
    { project:'Atlas', shot:'SH_0418', fxType:'Industrial Smoke', version:'v008', status:'sim_running', priority:'medium', issue:'Industrial smoke plume pass running', needsSupervisor:false, updated:'1h ago', actor:'Atlas Runner', event:'simulation started' },
    { project:'Atlas', shot:'SH_0420', fxType:'Snow Burst', version:'v010', status:'needs_review', priority:'high', issue:'Particle advect motion needs final review', needsSupervisor:true, updated:'50m ago', actor:'Atlas Artist 7', event:'submitted for review' },
    { project:'Atlas', shot:'SH_0422', fxType:'Debris Field', version:'v002', status:'revise', priority:'high', issue:'Debris silhouette too noisy', needsSupervisor:true, updated:'8h ago', actor:'Atlas Artist 3', event:'sent for revise' },
    { project:'Atlas', shot:'SH_0425', fxType:'Explosion Core', version:'v004', status:'cache_ready', priority:'medium', issue:'Pyro cache ready for comp checks', needsSupervisor:true, updated:'5h ago', actor:'Sim Farm A7', event:'cache completed' },
    { project:'Atlas', shot:'SH_0427', fxType:'Sandstorm', version:'v003', status:'approved', priority:'low', issue:'Sandstorm interaction approved', needsSupervisor:false, updated:'2d ago', actor:'Atlas Artist 9', event:'approved' },
    { project:'Atlas', shot:'SH_0429', fxType:'Bridge Collapse', version:'v001', status:'failed', priority:'high', issue:'Constraint spikes on hero frame', needsSupervisor:true, overdue:true, updated:'9h ago', actor:'Sim Farm A9', event:'cache failed' },
    { project:'Atlas', shot:'SH_0431', fxType:'Energy Burst', version:'v006', status:'cache_ready', priority:'medium', issue:'Energy burst cache completed', needsSupervisor:true, updated:'4h ago', actor:'Sim Farm A4', event:'cache completed' },

    { project:'Nova', shot:'SH_0231', fxType:'Smoke Wall', version:'v015', status:'needs_review', priority:'high', issue:'Needs supervisor eye on breakup', needsSupervisor:true, updated:'1h ago', actor:'Nova Artist', event:'submitted for review' },
    { project:'Nova', shot:'SH_0233', fxType:'Waterfall', version:'v007', status:'sim_running', priority:'medium', issue:'Waterfall hero sim in progress', needsSupervisor:false, updated:'2h ago', actor:'Nova Runner', event:'simulation started' },
    { project:'Nova', shot:'SH_0235', fxType:'Debris Pull', version:'v005', status:'cache_ready', priority:'medium', issue:'Cache completed, waiting review', needsSupervisor:true, updated:'3h ago', actor:'Sim Farm N1', event:'cache completed' },
    { project:'Nova', shot:'SH_0238', fxType:'Fire', version:'v009', status:'failed', priority:'high', issue:'Solver divergence in final frames', needsSupervisor:true, overdue:true, updated:'4h ago', actor:'Sim Farm N2', event:'cache failed' },
    { project:'Nova', shot:'SH_0240', fxType:'Street Collapse', version:'v003', status:'revise', priority:'high', issue:'Street collapse timing off by 14 frames', needsSupervisor:true, updated:'6h ago', actor:'Nova Artist 5', event:'sent for revise' },
    { project:'Nova', shot:'SH_0242', fxType:'Ash Drift', version:'v011', status:'sim_running', priority:'medium', issue:'Particle render cache pending', needsSupervisor:false, updated:'3h ago', actor:'Nova Runner', event:'simulation started' },
    { project:'Nova', shot:'SH_0244', fxType:'Fireball', version:'v004', status:'needs_review', priority:'high', issue:'Pyro readability check requested', needsSupervisor:true, updated:'2h ago', actor:'Nova Artist 3', event:'submitted for review' },
    { project:'Nova', shot:'SH_0247', fxType:'Flood Surge', version:'v002', status:'cache_ready', priority:'low', issue:'Flood surge secondary cache ready', needsSupervisor:true, updated:'9h ago', actor:'Sim Farm N6', event:'cache completed' },
    { project:'Nova', shot:'SH_0250', fxType:'Debris Trail', version:'v003', status:'approved', priority:'low', issue:'Debris pass approved for final comp', needsSupervisor:false, updated:'1d ago', actor:'Nova Artist 8', event:'approved' },
    { project:'Nova', shot:'SH_0252', fxType:'Avalanche', version:'v001', status:'revise', priority:'medium', issue:'Avalanche edge clipping in close-up', needsSupervisor:true, updated:'7h ago', actor:'Nova Artist 11', event:'sent for revise' },
    { project:'Nova', shot:'SH_0254', fxType:'Bridge Collapse', version:'v002', status:'failed', priority:'high', issue:'Collapse trigger missed timing window', needsSupervisor:true, overdue:true, updated:'5h ago', actor:'Sim Farm N9', event:'cache failed' },
    { project:'Nova', shot:'SH_0256', fxType:'Impact Burst', version:'v006', status:'cache_ready', priority:'medium', issue:'Impact energy cache completed', needsSupervisor:true, updated:'4h ago', actor:'Sim Farm N4', event:'cache completed' },

    { project:'Echo Point', shot:'SH_0122', fxType:'Fireline Spread', version:'v003', status:'needs_review', priority:'high', issue:'Needs timing approval for fireline spread', needsSupervisor:true, updated:'35m ago', actor:'Maya Patel', event:'submitted for review' },
    { project:'Echo Point', shot:'SH_0124', fxType:'Debris Rain', version:'v005', status:'failed', priority:'high', issue:'Debris collision pass diverged near frame 112', needsSupervisor:true, overdue:true, updated:'1h ago', actor:'Evan Brooks', event:'cache failed' },
    { project:'Echo Point', shot:'SH_0126', fxType:'Smoke Layer', version:'v004', status:'revise', priority:'high', issue:'Smoke layering lacks depth in hero beat', needsSupervisor:true, updated:'2h ago', actor:'Iris Lee', event:'sent for revise' },
    { project:'Echo Point', shot:'SH_0128', fxType:'Bridge Collapse', version:'v002', status:'sim_running', priority:'high', issue:'Bridge fracture sim running on farm', needsSupervisor:true, updated:'50m ago', actor:'Maya Patel', event:'simulation started' },
    { project:'Echo Point', shot:'SH_0130', fxType:'Ash Fallout', version:'v003', status:'needs_review', priority:'medium', issue:'Ash breakup pass queued for supervisor review', needsSupervisor:true, updated:'3h ago', actor:'Evan Brooks', event:'submitted for review' },
    { project:'Echo Point', shot:'SH_0132', fxType:'Gas Explosion', version:'v001', status:'failed', priority:'high', issue:'Blast pressure overdrives camera framing', needsSupervisor:true, overdue:true, updated:'4h ago', actor:'Aiden Shaw', event:'cache failed' },

    { project:'Atlas', shot:'SH_0433', fxType:'Tunnel Dustout', version:'v004', status:'needs_review', priority:'high', issue:'Tunnel dustout needs supervisor signoff', needsSupervisor:true, updated:'25m ago', actor:'Maya Patel', event:'submitted for review' },
    { project:'Atlas', shot:'SH_0435', fxType:'Harbor Wave Crash', version:'v005', status:'sim_running', priority:'high', issue:'Harbor wave interaction sim still running', needsSupervisor:true, updated:'1h ago', actor:'Iris Lee', event:'simulation started' },
    { project:'Atlas', shot:'SH_0437', fxType:'Debris Avalanche', version:'v003', status:'revise', priority:'high', issue:'Debris cadence needs retime on impact', needsSupervisor:true, updated:'2h ago', actor:'Evan Brooks', event:'sent for revise' },
    { project:'Atlas', shot:'SH_0439', fxType:'Fuel Fire', version:'v002', status:'failed', priority:'high', issue:'Fuel fire pass flickers at cut transition', needsSupervisor:true, overdue:true, updated:'5h ago', actor:'Maya Patel', event:'cache failed' },
    { project:'Atlas', shot:'SH_0441', fxType:'Smoke Tunnel', version:'v006', status:'needs_review', priority:'medium', issue:'Smoke tunnel pass waiting for notes', needsSupervisor:true, updated:'4h ago', actor:'Farah Haddad', event:'submitted for review' },
    { project:'Atlas', shot:'SH_0443', fxType:'Rockfall', version:'v004', status:'cache_ready', priority:'medium', issue:'Rockfall cache staged for review', needsSupervisor:true, updated:'6h ago', actor:'Evan Brooks', event:'cache completed' },

    { project:'Nova', shot:'SH_0258', fxType:'City Burning', version:'v004', status:'failed', priority:'high', issue:'City burning look breaks continuity in shot tail', needsSupervisor:true, overdue:true, updated:'40m ago', actor:'Maya Patel', event:'cache failed' },
    { project:'Nova', shot:'SH_0260', fxType:'Train Wreck Debris', version:'v003', status:'revise', priority:'high', issue:'Debris timing needs director beat match', needsSupervisor:true, updated:'1h ago', actor:'Iris Lee', event:'sent for revise' },
    { project:'Nova', shot:'SH_0262', fxType:'Storm Smoke', version:'v005', status:'needs_review', priority:'high', issue:'Storm smoke breakup waiting approval', needsSupervisor:true, updated:'2h ago', actor:'Evan Brooks', event:'submitted for review' },
    { project:'Nova', shot:'SH_0264', fxType:'Dam Break', version:'v002', status:'sim_running', priority:'high', issue:'Dam break sim in final water solve', needsSupervisor:true, updated:'55m ago', actor:'Diego Alvarez', event:'simulation started' },
    { project:'Nova', shot:'SH_0266', fxType:'Firestorm', version:'v001', status:'failed', priority:'high', issue:'Firestorm pass unstable during camera spin', needsSupervisor:true, overdue:true, updated:'3h ago', actor:'Maya Patel', event:'cache failed' },
    { project:'Nova', shot:'SH_0268', fxType:'Bridge Collapse', version:'v004', status:'needs_review', priority:'medium', issue:'Bridge collapse secondary dust ready for review', needsSupervisor:true, updated:'7h ago', actor:'Iris Lee', event:'submitted for review' }
  ],

  _statusLabel(status) {
    const map = {
      needs_review: 'Needs Review',
      sim_running: 'Sim Running',
      cache_ready: 'Cache Ready',
      revise: 'Revise',
      approved: 'Approved',
      failed: 'Failed'
    };
    return map[status] || status;
  },

  _statusMarkClass(status) {
    const map = {
      needs_review: 'purple',
      sim_running: 'blue',
      cache_ready: 'blue',
      revise: 'medium',
      approved: 'green',
      failed: 'high'
    };
    return map[status] || 'purple';
  },

  _activityIconClass(shot) {
    if (shot.status === 'failed' || /failed/i.test(shot.event)) return 'fail';
    if (shot.status === 'revise' || /revise/i.test(shot.event)) return 'revise';
    if (shot.status === 'approved' || /approved/i.test(shot.event)) return 'approved';
    if (shot.status === 'sim_running' || /started/i.test(shot.event)) return 'started';
    return 'default';
  },

  _activityIconSvg(iconClass) {
    if (iconClass === 'fail') {
      return `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4 21 19H3L12 4z"></path>
        <path d="M12 10v4"></path>
        <circle cx="12" cy="16.8" r=".7"></circle>
      </svg>`;
    }
    if (iconClass === 'revise') {
      return `<svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 12a8 8 0 1 1-2.5-5.8"></path>
        <path d="M20 4v5h-5"></path>
      </svg>`;
    }
    if (iconClass === 'approved') {
      return `<svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8"></circle>
        <path d="m8.5 12 2.3 2.3L15.8 9.5"></path>
      </svg>`;
    }
    if (iconClass === 'started') {
      return `<svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8"></circle>
        <path d="M12 8v4l2.8 1.6"></path>
      </svg>`;
    }
    return `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8.5 7.5 4h9L21 8.5v8.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 17.3z"></path>
      <path d="M7 12h10"></path>
    </svg>`;
  },

  _priorityRank(priority) {
    return priority === 'high' ? 0 : priority === 'medium' ? 1 : 2;
  },

  _projectPrefix(shot) {
    return this.currentProject === 'all' ? `[${shot.project}] ` : '';
  },

  _companyArtists() {
    return this.artistDirectory.map(a => a.name);
  },

  _normalizeShotActors() {
    const company = this._companyArtists();
    if (!company.length) return;
    this.shots = this.shots.map((shot, idx) => {
      if (company.includes(shot.actor)) return shot;
      return { ...shot, actor: company[idx % company.length] };
    });
  },

  _projectShots() {
    return this.shots.filter(shot => shot.project === this.currentProject);
  },

  _allShots() {
    return this.shots.slice();
  },

  _filterForQueue(shots, filter) {
    if (filter === 'immediate') return shots.filter(s => s.status === 'failed' || (s.priority === 'high' && s.needsSupervisor));
    if (filter === 'failed') return shots.filter(s => s.status === 'failed');
    if (filter === 'high-priority') return shots.filter(s => s.priority === 'high');
    if (filter === 'cache-ready') return shots.filter(s => s.status === 'cache_ready');
    if (filter === 'blocked') return shots.filter(s => s.status === 'failed' || s.status === 'revise');
    if (filter === 'needs-review') return shots.filter(s => s.status === 'needs_review' || s.status === 'cache_ready');
    if (filter === 'approved') return shots.filter(s => s.status === 'approved');
    return shots;
  },

  _counts(shots) {
    return {
      needs: shots.filter(s => s.status === 'needs_review').length,
      running: shots.filter(s => s.status === 'sim_running').length,
      cache: shots.filter(s => s.status === 'cache_ready').length,
      revise: shots.filter(s => s.status === 'revise').length,
      approved: shots.filter(s => s.status === 'approved').length,
      failed: shots.filter(s => s.status === 'failed').length,
      overdue: shots.filter(s => s.overdue).length
    };
  },

  _hoursFromUpdated(updated) {
    if (!updated) return 0;
    const m = String(updated).match(/(\d+)\s*([mhd])/i);
    if (!m) return 0;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'm') return Math.max(1, Math.round(n / 60));
    if (unit === 'h') return n;
    return n * 24;
  },

  _timeWaiting(updated) {
    const h = this._hoursFromUpdated(updated);
    return h >= 24 ? `Waiting ${Math.round(h / 24)}d` : `Waiting ${h}h`;
  },

  _riskLabel(shot) {
    if (shot.status === 'failed') return { label: 'Blocked', cls: 'high' };
    if (shot.priority === 'high' || shot.overdue) return { label: 'At Risk', cls: 'medium' };
    return { label: 'On Track', cls: 'green' };
  },

  _simTrend(counts) {
    if (counts.failed >= 2) return 'Delays increasing';
    if (counts.running > counts.cache) return 'Queue pressure rising';
    return 'Stable';
  },

  _dependencyTag(shot) {
    if (shot.status === 'failed') return { cls: 'blocked', label: 'Blocked by simulation' };
    if (shot.status === 'sim_running') return { cls: 'waiting', label: 'Waiting on cache' };
    if (shot.needsSupervisor) return { cls: 'dependent', label: 'Downstream impact: 2 shots' };
    return null;
  },

  _renderLiveUpdated() {
    if (this.currentProject === 'all') return;
    const el = document.querySelector('#sv-project-dashboard .sv-updated');
    if (!el) return;
    el.innerHTML = `<span class="sv-live-dot"></span>Updated ${this._liveSeconds}s ago`;
  },

  _animateValueTick(el) {
    if (!el) return;
    el.classList.remove('sv-value-tick');
    void el.offsetWidth;
    el.classList.add('sv-value-tick');
  },

  _animatePanel(ids) {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove('sv-panel-refresh');
      void el.offsetWidth;
      el.classList.add('sv-panel-refresh');
    });
  },

  _bindDependencyHover() {
    if (this._depsBound) return;
    const root = document.getElementById('sv-project-dashboard');
    if (!root) return;
    const toggle = (shot, on) => {
      if (!shot) return;
      root.querySelectorAll('.list-item').forEach((item) => {
        const firstStrong = item.querySelector('strong');
        if (!firstStrong) return;
        const matches = firstStrong.textContent.includes(shot);
        if (matches) item.classList.toggle('sv-linked-highlight', on);
      });
    };
    root.addEventListener('mouseover', (event) => {
      const tag = event.target.closest('.sv-tag[data-blocked-shot]');
      toggle(tag?.dataset.blockedShot, true);
    });
    root.addEventListener('mouseout', (event) => {
      const tag = event.target.closest('.sv-tag[data-blocked-shot]');
      toggle(tag?.dataset.blockedShot, false);
    });
    this._depsBound = true;
  },

  setProject(project) {
    this.currentProject = project;
    Store.set('frameshift.supervisorProject', project);
    this.render();
  },

  setView(view) {
    const allowed = new Set(['dashboard', 'review-queue', 'review-workspace']);
    this.currentView = allowed.has(view) ? view : 'dashboard';
    Store.set('frameshift.supervisorView', this.currentView);
    const app = document.getElementById('supervisor-app');
    if (app) app.classList.toggle('sv-review-queue-mode', this.currentView === 'review-queue');
    if (this.currentView === 'review-workspace') {
      document.body.classList.add('sidebar-collapsed');
      if (typeof ShellLayout !== 'undefined') ShellLayout.setCollapsed(true);
    } else {
      document.body.classList.remove('sidebar-collapsed');
      this._stopWorkspacePlayback();
    }
    this.render();
  },

  updateReviewQueueFilter(key, value) {
    this.reviewQueueState[key] = value;
    if (key !== 'page') this.reviewQueueState.page = 1;
    Store.set('frameshift.reviewQueueState', this.reviewQueueState);
    this.renderReviewQueue();
  },

  setReviewQueueSort(column) {
    if (this.reviewQueueState.sortBy === column) {
      this.reviewQueueState.sortDir = this.reviewQueueState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.reviewQueueState.sortBy = column;
      this.reviewQueueState.sortDir = column === 'updated' ? 'desc' : 'asc';
    }
    this.reviewQueueState.page = 1;
    Store.set('frameshift.reviewQueueState', this.reviewQueueState);
    this.renderReviewQueue();
  },

  setReviewQueuePage(page) {
    this.reviewQueueState.page = Math.max(1, page);
    Store.set('frameshift.reviewQueueState', this.reviewQueueState);
    this.renderReviewQueue();
  },

  toggleReviewQueueMenu(event, shot) {
    event?.stopPropagation();
    const trigger = event?.currentTarget;
    if (!trigger) return;
    const row = trigger.closest('tr');
    if (!row) return;
    const menu = row.querySelector('.sv-rq-actions-menu');
    if (!menu) return;
    document.querySelectorAll('.sv-rq-actions-menu.open').forEach((el) => {
      if (el !== menu) el.classList.remove('open');
    });
    menu.classList.toggle('open');
    menu.dataset.shot = shot;
  },

  closeReviewQueueMenus() {
    document.querySelectorAll('.sv-rq-actions-menu.open').forEach((el) => el.classList.remove('open'));
  },

  reviewQueueAction(event, action, shot) {
    event?.stopPropagation();
    this.closeReviewQueueMenus();
    if (action === 'open-shot') return this.openShot(shot);
    if (action === 'open-review') {
      this.currentFilter = 'needs-review';
      return this.goToReviewQueue();
    }
    if (action === 'assign') return showToast('info', `Assign/Reassign artist for ${shot}`);
    if (action === 'status') return showToast('info', `Change status for ${shot}`);
    if (action === 'priority') return showToast('info', `Set priority for ${shot}`);
    if (action === 'versions') return showToast('info', `Viewing versions for ${shot}`);
    if (action === 'notes') return showToast('info', `Open notes for ${shot}`);
    if (action === 'activity') return showToast('info', `Viewing activity log for ${shot}`);
  },

  _queueContext() {
    return this.currentProject === 'all' ? 'all-projects' : 'project';
  },

  getReviewQueueData(context, projectId) {
    const shots = context === 'all-projects'
      ? this._allShots()
      : this._allShots().filter((s) => s.project === projectId);
    return shots.map((shot, idx) => ({
      ...shot,
      task: `${shot.fxType} Simulation`,
      department: 'FX',
      thumbClass: idx % 4
    }));
  },

  _syncNavState() {
    const dash = document.getElementById('sv-nav-dashboard');
    const queue = document.getElementById('sv-nav-review-queue');
    const workspace = document.getElementById('sv-nav-review-workspace');
    if (dash) dash.classList.toggle('active', this.currentView === 'dashboard');
    if (queue) queue.classList.toggle('active', this.currentView === 'review-queue');
    if (workspace) workspace.classList.toggle('active', this.currentView === 'review-workspace');
    const pill = queue?.querySelector('.sv-pill');
    if (pill) {
      const context = this._queueContext();
      const data = this.getReviewQueueData(context, this.currentProject);
      pill.textContent = String(data.length);
    }
  },

  _bindTopSearch() {
    const topSearch = document.querySelector('.sv-search');
    if (!topSearch) return;
    topSearch.oninput = (event) => {
      const query = String(event?.target?.value || '');
      const commandInput = document.getElementById('sv-command-input');
      if (commandInput) commandInput.value = query;
      if (!query.trim()) {
        SupervisorDashboardPalette.close();
        return;
      }
      SupervisorDashboardPalette.open({ keep_focus: true });
      SupervisorDashboardPalette.search(query);
    };
    topSearch.onkeydown = (event) => {
      const query = String(topSearch.value || '').trim();
      if (!query) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
        SupervisorDashboardPalette.open({ keep_focus: true });
        SupervisorDashboardPalette.keynav(event);
      }
      if (event.key === 'Escape') {
        SupervisorDashboardPalette.close();
        topSearch.blur();
      }
    };
  },

  render() {
    const isGlobal = this.currentProject === 'all';
    const projectView = document.getElementById('sv-project-dashboard');
    const globalView = document.getElementById('sv-global-dashboard');
    const queueView = document.getElementById('sv-review-queue-view');
    const workspaceView = document.getElementById('sv-review-workspace-view');
    const supervisorApp = document.getElementById('supervisor-app');
    if (supervisorApp) supervisorApp.classList.toggle('sv-global-mode', isGlobal);
    if (supervisorApp) supervisorApp.classList.toggle('sv-review-queue-mode', this.currentView === 'review-queue');
    if (supervisorApp) supervisorApp.classList.toggle('sv-review-workspace-mode', this.currentView === 'review-workspace');
    const showQueue = this.currentView === 'review-queue';
    const showWorkspace = this.currentView === 'review-workspace';
    document.body.classList.toggle('sidebar-collapsed', showWorkspace);
    if (projectView) {
      const hidden = showQueue || showWorkspace || isGlobal;
      projectView.classList.toggle('is-hidden', hidden);
      projectView.style.display = hidden ? 'none' : '';
    }
    if (globalView) {
      const hidden = showQueue || showWorkspace || !isGlobal;
      globalView.classList.toggle('is-hidden', hidden);
      globalView.style.display = hidden ? 'none' : '';
    }
    if (queueView) {
      queueView.classList.toggle('is-hidden', !showQueue);
      queueView.style.display = showQueue ? '' : 'none';
    }
    if (workspaceView) {
      workspaceView.classList.toggle('is-hidden', !showWorkspace);
      workspaceView.style.display = showWorkspace ? '' : 'none';
      if (showWorkspace) workspaceView.classList.add('review-workspace-host');
    }
    this._syncNavState();
    if (showQueue) {
      this.renderReviewQueue();
      this._bindTopSearch();
      return;
    }
    if (showWorkspace) {
      this.renderReviewWorkspace();
      this._bindTopSearch();
      return;
    }
    if (isGlobal) {
      this.renderGlobal();
      this._bindTopSearch();
      return;
    }
    this.renderProject();
    this._bindTopSearch();
  },

  renderProject() {
    const root = document.getElementById('sv-project-dashboard');
    if (root) {
      root.innerHTML = `
        <div class="main-container">
          <div class="sv-project-layout dashboard-grid">
          <div class="dashboard-header page-header">
            <div class="sv-heading-row">
              <div>
                <h1 id="sv-project-heading">Project Supervisor Overview</h1>
                <p id="sv-project-subheading">Pipeline health and critical triage.</p>
              </div>
              <div class="sv-updated">Last updated: 2m ago</div>
            </div>
          </div>
          <div class="sv-decision-bar section">
            <div class="sv-kpi-row" id="sv-kpi-row">
              <article class="sv-kpi-compact is-critical" id="sv-kpi-card-failed">
                <h3>FAILED SIMS</h3>
                <strong id="sv-kpi-failed">0</strong>
                <em>requires action</em>
              </article>
              <article class="sv-kpi-compact" id="sv-kpi-card-needs">
                <h3>NEEDS REVIEW</h3>
                <strong id="sv-kpi-needs">0</strong>
                <em>ready now</em>
              </article>
              <article class="sv-kpi-compact" id="sv-kpi-card-running">
                <h3>SIM RUNNING</h3>
                <strong id="sv-kpi-running">0</strong>
                <em>active sims</em>
              </article>
              <article class="sv-kpi-compact" id="sv-kpi-card-cache">
                <h3>CACHE READY</h3>
                <strong id="sv-kpi-cache">0</strong>
                <em>awaiting review</em>
              </article>
              <article class="sv-kpi-compact is-high" id="sv-kpi-card-revise">
                <h3>REVISE</h3>
                <strong id="sv-kpi-revise">0</strong>
                <em>pending fixes</em>
              </article>
              <article class="sv-kpi-compact is-muted" id="sv-kpi-card-approved">
                <h3>APPROVED</h3>
                <strong id="sv-kpi-approved">0</strong>
                <em>today</em>
              </article>
            </div>
          </div>

          <div class="sv-insights-strip section">
            <div class="sv-insights-head">
              <div class="sv-insights-title section-title">SUPERVISOR INSIGHTS</div>
              <button class="sv-link sv-card-link" id="sv-insights-viewall">View all insights (4)</button>
            </div>
            <div class="sv-insights-row" id="sv-insight-list"></div>
          </div>

          <section class="sv-card card sv-decision-card sv-immediate-full full-width section">
            <div class="sv-card-title">🔥 Immediate Attention <span class="sv-att-count" id="sv-immediate-count">0</span> <button class="sv-link sv-card-link" id="sv-immediate-viewall">View all</button></div>
            <div class="sv-att-table-head">
              <span>SHOT</span>
              <span>ISSUE</span>
              <span>ASSIGNED TO</span>
              <span>TIME</span>
              <span>ACTIONS</span>
            </div>
            <div class="sv-list sv-alert-list" id="sv-immediate-list"></div>
          </section>

          <section class="sv-review-buckets-wrap section">
            <div class="sv-card-title sv-review-pipeline-title"><span>Review Pipeline</span><button class="sv-link sv-card-link" onclick="SupervisorDashboard.applyQueueFilter('all')">View review queue <span>→</span></button></div>
            <div class="sv-review-buckets-grid">
              <section class="sv-card sv-workflow-card sv-bucket-card sv-bucket-card-needs" role="button" tabindex="0" onclick="SupervisorDashboard.applyQueueFilter('needs-review')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();SupervisorDashboard.applyQueueFilter('needs-review')}">
                <div class="sv-card-title"><span>Needs Review <b id="sv-bucket-needs-count">0</b></span><button class="sv-link sv-card-link" onclick="SupervisorDashboard.applyQueueFilter('needs-review')">View all</button></div>
                <div class="sv-list sv-bucket-list" id="sv-bucket-needs-list"></div>
              </section>
              <section class="sv-card sv-workflow-card sv-bucket-card sv-bucket-card-review" role="button" tabindex="0" onclick="SupervisorDashboard.applyQueueFilter('high-priority')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();SupervisorDashboard.applyQueueFilter('high-priority')}">
                <div class="sv-card-title"><span>In Review <b id="sv-bucket-review-count">0</b></span><button class="sv-link sv-card-link" onclick="SupervisorDashboard.applyQueueFilter('high-priority')">View all</button></div>
                <div class="sv-list sv-bucket-list" id="sv-bucket-review-list"></div>
              </section>
              <section class="sv-card sv-workflow-card sv-bucket-card sv-bucket-card-approved" role="button" tabindex="0" onclick="SupervisorDashboard.applyQueueFilter('approved')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();SupervisorDashboard.applyQueueFilter('approved')}">
                <div class="sv-card-title"><span>Recently Approved <b id="sv-bucket-approved-count">0</b></span><button class="sv-link sv-card-link" onclick="SupervisorDashboard.applyQueueFilter('approved')">View all</button></div>
                <div class="sv-list sv-bucket-list" id="sv-bucket-approved-list"></div>
              </section>
            </div>
          </section>

          <div class="sv-context-zone">
            <section class="sv-card sv-context-muted" id="sv-context-deadlines-card">
              <div class="sv-card-title">Upcoming Deadlines</div>
              <div class="sv-list sv-deadline-list" id="sv-upcoming-deadlines-list"></div>
            </section>

            <section class="sv-card sv-context-muted" id="sv-context-events-card">
              <div class="sv-card-title">Critical Events
                <span class="sv-title-actions">
                  <button class="sv-mini-pill active" id="sv-act-filter-all" onclick="SupervisorDashboard.setActivityFilter('all')">All</button>
                  <button class="sv-mini-pill" id="sv-act-filter-errors" onclick="SupervisorDashboard.setActivityFilter('errors')">Errors</button>
                  <button class="sv-mini-pill" id="sv-act-filter-approvals" onclick="SupervisorDashboard.setActivityFilter('approvals')">Approvals</button>
                  <button class="sv-mini-pill" id="sv-act-filter-assignments" onclick="SupervisorDashboard.setActivityFilter('assignments')">Assignments</button>
                </span>
              </div>
              <div class="sv-list sv-activity" id="sv-activity-list"></div>
            </section>

            <section class="sv-card sv-context-muted" id="sv-review-workload-card">
              <div class="sv-card-title">Review Workload <button class="sv-link sv-card-link">View all</button></div>
              <div class="sv-list sv-workload-list" id="sv-review-workload-list"></div>
            </section>
          </div>

          <section class="sv-card card sv-project-cta-wrap section">
            <p class="sv-project-cta-helper"><strong>3 items need your attention</strong><span>1 critical • 2 high</span></p>
            <button class="sv-primary" id="sv-project-cta-btn" onclick="SupervisorDashboard.goToReviewQueue()">Open Attention Hub</button>
            <button class="sv-secondary" id="sv-project-cta-secondary" onclick="SupervisorDashboard.applyQueueFilter('all')">View all (3)</button>
          </section>

          <div class="sv-command-palette" id="sv-command-palette">
            <div class="sv-command-backdrop" onclick="SupervisorDashboardPalette.close()"></div>
            <div class="sv-command-panel">
              <input id="sv-command-input" class="sv-command-input" placeholder="Search shots, artists, sims..." oninput="SupervisorDashboardPalette.search(this.value)" onkeydown="SupervisorDashboardPalette.keynav(event)" />
              <div class="sv-command-results" id="sv-command-results"></div>
            </div>
          </div>
          </div>
        </div>
      `;
    }

    const shots = this._projectShots();
    const counts = this._counts(shots);
    const sorter = (a, b) => this._priorityRank(a.priority) - this._priorityRank(b.priority);
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (!el) return;
      const next = String(value);
      if (el.textContent !== next) this._animateValueTick(el);
      el.textContent = next;
    };
    setText('sv-kpi-needs', counts.needs);
    setText('sv-kpi-running', counts.running);
    setText('sv-kpi-cache', counts.cache);
    setText('sv-kpi-revise', counts.revise);
    setText('sv-kpi-approved', counts.approved);
    setText('sv-kpi-failed', counts.failed);
    this._renderLiveUpdated();
    const kpiSub = [
      ['sv-kpi-card-failed', `${counts.failed > 0 ? `↑ ${counts.failed} in last hour` : 'No change'}`],
      ['sv-kpi-card-needs', 'No change'],
      ['sv-kpi-card-running', `${counts.running > counts.cache ? '↑ Increasing' : 'No change'}`],
      ['sv-kpi-card-cache', 'No change'],
      ['sv-kpi-card-revise', `${counts.revise} pending fixes`],
      ['sv-kpi-card-approved', 'No change']
    ];
    kpiSub.forEach(([id, text]) => {
      const card = document.getElementById(id);
      if (!card) return;
      const em = card.querySelector('em');
      if (em) em.textContent = text;
    });
    const failedCard = document.getElementById('sv-kpi-card-failed');
    if (failedCard) failedCard.classList.toggle('sv-kpi-critical', counts.failed > 0);

    const insightEl = document.getElementById('sv-insight-list');
    if (insightEl) {
      const insights = generateInsights({ shots, counts });
      const rank = { critical: 0, high: 1, medium: 2 };
      insightEl.innerHTML = insights
        .sort((a, b) => rank[a.level] - rank[b.level])
        .slice(0, 4)
        .map(i => `
          <button class="sv-insight-item sv-insight-${i.level}" onclick="${i.action}">
            <span class="sv-insight-icon">${i.icon}</span>
            <span class="sv-insight-copy">
              <strong>${i.title}</strong>
            </span>
            <mark class="${i.level === 'critical' ? 'critical' : i.level === 'high' ? 'high' : 'medium'}">${i.level[0].toUpperCase() + i.level.slice(1)}</mark>
            <em>${i.cta}</em>
          </button>
        `).join('');
      this._animatePanel(['sv-insight-list']);
    }

    const immediate = getImmediateAttention({ shots, counts }).sort(sorter);
    const immediateEl = document.getElementById('sv-immediate-list');
    const immediateCount = document.getElementById('sv-immediate-count');
    if (immediateCount) immediateCount.textContent = String(immediate.length);
    if (immediateEl) {
      immediateEl.innerHTML = immediate.map((s, idx) => {
        const parts = String(s.issue || '').split('—').map(p => p.trim()).filter(Boolean);
        const issueTitle = parts[0] || this._statusLabel(s.status).toUpperCase();
        const issueDetail = parts.slice(1).join(' — ') || parts[0] || 'Requires supervisor attention';
        const urgency = s.status === 'failed' ? 'Critical' : 'High';
        return `
          <div class="sv-att-row ${idx === 0 ? 'sv-att-row-primary' : ''}">
            <span class="sv-att-shot">
              <span class="sv-att-thumb ${idx % 3 === 0 ? 'sv-thumb-1' : idx % 3 === 1 ? 'sv-thumb-2' : 'sv-thumb-3'}"></span>
              <span class="sv-att-shot-copy">
                <strong>${s.shot}</strong>
                <small>${s.fxType} Simulation</small>
              </span>
            </span>
            <span class="sv-att-issue">
              <strong class="${s.status === 'failed' ? 'is-failed' : ''}">${issueTitle}</strong>
              <small>${issueDetail}</small>
            </span>
            <span class="sv-att-assigned">
              <strong>${s.actor || 'Unassigned'}</strong>
              <small>${s.actor?.includes('Sim Farm') ? 'Machine' : 'FX Artist'}</small>
            </span>
            <span class="sv-att-time">
              <small>${s.updated}</small>
              <mark class="${urgency === 'Critical' ? 'critical' : 'high'}">${urgency}</mark>
            </span>
            <span class="sv-att-actions">
              <button onclick="SupervisorDashboard.openShot('${s.shot}')">Open Shot</button>
              <button class="sv-att-more" aria-label="More actions">&#8942;</button>
            </span>
          </div>
        `;
      }).join('');
      this._animatePanel(['sv-immediate-list']);
    }
    const immediateViewAll = document.getElementById('sv-immediate-viewall');
    if (immediateViewAll) immediateViewAll.textContent = `View all (${immediate.length})`;

    const activityEl = document.getElementById('sv-activity-list');
    if (activityEl) {
      const repeated = shots.filter(s => /failed|revise/i.test(s.event)).reduce((acc, s) => {
        const key = s.fxType;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const filtered = shots.filter(s => {
        if (this.activityFilter === 'errors') return s.status === 'failed' || /failed|revise/i.test(s.event);
        if (this.activityFilter === 'approvals') return s.status === 'approved' || /approved/i.test(s.event);
        if (this.activityFilter === 'assignments') return /submitted|review|revise|assigned/i.test(s.event);
        return s.status === 'failed' || /failed|revise|approved/i.test(s.event);
      });
      activityEl.innerHTML = filtered.slice(0, 5).map(s => `
        <button class="list-item ${repeated[s.fxType] > 1 ? 'sv-repeated-issue' : ''}">
          <span class="sv-act-icon ${this._activityIconClass(s)}">${this._activityIconSvg(this._activityIconClass(s))}</span>
          <span class="sv-act-copy">
            <strong>${this._projectPrefix(s)}${s.shot.toLowerCase()}_fx_${s.version} ${s.event}</strong>
            <span>by ${s.actor}</span>
          </span>
          <em>${s.updated}</em>
        </button>
      `).join('');
      ['all', 'errors', 'approvals', 'assignments'].forEach(key => {
        const btn = document.getElementById(`sv-act-filter-${key}`);
        if (btn) btn.classList.toggle('active', this.activityFilter === key);
      });
      this._animatePanel(['sv-activity-list']);
    }

    const makeBucketRow = (s, idx, tone = 'blue') => {
      const thumbClass = idx % 3 === 0 ? 'sv-thumb-1' : idx % 3 === 1 ? 'sv-thumb-2' : 'sv-thumb-3';
      const statusClass = s.status === 'failed'
        ? 'critical'
        : (s.priority === 'high' ? 'high' : s.priority === 'medium' ? 'medium' : 'low');
      const statusLabel = statusClass === 'critical'
        ? 'Critical'
        : statusClass[0].toUpperCase() + statusClass.slice(1);
      const submittedDuration = String(s.updated || '').trim();
      return `
        <div class="list-item sv-bucket-compact sv-bucket-${tone}">
          <span class="sv-bucket-leading">
            <span class="sv-bucket-thumb-dot ${thumbClass}"></span>
            <span class="sv-bucket-text">
              <strong>${s.shot} · ${s.fxType.split(' ')[0]}</strong>
              <small>${tone === 'blue' ? `${s.actor || 'Artist TBD'} (Reviewing)` : (tone === 'green' ? `Approved by ${s.actor || 'FX Lead'}` : `${s.actor || 'Artist TBD'}`)}</small>
            </span>
          </span>
          <span class="sv-bucket-right">
            <small class="sv-bucket-time">${tone === 'blue' ? `${submittedDuration.replace(/\s*ago$/i, '')} in review` : submittedDuration}</small>
            ${tone === 'green' ? '' : `<mark class="${statusClass}">${statusLabel}</mark>`}
          </span>
        </div>
      `;
    };

    const pipeline = getReviewPipeline({ shots, counts });
    const needsBucketEl = document.getElementById('sv-bucket-needs-list');
    if (needsBucketEl) {
      const allNeeds = pipeline.needs;
      const needs = allNeeds.slice(0, 3);
      const needsCountEl = document.getElementById('sv-bucket-needs-count');
      if (needsCountEl) needsCountEl.textContent = String(allNeeds.length);
      needsBucketEl.innerHTML = needs.length
        ? needs.map((s, idx) => makeBucketRow(s, idx, 'orange')).join('')
        : `
          <div class="sv-empty-state">
            <strong>No shots ready for review</strong>
            <span>You're all caught up</span>
          </div>
        `;
      this._animatePanel(['sv-bucket-needs-list']);
    }

    const reviewBucketEl = document.getElementById('sv-bucket-review-list');
    if (reviewBucketEl) {
      const allInReview = pipeline.inReview;
      const inReview = allInReview.slice(0, 3);
      const reviewCountEl = document.getElementById('sv-bucket-review-count');
      if (reviewCountEl) reviewCountEl.textContent = String(allInReview.length);
      reviewBucketEl.innerHTML = inReview.map((s, idx) => makeBucketRow(s, idx, 'blue')).join('');
      this._animatePanel(['sv-bucket-review-list']);
    }

    const approvedBucketEl = document.getElementById('sv-bucket-approved-list');
    if (approvedBucketEl) {
      const allApproved = pipeline.approved;
      const approved = allApproved.slice(0, 3);
      const approvedCountEl = document.getElementById('sv-bucket-approved-count');
      if (approvedCountEl) approvedCountEl.textContent = String(allApproved.length);
      approvedBucketEl.innerHTML = approved.length
        ? approved.map((s, idx) => makeBucketRow(s, idx, 'green')).join('')
        : `
          <div class="sv-empty-state">
            <strong>No recent approvals</strong>
            <span>Approved shots will appear here</span>
          </div>
        `;
      this._animatePanel(['sv-bucket-approved-list']);
    }

    const workloadEl = document.getElementById('sv-review-workload-list');
    if (workloadEl) {
      const loadActors = this.artistDirectory.map(a => a.name);
      const capacities = loadActors.reduce((acc, name) => ({ ...acc, [name]: 6 }), {});
      const weightedLoad = actor => shots.reduce((sum, s) => {
        if (s.actor !== actor) return sum;
        if (s.status === 'failed') return sum + 3;
        if (s.status === 'revise') return sum + 2;
        if (s.status === 'needs_review' || s.status === 'sim_running') return sum + 1.5;
        return sum + 1;
      }, 0);
      const reviewers = loadActors.map((name) => ({
        name,
        count: Math.max(0, Math.round(weightedLoad(name))),
        capacity: capacities[name],
        isCurrent: name === User.current.name
      })).sort((a, b) => b.count - a.count);
      const max = Math.max(...reviewers.map(r => Math.max(r.count, r.capacity)), 1);
      workloadEl.innerHTML = reviewers.map(r => `
        <button class="list-item sv-workload-item ${r.isCurrent ? 'is-current' : ''} ${r.count > r.capacity ? 'is-overload' : ''} ${r.count === 0 ? 'is-low' : ''} ${r.count >= Math.round(r.capacity * 0.7) && r.count <= r.capacity ? 'is-busy' : ''} ${r.count > 0 && r.count < Math.round(r.capacity * 0.7) ? 'is-balanced' : ''}">
          <span class="sv-workload-avatar ${r.isCurrent ? 'is-you' : ''}">
            <img src="${this._artistAvatar(r.name)}" alt="${r.name}" />
          </span>
          <span class="sv-workload-body">
            <span class="sv-workload-head">
              <strong>${r.name}${r.isCurrent ? ' (You)' : ''}</strong>
              <em><b>${r.count}</b> / ${r.capacity} shots</em>
            </span>
            <span class="sv-workload-bar"><i class="sv-workload-fill" data-fill="${Math.max(8, Math.round((r.count / max) * 100))}"></i></span>
          </span>
          <mark class="${r.count > r.capacity ? 'critical' : r.count >= Math.round(r.capacity * 0.7) ? 'high' : r.count === 0 ? 'low' : 'green'}">${r.count > r.capacity ? 'Overloaded' : r.count >= Math.round(r.capacity * 0.7) ? 'High' : r.count === 0 ? 'Low' : 'Balanced'}</mark>
        </button>
      `).join('');
      workloadEl.querySelectorAll('.sv-workload-fill').forEach((fill) => {
        const width = Number(fill.getAttribute('data-fill') || 8);
        fill.style.width = `${Math.max(8, Math.min(100, width))}%`;
      });
      this._animatePanel(['sv-review-workload-list']);
    }

    const updatedEl = document.getElementById('sv-updated-list');
    if (updatedEl) {
      updatedEl.innerHTML = shots.slice(0, 6).map(s => `
        <button class="list-item">
          <strong>${this._projectPrefix(s)}${s.shot}</strong>
          <span>${s.fxType}</span>
          <span>${s.version}</span>
          <mark class="${this._statusMarkClass(s.status)}">${this._statusLabel(s.status)}</mark>
          <em>${s.updated}</em>
        </button>
      `).join('');
      this._animatePanel(['sv-updated-list']);
    }

    const deadlinesEl = document.getElementById('sv-upcoming-deadlines-list');
    if (deadlinesEl) {
      const deadlines = shots
        .filter(s => s.priority === 'high' || s.status === 'needs_review' || s.status === 'revise')
        .slice(0, 5)
        .map((s, idx) => ({
          when: idx === 0 ? 'Today' : idx < 3 ? 'Tomorrow' : 'This Week',
          time: idx === 0 ? '4:30 PM' : idx < 3 ? '11:00 AM' : '2:00 PM',
          dependency: s.status === 'failed' ? 'Blocked by simulation' : s.status === 'needs_review' ? 'Awaiting review' : 'On track',
          ...s
        }));
      deadlinesEl.innerHTML = deadlines.map(s => `
        <button class="list-item sv-deadline-item ${s.priority === 'high' ? 'is-high' : ''}">
          <span class="sv-deadline-when">${s.when}</span>
          <span class="sv-deadline-shot">
            <strong>${s.shot}</strong>
            <span>${s.fxType} Simulation · ${s.dependency}</span>
          </span>
          <span class="sv-deadline-time">${s.time}</span>
          <mark class="${this._riskLabel(s).cls}">${this._riskLabel(s).label}</mark>
        </button>
      `).join('');
      this._animatePanel(['sv-upcoming-deadlines-list']);
    }

    const ctaHelper = document.querySelector('#sv-project-dashboard .sv-project-cta-helper');
    const ctaBtn = document.getElementById('sv-project-cta-btn');
    const ctaSecondary = document.getElementById('sv-project-cta-secondary');
    if (ctaHelper && ctaBtn) {
      let helperTop = '3 items need your attention';
      let helperSub = '1 critical • 2 high';
      let primaryLabel = 'Open Attention Hub';
      let secondaryLabel = `View all (${Math.max(1, counts.failed + counts.needs)})`;
      if (counts.failed > 0) {
        helperTop = `${counts.failed} ${counts.failed === 1 ? 'item' : 'items'} need your attention`;
        helperSub = `${counts.failed} critical • ${Math.max(0, counts.needs)} high`;
        primaryLabel = `Resolve ${counts.failed} Failed Sim${counts.failed === 1 ? '' : 's'}`;
      } else if (counts.needs > 0) {
        helperTop = `${counts.needs} items need your attention`;
        helperSub = `${counts.needs} high priority`;
        primaryLabel = `Review ${counts.needs} Critical Shot${counts.needs === 1 ? '' : 's'}`;
      } else {
        helperTop = 'No critical blockers right now';
        helperSub = 'Queue is stable';
        primaryLabel = 'Go to Review Queue';
      }
      ctaHelper.innerHTML = `<strong>${helperTop}</strong><span>${helperSub}</span>`;
      ctaBtn.textContent = primaryLabel;
      if (ctaSecondary) ctaSecondary.textContent = secondaryLabel;
    }

    const heading = document.getElementById('sv-project-heading');
    const subheading = document.getElementById('sv-project-subheading');
    if (heading) heading.textContent = `${this.currentProject} Project Supervisor Overview`;
    if (subheading) subheading.textContent = `${this.currentProject} project pipeline health and critical triage.`;
    if (typeof SupervisorInsights !== 'undefined') {
      SupervisorInsights.render(counts, shots, this.currentProject);
    }
    this._bindDependencyHover();
  },

  renderGlobal() {
    const shots = this._allShots();
    const counts = this._counts(shots);
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };
    setText('sv-global-needs', counts.needs);
    setText('sv-global-running', counts.running);
    setText('sv-global-cache', counts.cache);
    setText('sv-global-revise', counts.revise);
    setText('sv-global-approved', counts.approved);
    setText('sv-global-failed', counts.failed);
    setText('sv-global-needs-sub', `${counts.overdue} overdue`);
    setText('sv-global-running-sub', `${counts.running} active sims`);
    setText('sv-global-cache-sub', `${Math.max(0, counts.cache - counts.needs)} ready now`);
    setText('sv-global-revise-sub', `${counts.revise} pending fixes`);
    setText('sv-global-approved-sub', `${counts.approved} approved`);
    setText('sv-global-failed-sub', `${counts.failed} critical`);
    setText('sv-global-stat-failed', counts.failed);
    setText('sv-global-stat-blocked', counts.failed + counts.revise);
    setText('sv-global-stat-needs', counts.needs);

    const immediateEl = document.getElementById('sv-global-immediate-list');
    if (immediateEl) {
      const globalThumbs = [
        'https://images.unsplash.com/photo-1581091870627-3d1c4c4e1f1f',
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c',
        'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
        'https://images.unsplash.com/photo-1475688621402-4257c8128e58'
      ];
      const immediate = shots
        .filter(s => s.status === 'failed' || s.overdue || (s.priority === 'high' && s.needsSupervisor))
        .sort((a, b) => {
          const score = x => (x.status === 'failed' ? 0 : x.overdue ? 1 : x.priority === 'high' ? 2 : 3);
          const byScore = score(a) - score(b);
          if (byScore !== 0) return byScore;
          return this._priorityRank(a.priority) - this._priorityRank(b.priority);
        })
        .slice(0, 4);
      immediateEl.innerHTML = immediate.map((s, idx) => {
        const parts = String(s.issue || '').split('—').map(p => p.trim()).filter(Boolean);
        const issueTitle = parts[0] || this._statusLabel(s.status).toUpperCase();
        const issueDetail = parts.slice(1).join(' — ') || s.issue || 'Requires supervisor attention';
        const urgency = s.status === 'failed' ? 'Critical' : (s.priority === 'high' ? 'High' : 'Medium');
        return `
          <button class="list-item sv-attention-item ${idx === 0 ? 'sv-attention-dominant' : ''}" data-urgency="${urgency.toLowerCase()}">
            <img class="sv-thumb sv-global-thumb" src="${globalThumbs[idx % globalThumbs.length]}" alt="${s.fxType} reference" loading="lazy" />
            <span class="sv-att-shot">
              <strong>[${s.project}] ${s.shot}</strong>
              <span>${s.fxType} Simulation</span>
            </span>
            <span class="sv-att-issue">
              <b>${issueTitle}</b>
              <small>${issueDetail}</small>
            </span>
            <mark class="${urgency.toLowerCase()}">${urgency}</mark>
          </button>
        `;
      }).join('');
    }

    const byProjectEl = document.getElementById('sv-global-project-pipeline');
    if (byProjectEl) {
      const grouped = ['Echo Point', 'Nova', 'Atlas'].map(project => {
        const subset = shots.filter(s => s.project === project);
        return {
          project,
          needs: subset.filter(s => s.status === 'needs_review').length,
          running: subset.filter(s => s.status === 'sim_running').length,
          failed: subset.filter(s => s.status === 'failed').length
        };
      });
      const totalNeeds = grouped.reduce((a, g) => a + g.needs, 0);
      const totalRunning = grouped.reduce((a, g) => a + g.running, 0);
      const totalFailed = grouped.reduce((a, g) => a + g.failed, 0);
      byProjectEl.innerHTML = grouped.map(g => `
        <button class="list-item">
          <strong>${g.project}</strong>
          <span>${g.needs}</span>
          <span>${g.running}</span>
          <span>${g.failed}</span>
        </button>
      `).join('');
      byProjectEl.insertAdjacentHTML('afterbegin', `
        <button class="list-item">
          <strong>Project</strong>
          <span>Needs Review</span>
          <span>Sim Running</span>
          <span>Failed Sims</span>
        </button>
      `);
      byProjectEl.insertAdjacentHTML('beforeend', `
        <button class="list-item">
          <strong>Total</strong>
          <span>${totalNeeds}</span>
          <span>${totalRunning}</span>
          <span>${totalFailed}</span>
        </button>
      `);
    }

    const actEl = document.getElementById('sv-global-activity');
    if (actEl) {
      actEl.innerHTML = shots.slice(0, 6).map(s => `
        <button class="list-item">
          <span class="sv-act-icon ${this._activityIconClass(s)}">${this._activityIconSvg(this._activityIconClass(s))}</span>
          <span class="sv-act-copy">
            <strong>[${s.project}] ${s.shot.toLowerCase()}_fx_${s.version} ${s.event}</strong>
            <span>by ${s.actor}</span>
          </span>
          <em>${s.updated}</em>
        </button>
      `).join('');
    }

    const globalActions = document.getElementById('sv-global-actions');
    if (globalActions) {
      globalActions.innerHTML = `
        <button class="list-item" onclick="SupervisorDashboard.applyQueueFilter('failed')">Review Failed Sims (All Projects) <span>${counts.failed}</span></button>
        <button class="list-item" onclick="SupervisorDashboard.applyQueueFilter('needs-review')">Review Needs Review (All Projects) <span>${counts.needs}</span></button>
        <button class="list-item" onclick="SupervisorDashboard.applyQueueFilter('high-priority')">Review High Priority Shots <span>${shots.filter(s=>s.priority==='high').length}</span></button>
        <button class="list-item" onclick="SupervisorDashboard.applyQueueFilter('cache-ready')">Open Review Queue (All Projects) <span>${counts.cache}</span></button>
      `;
    }

    const globalUpdated = document.getElementById('sv-global-updated');
    if (globalUpdated) {
      globalUpdated.innerHTML = shots.slice(0, 5).map(s => `
        <button class="list-item">
          <strong>[${s.project}] ${s.shot}</strong>
          <span>${s.fxType}</span>
          <span>${s.version}</span>
          <mark class="${this._statusMarkClass(s.status)}">${this._statusLabel(s.status)}</mark>
          <em>${s.updated}</em>
        </button>
      `).join('');
    }

    const globalStatusList = document.getElementById('sv-global-status-list');
    if (globalStatusList) {
      globalStatusList.innerHTML = `
        <button class="list-item"><strong>Sim Running</strong><span>${counts.running}</span></button>
        <button class="list-item"><strong>Waiting Cache</strong><span>${Math.max(0, counts.running - counts.cache)}</span></button>
        <button class="list-item"><strong>Ready for Review</strong><span>${counts.needs + counts.cache}</span></button>
        <button class="list-item"><strong>Blocked</strong><span>${counts.failed + counts.revise}</span></button>
      `;
    }
  },

  renderReviewQueue() {
    const root = document.getElementById('sv-review-queue-view');
    if (!root) return;
    const context = this._queueContext();
    const state = this.reviewQueueState;
    const rows = this.getReviewQueueData(context, this.currentProject)
      .filter((row) => state.status === 'all' || row.status === state.status)
      .filter((row) => state.department === 'all' || row.department === state.department)
      .filter((row) => state.priority === 'all' || row.priority === state.priority)
      .filter((row) => {
        const q = String(state.query || '').trim().toLowerCase();
        if (!q) return true;
        return `${row.shot} ${row.fxType} ${row.task} ${row.actor}`.toLowerCase().includes(q);
      });
    const statusRank = { failed: 0, revise: 1, needs_review: 2, sim_running: 3, cache_ready: 4, approved: 5 };
    const priorityRank = { high: 0, medium: 1, low: 2 };
    rows.sort((a, b) => {
      const dir = state.sortDir === 'asc' ? 1 : -1;
      if (state.sortBy === 'shot') return String(a.shot).localeCompare(String(b.shot)) * dir;
      if (state.sortBy === 'task') return String(a.task).localeCompare(String(b.task)) * dir;
      if (state.sortBy === 'version') return String(a.version).localeCompare(String(b.version)) * dir;
      if (state.sortBy === 'status') return ((statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99)) * dir;
      if (state.sortBy === 'priority') return ((priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99)) * dir;
      if (state.sortBy === 'submittedBy') return String(a.actor || '').localeCompare(String(b.actor || '')) * dir;
      const hours = (v) => this._hoursFromUpdated(v);
      return (hours(a.updated) - hours(b.updated)) * dir;
    });
    const total = rows.length;
    const pageSize = Number(state.pageSize || 25);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, Number(state.page || 1)), totalPages);
    const start = (page - 1) * pageSize;
    const paged = rows.slice(start, start + pageSize);
    const showProject = context === 'all-projects';
    const statusPill = (status) => `<span class="sv-rq-status ${status}">${this._statusLabel(status)}</span>`;
    const priorityPill = (priority) => `<span class="sv-rq-priority"><i class="${priority}"></i>${priority[0].toUpperCase() + priority.slice(1)}</span>`;
    const sortArrow = (key) => state.sortBy === key ? (state.sortDir === 'asc' ? '↑' : '↓') : '↕';
    const sortTh = (label, key) => `<button class="sv-rq-sort ${state.sortBy === key ? 'active' : ''}" onclick="SupervisorDashboard.setReviewQueueSort('${key}')">${label} <span>${sortArrow(key)}</span></button>`;
    const heading = context === 'all-projects' ? 'Global FX Review Queue' : `${this.currentProject} Project Review Queue`;
    const subheading = context === 'all-projects'
      ? 'Cross-project shot submissions, priorities, and review status.'
      : `${this.currentProject} shot submissions, priorities, and review status.`;
    root.innerHTML = `
      <div class="dashboard-header page-header">
        <div class="sv-heading-row">
          <div>
            <h1>${heading}</h1>
            <p>${subheading}</p>
          </div>
          <div class="sv-updated">Last updated: 2m ago</div>
        </div>
      </div>
      <section class="sv-card sv-review-queue-screen">
        <div class="sv-review-toolbar">
          <div class="sv-review-filters">
            <label>Group By
              <select onchange="SupervisorDashboard.updateReviewQueueFilter('groupBy', this.value)">
                <option value="shot" ${state.groupBy === 'shot' ? 'selected' : ''}>Shot</option>
                <option value="artist" ${state.groupBy === 'artist' ? 'selected' : ''}>Artist</option>
              </select>
            </label>
            <label>Status
              <select onchange="SupervisorDashboard.updateReviewQueueFilter('status', this.value)">
                <option value="all" ${state.status === 'all' ? 'selected' : ''}>All</option>
                <option value="needs_review" ${state.status === 'needs_review' ? 'selected' : ''}>Needs Review</option>
                <option value="revise" ${state.status === 'revise' ? 'selected' : ''}>Revise</option>
                <option value="sim_running" ${state.status === 'sim_running' ? 'selected' : ''}>In Review</option>
                <option value="approved" ${state.status === 'approved' ? 'selected' : ''}>Approved</option>
              </select>
            </label>
            <label>Department
              <select onchange="SupervisorDashboard.updateReviewQueueFilter('department', this.value)">
                <option value="all" ${state.department === 'all' ? 'selected' : ''}>All</option>
                <option value="FX" ${state.department === 'FX' ? 'selected' : ''}>FX</option>
              </select>
            </label>
            <label>Priority
              <select onchange="SupervisorDashboard.updateReviewQueueFilter('priority', this.value)">
                <option value="all" ${state.priority === 'all' ? 'selected' : ''}>All</option>
                <option value="high" ${state.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="medium" ${state.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="low" ${state.priority === 'low' ? 'selected' : ''}>Low</option>
              </select>
            </label>
          </div>
          <div class="sv-review-tools">
            <input class="sv-review-search" placeholder="Search shots..." value="${String(state.query || '').replace(/"/g, '&quot;')}" oninput="SupervisorDashboard.updateReviewQueueFilter('query', this.value)" />
            <button class="sv-review-btn">Filters</button>
            <button class="sv-review-icon" aria-label="View toggle">&#9776;</button>
          </div>
        </div>
        <div class="sv-review-table-wrap">
          <table class="sv-review-table">
            <thead>
              <tr>
                ${showProject ? '<th>PROJECT</th>' : ''}
                <th>${sortTh('SHOT', 'shot')}</th>
                <th>${sortTh('TASK', 'task')}</th>
                <th>${sortTh('LATEST VERSION', 'version')}</th>
                <th>${sortTh('STATUS', 'status')}</th>
                <th>${sortTh('PRIORITY', 'priority')}</th>
                <th>${sortTh('SUBMITTED BY', 'submittedBy')}</th>
                <th>${sortTh('UPDATED', 'updated')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${paged.map((row) => `
                <tr onclick="SupervisorDashboard.openShot('${row.shot}')">
                  ${showProject ? `<td><span class="sv-rq-project">${row.project}</span></td>` : ''}
                  <td><div class="sv-rq-shot"><span class="sv-rq-thumb sv-thumb-${(row.thumbClass % 3) + 1}"></span><span><strong>${row.shot}</strong></span></div></td>
                  <td><strong>${row.task}</strong></td>
                  <td><strong>${row.version}</strong><small><span class="sv-rq-rev">REV</span></small></td>
                  <td>${statusPill(row.status)}</td>
                  <td>${priorityPill(row.priority)}</td>
                  <td><span class="sv-rq-user"><img src="${this._artistAvatar(row.actor || 'Unassigned')}" alt="${row.actor || 'Unassigned'}" /><span><strong>${row.actor || 'Unassigned'}</strong><small>Artist</small></span></span></td>
                  <td>${row.updated}</td>
                  <td>
                    <div class="sv-rq-actions">
                      <button class="sv-rq-kebab" onclick="SupervisorDashboard.toggleReviewQueueMenu(event, '${row.shot}')">&#8942;</button>
                      <div class="sv-rq-actions-menu" onclick="event.stopPropagation()">
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'open-shot','${row.shot}')">Open Shot</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'open-review','${row.shot}')">Open in Review</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'assign','${row.shot}')">Assign / Reassign Artist</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'status','${row.shot}')">Change Status</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'priority','${row.shot}')">Set Priority</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'versions','${row.shot}')">View Versions</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'notes','${row.shot}')">View Notes / Add Note</button>
                        <button onclick="SupervisorDashboard.reviewQueueAction(event,'activity','${row.shot}')">View Activity Log</button>
                      </div>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="sv-review-pagination">
          <span>Showing ${total === 0 ? 0 : start + 1}-${Math.min(start + pageSize, total)} of ${total} shots</span>
          <div class="sv-review-pages">
            <button ${page <= 1 ? 'disabled' : ''} onclick="SupervisorDashboard.setReviewQueuePage(${Math.max(1, page - 1)})">‹</button>
            ${Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => `<button class="${p === page ? 'active' : ''}" onclick="SupervisorDashboard.setReviewQueuePage(${p})">${p}</button>`).join('')}
            <button ${page >= totalPages ? 'disabled' : ''} onclick="SupervisorDashboard.setReviewQueuePage(${Math.min(totalPages, page + 1)})">›</button>
          </div>
          <label>Rows per page:
            <select onchange="SupervisorDashboard.updateReviewQueueFilter('pageSize', Number(this.value))">
              <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
              <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
              <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
            </select>
          </label>
        </div>
      </section>
    `;
    if (!this._reviewQueueCloseBound) {
      document.addEventListener('click', () => this.closeReviewQueueMenus());
      this._reviewQueueCloseBound = true;
    }
  },

  _workspaceShots() {
    const shots = this.currentProject === 'all'
      ? this._allShots()
      : this._allShots().filter((s) => s.project === this.currentProject);
    const rank = { failed: 0, needs_review: 1, revise: 2, sim_running: 3, cache_ready: 4, approved: 5 };
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return shots
      .slice()
      .sort((a, b) => {
        const byStatus = (rank[a.status] ?? 99) - (rank[b.status] ?? 99);
        if (byStatus !== 0) return byStatus;
        const byPriority = (priorityRank[a.priority] ?? 99) - (priorityRank[b.priority] ?? 99);
        if (byPriority !== 0) return byPriority;
        return String(a.shot).localeCompare(String(b.shot));
      })
      .slice(0, 12);
  },

  _ensureReviewWorkspaceState() {
    const workspaceShots = this._workspaceShots();
    if (!workspaceShots.length) return;
    const firstShot = workspaceShots[0].shot;
    const state = this.reviewWorkspaceState;
    if (!state.selectedShot || !workspaceShots.some((s) => s.shot === state.selectedShot)) {
      state.selectedShot = firstShot;
    }
    if (!state.selectedVersion) state.selectedVersion = '';
    if (typeof state.isPlaying !== 'boolean') state.isPlaying = false;
    if (!state.playbackSpeed) state.playbackSpeed = 1;
    if (!state.loopIn) state.loopIn = 1;
    if (!state.loopOut) state.loopOut = 300;
    if (!state.compareState || typeof state.compareState !== 'object') {
      state.compareState = { enabled: false, mode: 'off', baseVersion: '', compareVersion: '', wipeX: 50, opacity: 0.45 };
    }
    state.compareState.enabled = state.compareMode && state.compareMode !== 'off';
    state.compareState.mode = state.compareMode || 'off';
    state.compareState.baseVersion = state.selectedVersion || state.currentVersion || '';
    state.compareState.compareVersion = state.compareVersionTag || '';
    state.compareState.wipeX = Number(state.wipePosition || 50);
    state.compareState.opacity = Number(state.compareOpacity || 0.45);
    if (!state.liveSession || typeof state.liveSession !== 'object') {
      state.liveSession = { users: [], currentShot: state.selectedShot || '', currentFrame: state.currentFrame || 1, followMode: true };
    }
    if (!Array.isArray(state.liveSession.users)) state.liveSession.users = [];
    if (typeof state.liveSession.followMode !== 'boolean') state.liveSession.followMode = true;
    if (typeof state.liveSession.livePresenceOpen !== 'boolean') state.liveSession.livePresenceOpen = false;
    state.liveSession.currentShot = state.selectedShot;
    state.liveSession.currentFrame = state.currentFrame;
    if (typeof state.versionPanelOpen !== 'boolean') state.versionPanelOpen = false;

    const seeded = Store.get('frameshift.reviewWorkspaceSeededNotes', false);
    if (!seeded && typeof AnnotationStore !== 'undefined') {
      workspaceShots.slice(0, 10).forEach((shot, idx) => {
        const baseFrames = [54, 98, 125, 169];
        const frameA = baseFrames[idx % baseFrames.length];
        const frameB = baseFrames[(idx + 1) % baseFrames.length];
        [
          { frame: frameA, text: `Check primary ${shot.fxType.toLowerCase()} continuity on ${shot.shot}.`, tone: shot.priority === 'high' ? 'critical' : 'medium' },
          { frame: frameB, text: `Refine breakup and timing before final approval for ${shot.shot}.`, tone: 'high' }
        ].forEach((n, nIdx) => {
          AnnotationStore.add({
            frame: n.frame,
            version: shot.version,
            shot: shot.shot,
            text: n.text,
            author: 'Sarah Connor',
            role: 'supervisor',
            type: (idx + nIdx) % 2 ? 'arrow' : 'circle',
            color: n.tone === 'critical' ? '#EF4444' : n.tone === 'high' ? '#F59E0B' : '#3B82F6',
            x: 28 + Math.round(Math.random() * 42),
            y: 24 + Math.round(Math.random() * 44),
            drawingPath: []
          });
        });
      });
      Store.set('frameshift.reviewWorkspaceSeededNotes', true);
    }
    if (typeof AnnotationStore !== 'undefined') {
      workspaceShots.slice(0, 10).forEach((shot, idx) => {
        const existing = AnnotationStore.getNotes(shot.version).filter((n) => n.shot === shot.shot);
        if (existing.length >= 2) return;
        const need = 2 - existing.length;
        for (let i = 0; i < need; i += 1) {
          const frame = [54, 98, 125, 169][(idx + i) % 4];
          AnnotationStore.add({
            frame,
            version: shot.version,
            shot: shot.shot,
            text: `Supervisor note for ${shot.shot} at frame ${frame}.`,
            author: 'Sarah Connor',
            role: 'supervisor',
            type: i % 2 ? 'arrow' : 'circle',
            color: shot.priority === 'high' ? '#EF4444' : '#3B82F6',
            x: 30 + Math.round(Math.random() * 35),
            y: 26 + Math.round(Math.random() * 40),
            drawingPath: []
          });
        }
      });
    }
    Store.set('frameshift.reviewWorkspaceState', state);
  },

  _versionNumber(tag) {
    return Number(String(tag || '').replace(/[^\d]/g, '')) || 1;
  },

  _workspaceVersionsForShot(shot) {
    const currentTag = shot?.version || 'v001';
    const seeded = PipelineVersionStore.getVersions(shot.shot, currentTag).slice();
    const sortedSeeded = seeded.slice().sort((a, b) => this._versionNumber(b.tag) - this._versionNumber(a.tag));
    const hasInconsistentApproval = sortedSeeded.some((v, idx) =>
      idx > 0
      && v.status === 'approved'
      && sortedSeeded.slice(0, idx).some((n) => n.status !== 'approved')
    );
    if (seeded.length <= 1 || hasInconsistentApproval) {
      const currentNum = this._versionNumber(currentTag);
      const statusMap = {
        approved: ['approved', 'approved', 'approved', 'approved'],
        revise: ['revise', 'needs_review', 'needs_review', 'needs_review'],
        needs_review: ['needs_review', 'needs_review', 'revise', 'revise'],
        failed: ['revise', 'revise', 'needs_review', 'needs_review'],
        cache_ready: ['needs_review', 'needs_review', 'revise', 'revise'],
        sim_running: ['needs_review', 'revise', 'revise', 'revise']
      };
      const plan = statusMap[shot.status] || ['needs_review', 'needs_review', 'revise', 'revise'];
      const generated = Array.from({ length: 4 }, (_, idx) => {
        const num = Math.max(1, currentNum - idx);
        const tag = `v${String(num).padStart(3, '0')}`;
        return {
          tag,
          updated: idx === 0 ? shot.updated : `${idx + 1}d ago`,
          status: plan[idx] || plan[plan.length - 1],
          media: this._workspaceFrameImage(tag, shot)
        };
      });
      PipelineVersionStore.setVersions(shot.shot, generated);
      return generated;
    }
    return seeded
      .map((v) => ({ ...v, media: v.media || this._workspaceFrameImage(v.tag, shot) }))
      .sort((a, b) => this._versionNumber(b.tag) - this._versionNumber(a.tag));
  },

  _workspaceFrameImage(versionTag, shot) {
    const seed = `${shot?.shot || 'shot'}-${versionTag || 'v001'}`;
    const palette = [
      'https://images.unsplash.com/photo-1534447677768-be436bb09401?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1475688621402-4257c8128e58?q=80&w=1600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1470290378698-263fa7ca90a1?q=80&w=1600&auto=format&fit=crop'
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    return palette[Math.abs(hash) % palette.length];
  },

  setWorkspaceShot(shot) {
    this._stopWorkspacePlayback();
    this.reviewWorkspaceState.selectedShot = shot;
    this.reviewWorkspaceState.currentFrame = 1;
    this.reviewWorkspaceState.selectedVersion = '';
    this.reviewWorkspaceState.compareVersionTag = '';
    this.reviewWorkspaceState.loopIn = 1;
    this.reviewWorkspaceState.loopOut = 300;
    this.reviewWorkspaceState.liveSession = this.reviewWorkspaceState.liveSession || {};
    this.reviewWorkspaceState.liveSession.currentShot = shot;
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this._broadcastLiveState('frame');
    this.renderReviewWorkspace();
  },

  focusWorkspaceNote(noteId, frame) {
    this._enterWorkspaceFocusMode();
    this.reviewWorkspaceState.focusedNoteId = noteId;
    this.reviewWorkspaceState.activeSuggestionKeyword = '';
    this.reviewWorkspaceState.activeTab = 'notes';
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    if (typeof frame === 'number') this.scrubWorkspaceFrame(frame);
    else this.renderReviewWorkspace();
  },

  _syncCompareState() {
    const st = this.reviewWorkspaceState;
    st.compareState = st.compareState || {};
    st.compareState.enabled = !!(st.compareMode && st.compareMode !== 'off');
    st.compareState.mode = st.compareMode || 'off';
    st.compareState.baseVersion = st.selectedVersion || st.currentVersion || '';
    st.compareState.compareVersion = st.compareVersionTag || '';
    st.compareState.wipeX = Number(st.wipePosition || 50);
    st.compareState.opacity = Number(st.compareOpacity || 0.45);
  },

  _liveNow() { return Date.now(); },

  _initWorkspaceLiveSession() {
    if (this._liveSessionInitialized) return;
    this._liveSessionInitialized = true;
    this._liveClientId = Store.get('frameshift.liveClientId', `u-${Math.random().toString(16).slice(2, 10)}`);
    Store.set('frameshift.liveClientId', this._liveClientId);
    this.reviewWorkspaceState.liveSession = this.reviewWorkspaceState.liveSession || { users: [], currentShot: '', currentFrame: 1, followMode: true };
    this._liveUsers = this._liveUsers || {};
    this._liveUsers[this._liveClientId] = {
      id: this._liveClientId, name: User.current.name || 'Supervisor', role: User.current.role || 'supervisor',
      color: '#A78BFA', currentShot: this.reviewWorkspaceState.selectedShot || '', currentFrame: this.reviewWorkspaceState.currentFrame || 1, onlineAt: this._liveNow()
    };
    try {
      this._liveChannel = new BroadcastChannel('frameshift-live-review');
      this._liveChannel.onmessage = (event) => this._onLiveMessage(event.data);
    } catch (_) { this._liveChannel = null; }
    const wsUrl = Store.get('frameshift.liveWsUrl', '');
    if (wsUrl && typeof WebSocket !== 'undefined') {
      try {
        this._liveSocket = new WebSocket(wsUrl);
        this._liveSocket.onmessage = (evt) => {
          try { this._onLiveMessage(JSON.parse(evt.data)); } catch (_) { /* ignore */ }
        };
      } catch (_) { this._liveSocket = null; }
    }
    this._broadcastLiveState('presence');
    this._liveHeartbeat = setInterval(() => {
      this._broadcastLiveState('presence');
      this._pruneLiveUsers();
    }, 5000);
  },

  _pruneLiveUsers() {
    const cutoff = this._liveNow() - 20000;
    Object.keys(this._liveUsers || {}).forEach((id) => {
      if (id === this._liveClientId) return;
      if ((this._liveUsers[id]?.onlineAt || 0) < cutoff) delete this._liveUsers[id];
    });
    this.reviewWorkspaceState.liveSession.users = Object.values(this._liveUsers || {});
  },

  _broadcastLiveState(type = 'frame', extra = {}) {
    const payload = {
      type, source: this._liveClientId, ts: this._liveNow(),
      user: { id: this._liveClientId, name: User.current.name || 'Supervisor', role: User.current.role || 'supervisor', color: '#A78BFA' },
      shot: this.reviewWorkspaceState.selectedShot,
      frame: this.reviewWorkspaceState.currentFrame,
      playing: !!this.reviewWorkspaceState.isPlaying,
      note: extra.note || null
    };
    if (this._liveChannel) this._liveChannel.postMessage(payload);
    if (this._liveSocket && this._liveSocket.readyState === 1) this._liveSocket.send(JSON.stringify(payload));
  },

  _onLiveMessage(msg) {
    if (!msg || msg.source === this._liveClientId) return;
    this._liveUsers = this._liveUsers || {};
    this._liveUsers[msg.source] = {
      id: msg.source, name: msg.user?.name || 'Reviewer', role: msg.user?.role || 'supervisor', color: msg.user?.color || '#60A5FA',
      currentShot: msg.shot || '', currentFrame: Number(msg.frame || 1), onlineAt: this._liveNow()
    };
    this._pruneLiveUsers();
    this.reviewWorkspaceState.liveSession.users = Object.values(this._liveUsers || {});
    if (msg.type === 'frame' && this.reviewWorkspaceState.liveSession.followMode && msg.shot === this.reviewWorkspaceState.selectedShot) {
      this.reviewWorkspaceState.currentFrame = Number(msg.frame || this.reviewWorkspaceState.currentFrame || 1);
      this._updateWorkspaceFrameUI() || this.renderReviewWorkspace();
    } else if (msg.type === 'note') {
      this.renderReviewWorkspace();
    } else {
      this._updateWorkspaceFrameUI();
    }
  },

  toggleWorkspaceCompare() {
    this.reviewWorkspaceState.compareMode = this.reviewWorkspaceState.compareMode === 'off' ? 'overlay' : 'off';
    this._syncCompareState();
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this.renderReviewWorkspace();
  },

  toggleWorkspaceShotSelection(shot, checked, shiftKey = false) {
    const visible = this._workspaceVisibleShots || [];
    const set = new Set(this.reviewWorkspaceState.selectedShots || []);
    if (shiftKey && this.reviewWorkspaceState.lastSelectedShot && visible.length) {
      const start = visible.indexOf(this.reviewWorkspaceState.lastSelectedShot);
      const end = visible.indexOf(shot);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        visible.slice(from, to + 1).forEach((id) => {
          if (checked) set.add(id);
          else set.delete(id);
        });
      }
    } else {
      if (checked) set.add(shot);
      else set.delete(shot);
    }
    this.reviewWorkspaceState.selectedShots = Array.from(set);
    this.reviewWorkspaceState.lastSelectedShot = shot;
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this.renderReviewWorkspace();
  },

  clearWorkspaceSelection() {
    this.reviewWorkspaceState.selectedShots = [];
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this.renderReviewWorkspace();
  },

  selectAllWorkspaceShots() {
    const queueFilter = this.reviewWorkspaceState.queueFilter || 'all';
    const selected = this._workspaceShots()
      .filter((s) => s.status !== 'approved')
      .filter((s) => {
        if (queueFilter === 'mine') return s.actor === User.current.name;
        if (queueFilter === 'following') return s.priority === 'high' || s.status === 'failed';
        return true;
      })
      .map((s) => s.shot);
    this.reviewWorkspaceState.selectedShots = selected;
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this.renderReviewWorkspace();
  },

  scrubWorkspaceFrame(frame) {
    this.reviewWorkspaceState.currentFrame = Math.max(1, Math.min(300, Number(frame) || 1));
    this.reviewWorkspaceState.liveSession = this.reviewWorkspaceState.liveSession || {};
    this.reviewWorkspaceState.liveSession.currentFrame = this.reviewWorkspaceState.currentFrame;
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this._broadcastLiveState('frame');
    this._updateWorkspaceFrameUI() || this.renderReviewWorkspace();
  },

  openFloatingNoteInput(xPct, yPct, noteId = '') {
    const prevDraftId = this.reviewWorkspaceState.floatingNoteAt?.noteId;
    if (prevDraftId && typeof AnnotationStore !== 'undefined') {
      AnnotationStore.notes = AnnotationStore.notes.filter((n) => !(n.id === prevDraftId && !String(n.text || '').trim() && (!Array.isArray(n.drawingPath) || n.drawingPath.length === 0)));
      Store.set('frameshift.annotationNotes', AnnotationStore.notes);
    }
    this.reviewWorkspaceState.floatingNoteAt = { x: xPct, y: yPct, frame: this.reviewWorkspaceState.currentFrame, noteId };
    if (noteId) this.reviewWorkspaceState.focusedNoteId = noteId;
    this.reviewWorkspaceState.floatingNoteDraft = '';
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this.renderReviewWorkspace();
    setTimeout(() => document.getElementById('sv-ws-floating-note')?.focus(), 0);
  },

  _enterWorkspaceFocusMode() {
    const app = document.getElementById('supervisor-app');
    if (!app || !app.classList.contains('sv-review-workspace-mode')) return;
    app.classList.add('sv-review-focus');
    clearTimeout(this._workspaceFocusTimer);
    this._workspaceFocusTimer = setTimeout(() => {
      app.classList.remove('sv-review-focus');
    }, 1400);
  },

  onWorkspaceFrameClick(event) {
    this._enterWorkspaceFocusMode();
    const tool = (typeof ToolState !== 'undefined' ? ToolState.current : this.reviewWorkspaceState.activeTool) || 'pointer';
    if (['arrow', 'box', 'circle'].includes(tool)) return;
    const frame = event.currentTarget;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const xPct = Math.max(2, Math.min(98, x));
    const yPct = Math.max(2, Math.min(98, y));
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    if (!selected || typeof AnnotationStore === 'undefined') return;
    const created = AnnotationStore.add({
      frame: this.reviewWorkspaceState.currentFrame,
      version: this.reviewWorkspaceState.selectedVersion || selected.version,
      shot: selected.shot,
      text: '',
      author: User.current.name || 'Supervisor',
      role: 'supervisor',
      status: 'open',
      type: 'circle',
      color: '#22C55E',
      x: xPct,
      y: yPct,
      position: { x: xPct, y: yPct },
      drawingPath: []
    });
    this.reviewWorkspaceState.focusedNoteId = created?.id || this.reviewWorkspaceState.focusedNoteId;
    this._broadcastLiveState('note', { note: created ? { id: created.id, frame: created.frame, shot: created.shot, version: created.version } : null });
    this.openFloatingNoteInput(xPct, yPct, created?.id || '');
  },

  onWorkspaceFloatingInput(event) {
    this.reviewWorkspaceState.floatingNoteDraft = String(event.target.value || '');
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
  },

  submitWorkspaceFloatingNote(event) {
    if (event.key && event.key !== 'Enter') return;
    event?.preventDefault?.();
    const at = this.reviewWorkspaceState.floatingNoteAt;
    if (!at) return;
    const text = String(this.reviewWorkspaceState.floatingNoteDraft || '').trim();
    if (!text) return;
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    if (!selected || typeof AnnotationStore === 'undefined') return;
    let created = null;
    if (at.noteId) created = AnnotationStore.updateText(at.noteId, text);
    if (!created) {
      created = AnnotationStore.add({
        frame: at.frame,
        version: this.reviewWorkspaceState.selectedVersion || selected.version,
        shot: selected.shot,
        text,
        author: User.current.name || 'Supervisor',
        role: 'supervisor',
        type: 'circle',
        color: '#22C55E',
        x: at.x,
        y: at.y,
        drawingPath: []
      });
    }
    this.reviewWorkspaceState.floatingNoteAt = null;
    this.reviewWorkspaceState.floatingNoteDraft = '';
    this.reviewWorkspaceState.focusedNoteId = created?.id || this.reviewWorkspaceState.focusedNoteId;
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this._broadcastLiveState('note', { note: created ? { id: created.id, frame: created.frame, shot: created.shot, version: created.version } : null });
    this.renderReviewWorkspace();
  },

  _workspacePointFromEvent(event) {
    const canvas = event.currentTarget || this._workspaceCanvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  },

  startWorkspaceDraw(event) {
    this._enterWorkspaceFocusMode();
    const tool = (typeof ToolState !== 'undefined' ? ToolState.current : this.reviewWorkspaceState.activeTool) || 'pointer';
    if (!['arrow', 'box', 'circle'].includes(tool)) return;
    const p = this._workspacePointFromEvent(event);
    if (!p) return;
    this._workspaceDrawing = {
      tool,
      start: p,
      current: p,
      points: [p]
    };
    this._workspaceIsDrawing = true;
    event.preventDefault();
  },

  moveWorkspaceDraw(event) {
    if (!this._workspaceIsDrawing || !this._workspaceDrawing) return;
    const p = this._workspacePointFromEvent(event);
    if (!p) return;
    this._workspaceDrawing.current = p;
    if (this._workspaceDrawing.tool === 'arrow') {
      this._workspaceDrawing.points = [this._workspaceDrawing.start, p];
    } else {
      this._workspaceDrawing.points = [this._workspaceDrawing.start, p];
    }
    this._drawWorkspaceCanvas(this._workspaceDrawing);
  },

  endWorkspaceDraw() {
    if (!this._workspaceIsDrawing || !this._workspaceDrawing) return;
    this._workspaceIsDrawing = false;
    const drawing = this._workspaceDrawing;
    this._workspaceDrawing = null;
    const points = drawing.points || [];
    if (points.length < 2 || !drawing.start || !drawing.current) return;
    const first = drawing.start;
    const second = drawing.current;
    const path = [first, second];
    DrawTool.lastPath = path;
    if (typeof ToolState !== 'undefined') ToolState.current = drawing.tool;
    DrawTool.current = drawing.tool;
    DrawTool.end(this.reviewWorkspaceState.currentFrame, path);
  },

  _drawWorkspaceCanvas(liveDrawing = null) {
    const canvas = this._workspaceCanvas;
    const ctx = this._workspaceCtx;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(rect.height));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    if (!selected || typeof AnnotationStore === 'undefined') return;
    const version = this.reviewWorkspaceState.selectedVersion || selected.version;
    const frame = this.reviewWorkspaceState.currentFrame;
    const hidden = new Set(this.reviewWorkspaceState.drawingHiddenNoteIds || []);
    const frameNotes = AnnotationStore.getNotes(version).filter((n) =>
      n.shot === selected.shot
      && n.frame === frame
      && Array.isArray((n.annotations?.[0]?.points) || n.drawingPath)
      && (((n.annotations?.[0]?.points) || n.drawingPath).length > 1)
      && !hidden.has(n.id)
    );
    const drawShape = (tool, points, color = '#22C55E') => {
      if (!points.length) return;
      const p1 = points[0];
      const p2 = points[points.length - 1];
      const x1 = p1.x * canvas.width;
      const y1 = p1.y * canvas.height;
      const x2 = p2.x * canvas.width;
      const y2 = p2.y * canvas.height;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (tool === 'highlight') {
        const x = Math.min(x1, x2);
        const y = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        return;
      }
      if (tool === 'circle') {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(4, rx), Math.max(4, ry), 0, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      if (tool === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const hl = 12;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hl * Math.cos(ang - Math.PI / 6), y2 - hl * Math.sin(ang - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hl * Math.cos(ang + Math.PI / 6), y2 - hl * Math.sin(ang + Math.PI / 6));
        ctx.stroke();
        return;
      }
    };
    frameNotes.forEach((n) => {
      const ann = n.annotations?.[0];
      const points = ann?.points || n.drawingPath || [];
      drawShape((ann?.type || n.type || 'arrow') === 'box' ? 'highlight' : (ann?.type || n.type || 'arrow'), points, ann?.color || n.color || '#22C55E');
    });
    if (liveDrawing?.points?.length) {
      const tool = liveDrawing.tool === 'box' ? 'highlight' : liveDrawing.tool;
      drawShape(tool, liveDrawing.points, '#A78BFA');
    }
  },

  undoWorkspaceDrawing() {
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    if (!selected || typeof AnnotationStore === 'undefined') return;
    const version = this.reviewWorkspaceState.selectedVersion || selected.version;
    const frame = this.reviewWorkspaceState.currentFrame;
    const candidates = AnnotationStore.notes
      .filter((n) => n.shot === selected.shot && n.version === version && n.frame === frame && Array.isArray(n.drawingPath) && n.drawingPath.length > 1);
    const last = candidates[candidates.length - 1];
    if (!last) return;
    AnnotationStore.notes = AnnotationStore.notes.filter((n) => n.id !== last.id);
    Store.set('frameshift.annotationNotes', AnnotationStore.notes);
    this._updateWorkspaceFrameUI() || this.renderReviewWorkspace();
  },

  _getWorkspaceFocusedResizableNote() {
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    if (!selected || typeof AnnotationStore === 'undefined') return null;
    const version = this.reviewWorkspaceState.selectedVersion || selected.version;
    const frame = this.reviewWorkspaceState.currentFrame;
    const id = this.reviewWorkspaceState.focusedNoteId;
    if (!id) return null;
    const note = AnnotationStore.getNotes(version).find((n) =>
      n.id === id
      && n.shot === selected.shot
      && n.frame === frame
      && Array.isArray((n.annotations?.[0]?.points) || n.drawingPath)
      && (((n.annotations?.[0]?.points) || n.drawingPath).length > 1)
      && ['highlight', 'circle'].includes(n.type)
    );
    return note || null;
  },

  _noteRectPct(note) {
    const path = (note?.annotations?.[0]?.points) || note?.drawingPath || [];
    if (!path.length) return null;
    const p1 = path[0];
    const p2 = path[path.length - 1];
    const x1 = Math.min(p1.x, p2.x) * 100;
    const y1 = Math.min(p1.y, p2.y) * 100;
    const x2 = Math.max(p1.x, p2.x) * 100;
    const y2 = Math.max(p1.y, p2.y) * 100;
    return {
      left: x1,
      top: y1,
      width: Math.max(1, x2 - x1),
      height: Math.max(1, y2 - y1)
    };
  },

  startAnnotationResize(noteId, handle, event) {
    event.preventDefault();
    event.stopPropagation();
    const frameEl = this._workspaceFrameEl();
    if (!frameEl) return;
    const note = this._getWorkspaceFocusedResizableNote();
    if (!note || note.id !== noteId) return;
    const rect = frameEl.getBoundingClientRect();
    const p1 = note.drawingPath[0];
    const p2 = note.drawingPath[note.drawingPath.length - 1];
    const x1 = Math.min(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y);
    const x2 = Math.max(p1.x, p2.x);
    const y2 = Math.max(p1.y, p2.y);
    this._annotationResizeState = {
      noteId,
      handle,
      frameRect: rect,
      startPath: ((note.annotations?.[0]?.points) || note.drawingPath || []).map((p) => ({ ...p })),
      startMouse: {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height
      },
      startBounds: { x1, y1, x2, y2 }
    };
    const onMove = (e) => this._moveAnnotationResize(e);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._annotationResizeState = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  _moveAnnotationResize(event) {
    const st = this._annotationResizeState;
    if (!st || typeof AnnotationStore === 'undefined') return;
    const nx = Math.max(0, Math.min(1, (event.clientX - st.frameRect.left) / st.frameRect.width));
    const ny = Math.max(0, Math.min(1, (event.clientY - st.frameRect.top) / st.frameRect.height));
    const dx = nx - st.startMouse.x;
    const dy = ny - st.startMouse.y;
    const minSize = 0.01;
    const lockAspect = !!event.shiftKey;
    const fromCenter = !!event.altKey;
    const startW = Math.max(minSize, st.startBounds.x2 - st.startBounds.x1);
    const startH = Math.max(minSize, st.startBounds.y2 - st.startBounds.y1);
    const startRatio = startW / startH;
    let { x1, y1, x2, y2 } = st.startBounds;

    if (st.handle === 'move') {
      const w = x2 - x1;
      const h = y2 - y1;
      x1 = Math.max(0, Math.min(1 - w, st.startBounds.x1 + dx));
      y1 = Math.max(0, Math.min(1 - h, st.startBounds.y1 + dy));
      x2 = x1 + w;
      y2 = y1 + h;
    } else {
      if (fromCenter) {
        const cx = (st.startBounds.x1 + st.startBounds.x2) / 2;
        const cy = (st.startBounds.y1 + st.startBounds.y2) / 2;
        if (st.handle.includes('w') || st.handle.includes('e')) {
          const maxHalfW = Math.min(cx, 1 - cx);
          const halfW = Math.max(minSize / 2, Math.min(maxHalfW, Math.abs(nx - cx)));
          x1 = cx - halfW;
          x2 = cx + halfW;
        }
        if (st.handle.includes('n') || st.handle.includes('s')) {
          const maxHalfH = Math.min(cy, 1 - cy);
          const halfH = Math.max(minSize / 2, Math.min(maxHalfH, Math.abs(ny - cy)));
          y1 = cy - halfH;
          y2 = cy + halfH;
        }
      } else {
        if (st.handle.includes('n')) y1 = Math.min(y2 - minSize, ny);
        if (st.handle.includes('s')) y2 = Math.max(y1 + minSize, ny);
        if (st.handle.includes('w')) x1 = Math.min(x2 - minSize, nx);
        if (st.handle.includes('e')) x2 = Math.max(x1 + minSize, nx);
      }

      if (lockAspect) {
        const hasX = st.handle.includes('w') || st.handle.includes('e');
        const hasY = st.handle.includes('n') || st.handle.includes('s');
        let w = Math.max(minSize, x2 - x1);
        let h = Math.max(minSize, y2 - y1);

        if (hasX && hasY) {
          if (Math.abs(dx) >= Math.abs(dy)) h = w / startRatio;
          else w = h * startRatio;
        } else if (hasX) {
          h = w / startRatio;
        } else if (hasY) {
          w = h * startRatio;
        }

        const cx = fromCenter ? (x1 + x2) / 2 : (st.handle.includes('w') ? x2 : st.handle.includes('e') ? x1 : (x1 + x2) / 2);
        const cy = fromCenter ? (y1 + y2) / 2 : (st.handle.includes('n') ? y2 : st.handle.includes('s') ? y1 : (y1 + y2) / 2);

        if (fromCenter || !hasX) {
          x1 = cx - (w / 2);
          x2 = cx + (w / 2);
        } else if (st.handle.includes('w')) {
          x1 = x2 - w;
        } else if (st.handle.includes('e')) {
          x2 = x1 + w;
        }

        if (fromCenter || !hasY) {
          y1 = cy - (h / 2);
          y2 = cy + (h / 2);
        } else if (st.handle.includes('n')) {
          y1 = y2 - h;
        } else if (st.handle.includes('s')) {
          y2 = y1 + h;
        }
      }

      x1 = Math.max(0, Math.min(1, x1));
      y1 = Math.max(0, Math.min(1, y1));
      x2 = Math.max(0, Math.min(1, x2));
      y2 = Math.max(0, Math.min(1, y2));
      if (x2 - x1 < minSize) x2 = Math.min(1, x1 + minSize);
      if (y2 - y1 < minSize) y2 = Math.min(1, y1 + minSize);
    }

    const path = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    AnnotationStore.updateDrawing(st.noteId, path, { x: x1 * 100, y: y1 * 100 });
    this._updateWorkspaceFrameUI() || this.renderReviewWorkspace();
  },

  _bindWorkspaceAnnotationLayer() {
    const canvas = document.getElementById('sv-ws-annotation-canvas');
    if (!canvas) return;
    this._workspaceCanvas = canvas;
    this._workspaceCtx = canvas.getContext('2d');
    canvas.onpointerdown = (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      this.startWorkspaceDraw(e);
    };
    canvas.onpointermove = (e) => this.moveWorkspaceDraw(e);
    canvas.onpointerup = () => this.endWorkspaceDraw();
    canvas.onpointercancel = () => this.endWorkspaceDraw();
    canvas.onpointerleave = () => this.endWorkspaceDraw();
    const frameEl = this._workspaceFrameEl();
    if (frameEl && !frameEl.dataset.focusBound) {
      frameEl.dataset.focusBound = '1';
      frameEl.addEventListener('mousemove', () => this._enterWorkspaceFocusMode());
      frameEl.addEventListener('mouseenter', () => this._enterWorkspaceFocusMode());
    }
    this._drawWorkspaceCanvas();
  },

  _stopWorkspacePlayback() {
    if (this._workspacePlaybackTimer) {
      clearInterval(this._workspacePlaybackTimer);
      this._workspacePlaybackTimer = null;
    }
    this.reviewWorkspaceState.isPlaying = false;
    const app = document.getElementById('supervisor-app');
    app?.classList.remove('sv-cinematic-play');
  },

  addWorkspaceNote() {
    const input = document.getElementById('sv-ws-note-input');
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    if (!selected || typeof AnnotationStore === 'undefined') return;
    const text = String(input?.value || '').trim() || ' ';
    const tool = (typeof ToolState !== 'undefined' ? ToolState.current : this.reviewWorkspaceState.activeTool) || 'pointer';
    const at = this.reviewWorkspaceState.floatingNoteAt;
    const xPos = at?.x ?? 50;
    const yPos = at?.y ?? 50;
    const created = AnnotationStore.add({
      frame: this.reviewWorkspaceState.currentFrame,
      version: this.reviewWorkspaceState.selectedVersion || selected.version,
      shot: selected.shot,
      text,
      author: User.current.name || 'Supervisor',
      role: 'supervisor',
      type: tool === 'box' ? 'highlight' : tool === 'arrow' ? 'arrow' : 'circle',
      drawingPath: DrawTool?.lastPath || [],
      color: tool === 'arrow' ? '#EF4444' : tool === 'box' ? '#F59E0B' : '#22C55E',
      x: xPos,
      y: yPos,
      position: { x: xPos, y: yPos }
    });
    this.reviewWorkspaceState.floatingNoteAt = null;
    DrawTool?.reset?.();
    Store.set('frameshift.reviewWorkspaceState', this.reviewWorkspaceState);
    this._broadcastLiveState('note', { note: created ? { id: created.id, frame: created.frame, shot: created.shot, version: created.version } : null });
    this.renderReviewWorkspace();
  },

  _isWorkspaceSelectedVersionApproved() {
    const selected = this.reviewWorkspaceState.selectedShot;
    const shot = this.shots.find((s) => s.shot === selected);
    const selectedVersionTag = this.reviewWorkspaceState.selectedVersion || shot?.version;
    if (!shot || !selectedVersionTag || typeof PipelineVersionStore === 'undefined') return false;
    const selectedVersionMeta = PipelineVersionStore
      .getVersions(shot.shot, selectedVersionTag)
      .find((v) => v.tag === selectedVersionTag);
    return selectedVersionMeta?.status === 'approved';
  },

  _timecodeFromFrame(frame) {
    const f = Math.max(0, Number(frame) || 0);
    const secs = Math.floor(f / 24);
    return `00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  },

  _workspaceRootId() {
    return this.workspaceMountId || 'sv-review-workspace-view';
  },

  _workspaceRoot() {
    return document.getElementById(this._workspaceRootId());
  },

  _workspaceFrameEl() {
    const root = this._workspaceRoot();
    return root ? root.querySelector('.review-frame') : null;
  },

  _computeWorkspaceInsights(notes, shotId) {
    const analysis = analyzeNotes(notes || []);
    const suggestions = generateSuggestions(analysis).map((s, i) => ({
      ...s,
      id: s.id || `ins-sg-${shotId}-${i}`,
      type: 'suggestion'
    }));
    const hotspots = (analysis.clusteredFrames || []).slice(0, 4).map((h, idx) => ({
      id: `ins-hot-${shotId}-${h.frame}-${idx}`,
      frame: h.frame,
      label: h.count >= 3 ? 'High note density hotspot' : 'Review attention cluster',
      detail: h.notes.slice(0, 2).map((n) => n.text).filter(Boolean).join(' | ') || `${h.count} note(s) require attention.`,
      severity: h.count >= 3 ? 'high' : 'medium',
      relatedNoteIds: h.notes.map((n) => n.id).filter(Boolean),
      keyword: ''
    }));
    return [...suggestions, ...hotspots].slice(0, 8);
  },

  _authorColor(name = 'User') {
    const palette = ['#A78BFA', '#60A5FA', '#34D399', '#F59E0B', '#FB7185', '#22D3EE'];
    let h = 0;
    String(name).split('').forEach((ch) => { h = ((h << 5) - h) + ch.charCodeAt(0); h |= 0; });
    return palette[Math.abs(h) % palette.length];
  },

  _updateWorkspaceFrameUI() {
    const app = document.getElementById('supervisor-app');
    if (!app || !app.classList.contains('sv-review-workspace-mode')) return false;
    const root = this._workspaceRoot();
    if (!root || root.classList.contains('is-hidden')) return false;
    const frame = this.reviewWorkspaceState.currentFrame || 1;
    const tc = root.querySelector('.review-timecode');
    if (tc) tc.textContent = this._timecodeFromFrame(frame);
    const slider = root.querySelector('.review-timeline input[type="range"]');
    if (slider) slider.value = String(frame);
    const playhead = root.querySelector('.review-timeline-playhead');
    if (playhead) {
      const pct = Math.max(0, Math.min(100, ((frame - 1) / 299) * 100));
      playhead.style.left = `${pct}%`;
    }
    root.querySelectorAll('.sv-ws-tick').forEach((el) => {
      const v = Number(el.textContent || 0);
      el.classList.toggle('active', Math.abs(v - frame) <= 15);
    });
    root.querySelectorAll('.review-strip-frame').forEach((el, idx) => {
      const f = 1 + (idx * 30);
      el.classList.toggle('active', Math.abs(f - frame) < 15);
    });
    const selected = this.shots.find((s) => s.shot === this.reviewWorkspaceState.selectedShot);
    const version = this.reviewWorkspaceState.selectedVersion || selected?.version || '';
    const shotId = this.reviewWorkspaceState.selectedShot;
    const notes = typeof AnnotationStore !== 'undefined'
      ? AnnotationStore.getNotes(version).filter((n) => n.shot === shotId && n.frame === frame)
      : [];
    const overlay = root.querySelector('.review-overlay-layer');
    if (overlay) {
      overlay.innerHTML = notes.map((note, idx) => {
        const rawX = note?.position?.x ?? note?.x ?? 45;
        const rawY = note?.position?.y ?? note?.y ?? 45;
        const x = rawX <= 1 ? rawX * 100 : rawX;
        const y = rawY <= 1 ? rawY * 100 : rawY;
        return `
        <button class="sv-ws-overlay-note tone-${note.tone || 'medium'} ${this.reviewWorkspaceState.focusedNoteId === note.id ? 'active' : ''}" style="left:${x}%;top:${y}%;" title="${String(note.text || '').replace(/"/g, '&quot;')}" onclick="event.stopPropagation();SupervisorDashboard.focusWorkspaceNote('${note.id}', ${note.frame})">
          <span class="dot"></span>
        </button>
      `;
      }).join('');
    }
    root.querySelectorAll('.review-note-item').forEach((el) => {
      const noteFrame = Number(el.getAttribute('data-frame') || 0);
      el.classList.toggle('active', noteFrame === frame);
    });
    this._drawWorkspaceCanvas();
    return true;
  },

  renderReviewWorkspace() {
    const root = this._workspaceRoot();
    if (!root) return;
    if (typeof window.initReviewWorkspace === 'function') {
      window.initReviewWorkspace(root);
    }
  },

  applyQueueFilter(filter) {
    this.currentFilter = filter;
    showToast('info', `Review Queue filter: ${String(filter).replace('-', ' ')}`);
  },

  setActivityFilter(filter) {
    this.activityFilter = filter;
    if (this.currentProject !== 'all') this.renderProject();
  },

  openShot(shot) {
    showToast('info', `Opening ${shot}`);
  },

  viewLogs(shot) {
    showToast('info', `Viewing logs for ${shot}`);
  },

  assignFix(shot) {
    this.flashFailure(shot);
    showToast('info', `Assigning fix for ${shot}`);
  },

  quickDecision(shot, action) {
    showToast('info', `${action === 'approve' ? 'Approved' : 'Sent back'} ${shot}`);
  },

  flashFailure(shot) {
    const root = document.getElementById('sv-project-dashboard');
    if (!root) return;
    root.querySelectorAll('.sv-attention-item').forEach((item) => {
      const strong = item.querySelector('.sv-att-col-shot strong');
      if (!strong || !strong.textContent.includes(shot)) return;
      item.classList.remove('sv-error-flash');
      void item.offsetWidth;
      item.classList.add('sv-error-flash');
    });
  },

  _artistAvatar(name) {
    if (this.artistAvatarMap && this.artistAvatarMap[name]) return this.artistAvatarMap[name];
    return `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(name)}`;
  },

  goToReviewQueue() {
    const shots = this._filterForQueue(this.currentProject === 'all' ? this._allShots() : this._projectShots(), this.currentFilter || 'needs-review');
    const tbody = document.getElementById('sv-queue-body');
    if (tbody) {
      tbody.innerHTML = shots.map(s => `
        <tr>
          <td>${s.project}</td>
          <td>${s.shot}</td>
          <td>${s.fxType}</td>
          <td>${this._statusLabel(s.status)}</td>
          <td>${s.priority[0].toUpperCase() + s.priority.slice(1)}</td>
        </tr>
      `).join('');
    }
    const modal = document.getElementById('sv-queue-modal');
    if (modal) modal.classList.remove('is-hidden');

    const top = shots[0];
    if (top) {
      const label = document.querySelector('.rm-shot-label');
      if (label) label.textContent = `[${top.project}] ${top.shot}_fx_${top.version}`;
    }
    if (typeof ReviewMode !== 'undefined' && typeof ReviewMode.enter === 'function') {
      ReviewMode.enter();
      showToast('info', 'Opened FX Review Queue');
      return;
    }
    showToast('info', 'FX Review Queue is not available in this build');
  },

  goToGlobalReviewQueue() {
    this.currentProject = 'all';
    const select = document.getElementById('sv-project-switcher');
    if (select) select.value = 'all';
    this.currentFilter = 'needs-review';
    this.goToReviewQueue();
  },

  closeQueue() {
    const modal = document.getElementById('sv-queue-modal');
    if (modal) modal.classList.add('is-hidden');
  },

  init() {
    const select = document.getElementById('sv-project-switcher');
    if (select) select.value = this.currentProject;
    this._normalizeShotActors();
    if (this.currentView === 'review-workspace') {
      document.body.classList.add('sidebar-collapsed');
      if (typeof ShellLayout !== 'undefined' && !ShellLayout.isCollapsed()) {
        ShellLayout.setCollapsed(true);
      }
    }
    if (!this._liveTimer) {
      this._liveTimer = setInterval(() => {
        this._liveSeconds = (this._liveSeconds + 1) % 3600;
        this._renderLiveUpdated();
      }, 1000);
    }
    this.render();
    SupervisorUserMenu.applyHeaderProfile();
  }
};
window.SupervisorDashboard = SupervisorDashboard;
window.setAppView = (view) => {
  if (typeof SupervisorDashboard !== 'undefined') SupervisorDashboard.setView(view);
};

const SupervisorDashboardPalette = {
  activeIndex: 0,
  _shots() {
    return SupervisorDashboard.currentProject === 'all' ? SupervisorDashboard._allShots() : SupervisorDashboard._projectShots();
  },
  open(options = {}) {
    const root = document.getElementById('sv-command-palette');
    const input = document.getElementById('sv-command-input');
    if (!root) return;
    root.classList.add('open');
    if (!options.keep_results) this.search('');
    if (!options.keep_focus) setTimeout(() => input?.focus(), 0);
  },
  close() {
    const root = document.getElementById('sv-command-palette');
    if (root) root.classList.remove('open');
  },
  search(query) {
    const q = String(query || '').trim().toLowerCase();
    const out = document.getElementById('sv-command-results');
    if (!out) return;
    const shots = this._shots().filter(s => !q || `${s.shot} ${s.fxType} ${s.actor} ${s.status}`.toLowerCase().includes(q)).slice(0, 8);
    this.activeIndex = 0;
    out.innerHTML = shots.map((s, idx) => `
      <button class="sv-command-item ${idx === 0 ? 'active' : ''}" data-index="${idx}" onclick="SupervisorDashboard.openShot('${s.shot}');SupervisorDashboardPalette.close()">
        <strong>${s.shot}</strong>
        <span>${s.fxType} · ${SupervisorDashboard._statusLabel(s.status)} · ${s.actor || 'Unassigned'}</span>
      </button>
    `).join('') || '<div class="sv-command-empty">No matches</div>';
  },
  keynav(event) {
    const items = Array.from(document.querySelectorAll('#sv-command-results .sv-command-item'));
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = Math.min(items.length - 1, this.activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = Math.max(0, this.activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[this.activeIndex]?.click();
      return;
    } else {
      return;
    }
    items.forEach((el, i) => el.classList.toggle('active', i === this.activeIndex));
  }
};
window.SupervisorDashboardPalette = SupervisorDashboardPalette;
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
    event.preventDefault();
    SupervisorDashboardPalette.open();
  }
  if (event.key === 'Escape') SupervisorDashboardPalette.close();
});

const SupervisorInsights = {
  toggle() {
    const panel = document.getElementById('sv-insights-panel');
    if (!panel) return;
    panel.classList.toggle('open');
  },

  close() {
    const panel = document.getElementById('sv-insights-panel');
    if (!panel) return;
    panel.classList.remove('open');
    panel.classList.remove('compact');
  },

  collapse() {
    const panel = document.getElementById('sv-insights-panel');
    if (!panel) return;
    panel.classList.toggle('compact');
    const btn = document.getElementById('sv-insights-collapse');
    if (btn) btn.textContent = panel.classList.contains('compact') ? 'Expand' : 'Collapse';
  },

  render(counts, shots, project) {
    const issues = document.getElementById('sv-insights-issues');
    const actions = document.getElementById('sv-insights-actions-list');
    const notes = document.getElementById('sv-insights-notes');
    if (!issues || !actions || !notes) return;

    const failed = counts.failed;
    const overdue = counts.overdue;
    const running = counts.running;
    const bottleneck = running > counts.cache;
    const topFailed = shots.filter(s => s.status === 'failed').slice(0, 2).map(s => `${s.shot} (${s.fxType})`);

    issues.innerHTML = `
      <li>${failed} failed sim${failed === 1 ? '' : 's'}${topFailed.length ? `: ${topFailed.join(', ')}` : ''}</li>
      <li>${overdue} overdue shot${overdue === 1 ? '' : 's'} pending supervisor review</li>
      <li>${bottleneck ? 'Sim-running queue exceeds cache-ready throughput (bottleneck detected)' : 'No major sim queue bottleneck detected'}</li>
    `;

    actions.innerHTML = `
      <li>Review failed sims and unblock pipeline first</li>
      <li>Approve cache-ready shots to reduce queue pressure</li>
      <li>Check long-running sims and investigate delays</li>
    `;

    notes.textContent = `Assistant summary for ${project}: prioritize critical failures, then clear overdue approvals to stabilize throughput.`;
  }
};
window.SupervisorInsights = SupervisorInsights;

const VersionStore = {
  versions: Store.get('frameshift.versions', DEFAULT_VERSIONS),
  activeVersion: Store.get('frameshift.activeVersion', 'v012'),
  nextNum: 13,

  get(tag)     { return this.versions.find(v => v.tag === tag); },
  getActive()  { return this.get(this.activeVersion); },
  forCurrentTask() {
    const current = typeof TaskFlow !== 'undefined' ? TaskFlow.current : 'SH_0100';
    return this.versions.filter(v => (v.task || current) === current);
  },
  count()      { return this.forCurrentTask().length; },

  select(tag) {
    if (!this.get(tag)) return;
    this.activeVersion = tag;
    this.persist();
    Render.all();
  },

  updateStatus(tag, status) {
    const version = this.get(tag);
    if (!version) return;
    version.status = status;
    this.activeVersion = tag;
    this.persist();
    Render.all();
  },

  addVersion(filename, sizeStr, taskId) {
    // Validate via VersionState: uploading only allowed when current is working/revise
    const cur = this.getActive();
    if (cur && !VersionState.STATES[cur.status]?.canArtistUpload) {
      showToast('warn', `Cannot upload — ${cur.tag} status is "${VersionState.label(cur.status)}"`);
      return null;
    }
    const num = this.nextNum++;
    const tag = 'v' + String(num).padStart(3,'0');
    this.versions.unshift({
      tag, num,
      time: 'Just now',
      status: 'working',
      notes: 0,
      by: 'Alex Johnson',
      size: sizeStr || '—',
      filename: filename || `SH_0100_comp_${tag}.exr`,
      task: taskId || (typeof TaskFlow !== 'undefined' ? TaskFlow.current : 'SH_0100')
    });
    this.activeVersion = tag;
    this.persist();
    return tag;
  },

  persist() {
    Store.set('frameshift.versions', this.versions);
    Store.set('frameshift.activeVersion', this.activeVersion);
  }
};
window.VersionStore = VersionStore;

/* ─────────────────────────────────────────────────────────
   BADGE HELPERS
───────────────────────────────────────────────────────── */
const STATUS_META = {
  working:  { cls:'badge-working',  label:'Working'  },
  revise:   { cls:'badge-revise',   label:'Revise'   },
  approved: { cls:'badge-approved', label:'Approved' },
};
function badgeHtml(status, small) {
  const m = STATUS_META[status] || STATUS_META.working;
  const s = small ? ' style="font-size:9px;padding:2px 7px;"' : '';
  return `<span class="badge ${m.cls}"${s}>${m.label}</span>`;
}

/* ─────────────────────────────────────────────────────────
   RENDER — pure DOM updates, no side-effects
───────────────────────────────────────────────────────── */
const Render = {

  currentTaskUI() {
    if (typeof TaskFlow === 'undefined') return;
    const task = TaskFlow.current;
    const info = TaskFlow.details?.[task] || {};
    const version = VersionStore.getActive()?.tag || 'v001';
    const shotLabel = `${task}_comp_${version}`;
    const dept = info.department || 'FX';
    const taskType = info.taskType || 'FX Simulation';

    document.querySelectorAll('.current-task-card .task-name').forEach(el => { el.textContent = shotLabel; });
    document.querySelectorAll('.center-shot-id').forEach(el => { el.textContent = `${task}_comp`; });
    document.querySelectorAll('.center-shot-dept').forEach(el => { el.textContent = `${dept} · ${taskType}`; });
    const banner = document.getElementById('active-task-banner');
    if (banner) banner.textContent = `Working on ${task} · ${taskType}`;
    const mode = document.getElementById('player-mode');
    if (mode && typeof Player !== 'undefined') mode.textContent = Player.mode === 'review' ? 'Review Mode' : 'Work Mode';
    const dashShot = document.querySelector('.dash-focus-main h2');
    if (dashShot) dashShot.textContent = task;
    const dashDesc = document.querySelector('.dash-focus-main p');
    if (dashDesc) dashDesc.textContent = info.description || 'Fire Temple – Wide';
    const dashMeta = document.querySelectorAll('.dash-focus-meta span');
    if (dashMeta[0]) dashMeta[0].textContent = `Task: ${taskType}`;
    if (dashMeta[1]) dashMeta[1].textContent = `Department: ${dept}`;
    const deadline = document.querySelector('.dash-focus-deadline strong');
    if (deadline) deadline.textContent = info.deadline || 'May 24, 2024';
    const remaining = document.querySelector('.dash-focus-deadline em');
    if (remaining) remaining.textContent = info.remaining || '2 days remaining';
    const status = document.querySelector('.dash-focus-progress strong');
    if (status) status.textContent = info.statusLabel || 'In Progress';
    const progressFill = document.querySelector('.dash-focus-progress .dash-progress-track div');
    if (progressFill) progressFill.style.width = `${info.progress ?? 60}%`;
    const progressText = document.querySelector('.dash-focus-progress small');
    if (progressText) progressText.textContent = `${info.progress ?? 60}%`;
    document.querySelectorAll('[data-shot]').forEach(el => {
      const rowInfo = TaskFlow.details?.[el.dataset.shot] || {};
      const name = el.querySelector('.task-row-name, .task-name');
      const meta = el.querySelector('.task-row-meta, .task-dept');
      if (name) name.textContent = `${el.dataset.shot}_comp${rowInfo.version ? '_' + rowInfo.version : ''}`;
      if (meta) meta.textContent = `${rowInfo.department || 'FX'} · ${rowInfo.taskType || 'FX Simulation'}`;
    });
    document.querySelectorAll('[data-shot]').forEach(el => {
      el.classList.toggle('locked', !TaskFlow.canOpen(el.dataset.shot));
      el.classList.toggle('active-task', TaskFlow.canOpen(el.dataset.shot));
    });
  },

  /* Current Version Card (center-right top) */
  currentVersionCard() {
    const v = VersionStore.getActive();
    if (!v) return;
    const tagEl    = document.getElementById('cv-tag');
    const badgeEl  = document.getElementById('cv-badge');
    const updEl    = document.getElementById('cv-updated');
    if (tagEl)   tagEl.textContent   = v.tag;
    if (updEl)   updEl.textContent   = 'Updated ' + v.time;
    if (badgeEl) {
      const m = STATUS_META[v.status] || STATUS_META.working;
      badgeEl.className   = 'badge ' + m.cls;
      badgeEl.textContent = m.label;
    }
    // also update info panel tag
    const infoTag = document.getElementById('info-cv-tag');
    if (infoTag) infoTag.textContent = v.tag;
  },

  /* Version History list (center-right, compact) */
  versionRows() {
    const listEl = document.getElementById('vh-list');
    if (!listEl) return;

    const showAll = listEl.dataset.showAll === 'true';
    const versions = VersionStore.forCurrentTask();
    const displayed = showAll
      ? versions
      : versions.slice(0, 4);

    if (versions.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No versions yet — upload your first version</div>';
    } else {
    listEl.innerHTML = displayed.map(v => {
      const isActive = v.tag === VersionStore.activeVersion;
      const notesHtml = v.notes > 0
        ? `<span class="vh-note-ct" title="${v.notes} supervisor note${v.notes>1?'s':''}">${v.notes}</span>`
        : '';

      const detailHtml = isActive ? `
        <div class="vh-detail">
          <div class="vh-detail-row"><span class="vh-dkey">Uploaded by</span><span class="vh-dval">${v.by}</span></div>
          <div class="vh-detail-row"><span class="vh-dkey">File size</span><span class="vh-dval">${v.size}</span></div>
          <div class="vh-detail-row"><span class="vh-dkey">Filename</span><span class="vh-dval" style="font-size:10px;font-family:monospace;">${v.filename}</span></div>
          ${v.notes > 0 ? `<div class="vh-detail-row"><span class="vh-dkey">Notes</span><span class="vh-dval" style="color:var(--purple-txt);">${v.notes} note${v.notes>1?'s':''}</span></div>` : ''}
        </div>` : '';

      return `<div class="vh-row${isActive?' vr-active':''}" data-v="${v.tag}" onclick="selectVersion('${v.tag}')">
        <span class="vh-tag">${v.tag}</span>
        <span class="vh-time">${v.time}</span>
        ${notesHtml}
        ${badgeHtml(v.status, true)}

        ${detailHtml}
      </div>`;
    }).join('');
    }

    // Show-all button text
    const btn = document.getElementById('show-all-btn');
    if (btn) {
      const remaining = VersionStore.count() - 4;
      btn.textContent = showAll
        ? 'Show less'
        : `Show all versions (${VersionStore.count()})`;
      btn.style.display = VersionStore.count() <= 4 ? 'none' : 'block';
    }

    // Tab count badge
    const tc = document.getElementById('tc-versions');
    if (tc) tc.textContent = VersionStore.count();
    const tic = document.getElementById('info-total-v');
    if (tic) tic.textContent = VersionStore.count();
  },

  /* Versions full-list table (center-left VERSIONS tab) */
  versionsTable() {
    const body = document.getElementById('versions-full-list-body');
    if (!body) return;

    const versions = VersionStore.forCurrentTask();
    if (versions.length === 0) {
      body.innerHTML = '<div class="empty-state">No versions yet — upload your first version</div>';
      return;
    }
    body.innerHTML = versions.map(v => {
      const isActive = v.tag === VersionStore.activeVersion;
      return `<div class="vfl-row${isActive?' vfl-active':''}" onclick="selectVersion('${v.tag}')">
        <div class="vfl-ver">
          <div class="vfl-mini-thumb"></div>
          ${v.tag}
        </div>
        <div class="vfl-meta">
          <div class="vfl-filename">${v.filename}</div>
          <div class="vfl-by">${v.by}</div>
        </div>
        ${badgeHtml(v.status, true)}
        <div class="vfl-date">${v.time}</div>
        <div class="vfl-notes-ct${v.notes>0?' has-notes':''}">
          ${v.notes > 0 ? v.notes : '—'}
        </div>

      </div>`;
    }).join('');
  },

  /* Submit panel dropdown */
  submitDropdown() {
    const sel = document.getElementById('submit-version-select');
    if (!sel) return;
    const labels = { working:'Working', revise:'Revise', approved:'Approved' };
    const versions = VersionStore.forCurrentTask();
    if (versions.length === 0) {
      sel.innerHTML = '<option value="">No versions yet</option>';
      return;
    }
    sel.innerHTML = versions.map((v,i) =>
      `<option value="${v.tag}"${i===0?' selected':''}>${v.tag} (${labels[v.status]||'Working'})</option>`
    ).join('');
  },

  /* Run all render passes */
  all() {
    this.currentTaskUI();
    this.currentVersionCard();
    this.versionRows();
    this.versionsTable();
    this.submitDropdown();
  }
};

/* ─────────────────────────────────────────────────────────
   ACTIONS
───────────────────────────────────────────────────────── */
function selectVersion(tag) {
  if (tag === VersionStore.activeVersion) return;
  VersionStore.select(tag);
  showToast('info', `Viewing ${tag} — ${STATUS_META[VersionStore.get(tag)?.status]?.label || ''}`);
}

function downloadVersion(tag) {
  const v = VersionStore.get(tag);
  if (!v) return;
  showToast('success', `Downloading ${tag} — ${v.filename} (${v.size})`);
}

/* ─────────────────────────────────────────────────────────
   TAB SYSTEM
───────────────────────────────────────────────────────── */
const TabSystem = {
  active: 'dashboard',

  switch(tabName) {
    this.active = tabName;
    document.body.classList.toggle('dashboard-landing', tabName === 'dashboard');
    if (tabName === 'dashboard') {
      document.body.classList.remove('focus-mode');
      WorkState?.set?.('idle');
    }

    // Update tab underlines
    document.querySelectorAll('.tab[data-tab]').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Show/hide panels
    document.querySelectorAll('.tab-panel[data-panel]').forEach(p => {
      p.classList.toggle('active', p.dataset.panel === tabName);
    });

    // Lazy render the versions table when switching to it
    if (tabName === 'versions') Render.versionsTable();
  }
};

// Expose globally (called from HTML onclick & JS)
function switchTab(name) {
  TabSystem.switch(name);
  updateSidebarActive(name);
}

const WorkState = {
  mode: 'idle',

  set(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
  }
};
window.WorkState = WorkState;

const TaskFlow = {
  current: Store.get('frameshift.currentTask', 'SH_0100'),
  queue: ['SH_0100', 'SH_0101', 'SH_0102', 'SH_0103'],
  dependencies: {
    SH_0101: ['SH_0100'],
    SH_0102: ['SH_0100'],
    SH_0103: ['SH_0102'],
  },
  completed: Store.get('frameshift.completedTasks', []),
  lockedVersions: Store.get('frameshift.lockedVersions', []),
  details: {
    SH_0100: { description:'Fire Temple – Wide', taskType:'FX Simulation', department:'FX', version:'v012', deadline:'May 24, 2024', remaining:'2 days remaining', progress:60, statusLabel:'In Progress', priority:1 },
    SH_0101: { description:'Fire Close Up', taskType:'Glow Variation', department:'FX', version:'v005', deadline:'May 25, 2024', remaining:'3 days remaining', progress:20, statusLabel:'Assigned', priority:2 },
    SH_0102: { description:'Smoke Simulation', taskType:'FX Simulation', department:'FX', version:'v003', deadline:'May 24, 2024', remaining:'Due today', progress:10, statusLabel:'Assigned', priority:3 },
    SH_0103: { description:'Ember Detail Pass', taskType:'FX Simulation', department:'FX', version:'v002', deadline:'May 24, 2024', remaining:'Due today', progress:10, statusLabel:'Assigned', priority:4 },
    SH_0104: { description:'BG Comp', taskType:'FX Simulation', department:'FX', version:'v001', deadline:'May 27, 2024', remaining:'4 days remaining', progress:0, statusLabel:'Assigned', priority:5 },
  },

  canOpen(shot) {
    return shot === this.current && this.dependenciesMet(shot);
  },

  dependenciesMet(shot) {
    const deps = this.dependencies[shot] || [];
    return deps.every(dep => this.completed.includes(dep) || dep === this.current);
  },

  activate(shot) {
    this.current = shot;
    Store.set('frameshift.currentTask', this.current);
    if (typeof Render !== 'undefined') Render.all();
    if (typeof Dashboard !== 'undefined') Dashboard.init();
  },

  complete(shot = this.current) {
    if (!this.completed.includes(shot)) this.completed.push(shot);
    Store.set('frameshift.completedTasks', this.completed);
  },

  lock(versionId) {
    if (!this.lockedVersions.includes(versionId)) this.lockedVersions.push(versionId);
    Store.set('frameshift.lockedVersions', this.lockedVersions);
  },

  next() {
    return this.queue
      .filter(shot => shot !== this.current)
      .sort((a,b) => (this.details[a]?.priority || 99) - (this.details[b]?.priority || 99))
      .find(shot => this.dependenciesMet(shot)) || this.current;
  }
};
window.TaskFlow = TaskFlow;

function openTask(shot) {
  if (!TaskFlow.canOpen(shot)) {
    showToast('warn', 'This task is not active yet');
    return;
  }
  Dashboard.openTask(shot);
}
window.openTask = openTask;

const FlowManager = {
  submitCurrentTask() {
    WorkState.set('submitting');
    SubmitFlow.submit();
  },

  completeTask() {
    showToast('success', 'Task submitted');
    TaskFlow.complete();
    const nextTask = TaskFlow.next();
    if (nextTask !== TaskFlow.current) {
      TaskFlow.activate(nextTask);
      Dashboard.openTask(nextTask);
      showToast('info', 'Next task loaded');
    }
  }
};
window.FlowManager = FlowManager;

const Dashboard = {
  init() {
    const notes = typeof AnnotationStore !== 'undefined'
      ? AnnotationStore.getNotes(VersionStore?.activeVersion || 'v012')
      : [];
    const newNotes = notes.filter(note => note.role === 'supervisor' && note.frame != null).length || 2;
    const el = document.getElementById('dash-new-notes');
    if (el) el.textContent = String(newNotes);
  },

  openWorkspace(message = 'Opened current shot workspace') {
    switchTab('overview');
    document.body.classList.add('focus-mode');
    showToast('info', message);
  },

  continueWorking() {
    WorkState.set('working');
    Player.mode = 'work';
    this.openWorkspace(`Continuing ${TaskFlow.current}`);
  },

  openShot() {
    WorkState.set('working');
    Player.mode = 'work';
    this.openWorkspace(`Opened ${TaskFlow.current}`);
  },

  openTasks(group) {
    switchTab('overview');
    showToast('info', `Showing ${group === 'today' ? 'due today' : group === 'review' ? 'needs review' : 'assigned'} tasks`);
  },

  openTask(shot) {
    if (!TaskFlow.canOpen(shot)) {
      showToast('warn', 'This task is not active yet');
      return;
    }
    WorkState.set('working');
    Player.mode = 'work';
    switchTab('overview');
    document.body.classList.add('focus-mode');
    showToast('info', `Opened ${shot}`);
  },

  openFeedback(frame) {
    WorkState.set('reviewing');
    Player.mode = 'review';
    switchTab('overview');
    document.body.classList.add('focus-mode');
    if (typeof AnnotationSystem !== 'undefined') AnnotationSystem.seekToFrame(frame);
    showToast('info', 'Review note loaded — update your work');
  },

  uploadVersion() {
    WorkState.set('working');
    switchTab('versions');
    document.body.classList.add('focus-mode');
    document.getElementById('version-file-input')?.click();
  },

  startReview() {
    WorkState.set('reviewing');
    Player.mode = 'review';
    switchTab('overview');
    document.body.classList.add('focus-mode');
    if (typeof ReviewMode !== 'undefined') ReviewMode.enter();
  },

  createNote() {
    WorkState.set('working');
    switchTab('notes');
    document.body.classList.add('focus-mode');
    document.getElementById('cn-ta')?.focus();
  }
};
window.Dashboard = Dashboard;
window.DashboardActions = Dashboard;


const ReviewSession = {
  shot: null,
  version: null,
  queue: [],
  index: 0,
  currentVersion: '',
  compareVersion: null,
  compareMode: 'off',

  start(shot, version) {
    this.shot = shot;
    this.version = version;
    this.currentVersion = version;
    this.compareVersion = null;
    this.compareMode = 'off';
    this.queue = (typeof SupervisorDashboard !== 'undefined')
      ? SupervisorDashboard._workspaceShots().map((s) => s.shot)
      : [];
    this.index = Math.max(0, this.queue.indexOf(shot));
    Player.seek(0);
    Player.pause(Player._playButton());
    renderNotes();
    renderViewer();
  },

  loadNotes(version = this.version) {
    const notes = AnnotationStore.forVersion(version);
    renderNotes();
    return notes;
  },

  nextShot() {
    if (!this.queue.length) return null;
    this.index = (this.index + 1) % this.queue.length;
    this.shot = this.queue[this.index];
    if (typeof SupervisorDashboard !== 'undefined') SupervisorDashboard.setWorkspaceShot(this.shot);
    return this.shot;
  },

  prevShot() {
    if (!this.queue.length) return null;
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.shot = this.queue[this.index];
    if (typeof SupervisorDashboard !== 'undefined') SupervisorDashboard.setWorkspaceShot(this.shot);
    return this.shot;
  },

  setCompare(mode, compareVersion = null) {
    this.compareMode = mode || 'off';
    this.compareVersion = compareVersion;
  }
};
window.ReviewSession = ReviewSession;

const PipelineVersionStore = {
  key: 'frameshift.pipelineVersions',
  data: Store.get('frameshift.pipelineVersions', {}),
  _ensureShot(shotId, fallbackVersion = 'v001') {
    if (!this.data[shotId]) {
      this.data[shotId] = [
        { tag: fallbackVersion, status: 'needs_review', updated: 'Just now', media: '' }
      ];
      Store.set(this.key, this.data);
    }
    return this.data[shotId];
  },
  getVersions(shotId, fallbackVersion = 'v001') {
    return this._ensureShot(shotId, fallbackVersion);
  },
  setStatus(shotId, tag, status) {
    const versions = this._ensureShot(shotId, tag || 'v001');
    const target = versions.find((v) => v.tag === tag);
    if (target) target.status = status;
    Store.set(this.key, this.data);
  },
  setVersions(shotId, versions) {
    this.data[shotId] = versions;
    Store.set(this.key, this.data);
  }
};
window.PipelineVersionStore = PipelineVersionStore;

const DrawTool = {
  current: 'pointer',
  lastPath: [],
  set(tool) {
    this.current = tool;
    if (typeof ToolState !== 'undefined') ToolState.current = tool;
  },
  end(frame = 1, points = null) {
    const path = Array.isArray(points) && points.length
      ? points
      : Array.isArray(this.lastPath) && this.lastPath.length > 1
        ? this.lastPath
        : [];
    if (!path.length || typeof SupervisorDashboard === 'undefined' || typeof AnnotationStore === 'undefined') return;
    const selected = SupervisorDashboard.shots?.find((s) => s.shot === SupervisorDashboard.reviewWorkspaceState?.selectedShot);
    if (!selected) return;
    const tool = (typeof ToolState !== 'undefined' ? ToolState.current : this.current) || 'pointer';
    const first = path[0];
    const created = AnnotationStore.add({
      frame: Number(frame) || SupervisorDashboard.reviewWorkspaceState.currentFrame || 1,
      version: SupervisorDashboard.reviewWorkspaceState.selectedVersion || selected.version,
      shot: selected.shot,
      drawing: path,
      drawingPath: path,
      text: '',
      author: User.current.name || 'Supervisor',
      role: 'supervisor',
      type: tool === 'box' ? 'highlight' : tool === 'arrow' ? 'arrow' : 'circle',
      color: tool === 'arrow' ? '#EF4444' : tool === 'box' ? '#F59E0B' : '#22C55E',
      x: (first?.x ?? 0.5) * 100,
      y: (first?.y ?? 0.5) * 100,
      position: { x: (first?.x ?? 0.5) * 100, y: (first?.y ?? 0.5) * 100 }
    });
    SupervisorDashboard.openFloatingNoteInput((first?.x ?? 0.5) * 100, (first?.y ?? 0.5) * 100, created?.id || '');
    this.reset();
  },
  reset() {
    this.lastPath = [];
  }
};
window.DrawTool = DrawTool;
const ToolState = { current: DrawTool.current || 'pointer' };
window.ToolState = ToolState;

const Compare = {
  toggle() {
    if (typeof SupervisorDashboard !== 'undefined') SupervisorDashboard.toggleWorkspaceCompare();
  }
};
window.Compare = Compare;

function renderFrame(frame) {
  Player.frame = Math.max(0, Math.min(frame, Player.duration));
  Player._setProgressForFrame(Player.frame);
  Player._setTimecode(Player.frame);
  Player._syncReviewFrame(Player.frame);
  renderTimelineMarkers();
}
window.renderFrame = renderFrame;

function createNote(text) {
  const noteText = text || 'Note';
  AnnotationStore.add({
    frame: Math.round(Player.frame),
    version: VersionStore.activeVersion,
    text: noteText,
    author: User.current.name,
    type: 'circle'
  });
  renderNotes();
  renderTimelineMarkers();
}
window.createNote = createNote;

function renderNotes() {
  return;
}
window.renderNotes = renderNotes;

function renderViewer() {
  AnnotationSystem._build?.(VersionStore.activeVersion);
  renderTimelineMarkers();
}
window.renderViewer = renderViewer;

function getMarkers(version) {
  return AnnotationStore.notes
    .filter(n => n.version === version)
    .map(n => n.frame);
}
window.getMarkers = getMarkers;

function renderTimelineMarkers() {
  const frames = getMarkers(VersionStore.activeVersion);
  const strip = document.querySelector('.sup-frame-strip');
  if (!strip) return;
  strip.querySelectorAll('.sup-marker').forEach(marker => marker.remove());
  frames.forEach(frame => {
    const marker = document.createElement('button');
    marker.className = 'sup-marker';
    marker.style.left = `${Math.max(0, Math.min(100, (frame / Player.duration) * 100))}%`;
    marker.title = `Frame ${frame}`;
    marker.onclick = () => Player.seek(frame);
    strip.appendChild(marker);
  });
}

/* ─────────────────────────────────────────────────────────
   UPLOAD ZONE
───────────────────────────────────────────────────────── */
const UploadZone = {
  zone:       null,
  fillEl:     null,
  timer:      null,
  progress:   0,

  init() {
    this.zone   = document.getElementById('upload-zone');
    this.fillEl = document.getElementById('upload-progress-fill');
    if (!this.zone) return;

    // Click to browse
    this.zone.addEventListener('click', () => {
      if (this.zone.classList.contains('dz-uploading')) return;
      document.getElementById('version-file-input').click();
    });

    // File-input change
    const fileInput = document.getElementById('version-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) this.start(f);
        e.target.value = ''; // allow same file again
      });
    }

    // Drag events on the zone itself
    this.zone.addEventListener('dragenter', e => {
      e.preventDefault(); e.stopPropagation();
      this.zone.classList.add('dz-over');
    });
    this.zone.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
    });
    this.zone.addEventListener('dragleave', e => {
      e.stopPropagation();
      if (!this.zone.contains(e.relatedTarget)) {
        this.zone.classList.remove('dz-over');
      }
    });
    this.zone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      this.zone.classList.remove('dz-over');
      if (this.zone.classList.contains('dz-uploading')) return;
      const f = e.dataTransfer?.files[0];
      if (f) this.start(f);
    });

    // Prevent page-level drag drop hijack
    ['dragover','drop'].forEach(evt => {
      document.addEventListener(evt, e => { if (e.target !== this.zone) e.preventDefault(); });
    });
  },

  start(file) {
    const allowed = /\.(exr|dpx|mov|mp4|png|tiff|tif|jpg|jpeg)$/i;
    if (!allowed.test(file.name)) {
      this.fail('Invalid file type');
      return;
    }
    const sizeStr = file.size > 1073741824
      ? (file.size / 1073741824).toFixed(1) + ' GB'
      : file.size > 1048576
        ? (file.size / 1048576).toFixed(0) + ' MB'
        : (file.size / 1024).toFixed(0) + ' KB';

    // Switch to uploading state
    this.zone.classList.add('dz-uploading');
    this.zone.classList.remove('dz-done');
    this._show('dz-uploading');

    const fnEl   = document.getElementById('dz-fname');
    const pctEl  = document.getElementById('dz-pct-label');
    if (fnEl)  fnEl.textContent  = file.name;
    if (pctEl) pctEl.textContent = '0%';

    // Animate progress
    this.progress = 0;
    if (this.fillEl) this.fillEl.style.width = '0%';
    clearInterval(this.timer);

    this.timer = setInterval(() => {
      const remaining = 100 - this.progress;
      const step = Math.max(0.6, remaining * 0.07 + Math.random() * 1.8);
      this.progress = Math.min(this.progress + step, 99);

      if (this.fillEl) this.fillEl.style.width = this.progress + '%';
      if (pctEl) pctEl.textContent = Math.round(this.progress) + '%';

      if (this.progress >= 99) {
        clearInterval(this.timer);
        setTimeout(() => this.complete(file, sizeStr), 280);
      }
    }, 55);
  },

  complete(file, sizeStr) {
    // Snap to 100%
    if (this.fillEl) this.fillEl.style.width = '100%';
    const pctEl = document.getElementById('dz-pct-label');
    if (pctEl) pctEl.textContent = '100%';

    setTimeout(() => {
      // Add to store & re-render
      const newTag = VersionStore.addVersion(file.name, sizeStr, TaskFlow.current);

      // Switch to done state
      this.zone.classList.remove('dz-uploading');
      this.zone.classList.add('dz-done');
      this._show('dz-done');

      const doneTag  = document.getElementById('dz-done-tag');
      const doneName = document.getElementById('dz-done-name');
      if (doneTag)  doneTag.textContent  = newTag + ' created successfully';
      if (doneName) doneName.textContent  = file.name;

      // Render all version UI
      Render.all();

      // Flash new row
      requestAnimationFrame(() => {
        const newRow = document.querySelector(`[data-v="${newTag}"]`);
        if (newRow) {
          newRow.classList.add('vr-new');
          setTimeout(() => newRow.classList.remove('vr-new'), 5000);
        }
      });

      showToast('success', `${newTag} uploaded — ${file.name}`);

      // Reset zone after 3.5s
      setTimeout(() => this.reset(), 3500);
    }, 220);
  },

  fail(message = 'Upload failed') {
    showToast('error', message);
    this.reset();
  },

  reset() {
    this.zone.classList.remove('dz-uploading','dz-done','dz-over');
    this._show('dz-idle');
    if (this.fillEl) this.fillEl.style.width = '0%';
  },

  _show(stateId) {
    ['dz-idle','dz-uploading','dz-done'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === stateId) ? '' : 'none';
    });
  }
};

/* ─────────────────────────────────────────────────────────
   VERSION TOGGLE (show all / collapse)
───────────────────────────────────────────────────────── */
function toggleShowAll() {
  const list = document.getElementById('vh-list');
  if (!list) return;
  list.dataset.showAll = list.dataset.showAll === 'true' ? 'false' : 'true';
  Render.versionRows();
}

/* ─────────────────────────────────────────────────────────
   TOAST — lightweight notification
───────────────────────────────────────────────────────── */
function showToast(type, message) {
  const wrap = document.getElementById('center-toast-wrap');
  if (!wrap) return;

  const colors  = { success:'var(--green)', info:'var(--purple-txt)', error:'var(--red)', warn:'var(--amber)' };
  const icons   = { success:'✓', info:'ℹ', error:'✕', warn:'⚠' };

  const t = document.createElement('div');
  t.className = 'center-toast';
  t.innerHTML = `
    <div class="ct-icon" style="background:${colors[type]}25;color:${colors[type]};">${icons[type]}</div>
    <span>${message}</span>`;
  wrap.appendChild(t);

  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('ct-show')));

  setTimeout(() => {
    t.classList.remove('ct-show');
    setTimeout(() => t.remove(), 260);
  }, 3000);
}

/* ─────────────────────────────────────────────────────────
   VIEWER — basic scrub on progress bar
───────────────────────────────────────────────────────── */
const Player = {
  playing: false,
  mode: 'review',
  looping: true,
  frame: 0,
  fps: 24,
  duration: 320,
  progress: 0,
  timer: null,
  lastTime: null,
  totalFrames: 320, // matches the review timeline and annotation frame data
  _snapLockFrame: null,
  _pauseLockFrame: null,
  _hitLockFrame: null,
  _reviewHoldTimer: null,

  currentFrame() {
    return this.frame;
  },

  _setTimecode(frameNum) {
    const tc = document.getElementById('main-timecode');
    if (!tc) return;
    const wholeFrame = Math.max(0, Math.min(this.totalFrames, Math.floor(frameNum)));
    const secs   = Math.floor(wholeFrame / this.fps);
    const frames = wholeFrame % this.fps;
    const mm     = String(Math.floor(secs / 60)).padStart(2,'0');
    const ss     = String(secs % 60).padStart(2,'0');
    const ff     = String(frames).padStart(2,'0');
    tc.textContent = `${mm}:${ss}:${ff}`;
  },

  _syncReviewFrame(frameNum) {
    if (typeof Timeline !== 'undefined') Timeline.update(frameNum);
    if (typeof AnnotationSystem !== 'undefined') AnnotationSystem.onFrameChange(frameNum);
    if (typeof Render !== 'undefined') Render.currentTaskUI();
  },

  _setProgressForFrame(frameNum) {
    this.frame = Math.max(0, Math.min(this.duration, frameNum));
    this.progress = Math.max(0, Math.min(100, (this.frame / this.duration) * 100));
    const fill = document.getElementById('main-progress-fill');
        if (fill) fill.style.width = this.progress + '%';
  },

  _playButton() {
    return document.getElementById('main-play-btn');
  },

  _snapFrame(frameNum) {
    if (this.mode !== 'review') return frameNum;
    const version = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
    const frames = typeof AnnotationStore !== 'undefined' ? AnnotationStore.allFrames(version) : [];
    const nearest = frames.reduce((best, frame) => {
      if (best == null) return frame;
      return Math.abs(frame - frameNum) < Math.abs(best - frameNum) ? frame : best;
    }, null);

    if (nearest == null) return frameNum;
    const distance = Math.abs(nearest - frameNum);
    if (distance > 2) {
      if (this._snapLockFrame === nearest) this._snapLockFrame = null;
      return frameNum;
    }
    if (this._snapLockFrame === nearest) return frameNum;
    this._snapLockFrame = nearest;
    return nearest;
  },

  _isReviewFrame(frameNum) {
    const version = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
    if (typeof AnnotationStore === 'undefined') return false;
    return AnnotationStore.allFrames(version).includes(frameNum);
  },

  play(btn) {
    if (this.playing) return;
    clearTimeout(this._reviewHoldTimer);
    this.playing = true;
    this.lastTime = performance.now();
    const playBtn = btn || this._playButton();
    if (playBtn) {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
      setActive(playBtn, true);
    }
    this.timer = requestAnimationFrame(this._tick.bind(this));
  },

  loop() {
    if (!this.playing) return;
    this.frame = Math.min(this.frame + 1, this.duration);
    renderFrame(this.frame);
    this.timer = requestAnimationFrame(() => this.loop());
  },

  pause(btn, preserveHold = false) {
    if (!preserveHold) clearTimeout(this._reviewHoldTimer);
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) cancelAnimationFrame(this.timer);
    this.timer = null;
    const playBtn = btn || this._playButton();
    if (playBtn) {
      playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      setActive(playBtn, false);
    }
  },

  _tick(now) {
    if (!this.playing) return;

    const delta = now - (this.lastTime || now);
    const frameAdvance = (delta / 1000) * this.fps;
    let frame = this.currentFrame() + frameAdvance;

    if (frame >= this.duration) {
      if (this.looping) {
        frame = 0;
        this._hitLockFrame = null;
    } else {
        frame = this.duration;
        this._setProgressForFrame(frame);
        this._setTimecode(frame);
        this._syncReviewFrame(frame);
        this.pause(this._playButton());
        return;
      }
    }

    const note = this.mode === 'review' && typeof AnnotationSystem !== 'undefined'
      ? AnnotationSystem.getNoteNear(frame)
      : null;
    if (note) {
      const dist = Math.abs(note.frame - frame);
      if (dist < 8 && dist >= 2) {
        frame -= Math.sign(frame - note.frame) * dist * 0.2;
      }
    }
    if (note && Math.abs(note.frame - frame) < 2 && this._hitLockFrame !== note.frame) {
      frame = note.frame;
      this._hitLockFrame = note.frame;
      this._setProgressForFrame(frame);
      this._setTimecode(frame);
      this._syncReviewFrame(frame);
      this.pause(this._playButton(), true);
      clearTimeout(this._reviewHoldTimer);
      this._reviewHoldTimer = setTimeout(() => {
        if (this._hitLockFrame === note.frame) this.play(this._playButton());
      }, 900);
      return;
    }

    if (!note && this._hitLockFrame != null && Math.abs(frame - this._hitLockFrame) > 3) {
      this._hitLockFrame = null;
    }

    frame = this._snapFrame(frame);
    this._setProgressForFrame(frame);
    this._setTimecode(frame);
    this._syncReviewFrame(frame);
    this.lastTime = now;

    this.timer = requestAnimationFrame(this._tick.bind(this));
  },

  togglePlay(btn) {
    this.playing ? this.pause(btn) : this.play(btn);
  },

  toggle() {
    this.togglePlay(this._playButton());
  },

  seek(frame) {
    const nextFrame = Math.max(0, Math.min(frame, this.duration));
    this._setProgressForFrame(nextFrame);
    this._setTimecode(nextFrame);
    this._syncReviewFrame(nextFrame);
  },

  stepFrame(dir) {
    this.pause(this._playButton());

    let frame = Math.round(this.currentFrame()) + dir;
    this.seek(frame);
  },

  skipToStart() {
    this.seek(0);
  },

  skipToEnd() {
    this.seek(this.duration);
  },

  scrub(e) {
    const bar = document.getElementById('main-progress');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    this.progress = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const fill = document.getElementById('main-progress-fill');
    if (fill) fill.style.width = this.progress + '%';
    const frameNum = this._snapFrame(this.currentFrame());
    if (frameNum !== this.currentFrame()) this._setProgressForFrame(frameNum);
    this._setTimecode(frameNum);
    this._syncReviewFrame(frameNum);
  }
};

function togglePlay(btn) { Player.togglePlay(btn); }
function scrubProgress(e) { Player.scrub(e); }
function setActive(btn, state) {
  if (!btn) return;
  btn.classList.toggle('active', state);
}

function initArtistApp() {
  if (typeof SupervisorDashboard !== 'undefined' && typeof SupervisorDashboard._normalizeShotActors === 'function') {
    SupervisorDashboard._normalizeShotActors();
    const companyArtists = SupervisorDashboard._companyArtists?.() || [];
    if (User.current.role === 'artist' && companyArtists.length && !companyArtists.includes(User.current.name)) {
      User.current.name = companyArtists[0];
      User.current.department = User.current.department || 'FX';
      Store.set('frameshift.currentUser', User.current);
      User.applyRole();
    }
  }
  if (typeof AssignmentBridge !== 'undefined') AssignmentBridge.hydrateArtistTaskFlow();
  TabSystem.switch('dashboard');
  updateSidebarActive('dashboard');

  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => TabSystem.switch(tab.dataset.tab));
  });

  const showAllBtn = document.getElementById('show-all-btn');
  if (showAllBtn) showAllBtn.addEventListener('click', toggleShowAll);

  document.querySelectorAll('.player-btn').forEach(btn => {
    const title = btn.getAttribute('title');
    if (title === 'Previous frame') btn.onclick = () => Player.stepFrame(-1);
    if (title === 'Next frame') btn.onclick = () => Player.stepFrame(1);
    if (title === 'Step back') btn.onclick = () => Player.stepFrame(-10);
    if (title === 'Skip to start') btn.onclick = () => Player.skipToStart();
    if (title === 'Skip to end') btn.onclick = () => Player.skipToEnd();
    if (title === 'Loop') {
      setActive(btn, Player.looping);
      btn.onclick = () => {
        Player.looping = !Player.looping;
        setActive(btn, Player.looping);
      };
    }
  });

  Render.all();
  UploadZone.init();

  document.querySelectorAll('.shortcut-row').forEach(row => {
    if (row.textContent.trim().startsWith('Upload Version')) {
      row.addEventListener('click', () => {
        const fi = document.getElementById('version-file-input');
        if (fi) fi.click();
      });
    }
    if (row.textContent.trim().startsWith('Submit for Review')) {
      row.addEventListener('click', () => {
        document.querySelector('.submit-btn')?.scrollIntoView({ behavior:'smooth' });
        document.querySelector('.submit-btn')?.focus();
      });
    }
  });

  CNInput.init();
  AnnotationSystem.init();
  switchTab('dashboard');
  Dashboard.init();
  Render.all();
  SubmitFlow.init();
  ArtistBehavior.init();
}

function initSupervisorApp() {
  if (typeof SupervisorDashboard !== 'undefined') {
    SupervisorDashboard.init();
  }
}

function initAppForRole() {
  if (User.current.role === 'supervisor') {
    initSupervisorApp();
    return;
  }
  initArtistApp();
}

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', e => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === ' ') {
      e.preventDefault();
      Player.togglePlay();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      Player.stepFrame(1);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      Player.stepFrame(-1);
    }
    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      Player.stepFrame(-10);
    }
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      Player.stepFrame(10);
    }
  });

  User.applyRole();
  renderAppByRole();
  initAppForRole();
});

/* ══════════════════════════════════════════════════════════════
   FRAMESHIFT NOTES SYSTEM — Step 3
   (notes system removed — lives in center tab only)
══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   TIME UTILITIES
───────────────────────────────────────────────────────── */
function relTime(iso) {
  const d = +new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s <  30)  return 'Just now';
  if (s <  90)  return '1m ago';
  if (s < 3600) return Math.floor(s / 60)   + 'm ago';
  if (s < 86400)return Math.floor(s / 3600)  + 'h ago';
  if (s < 172800)return 'Yesterday';
  return Math.floor(s / 86400) + 'd ago';
}
function absTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const H = d.getHours().toString().padStart(2,'0');
  const M = d.getMinutes().toString().padStart(2,'0');
  const t = `${H}:${M}`;
  if (d.toDateString() === now.toDateString()) return `Today at ${t}`;
  const yest = new Date(now); yest.setDate(now.getDate()-1);
  if (d.toDateString() === yest.toDateString()) return `Yesterday at ${t}`;
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) + ` at ${t}`;
}
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}










/* ═══════════════════════════════════════════════════════════════
   SUBMIT FLOW
═══════════════════════════════════════════════════════════════ */
const SubmitFlow = {
  _notifyChecked:    true,
  _countdownTimer:   null,
  _submitted:        false,
  _submittedVersion: null,

  init() {
    const btn = document.getElementById('submit-btn');
    if (btn && !btn.getAttribute('onclick')) btn.addEventListener('click', () => this.submit());
    if (typeof Render !== 'undefined') Render.submitDropdown();
  },

  onVersionChange() {},

  onNoteInput(ta) {
    const hint = document.getElementById('sf-hint');
    if (!hint) return;
    const len = ta.value.trim().length;
    hint.textContent = len > 500 ? `${len}/500 — keep notes concise` : len > 0 ? `${len} chars` : '';
    hint.className   = 'sf-hint' + (len > 500 ? ' sf-warn' : '');
  },

  toggleNotify() {
    this._notifyChecked = !this._notifyChecked;
    const chk = document.getElementById('notify-chk');
    const who = document.getElementById('notify-who');
    if (!chk) return;
    if (this._notifyChecked) {
      chk.style.background = 'var(--purple)';
      chk.innerHTML = '<svg viewBox="0 0 12 12"><polyline points="1.5 6 4.5 9 10.5 3" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    } else {
      chk.style.background = 'var(--bg-input)';
      chk.innerHTML = '';
    }
    if (who) who.style.opacity = this._notifyChecked ? '1' : '0.35';
  },

  submit() {
    if (this._submitted) return;
    const btn     = document.getElementById('submit-btn');
    const version = document.getElementById('submit-version-select')?.value
                    || (typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012');
    const note    = document.getElementById('submit-note')?.value.trim() || '';

    if (btn) {
      btn.classList.add('sb-loading');
      btn.innerHTML = '<span class="sb-spinner"></span>Submitting…';
    }
    setTimeout(() => {
      this._submitted        = true;
      this._submittedVersion = version;
      this._cascadeStatus(version);
      this._showConfirmation(version, note);
      WorkState.set('submitting');
      setTimeout(() => FlowManager.completeTask(), 1000);
    }, 720);
  },

  _cascadeStatus(version) {
    /* 1. Center badge */
    const badge = document.getElementById('task-status-badge');
    if (badge) {
      badge.className = 'badge badge-review badge-pop';
      badge.textContent = 'In Review';
      setTimeout(() => badge.classList.remove('badge-pop'), 400);
    }
    /* 2. Left panel badge */
    const ctBadge = document.querySelector('.current-task-card .badge');
    if (ctBadge) {
      ctBadge.className = 'badge badge-review badge-pop';
      ctBadge.textContent = 'In Review';
      setTimeout(() => ctBadge.classList.remove('badge-pop'), 400);
    }
    /* 3. System event in notes thread */
    this._addSystemEventNote(version);
  },

  _addSystemEventNote(version) {
    const thread = document.getElementById('cn-thread');
    if (!thread) return;
    const el = document.createElement('div');
    el.className = 'note-system-event';
    el.innerHTML = `
      <div class="nse-line"></div>
      <div class="nse-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" width="10" height="10">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        Submitted for review · ${version} · Just now
      </div>
      <div class="nse-line"></div>`;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  },

  _showConfirmation(version, note) {
    const formWrap = document.getElementById('submit-form-wrap');
    const confWrap = document.getElementById('submit-confirm-wrap');
    if (formWrap) formWrap.style.display = 'none';
    if (confWrap) confWrap.classList.add('sc-visible');

    const now = new Date();
    const hm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sc-ver-pill',      version);
    set('sc-time-pill',     `Today at ${hm}`);
    set('sc-shot-line',     'SH_0100_comp_v012');
    set('sc-sup-row',       'Sarah Chen');
    set('sc-notified-row',  this._notifyChecked ? 'Yes — email + in-app' : 'No');
    set('sc-note-row',      note.length > 0 ? (note.length > 34 ? note.slice(0,34)+'…' : note) : 'None');
    this._startUndoCountdown(8);
  },

  _startUndoCountdown(seconds) {
    let remaining = seconds;
    clearInterval(this._countdownTimer);
    this._countdownTimer = setInterval(() => {
      remaining--;
      const countEl = document.getElementById('sc-undo-count');
      if (countEl) countEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(this._countdownTimer);
        const undoBtn = document.getElementById('sc-undo-btn');
        if (undoBtn) {
          undoBtn.classList.add('scu-fading');
          setTimeout(() => { if (undoBtn) undoBtn.style.display = 'none'; }, 1500);
        }
      }
    }, 1000);
  },

  undo() {
    if (!this._submitted) return;
    clearInterval(this._countdownTimer);
    this._submitted = false;
    /* Revert badges */
    ['task-status-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.className = 'badge badge-ip badge-pop'; el.textContent = 'In Progress'; }
    });
    const ctBadge = document.querySelector('.current-task-card .badge');
    if (ctBadge) { ctBadge.className = 'badge badge-ip badge-pop'; ctBadge.textContent = 'In Progress'; }
    /* Remove system event note */
    document.querySelectorAll('.note-system-event').forEach(el => el.remove());
    this.reset();
    if (typeof showToast !== 'undefined') showToast('info', 'Submission undone — back to In Progress');
  },

  reset() {
    this._submitted = this._submittedVersion = null;
    clearInterval(this._countdownTimer);
    const formWrap = document.getElementById('submit-form-wrap');
    const confWrap = document.getElementById('submit-confirm-wrap');
    const btn      = document.getElementById('submit-btn');
    const undoBtn  = document.getElementById('sc-undo-btn');
    if (formWrap) formWrap.style.display = '';
    if (confWrap) confWrap.classList.remove('sc-visible');
    if (btn)      { btn.classList.remove('sb-loading'); btn.textContent = 'Submit for Review'; }
    if (undoBtn)  { undoBtn.style.display = ''; undoBtn.classList.remove('scu-fading'); }
    const countEl = document.getElementById('sc-undo-count');
    if (countEl) countEl.textContent = '8';
  },
};

/* ─────────────────────────────────────────────────────────
   INIT SUBMIT FLOW
───────────────────────────────────────────────────────── */
// SubmitFlow is initialized inside initArtistApp().


/* ══════════════════════════════════════════════════════════════
   FRAMESHIFT STATE SYSTEM
   Enforced transitions — single source of truth for all statuses.
══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────
   TASK STATE MACHINE
───────────────────────────────────────────────────────── */
const TaskState = {
  STATES: {
    assigned:    { label:'Assigned',    badge:'badge-assigned', next:['in_progress'] },
    in_progress: { label:'In Progress', badge:'badge-ip',       next:['in_review'] },
    in_review:   { label:'In Review',   badge:'badge-review',   next:['approved','revise'] },
    revise:      { label:'Revise',      badge:'badge-revise',   next:['in_progress'] },
    approved:    { label:'Approved',    badge:'badge-approved', next:[] },
  },

  /* Artist can only push forward */
  ARTIST_CAN_SET: ['in_progress', 'in_review'],
  /* System/supervisor can set anything */

  _current: 'in_progress',

  get current() { return this._current; },
  get def()     { return this.STATES[this._current]; },

  canArtist(to) {
    if (!this.ARTIST_CAN_SET.includes(to)) return { ok:false, reason:`"${this.STATES[to]?.label||to}" requires supervisor action` };
    if (!(this.def?.next||[]).includes(to))  return { ok:false, reason:`Cannot move from "${this.def?.label}" → "${this.STATES[to]?.label}". Valid: ${(this.def?.next||[]).map(s=>this.STATES[s]?.label).join(', ')||'none'}` };
    return { ok:true };
  },

  apply(to, actor='artist') {
    const check = actor === 'artist' ? this.canArtist(to) : { ok:true };
    if (!check.ok) { showToast('warn', check.reason); return false; }
    const from = this._current;
    this._current = to;
    this._fire(from, to);
    return true;
  },

  _cbs: [],
  on(fn) { this._cbs.push(fn); },
  _fire(f,t) { this._cbs.forEach(fn=>fn(f,t)); },
};

/* ─────────────────────────────────────────────────────────
   VERSION STATE MACHINE
───────────────────────────────────────────────────────── */
const VersionState = {
  STATES: {
    working:   { label:'Working',   badge:'badge-working',  canArtistUpload:true,  next:['submitted'] },
    submitted: { label:'Submitted', badge:'badge-review',   canArtistUpload:false, next:['approved','revise'] },
    approved:  { label:'Approved',  badge:'badge-approved', canArtistUpload:false, next:[] },
    revise:    { label:'Revise',    badge:'badge-revise',   canArtistUpload:true,  next:['submitted'] },
  },

  canTransitionTo(from, to) {
    return (this.STATES[from]?.next || []).includes(to);
  },

  badge(status)  { return this.STATES[status]?.badge || 'badge-working'; },
  label(status)  { return this.STATES[status]?.label || status; },
  canUpload(status) { return this.STATES[status]?.canArtistUpload ?? true; },
};

/* ─────────────────────────────────────────────────────────
   WIRE TaskState → ALL STATUS BADGES
───────────────────────────────────────────────────────── */
TaskState.on((from, to) => {
  const def = TaskState.STATES[to];
  if (!def) return;

  /* 1. Center panel OVERVIEW badge */
  const cb = document.getElementById('task-status-badge');
  if (cb) { cb.className=`badge ${def.badge} badge-pop`; cb.textContent=def.label; setTimeout(()=>cb.classList.remove('badge-pop'),350); }

  /* 2. Left panel current-task badge */
  const lb = document.querySelector('.current-task-card .badge');
  if (lb) { lb.className=`badge ${def.badge} badge-pop`; lb.textContent=def.label; setTimeout(()=>lb.classList.remove('badge-pop'),350); }

  /* 3. Info panel status cell */
  document.querySelectorAll('.info-val .badge').forEach(b => {
    if (b.textContent.includes('Progress')||b.textContent.includes('Review')||b.textContent.includes('Approved')||b.textContent.includes('Revise')) {
      b.className=`badge ${def.badge}`; b.textContent=def.label;
    }
  });

  /* 4. Submit panel — toggle button text based on state */
  const sb = document.getElementById('submit-btn');
  if (sb && !sb.classList.contains('sb-loading')) {
    if (to === 'in_review') { sb.textContent='Already In Review'; sb.disabled=true; }
    if (to === 'revise')    { sb.disabled=false; sb.textContent='Submit Revised Version'; }
    if (to === 'in_progress') { sb.disabled=false; sb.textContent='Submit for Review'; }
  }
});

/* ─────────────────────────────────────────────────────────
   PATCH SubmitFlow → use state machine
───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof SubmitFlow === 'undefined') return;

  /* Override _cascadeStatus */
  SubmitFlow._cascadeStatus = function(version) {
    const ok = TaskState.apply('in_review', 'artist');
    if (!ok) return;
    /* System event note in thread */
    this._addSystemEventNote(version);
  };

  /* Override undo */
  SubmitFlow.undo = function() {
    TaskState._current = 'in_progress';
    TaskState._fire('in_review', 'in_progress');
    document.querySelectorAll('.note-system-event').forEach(el=>el.remove());
    this.reset();
    showToast('info', 'Submission undone — back to In Progress');
  };
}, { once: true });


/* ══════════════════════════════════════════════════════════════
   ARTIST BEHAVIOR LOCKS — Step final
   1. Tasks are read-only — artist cannot reorder
   2. Current task always highlighted
   3. Latest version always auto-selected
══════════════════════════════════════════════════════════════ */
const ArtistBehavior = {

  /* ── Lock 1: Task list is immutable ──────────────────────────
     Tasks are assigned by supervisor. No drag, no reorder.
     Any accidental drag event is cancelled at the container level.
  ─────────────────────────────────────────────────────────── */
  lockTaskList() {
    const colLeft = document.querySelector('.col-left');
    if (!colLeft) return;

    // Block all drag events from propagating out of col-left
    ['dragstart','dragover','dragenter','dragleave','drop'].forEach(evt => {
      colLeft.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
      }, { capture: true });
    });

    // Ensure no task card has draggable attribute
    colLeft.querySelectorAll('[draggable]').forEach(el => {
      el.removeAttribute('draggable');
    });

    // Also block right-click context menus on task rows (no "move to top" etc.)
    colLeft.querySelectorAll('.task-row, .current-task-card, .up-next-card').forEach(el => {
      el.addEventListener('contextmenu', e => e.preventDefault());
    });
  },

  /* ── Lock 2: Current task always highlighted ──────────────────
     The current-task-card always has a distinct visual treatment.
     If the state ever changes (version submitted), update the badge
     but keep the card anchored as the active item.
  ─────────────────────────────────────────────────────────── */
  pinCurrentTask() {
    const card = document.querySelector('.current-task-card');
    if (!card) return;

    // Ensure it's always visible at the top (scroll col-left to top)
    const colLeft = document.querySelector('.col-left');
    if (colLeft) colLeft.scrollTop = 0;

    // Apply a persistent "active" data attribute
    card.dataset.pinned = 'true';
    card.setAttribute('aria-current', 'task');

    // When task status changes, reflect it on the card badge
    if (typeof TaskState !== 'undefined') {
      TaskState.on((from, to) => {
        const def = TaskState.STATES[to];
        if (!def) return;
        // Ensure card stays visible — scroll to top
        if (colLeft) {
          colLeft.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }
  },

  /* ── Lock 3: Latest version auto-selected ───────────────────
     On any render, the newest version (index 0) is always active.
     Submit dropdown always defaults to the latest version.
     Version table top row is always highlighted.
  ─────────────────────────────────────────────────────────── */
  autoSelectLatestVersion() {
    if (typeof VersionStore === 'undefined') return;

    // Ensure the active version is always the latest
    const latest = VersionStore.forCurrentTask()[0];
    if (latest && VersionStore.activeVersion !== latest.tag) {
      VersionStore.activeVersion = latest.tag;
    }

    // Patch VersionStore.addVersion to always auto-select new version
    const origAdd = VersionStore.addVersion.bind(VersionStore);
    VersionStore.addVersion = function(filename, sizeStr, taskId) {
      const tag = origAdd(filename, sizeStr, taskId);
      if (tag) {
        // New version is always index 0 and auto-selected
        this.activeVersion = tag;
        // Sync submit dropdown to new version
        const sel = document.getElementById('submit-version-select');
        if (sel) sel.value = tag;
        // Re-render version UI
        if (typeof Render !== 'undefined') Render.all();
      }
      return tag;
    };

    // Patch Render.submitDropdown to always select first option
    if (typeof Render !== 'undefined') {
      const origDropdown = Render.submitDropdown.bind(Render);
      Render.submitDropdown = function() {
        origDropdown();
        // Always ensure first option selected
        const sel = document.getElementById('submit-version-select');
        if (sel && sel.options.length > 0) {
          sel.selectedIndex = 0;
        }
      };
    }
  },

  /* ── Init all locks ─────────────────────────────────────── */
  init() {
    this.lockTaskList();
    this.pinCurrentTask();
    this.autoSelectLatestVersion();

    // Also lock task-row clicks to be view-only (open task detail, not select)
    document.querySelectorAll('.task-row').forEach(row => {
      // Preserve existing click but prevent any drag-initiated selection
      row.style.userSelect = 'none';
      row.style.webkitUserSelect = 'none';
    });

    // Add "view only" label to the other-assigned section to reinforce the model
    const otherHdr = document.querySelector('.other-hdr');
    if (otherHdr && !otherHdr.querySelector('.lock-label')) {
      const lbl = document.createElement('span');
      lbl.className = 'lock-label';
      lbl.style.cssText = 'font-size:9px;color:var(--t3);font-weight:500;background:var(--bg-card);border:1px solid var(--b);border-radius:3px;padding:1px 6px;';
      lbl.textContent = 'read only';
      otherHdr.appendChild(lbl);
    }
  }
};

/* ── Wire sidebar nav to also update visual active state ── */
function updateSidebarActive(tabName) {
  const map = { dashboard:'nav-dashboard', overview:'nav-tasks', versions:'nav-shots', notes:'nav-shots' };
  document.querySelectorAll('.artist-app .nav-item, .artist-app .sv-nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(map[tabName] || 'nav-dashboard');
  if (target) target.classList.add('active');
}

/* switchTab patched inline below */

/* ── Init on DOM ready ────────────────────────────────────── */
// ArtistBehavior is initialized inside initArtistApp().


/* ─────────────────────────────────────────────────────────
   CNInput — Center Notes input (self-contained)
   Replaces the removed right-panel notes system.
───────────────────────────────────────────────────────── */
const CNInput = {
  _frameRef: null,

  init() {
    const ta   = document.getElementById('cn-ta');
    const foot = document.getElementById('cn-input-footer');
    if (!ta) return;

    // Auto-grow
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 84) + 'px';
      if (foot) foot.classList.toggle('visible', ta.value.length > 0);
    });

    // Enter = send, Shift+Enter = newline
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
      if (e.key === 'Escape') this.closeFrameRef();
    });

    // Frame ref inputs
    ['cn-fr-start','cn-fr-end'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') this.attachFrame();
      });
    });
  },

  send() {
    const ta = document.getElementById('cn-ta');
    if (!ta || !ta.value.trim()) return;
    const text = ta.value.trim();
    const frameRef = this._frameRef;

    // Build message node
    const thread = document.getElementById('cn-thread');
    if (thread) {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const frameHtml = frameRef
        ? `<div class="cn-frame-tag" onclick="seekToFrame(${frameRef.start})"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Frames ${frameRef.start}–${frameRef.end}</div>` : '';

      const el = document.createElement('div');
      el.className = 'cn-msg cn-art';
      el.innerHTML = `
        <div class="cn-av cn-av-art">AJ</div>
        <div class="cn-body">
          <div class="cn-hdr">
            <span class="cn-author">Alex Johnson</span>
            <span class="cn-role-badge cn-role-art">You</span>
            <span class="cn-time">${timeStr}</span>
          </div>
          <div class="cn-txt">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          ${frameHtml}
        </div>`;
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
    }

    // Reset
    ta.value = '';
    ta.style.height = 'auto';
    document.getElementById('cn-input-footer')?.classList.remove('visible');
    this._frameRef = null;
    this.closeFrameRef();
  },

  toggleFrameRef() {
    const c = document.getElementById('cn-frame-composer');
    const btn = document.getElementById('cn-frame-btn');
    if (!c) return;
    const open = c.classList.toggle('open');
    if (btn) btn.style.color = open ? 'var(--purple-txt)' : '';
    if (open) document.getElementById('cn-fr-start')?.focus();
  },

  closeFrameRef() {
    const c = document.getElementById('cn-frame-composer');
    const btn = document.getElementById('cn-frame-btn');
    if (c) c.classList.remove('open');
    if (btn) btn.style.color = '';
    const s = document.getElementById('cn-fr-start');
    const e = document.getElementById('cn-fr-end');
    if (s) s.value = '';
    if (e) e.value = '';
  },

  attachFrame() {
    const s = parseInt(document.getElementById('cn-fr-start')?.value || '0');
    const e = parseInt(document.getElementById('cn-fr-end')?.value || '0');
    if (!s || !e || e < s) { showToast('warn', 'Enter a valid frame range'); return; }
    this._frameRef = { start: s, end: e };
    this.closeFrameRef();
    const ta = document.getElementById('cn-ta');
    if (ta) ta.focus();
    showToast('info', `Frame range ${s}–${e} will attach to next note`);
  },
};

/* seekToFrame — used by frame tags in notes thread */
function seekToFrame(frame) {
  if (typeof Player !== 'undefined') {
    Player.progress = Math.min(100, (frame / 320) * 100);
    const fill = document.getElementById('main-progress-fill');
    if (fill) fill.style.width = Player.progress + '%';
    const tc = document.getElementById('main-timecode');
    if (tc) {
      const secs = Math.floor(frame / 24);
      const fr   = frame % 24;
      const mm = String(Math.floor(secs/60)).padStart(2,'0');
      const ss = String(secs%60).padStart(2,'0');
      const ff = String(fr).padStart(2,'0');
      tc.textContent = `${mm}:${ss}:${ff}`;
    }
  }
  showToast('info', `Seeked to frame ${frame}`);
}


/* ═══════════════════════════════════════════════════════
   ANNOTATION SYSTEM
   ─────────────────────────────────────────────────────
   AnnotationStore  — per-version data (annotations + notes-with-frames)
   AnnotationCanvas — renders shapes on canvas, frame-aware
   FrameTimeline    — clickable markers, playhead sync
   NoteSync         — highlights note when frame matches
   AnnotationSystem — orchestrates everything, public API
═══════════════════════════════════════════════════════ */

/* ── DATA STORE ───────────────────────────────────────── */
const AnnotationStore = {
  /* Annotations: { frame, shape, x, y, w, h, color, version } */
  annotations: {
    v012: [
      { id:'a1', frame: 84,  shape:'circle',    x:0.48, y:0.55, r:0.09,  color:'#F59E0B', label:'Spill area' },
      { id:'a2', frame: 84,  shape:'arrow',     x1:0.72, y1:0.32, x2:0.55, y2:0.52, color:'#EF4444', label:'Edge spill source' },
      { id:'a3', frame: 105, shape:'highlight',  x:0.15, y:0.60, w:0.40, h:0.25,   color:'#3B82F6', label:'BG contrast zone' },
      { id:'a4', frame: 148, shape:'circle',    x:0.62, y:0.40, r:0.06,  color:'#22C55E', label:'Approved look' },
    ],
    v011: [
      { id:'b1', frame: 84,  shape:'circle',    x:0.48, y:0.52, r:0.12,  color:'#EF4444', label:'Too much spill' },
      { id:'b2', frame: 90,  shape:'arrow',     x1:0.30, y1:0.70, x2:0.50, y2:0.55, color:'#F59E0B', label:'Check motion blur' },
    ],
    v010: [
      { id:'c1', frame: 84,  shape:'circle',    x:0.50, y:0.50, r:0.15,  color:'#EF4444', label:'Density issue' },
    ],
  },

  notes: Store.get('frameshift.annotationNotes', []),

  /* Seed notes with frame references, per version */
  notesByVersion: {
    v012: [
      { id:'n1', frame: 84,  role:'supervisor', author:'Sarah Chen',   initials:'SC',
        text:'Please clean up the edge light spill on frame 84. The spill reads as a green tint — run a luma matte and apply curves.', time:'2h ago' },
      { id:'n2', frame: null, role:'artist',     author:'Alex Johnson', initials:'AJ',
        text:'Got it — running the luma matte now. Will update v013 shortly with the spill fix.', time:'1h ago' },
      { id:'n3', frame: 105, role:'supervisor', author:'Sarah Chen',   initials:'SC',
        text:'Also match the contrast in the background buildings around frame 105. Reference SH_0099 for the approved look.', time:'30m ago' },
    ],
    v011: [
      { id:'m1', frame: 84,  role:'supervisor', author:'Sarah Chen',   initials:'SC',
        text:'Smoke density still too uniform. Needs variation across the Z depth — heavier near frame 84.', time:'Yesterday' },
      { id:'m2', frame: 90,  role:'supervisor', author:'Sarah Chen',   initials:'SC',
        text:'Motion blur on particles looks off at frame 90. Should be softer.', time:'Yesterday' },
    ],
    v010: [
      { id:'k1', frame: 84,  role:'supervisor', author:'Sarah Chen',   initials:'SC',
        text:'Starting point. Density is off around frame 84 — smoke is too thin.', time:'2 days ago' },
    ],
  },

  _normalizeNote(note, versionHint = 'v001') {
    const version = note.version || versionHint;
    const status = note.status || (note.resolved ? 'resolved' : 'open');
    const legacyPath = Array.isArray(note.drawingPath) ? note.drawingPath : (Array.isArray(note.drawing) ? note.drawing : []);
    const annotations = Array.isArray(note.annotations)
      ? note.annotations
      : (legacyPath.length ? [{
        type: note.type || 'draw',
        points: legacyPath,
        color: note.color || '#22C55E',
        createdAt: note.createdAt || Date.now()
      }] : []);
    return {
      id: note.id || `note-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      shot: note.shot || note.task || 'SH_0000',
      version,
      frame: note.frame ?? 0,
      text: note.text || '',
      author: note.author || 'Unknown',
      resolved: status === 'resolved',
      status,
      replies: Array.isArray(note.replies) ? note.replies : [],
      role: note.role || 'supervisor',
      initials: note.initials || String(note.author || 'U').split(' ').map((p) => p[0]).join('').slice(0, 2),
      time: note.time || note.createdAgo || 'Just now',
      annotations,
      drawingPath: legacyPath,
      drawing: legacyPath,
      x: note.x ?? note.position?.x ?? 45,
      y: note.y ?? note.position?.y ?? 45,
      position: note.position || { x: note.x ?? 45, y: note.y ?? 45 }
    };
  },
  get(version)         { return this.annotations[version] || []; },
  forVersion(version) {
    return [
      ...(this.notesByVersion[version] || []).map((n) => this._normalizeNote(n, version)),
      ...this.notes.filter(n => n.version === version).map((n) => this._normalizeNote(n, version))
    ].sort((a, b) => (a.frame ?? 0) - (b.frame ?? 0));
  },
  getNotes(version)    { return this.forVersion(version); },
  forFrame(version, f) {
    const seeded = this.get(version).filter(a => a.frame === f);
    const fromNotes = this.getNotes(version)
      .filter((n) => n.frame === f && Array.isArray(n.drawingPath) && n.drawingPath.length > 1)
      .map((n) => {
        const p1 = n.drawingPath[0];
        const p2 = n.drawingPath[n.drawingPath.length - 1];
        return {
          id: n.id,
          frame: n.frame,
          shape: n.type || 'circle',
          x: p1?.x ?? 0.5,
          y: p1?.y ?? 0.5,
          x1: p1?.x ?? 0.5,
          y1: p1?.y ?? 0.5,
          x2: p2?.x ?? p1?.x ?? 0.5,
          y2: p2?.y ?? p1?.y ?? 0.5,
          color: n.color || '#22C55E',
          label: n.text || 'Annotation note',
          author: n.author
        };
      });
    return [...seeded, ...fromNotes];
  },
  notesForFrame(v, f)  { return this.getNotes(v).filter(n => n.frame === f); },
  getByFrame(frame, version) {
    return this.notes.filter(n =>
      n.frame === frame && n.version === version
    );
  },
  add(annotation) {
    const version = annotation.version || VersionStore.activeVersion;
    const rawPath = Array.isArray(annotation.drawingPath)
      ? annotation.drawingPath
      : (Array.isArray(annotation.drawing) ? annotation.drawing : []);
    const annotations = Array.isArray(annotation.annotations)
      ? annotation.annotations
      : (rawPath.length ? [{
        type: annotation.type || 'draw',
        points: rawPath,
        color: annotation.color || '#22C55E',
        createdAt: Date.now()
      }] : []);
    const note = this._normalizeNote({
      id:'sup-note-' + Date.now(),
      shot: annotation.shot || 'SH_0000',
      version,
      frame: annotation.frame,
      role:'supervisor',
      author:User.current.name,
      initials:User.current.name.split(' ').map(p=>p[0]).join('').slice(0,2),
      text:annotation.text || 'Supervisor annotation',
      time:'Just now',
      resolved:false,
      status: 'open',
      replies: [],
      annotations,
      drawingPath: rawPath,
      x: annotation.x ?? 45,
      y: annotation.y ?? 45,
      position: { x: annotation.x ?? 45, y: annotation.y ?? 45 }
    }, version);
    this.notes.push(note);
    Store.set('frameshift.annotationNotes', this.notes);
    return note;
  },
  getNoteById(noteId) {
    const fromSeed = Object.values(this.notesByVersion || {})
      .flat()
      .find((n) => n.id === noteId);
    if (fromSeed) return this._normalizeNote(fromSeed, fromSeed.version || 'v001');
    const dynamic = this.notes.find((n) => n.id === noteId);
    return dynamic ? this._normalizeNote(dynamic, dynamic.version || 'v001') : null;
  },
  _updateDynamicNote(noteId, updater) {
    const idx = this.notes.findIndex((n) => n.id === noteId);
    if (idx >= 0) {
      const next = updater(this._normalizeNote(this.notes[idx], this.notes[idx].version || 'v001'));
      this.notes[idx] = this._normalizeNote(next, next.version || this.notes[idx].version || 'v001');
      Store.set('frameshift.annotationNotes', this.notes);
      return this.notes[idx];
    }
    const seeded = this.getNoteById(noteId);
    if (!seeded) return null;
    const next = updater(seeded);
    this.notes.unshift(this._normalizeNote(next, next.version || seeded.version || 'v001'));
    Store.set('frameshift.annotationNotes', this.notes);
    return this.notes[0];
  },
  toggleResolved(noteId) {
    return this._updateDynamicNote(noteId, (n) => {
      const resolved = !n.resolved;
      return { ...n, resolved, status: resolved ? 'resolved' : 'open' };
    });
  },
  addReply(noteId, text, author = 'Supervisor') {
    return this._updateDynamicNote(noteId, (n) => ({
      ...n,
      replies: [...(n.replies || []), { id: `r-${Date.now()}`, text, author, time: 'Just now' }]
    }));
  },
  updateDrawing(noteId, drawingPath, position = null) {
    return this._updateDynamicNote(noteId, (n) => ({
      ...n,
      annotations: [{
        type: n.type || 'draw',
        points: drawingPath,
        color: n.color || '#22C55E',
        createdAt: Date.now()
      }],
      drawingPath,
      drawing: drawingPath,
      position: position || n.position,
      x: position?.x ?? n.x,
      y: position?.y ?? n.y
    }));
  },
  updateText(noteId, text) {
    return this._updateDynamicNote(noteId, (n) => ({
      ...n,
      text: String(text || '').trim(),
      time: 'Just now'
    }));
  },
  allFrames(version)   {
    const af = new Set(this.get(version).map(a => a.frame));
    this.getNotes(version).forEach(n => { if (n.frame != null) af.add(n.frame); });
    return [...af].sort((a,b) => a-b);
  },
};

/* ── CANVAS RENDERER ─────────────────────────────────── */
const AnnotationCanvas = {
  canvas: null,
  ctx: null,
  visible: false,

  init() {
    this.canvas = document.getElementById('ann-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  },

  _resize() {
    if (!this.canvas) return;
    const scene = document.querySelector('.viewer-scene');
    if (!scene) return;
    const r = scene.getBoundingClientRect();
    this.canvas.width  = r.width  || 640;
    this.canvas.height = r.height || 320;
    this.canvas.style.width  = '100%';
    this.canvas.style.height = '100%';
  },

  render(version, frame) {
    if (!this.ctx || !this.canvas) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.ctx.clearRect(0, 0, W, H);
    if (!this.visible) return;

    const anns = AnnotationStore.forFrame(version, frame);
    anns.forEach((a, i) => {
      this._drawShape(a, W, H, i);
    });
  },

  _drawShape(a, W, H, idx) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = 0.88;
    const c = a.color || '#F59E0B';

    /* entrance: offset slightly for stagger effect */
    ctx.globalAlpha = Math.min(0.88, 0.2 + idx * 0.25 + 0.5);

    if (a.shape === 'circle') {
      const cx = a.x * W, cy = a.y * H, r = a.r * Math.min(W, H);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.fillStyle = c + '22';
      ctx.fill();
      /* label dot */
      ctx.beginPath();
      ctx.arc(cx - r + 6, cy - r + 6, 4, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      /* label text */
      this._drawLabel(ctx, a.label, cx, cy - r - 8, c);
    }

    if (a.shape === 'arrow') {
      const x1 = a.x1 * W, y1 = a.y1 * H;
      const x2 = a.x2 * W, y2 = a.y2 * H;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      /* arrowhead */
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const hl  = 14;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang - Math.PI/6), y2 - hl * Math.sin(ang - Math.PI/6));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang + Math.PI/6), y2 - hl * Math.sin(ang + Math.PI/6));
      ctx.stroke();
      /* label at tail */
      this._drawLabel(ctx, a.label, x1, y1 - 10, c);
    }

    if (a.shape === 'highlight') {
      const x = a.x * W, y = a.y * H;
      const w = a.w * W, h = a.h * H;
      ctx.strokeStyle = c;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = c + '14';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([]);
      this._drawLabel(ctx, a.label, x + w/2, y - 8, c);
    }

    ctx.restore();
  },

  _drawLabel(ctx, text, x, y, color) {
    if (!text) return;
    ctx.save();
    ctx.font = '700 10px "Plus Jakarta Sans", system-ui, sans-serif';
    const m = ctx.measureText(text);
    const pad = 5, h = 16;
    const bx = x - m.width/2 - pad;
    const by = y - h/2 - 1;
    ctx.fillStyle = 'rgba(10,10,18,0.82)';
    ctx.beginPath();
    ctx.roundRect(bx, by, m.width + pad*2, h, 3);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  },

  setVisible(v) {
    this.visible = v;
    if (this.canvas) this.canvas.classList.toggle('ann-hidden', !v);
  },
};

/* ── FRAME TIMELINE ──────────────────────────────────── */
const FrameTimeline = {
  totalFrames: 320,

  init() {
    const tl = document.getElementById('frame-timeline');
    if (!tl) return;
    const tot = document.getElementById('ftl-total');
    if (tot) tot.textContent = `${this.totalFrames}fr`;

    /* Click on rail to seek */
    tl.addEventListener('click', e => {
      if (e.target.classList.contains('ftl-marker')) return;
      const r = tl.getBoundingClientRect();
      const pad = 10;
      const pct = Math.max(0, Math.min(1, (e.clientX - r.left - pad) / (r.width - pad*2)));
      const frame = Math.round(pct * this.totalFrames);
      AnnotationSystem.seekToFrame(frame);
    });
  },

  buildMarkers(version) {
    const tl = document.getElementById('frame-timeline');
    if (!tl) return;
    /* Remove old markers only */
    tl.querySelectorAll('.ftl-marker').forEach(m => m.remove());

    const frames = AnnotationStore.allFrames(version);
    frames.forEach(frame => {
      const pct  = frame / this.totalFrames;
      const pad  = 10;
      const tl2  = document.getElementById('frame-timeline');
      if (!tl2) return;
      const w    = tl2.offsetWidth - pad * 2;
      const left = pad + pct * w;

      /* Determine role from first annotation on this frame */
      const anns  = AnnotationStore.forFrame(version, frame);
      const notes = AnnotationStore.notesForFrame(version, frame);
      const role  = (anns.length || notes.length)
        ? (notes.some(n => n.role === 'supervisor') ? 'supervisor' : 'artist')
        : 'supervisor';

      const m = document.createElement('div');
      m.className  = 'ftl-marker';
      m.dataset.frame = frame;
      m.dataset.role  = role;
      m.dataset.label = `fr ${frame}`;
      m.style.left    = left + 'px';
      m.title         = `Frame ${frame}`;
      m.addEventListener('click', e => {
        e.stopPropagation();
        AnnotationSystem.seekToFrame(frame);
      });
      tl.appendChild(m);
    });
  },

  updatePlayhead(frame) {
    const ph  = document.getElementById('ftl-playhead');
    const tl  = document.getElementById('frame-timeline');
    if (!ph || !tl) return;
    const pad  = 10;
    const w    = tl.offsetWidth - pad * 2;
    const pct  = frame / this.totalFrames;
    ph.style.left = (pad + pct * w) + 'px';

    /* Highlight active marker */
    tl.querySelectorAll('.ftl-marker').forEach(m => {
      m.classList.toggle('ftlm-active', parseInt(m.dataset.frame) === frame);
    });
  },
};

/* Public timeline API used by playback. Keeps the visual playhead and markers live. */
const Timeline = {
  update(frame) {
    const playhead = document.getElementById('ftl-playhead');
    const total = Player?.totalFrames || FrameTimeline.totalFrames || 320;
    const percent = Math.max(0, Math.min(100, (frame / total) * 100));
    if (playhead) playhead.style.left = percent + '%';

    let hitMarker = null;
    document.querySelectorAll('.ftl-marker').forEach(marker => {
      const markerFrame = Number(marker.dataset.frame);
      const near = Math.abs(markerFrame - frame) < 2;
      const hit = Math.round(frame) === markerFrame;
      marker.classList.toggle('active', near);
      marker.classList.toggle('ftlm-active', hit);
      if (hit) hitMarker = marker;
    });

    if (hitMarker) this.pulse(hitMarker, playhead);
  },

  pulse(marker, playhead) {
    marker.classList.remove('ftlm-hit');
    if (playhead) playhead.classList.remove('ftl-hit');
    void marker.offsetWidth;
    marker.classList.add('ftlm-hit');
    if (playhead) playhead.classList.add('ftl-hit');
  },
};
window.Timeline = Timeline;

/* ── NOTE SYNC ───────────────────────────────────────── */
const NoteSync = {
  _lastHighlight: null,
  _lastContextFrame: null,

  buildThread(version) {
    const thread = document.getElementById('cn-thread');
    if (!thread) return;
    const notes = AnnotationStore.getNotes(version);

    thread.innerHTML = notes.map(n => {
      const isSup    = n.role === 'supervisor';
      const frameTag = n.frame != null
        ? `<div class="cn-frame-tag" onclick="AnnotationSystem.seekToFrame(${n.frame})">
             <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
             Frame ${n.frame}
           </div>`
        : '';
      const frameBadge = n.frame != null
        ? `<span class="cn-frame-badge">${n.frame}</span>`
        : '';

      return `<div class="cn-msg ${isSup ? 'cn-sup' : 'cn-art'}" data-frame="${n.frame ?? ''}" data-note-id="${n.id}">
        <div class="cn-av ${isSup ? 'cn-av-sup' : 'cn-av-art'}">${n.initials}</div>
        <div class="cn-body">
          <div class="cn-hdr">
            <span class="cn-author">${n.author}</span>
            <span class="cn-role-badge ${isSup ? 'cn-role-sup' : 'cn-role-art'}">${isSup ? 'Supervisor' : 'You'}</span>
            ${frameBadge}
            <span class="cn-time">${n.time}</span>
          </div>
          <div class="cn-txt">${n.text}</div>
          ${frameTag}
        </div>
      </div>`;
    }).join('');
  },

  showContext(version, frame) {
    const pop = document.getElementById('context-note-pop');
    if (!pop) return;
    const notes = AnnotationStore.notesForFrame(version, frame);

    if (!notes.length) {
      this._lastContextFrame = null;
      pop.classList.add('context-note-hidden');
      pop.innerHTML = '';
      return;
    }

    if (this._lastContextFrame === frame && !pop.classList.contains('context-note-hidden')) return;
    this._lastContextFrame = frame;
    const primary = notes[0];
    const more = notes.length > 1 ? ` +${notes.length - 1} more` : '';
    pop.innerHTML = `
      <div class="context-note-kicker">
        <span>Frame Feedback</span>
        <span class="context-note-frame">fr ${frame}${more}</span>
      </div>
      <div class="context-note-body">${escHtml(primary.text)}</div>
      <div class="context-note-meta">${escHtml(primary.author)} · ${escHtml(primary.time)}</div>`;
    pop.classList.remove('context-note-hidden');
  },

  highlightFrame(frame) {
    /* Remove previous highlight */
    if (this._lastHighlight) {
      this._lastHighlight.classList.remove('cn-active-frame');
      this._lastHighlight = null;
    }
    if (frame == null) return;

    /* Find note matching this frame */
    const thread  = document.getElementById('cn-thread');
    if (!thread) return;
    const match = thread.querySelector(`[data-frame="${frame}"]`);
    if (!match) return;

    match.classList.add('cn-active-frame');
    this._lastHighlight = match;

    /* Scroll note into view (smooth) */
    match.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    /* If notes tab is not active, pulse the tab badge */
    const notesTab = document.querySelector('.tab[data-tab="notes"]');
    if (notesTab && !notesTab.classList.contains('active')) {
      notesTab.classList.add('tab-pulse');
      setTimeout(() => notesTab.classList.remove('tab-pulse'), 1200);
    }
  },
};

/* ── MAIN ORCHESTRATOR ───────────────────────────────── */
const AnnotationSystem = {
  _overlayOn: false,
  _currentFrame: 84,
  _currentVersion: 'v012',

  init() {
    AnnotationCanvas.init();
    FrameTimeline.init();
    this._currentVersion = (typeof VersionStore !== 'undefined')
      ? VersionStore.activeVersion : 'v012';

    /* Build initial state */
    this._build(this._currentVersion);

    /* Player calls AnnotationSystem.onFrameChange directly on every tick. */
    this._patchPlayer();

    /* Listen for version changes */
    if (typeof VersionStore !== 'undefined') {
      const _origSelect = VersionStore.select?.bind(VersionStore);
      if (_origSelect) {
        VersionStore.select = (tag) => {
          _origSelect(tag);
          this._currentVersion = tag;
          this._build(tag);
          if (typeof ReviewSession !== 'undefined') ReviewSession.loadNotes(tag);
        };
      }
    }

    this.seekToFrame(this._currentFrame);
  },

  _build(version) {
    FrameTimeline.buildMarkers(version);
    NoteSync.buildThread(version);
    AnnotationCanvas.render(version, this._currentFrame);
    FrameTimeline.updatePlayhead(this._currentFrame);
    NoteSync.showContext(version, this._currentFrame);
  },

  _patchPlayer() {
    /* Kept as an init hook for older code paths; Player now owns frame dispatch. */
  },

  onFrameChange(frame) {
    this._onFrame(frame);
  },

  getNoteAtFrame(frame) {
    return AnnotationStore.notesForFrame(this._currentVersion, Math.round(frame))[0] || null;
  },

  getNoteNear(frame) {
    const notes = AnnotationStore.getNotes(this._currentVersion)
      .filter(note => note.frame != null);
    return notes.find(note => Math.abs(note.frame - frame) < 2) || null;
  },

  showContextPopup(note, frame) {
    if (!note) return;
    const el = document.getElementById('context-note-pop');
    if (!el) return;

    el.innerHTML = `
      <div class="context-note-kicker">
        <span>Frame Feedback</span>
        <span class="context-note-frame">fr ${note.frame ?? Math.round(frame)}</span>
      </div>
      <div class="context-note-body">${escHtml(note.text)}</div>
      <div class="context-note-meta">${escHtml(note.author)} · ${escHtml(note.time)}</div>`;
    el.style.display = 'flex';
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px) scale(0.95)';
    el.classList.remove('context-note-hidden');

    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.2s ease, transform 0.2s ease, filter 0.2s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0) scale(1)';
      el.style.filter = '';
    });
  },

  hideContextPopup() {
    const pop = document.getElementById('context-note-pop');
    if (!pop) return;
    pop.style.opacity = '0';
    pop.style.transform = 'translateY(10px) scale(0.95)';
    pop.style.filter = 'blur(2px)';
    setTimeout(() => {
      pop.classList.add('context-note-hidden');
      pop.style.display = 'none';
      pop.innerHTML = '';
    }, 200);
  },

  _onFrame(frame, force = false) {
    const displayFrame = Math.round(frame);
    if (!force && this._currentFrame === displayFrame) return;
    this._currentFrame = displayFrame;
    AnnotationCanvas.render(this._currentVersion, displayFrame);
    Timeline.update(frame);
    NoteSync.highlightFrame(displayFrame);
    const note = this.getNoteAtFrame(displayFrame);
    if (note) this.showContextPopup(note, displayFrame);
    else this.hideContextPopup();
  },

  seekToFrame(frame) {
    frame = Math.round(Math.max(0, Math.min(Player.totalFrames, frame)));
    Player.progress = (frame / Player.totalFrames) * 100;
    const fill = document.getElementById('main-progress-fill');
    if (fill) fill.style.width = Player.progress + '%';
    const tc = document.getElementById('main-timecode');
    if (tc) {
      const s = Math.floor(frame / 24);
      const fr = frame % 24;
      tc.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}:${String(fr).padStart(2,'0')}`;
    }
    this._onFrame(frame, true);
    /* Keep notes contextual in the viewer; the Notes tab still highlights if open. */
    const hasNote = AnnotationStore.notesForFrame(this._currentVersion, frame).length > 0;
    if (hasNote) {
      NoteSync.highlightFrame(frame);
      NoteSync.showContext(this._currentVersion, frame);
    }
  },

  toggleOverlay() {
    this._overlayOn = !this._overlayOn;
    AnnotationCanvas.setVisible(this._overlayOn);
    const btn = document.getElementById('ann-toggle');
    if (btn) btn.classList.toggle('active', this._overlayOn);
    if (this._overlayOn) {
      AnnotationCanvas.render(this._currentVersion, this._currentFrame);
    }
    showToast(this._overlayOn ? 'info' : 'info',
      this._overlayOn ? 'Annotations visible' : 'Annotations hidden', );
  },
};
window.AnnotationSystem = AnnotationSystem;

/* Tab pulse style */
const _s = document.createElement('style');
_s.textContent = `.tab-pulse{animation:tabPulse .6s ease 2;}@keyframes tabPulse{0%,100%{color:var(--t2)}50%{color:var(--amber);}}`;
document.head.appendChild(_s);







/* ═══════════════════════════════════════════════════════════════
   REVIEW MODE  —  fixed-overlay, self-contained player + notes
═══════════════════════════════════════════════════════════════ */
const ReviewMode = {
  active:     false,
  _active:    false, // retained for the legacy overlay keyboard player below
  _playing:   false,
  _frame:     84,
  _total:     320,
  _fps:       24,
  _timer:     null,
  _pfActive:  false,
  _pfTimer:   null,
  _pfIdx:     0,
  _annOn:     false,
  _canvas:    null,
  _ctx:       null,
  _keyFn:     null,
  _flashT:    null,
  _keysT:     null,
  _hiddenPanels: [],

  /* ─── Enter / Exit ─────────────────────────────────────── */
  enter() {
    if (this.active) return;
    this.active = true;
    this._active = true;

    if (typeof TabSystem !== 'undefined') TabSystem.switch('overview');
    document.body.classList.add('review-active');

    /* Explicit panel hiding for review mode. */
    this._hiddenPanels = ['.col-left', '.versions-col', '.col-right']
      .map(selector => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const display = el.style.display;
        return { el, display };
      })
      .filter(Boolean);
    setTimeout(() => {
      if (this.active) document.body.classList.add('dashboard-review-mode');
    }, 190);

    const viewer = document.querySelector('.viewer');
    if (viewer) viewer.classList.add('review-mode');

    const ov = document.getElementById('rm-overlay');
    if (ov) ov.classList.remove('rm-open');

    const btn = document.getElementById('rm-btn');
    if (btn) btn.classList.add('rm-active');
    const label = document.getElementById('rm-btn-label');
    if (label) label.textContent = 'Exit Review Mode';

    if (typeof AnnotationSystem !== 'undefined') {
      this._frame = AnnotationSystem._currentFrame;
      AnnotationSystem._build(AnnotationSystem._currentVersion);
      AnnotationSystem.onFrameChange(this._frame);
    }

    requestAnimationFrame(() => {
      if (typeof AnnotationCanvas !== 'undefined') AnnotationCanvas._resize();
      if (typeof FrameTimeline !== 'undefined' && typeof AnnotationSystem !== 'undefined') {
        FrameTimeline.buildMarkers(AnnotationSystem._currentVersion);
        FrameTimeline.updatePlayhead(AnnotationSystem._currentFrame);
      }
    });
  },

  exit() {
    if (!this.active) return;
    this.active = false;
    this._active = false;
    this.stop();
    this.stopPF();
    this._unbindKeys();
    clearTimeout(this._keysT);
    document.body.classList.remove('review-active');

    /* Restore panels exactly to their previous inline display values. */
    document.body.classList.remove('dashboard-review-mode');
    this._hiddenPanels.forEach(({ el, display }) => { el.style.display = display; });
    this._hiddenPanels = [];

    const viewer = document.querySelector('.viewer');
    if (viewer) viewer.classList.remove('review-mode');

    const ov = document.getElementById('rm-overlay');
    if (ov) ov.classList.remove('rm-open');

    const btn = document.getElementById('rm-btn');
    if (btn) btn.classList.remove('rm-active');
    const label = document.getElementById('rm-btn-label');
    if (label) label.textContent = 'Enter Review Mode';

    requestAnimationFrame(() => {
      if (typeof AnnotationCanvas !== 'undefined') AnnotationCanvas._resize();
      if (typeof FrameTimeline !== 'undefined' && typeof AnnotationSystem !== 'undefined') {
        FrameTimeline.buildMarkers(AnnotationSystem._currentVersion);
        FrameTimeline.updatePlayhead(AnnotationSystem._currentFrame);
      }
    });
  },

  toggle() {
    this.active ? this.exit() : this.enter();
  },

  /* ─── Canvas ────────────────────────────────────────────── */
  _initCanvas() {
    this._canvas = document.getElementById('rm-canvas');
    if (!this._canvas) return;
    this._ctx = this._canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => { if (this._active) this._resize(); });
  },

  _resize() {
    if (!this._canvas) return;
    const wrap = document.getElementById('rm-viewer-wrap');
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    this._canvas.width  = r.width  || 800;
    this._canvas.height = r.height || 500;
    this._redraw();
  },

  _redraw() {
    if (!this._ctx || !this._canvas || !this._annOn) {
      if (this._ctx) this._ctx.clearRect(0,0,this._canvas.width,this._canvas.height);
      return;
    }
    const ver  = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
    const anns = typeof AnnotationStore !== 'undefined'
      ? AnnotationStore.forFrame(ver, this._frame) : [];
    const W = this._canvas.width, H = this._canvas.height;
    this._ctx.clearRect(0,0,W,H);
    anns.forEach((a,i) => this._drawShape(a,W,H,i));
  },

  _drawShape(a,W,H,idx) {
    const ctx=this._ctx, c=a.color||'#F59E0B';
    ctx.save(); ctx.globalAlpha=0.9; ctx.strokeStyle=c; ctx.lineWidth=2.5;
    ctx.setLineDash([]);
    if (a.shape==='circle'){
      const cx=a.x*W,cy=a.y*H,r=a.r*Math.min(W,H);
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle=c+'22'; ctx.fill();
      this._label(ctx,a.label,cx,cy-r-8,c);
    }
    if (a.shape==='arrow'){
      const x1=a.x1*W,y1=a.y1*H,x2=a.x2*W,y2=a.y2*H;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      const ang=Math.atan2(y2-y1,x2-x1),hl=14;
      ctx.beginPath();
      ctx.moveTo(x2,y2); ctx.lineTo(x2-hl*Math.cos(ang-Math.PI/6),y2-hl*Math.sin(ang-Math.PI/6));
      ctx.moveTo(x2,y2); ctx.lineTo(x2-hl*Math.cos(ang+Math.PI/6),y2-hl*Math.sin(ang+Math.PI/6));
      ctx.stroke();
      this._label(ctx,a.label,x1,y1-10,c);
    }
    if (a.shape==='highlight'){
      const x=a.x*W,y=a.y*H,w=a.w*W,h=a.h*H;
      ctx.setLineDash([6,3]);
      ctx.strokeRect(x,y,w,h);
      ctx.fillStyle=c+'14'; ctx.fillRect(x,y,w,h);
      ctx.setLineDash([]);
      this._label(ctx,a.label,x+w/2,y-8,c);
    }
    ctx.restore();
  },

  _label(ctx,text,x,y,color){
    if(!text)return;
    ctx.save();
    ctx.font='700 10px "Plus Jakarta Sans",sans-serif';
    const m=ctx.measureText(text),p=5,h=16;
    ctx.fillStyle='rgba(10,10,18,0.82)';
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x-m.width/2-p,y-h/2-1,m.width+p*2,h,3);
    else ctx.rect(x-m.width/2-p,y-h/2-1,m.width+p*2,h);
    ctx.fill();
    ctx.fillStyle=color; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(text,x,y+1);
    ctx.restore();
  },

  toggleAnnotations(){
    this._annOn = !this._annOn;
    const c = document.getElementById('rm-canvas');
    const b = document.getElementById('rm-ann-btn');
    if (c) c.classList.toggle('hidden', !this._annOn);
    if (b) b.classList.toggle('active', this._annOn);
    this._redraw();
  },

  /* ─── Timeline ──────────────────────────────────────────── */
  _buildTimeline(){
    const tl = document.getElementById('rm-timeline');
    if (!tl) return;
    tl.querySelectorAll('.rm-tl-marker').forEach(m=>m.remove());
    const ver = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
    const frames = typeof AnnotationStore !== 'undefined'
      ? AnnotationStore.allFrames(ver) : [];
    const rail = document.getElementById('rm-tl-rail');
    const pad = 12;

    frames.forEach(f => {
      const pct  = f / this._total;
      const left = pad + pct * (tl.offsetWidth - pad*2);
      const ver2 = typeof AnnotationStore !== 'undefined'
        ? AnnotationStore : null;
      const hasSup = ver2
        ? ver2.notesForFrame(ver,f).some(n=>n.role==='supervisor')
        : false;
      const m = document.createElement('div');
      m.className = 'rm-tl-marker';
      m.dataset.frame = f;
      m.dataset.role  = hasSup ? 'supervisor' : 'artist';
      m.dataset.label = `fr ${f}`;
      m.style.left    = left+'px';
      m.addEventListener('click', e => {
        e.stopPropagation();
        this.seekToFrame(f);
      });
      tl.appendChild(m);
    });

    // Click rail to seek
    tl.onclick = (e) => {
      if (e.target.classList.contains('rm-tl-marker')) return;
      const r   = tl.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1,(e.clientX-r.left-pad)/(r.width-pad*2)));
      this.seekToFrame(Math.round(pct*this._total));
    };
  },

  _updatePlayhead(){
    const ph  = document.getElementById('rm-tl-playhead');
    const tl  = document.getElementById('rm-timeline');
    const pf  = document.getElementById('rm-progress-fill');
    if (!ph||!tl) return;
    const pad  = 12;
    const pct  = this._frame / this._total;
    ph.style.left = (pad + pct*(tl.offsetWidth-pad*2))+'px';
    if (pf) pf.style.width = (pct*100)+'%';

    // Highlight active marker
    tl.querySelectorAll('.rm-tl-marker').forEach(m => {
      m.classList.toggle('active', parseInt(m.dataset.frame)===this._frame);
    });
  },

  /* ─── Playback ──────────────────────────────────────────── */
  togglePlay(){
    this._playing ? this.stop() : this.play();
  },

  play(){
    this._playing = true;
    const btn = document.getElementById('rm-play-btn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    clearInterval(this._timer);
    this._timer = setInterval(()=>{
      this._frame = (this._frame+1) % this._total;
      this._onFrame();
    }, 1000/this._fps);
  },

  stop(){
    this._playing = false;
    clearInterval(this._timer);
    const btn = document.getElementById('rm-play-btn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
  },

  stepFrame(delta){
    if (this._playing) this.stop();
    this._frame = Math.max(0, Math.min(this._total-1, this._frame+delta));
    this._onFrame();
  },

  seek(frame){
    this._frame = Math.max(0,Math.min(this._total-1,Math.round(frame)));
    this._onFrame();
  },

  seekToFrame(f){ this.seek(f); },

  scrub(e){
    const bar = document.getElementById('rm-progress');
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    this.seek(Math.round(((e.clientX-r.left)/r.width)*this._total));
  },

  _onFrame(){
    this._updatePlayhead();
    this._updateTimecode();
    this._redraw();
    this._syncNotes(this._frame);
  },

  _updateTimecode(){
    const tc = document.getElementById('rm-timecode');
    if (!tc) return;
    const f  = this._frame;
    const s  = Math.floor(f/this._fps);
    const fr = f%this._fps;
    const mm = String(Math.floor(s/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    const ff = String(fr).padStart(2,'0');
    tc.textContent = `${mm}:${ss}:${ff}`;
  },

  /* ─── Play Feedback ─────────────────────────────────────── */
  _annotatedFrames(){
    const ver = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
    return typeof AnnotationStore !== 'undefined' ? AnnotationStore.allFrames(ver) : [];
  },

  togglePlayFeedback(){
    this._pfActive ? this.stopPF() : this.startPF();
  },

  startPF(){
    const frames = this._annotatedFrames();
    if (!frames.length){ showToast('warn','No annotated frames'); return; }
    if (this._playing) this.stop();
    this._pfActive = true;
    this._pfIdx    = 0;
    const btn = document.getElementById('rm-pf-btn');
    if (btn){ btn.classList.add('active'); btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop'; }
    const step = () => {
      if (!this._pfActive || this._pfIdx>=frames.length){ this.stopPF(); return; }
      const f = frames[this._pfIdx++];
      this.seek(f);
      const ver = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
      const hasSup = typeof AnnotationStore !== 'undefined'
        ? AnnotationStore.notesForFrame(ver,f).some(n=>n.role==='supervisor') : false;
      this._pfTimer = setTimeout(step, hasSup ? 2000 : 1400);
    };
    step();
  },

  stopPF(){
    this._pfActive = false;
    clearTimeout(this._pfTimer);
    const btn = document.getElementById('rm-pf-btn');
    if (btn){ btn.classList.remove('active'); btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play Feedback'; }
  },

  /* ─── Notes sync ────────────────────────────────────────── */
  _syncNotes(frame){
    const list  = document.getElementById('rm-notes-list');
    const badge = document.getElementById('rm-frame-badge');
    if (!list) return;
    if (badge) badge.textContent = `fr ${frame}`;

    const ver   = typeof VersionStore !== 'undefined' ? VersionStore.activeVersion : 'v012';
    const notes = typeof AnnotationStore !== 'undefined'
      ? AnnotationStore.getNotes(ver).filter(n=>n.frame===frame||n.frame==null&&frame===0) : [];
    const frameNotes = typeof AnnotationStore !== 'undefined'
      ? AnnotationStore.notesForFrame(ver,frame) : [];
    const show = frameNotes.length ? frameNotes : [];

    if (!show.length){
      list.innerHTML = '<div class="rm-empty-msg">No feedback on this frame</div>';
      return;
    }

    list.innerHTML = show.map(n=>`
      <div class="rm-note ${n.role==='supervisor'?'sup':'art'}">
        <div class="rm-note-author">${n.author}</div>
        <div class="rm-note-text">${n.text}</div>
        ${n.frame!=null?`<div class="rm-note-frame" onclick="ReviewMode.seek(${n.frame})">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
          fr ${n.frame}
        </div>`:''}
      </div>`).join('');
  },

  nextAnnotation(){
    const frames = this._annotatedFrames();
    if (!frames.length) return;
    const next = frames.find(f=>f>this._frame) ?? frames[0];
    this.seek(next);
  },

  prevAnnotation(){
    const frames = this._annotatedFrames();
    if (!frames.length) return;
    const prev = [...frames].reverse().find(f=>f<this._frame) ?? frames[frames.length-1];
    this.seek(prev);
  },

  /* ─── Flash ─────────────────────────────────────────────── */
  flash(text){
    const el = document.getElementById('rm-rate-flash');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(()=>el.classList.remove('show'), 420);
  },

  _showKeys(){
    const el = document.getElementById('rm-keys');
    if (!el) return;
    el.style.display = 'flex';
    el.classList.add('visible');
    clearTimeout(this._keysT);
    this._keysT = setTimeout(()=>el.classList.remove('visible'), 3000);
  },

  /* ─── Keyboard ──────────────────────────────────────────── */
  _bindKeys(){
    this._keyFn = (e) => {
      if (!this._active) return;
      const tag = e.target.tagName;
      if (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
      switch(e.key){
        case 'j': case 'J':
          e.preventDefault();
          if(this._playing)this.stop();
          this.seek(Math.max(0,this._frame-30));
          this.flash('◀◀');
          break;
        case 'k': case 'K':
          e.preventDefault();
          if(this._playing)this.stop(); else this.play();
          this.flash(this._playing?'▶':'⏸');
          break;
        case 'l': case 'L':
          e.preventDefault();
          if(!this._playing)this.play();
          this.flash('▶');
          break;
        case ' ':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.stepFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.stepFrame(1);
          break;
        case 'n': case 'N':
          e.preventDefault();
          this.nextAnnotation();
          break;
        case 'p': case 'P':
          e.preventDefault();
          this.prevAnnotation();
          break;
        case 'Escape':
          this.exit();
          break;
      }
    };
    document.addEventListener('keydown', this._keyFn);
  },

  _unbindKeys(){
    if (this._keyFn){
      document.removeEventListener('keydown', this._keyFn);
      this._keyFn = null;
    }
  },
};
window.ReviewMode = ReviewMode;

/**
 * Workspace-only integration entrypoint.
 * Mounts the review workspace inside a provided container without topbar/sidebar shells.
 * @param {HTMLElement} container
 * @param {{ treatAsSupervisor?: boolean }} [options] Pass `{ treatAsSupervisor: true }` for standalone demos so Resolve/Revise match supervisor UX without mutating stored user role.
 */
function initReviewWorkspace(container, options = {}) {
  if (!container) return;
  const rwTreatAsSupervisor = options.treatAsSupervisor === true;
  container.classList.add('review-workspace-host');
  container.innerHTML = '<div id="review-root"></div>';
  const root = container.querySelector('#review-root');
  if (!root) return;

  root.innerHTML = `
    <div class="review-workspace">
      <aside class="review-left">
        <div class="left-head">
          <div class="left-title-row"><div class="left-title">Review Workspace</div></div>
          <div class="shot-queue-row">
            <div class="ttl">Shot Queue</div>
            <div class="pill" id="queueCount">0</div>
            <div class="completed" id="completedLbl">0 of 0 completed</div>
          </div>
          <div class="left-tabs">
            <button class="tab active" data-tab="all">All Shots</button>
            <button class="tab" data-tab="mine">My Reviews</button>
            <button class="tab" data-tab="follow">Following</button>
          </div>
          <div class="left-search">
            <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input id="leftSearch" placeholder="Search shots..." />
            <button class="filter-btn" title="Filters">
              <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12M10 18h4"/></svg>
            </button>
          </div>
        </div>
        <div class="shot-list" id="shotList"></div>
      </aside>

      <section class="review-center">
        <div class="shot-header">
          <div class="sh-left">
            <div class="sh-title-row">
              <h2 id="shotTitle">SH_0102</h2>
              <span class="sub" id="shotSub">Debris Burst Simulation</span>
              <span class="tag priority-high">High Priority</span>
            </div>
            <div class="sh-meta-row" id="shotMeta"></div>
          </div>
          <div class="sh-right">
            <div class="nav-pair">
              <button id="prevShot">
                <svg class="icon-sm arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
                <div style="display:flex;flex-direction:column;line-height:1.15;align-items:flex-start">
                  <span class="lbl">Prev</span>
                  <b id="prevShotLbl">SH_0101</b>
                </div>
              </button>
              <button id="nextShot">
                <div style="display:flex;flex-direction:column;line-height:1.15;align-items:flex-end">
                  <span class="lbl">Next</span>
                  <b id="nextShotLbl">SH_0103</b>
                </div>
                <svg class="icon-sm arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            <button class="btn" id="compareToggle">Compare</button>
            <button class="btn">Fit</button>
            <button class="btn icon-only" title="Fullscreen">
              <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>
            </button>
          </div>
        </div>

        <div class="review-viewer">
          <div class="viewer-stage" id="viewerStage">
            <video class="video-canvas" id="videoCanvas" muted playsinline preload="auto"></video>
            <video class="video-canvas" id="compareCanvas" muted playsinline preload="auto" style="display:none;"></video>
            <canvas class="annotation-layer tool-pointer" id="annLayer"></canvas>
            <div class="callouts" id="calloutHost"></div>
            <div class="v-current-tag"><b id="vCurrentLbl">v012</b><span class="lbl">Current</span></div>
            <div class="live-tag"><span class="pulse"></span>Following Live</div>
            <div class="ann-toolbar">
              <button class="ann-tool active" data-tool="pointer">Pointer</button>
              <button class="ann-tool" data-tool="draw">Draw</button>
              <button class="ann-tool" data-tool="arrow">Arrow</button>
              <button class="ann-tool" data-tool="rect">Box</button>
              <button class="ann-tool" data-tool="circle">Circle</button>
              <button class="ann-tool" data-tool="text">Text</button>
            </div>
            <div class="float-input" id="floatInput">
              <textarea id="floatText" placeholder="Type your note..."></textarea>
              <div class="row">
                <button class="btn ghost" id="floatCancel">Cancel</button>
                <button class="btn primary" id="floatSave">Save</button>
              </div>
            </div>
          </div>
          <div class="player-controls">
            <div class="player-time">
              <span id="tcDisplay">00:00:04:02</span>
              <span class="player-frame" id="frameLbl">98/240</span>
            </div>
            <div class="player-mid">
              <button class="pbtn" id="btnFirst" title="First frame"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4v16h2V4zM21 4l-12 8 12 8z"/></svg></button>
              <button class="pbtn" id="btnPrev" title="Prev frame"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5L8 12l11 7zM6 5h2v14H6z"/></svg></button>
              <button class="pbtn play" id="btnPlay" title="Play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg></button>
              <button class="pbtn" id="btnNext" title="Next frame"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5l11 7-11 7zM16 5h2v14h-2z"/></svg></button>
              <button class="pbtn" id="btnLast" title="Last frame"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 4l12 8-12 8zM17 4h2v16h-2z"/></svg></button>
            </div>
            <div class="player-right">
              <span class="fps-tag">24 FPS</span>
              <div class="vol-row">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--t3)"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19 5a9 9 0 0 1 0 14M16 9a5 5 0 0 1 0 6"/></svg>
                <div class="vol-track"><div class="vol-fill"></div><div class="vol-handle"></div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="timeline-wrap">
          <div class="tc-ruler" id="tcRuler"></div>
          <input type="range" id="timelineInput" min="1" max="240" value="98" />
          <div class="frame-strip" id="frameStrip"></div>
        </div>

        <div class="versions-wrap">
          <div class="versions-label">Versions</div>
          <div class="versions-row" id="versionsRow"></div>
        </div>
      </section>

      <aside class="review-right">
        <div class="right-tabs">
          <div class="rtab active" data-rtab="notes">Notes <span class="badge" id="notesCountBadge">0</span></div>
          <div class="rtab" data-rtab="versions">Versions <span class="badge">0</span></div>
          <div class="rtab" data-rtab="info">Info</div>
        </div>
        <div class="filter-row">
          <div class="filter-tabs">
            <button class="active" data-filter="open">Open</button>
            <button data-filter="resolved">Resolved</button>
            <button data-filter="all">All</button>
          </div>
        </div>
        <div class="notes-meta">
          <div class="left"><span class="vname" id="activeVersionLbl">v012</span><span id="openCount">0 Open</span></div>
        </div>
        <div class="notes-list" id="notesList"></div>
        <div class="review-action">
          <div class="ra-label">Review Action</div>
          <div class="ra-row">
            <button class="ra-btn approve">Approve</button>
            <button class="ra-btn revise">Request Changes</button>
            <button class="ra-btn skip">Skip</button>
          </div>
          <div class="ra-next"><span class="dot"></span>Send to next: <b id="nextShotLbl2">SH_0103</b></div>
        </div>
      </aside>
    </div>
  `;

  const state = {
    fps: 24,
    duration: 240,
    currentFrame: 98,
    playing: false,
    timer: null,
    shotFilter: 'all',
    noteFilter: 'open',
    tool: 'pointer',
    rightTab: 'notes',
    focusedNote: null,
    hoveredNote: null,
    compare: false,
    selectedShot: 0,
    selectedVersion: 0,
    shots: [
      { id: 'SH_0102', task: 'Debris Burst Simulation', artist: 'Maya Patel', when: '2h ago', status: 'review', section: 'CURRENT', versions: [{ v: 'v012', status: 'current', when: '2h ago' }, { v: 'v011', status: 'revise', when: '1 day ago' }, { v: 'v010', status: 'revise', when: '2 days ago' }, { v: 'v009', status: 'revise', when: '4 days ago' }], image: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1920&q=70', video: 'https://cdn.coverr.co/videos/coverr-black-sand-spreading-over-the-ground-1579/1080p.mp4', compareVideo: 'https://cdn.coverr.co/videos/coverr-close-up-shot-of-burning-charcoal-1577/1080p.mp4' },
      { id: 'SH_0105', task: 'Pyro Smoke Pass', artist: 'Maya Patel', when: '5h ago', status: 'progress', section: 'UP NEXT', versions: [{ v: 'v007', status: 'current', when: '5h ago' }, { v: 'v006', status: 'revise', when: '1 day ago' }, { v: 'v005', status: 'revise', when: '3 days ago' }], image: 'https://images.unsplash.com/photo-1475274222690-a8f9b60a6f38?auto=format&fit=crop&w=1920&q=70', video: 'https://cdn.coverr.co/videos/coverr-smoke-in-the-air-1578/1080p.mp4', compareVideo: 'https://cdn.coverr.co/videos/coverr-burning-fire-1569/1080p.mp4' },
      { id: 'SH_0110', task: 'Fire Blast Simulation', artist: 'Maya Patel', when: 'Yesterday', status: 'progress', section: 'OTHER ASSIGNED', versions: [{ v: 'v003', status: 'current', when: 'Yesterday' }, { v: 'v002', status: 'revise', when: '2 days ago' }], image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=1920&q=70', video: 'https://cdn.coverr.co/videos/coverr-blazing-fire-1570/1080p.mp4', compareVideo: 'https://cdn.coverr.co/videos/coverr-bonfire-at-night-1573/1080p.mp4' },
      { id: 'SH_0115', task: 'Ember Pass', artist: 'Maya Patel', when: 'Yesterday', status: 'progress', section: 'OTHER ASSIGNED', versions: [{ v: 'v005', status: 'current', when: 'Yesterday' }, { v: 'v004', status: 'revise', when: '2 days ago' }], image: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1920&q=70', video: 'https://cdn.coverr.co/videos/coverr-glowing-embers-1572/1080p.mp4', compareVideo: 'https://cdn.coverr.co/videos/coverr-burning-coals-1571/1080p.mp4' },
      { id: 'SH_0120', task: 'Lighting & Comp', artist: 'Maya Patel', when: '2 days ago', status: 'progress', section: 'OTHER ASSIGNED', versions: [{ v: 'v002', status: 'current', when: '2 days ago' }, { v: 'v001', status: 'revise', when: '4 days ago' }], image: 'https://images.unsplash.com/photo-1475274222690-a8f9b60a6f38?auto=format&fit=crop&w=1920&q=70', video: 'https://cdn.coverr.co/videos/coverr-planet-earth-in-space-1580/1080p.mp4', compareVideo: 'https://cdn.coverr.co/videos/coverr-stars-in-space-1581/1080p.mp4' }
    ],
    notes: [
      { id: 'n1', shot: 'SH_0102', version: 'v012', frame: 98, x: 18, y: 62, text: 'Supervisor note for SH_0429 at frame 98.', author: 'Maya Patel', initials: 'MP', color: 'p', resolved: false, annotations: [{ type: 'arrow', points: [{ x: 0.22, y: 0.58 }, { x: 0.33, y: 0.48 }], color: 'p' }] },
      { id: 'n2', shot: 'SH_0102', version: 'v012', frame: 125, x: 62, y: 32, text: 'Supervisor note for SH_0429 at frame 125.', author: 'Maya Patel', initials: 'MP', color: 'y', resolved: false, annotations: [{ type: 'circle', x: 0.56, y: 0.24, w: 0.14, h: 0.2, color: 'y' }] },
      { id: 'n3', shot: 'SH_0102', version: 'v011', frame: 82, x: 34, y: 57, text: 'Previous pass had noisy edge breakup here.', author: 'Maya Patel', initials: 'MP', color: 'b', resolved: true, resolvedBySupervisor: false, annotations: [{ type: 'rect', x: 0.29, y: 0.5, w: 0.11, h: 0.16, color: 'b' }] },
      { id: 'n4', shot: 'SH_0102', version: 'v011', frame: 110, x: 58, y: 41, text: 'Debris timing was late by 3 frames.', author: 'Maya Patel', initials: 'MP', color: 'o', resolved: true, resolvedBySupervisor: false, annotations: [{ type: 'arrow', points: [{ x: 0.52, y: 0.46 }, { x: 0.61, y: 0.39 }], color: 'o' }] },
      { id: 'n5', shot: 'SH_0102', version: 'v010', frame: 64, x: 25, y: 48, text: 'Fire core lacked intensity in this section.', author: 'Maya Patel', initials: 'MP', color: 'r', resolved: true, resolvedBySupervisor: false, annotations: [{ type: 'circle', x: 0.2, y: 0.4, w: 0.12, h: 0.2, color: 'r' }] }
    ]
  };
  // Seed complete historical feedback so previous versions always carry notes/annotations.
  // This mirrors real review iteration: older versions have more notes, current has fewer unresolved notes.
  (() => {
    const palette = ['p', 'y', 'b', 'o', 'r'];
    const templates = [
      { text: 'Edge breakup and shape continuity need cleanup.', annotation: (x, y, c) => ({ type: 'rect', x: Math.max(0.05, x - 0.06), y: Math.max(0.05, y - 0.07), w: 0.12, h: 0.14, color: c }) },
      { text: 'Timing is late relative to plate action.', annotation: (x, y, c) => ({ type: 'arrow', points: [{ x: Math.max(0.08, x - 0.07), y: Math.max(0.08, y - 0.06) }, { x, y }], color: c }) },
      { text: 'Energy/intensity feels low in this beat.', annotation: (x, y, c) => ({ type: 'circle', x: Math.max(0.05, x - 0.06), y: Math.max(0.05, y - 0.07), w: 0.13, h: 0.16, color: c }) }
    ];
    const existing = new Set(state.notes.map((n) => `${n.shot}::${n.version}`));
    let seedId = 1000;
    state.shots.forEach((shot) => {
      shot.versions.forEach((ver, vi) => {
        const key = `${shot.id}::${ver.v}`;
        if (existing.has(key)) return;
        const count = Math.max(1, Math.min(3, shot.versions.length - vi));
        for (let i = 0; i < count; i += 1) {
          const tpl = templates[i % templates.length];
          const color = palette[(vi + i) % palette.length];
          const frame = Math.min(state.duration, 28 + vi * 22 + i * 18);
          const x = Math.min(0.88, 0.22 + 0.15 * i + 0.03 * vi);
          const y = Math.min(0.84, 0.3 + 0.12 * i + 0.02 * (vi % 3));
          state.notes.push({
            id: `n${seedId++}`,
            shot: shot.id,
            version: ver.v,
            frame,
            x: Math.round(x * 100),
            y: Math.round(y * 100),
            text: tpl.text,
            author: shot.artist,
            initials: shot.artist.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
            color,
            resolved: ver.status !== 'current',
            resolvedBySupervisor: false,
            repliesData: ver.status !== 'current'
              ? [{ author: 'Alex Chen', initials: 'AC', color: 'b', text: 'Addressed in next publish.', when: '1h later' }]
              : [],
            annotations: [tpl.annotation(x, y, color)]
          });
        }
      });
    });
  })();

  const el = {
    shotList: root.querySelector('#shotList'),
    queueCount: root.querySelector('#queueCount'),
    completedLbl: root.querySelector('#completedLbl'),
    shotTitle: root.querySelector('#shotTitle'),
    shotSub: root.querySelector('#shotSub'),
    shotMeta: root.querySelector('#shotMeta'),
    mainImage: root.querySelector('#videoCanvas'),
    compareImage: root.querySelector('#compareCanvas'),
    annLayer: root.querySelector('#annLayer'),
    calloutHost: root.querySelector('#calloutHost'),
    tcDisplay: root.querySelector('#tcDisplay'),
    frameLbl: root.querySelector('#frameLbl'),
    timelineInput: root.querySelector('#timelineInput'),
    tcRuler: root.querySelector('#tcRuler'),
    frameStrip: root.querySelector('#frameStrip'),
    versionsRow: root.querySelector('#versionsRow'),
    notesList: root.querySelector('#notesList'),
    activeVersionLbl: root.querySelector('#activeVersionLbl'),
    openCount: root.querySelector('#openCount'),
    notesCountBadge: root.querySelector('#notesCountBadge'),
    filterRow: root.querySelector('.filter-row'),
    notesMeta: root.querySelector('.notes-meta'),
    floatInput: root.querySelector('#floatInput'),
    floatText: root.querySelector('#floatText'),
    floatSave: root.querySelector('#floatSave'),
    floatCancel: root.querySelector('#floatCancel')
  };
  function setRightTab(tab) {
    state.rightTab = tab;
    root.querySelectorAll('.right-tabs .rtab').forEach((t) => t.classList.toggle('active', t.dataset.rtab === tab));
  }
  function getNoteById(noteId) {
    return state.notes.find((n) => String(n.id) === String(noteId)) || null;
  }
  function updateNoteById(noteId, updater) {
    const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
    if (idx < 0) return false;
    const next = updater({ ...state.notes[idx] });
    if (!next) return false;
    state.notes[idx] = next;
    return true;
  }
  function deleteNoteById(noteId) {
    const before = state.notes.length;
    state.notes = state.notes.filter((n) => String(n.id) !== String(noteId));
    if (String(state.focusedNote) === String(noteId)) state.focusedNote = null;
    if (String(state.hoveredNote) === String(noteId)) state.hoveredNote = null;
    return state.notes.length !== before;
  }
  function syncNoteFilterButtons() {
    root.querySelectorAll('.filter-tabs button').forEach((b) => {
      b.classList.toggle('active', (b.dataset.filter || 'open') === state.noteFilter);
    });
  }
  function selectVersion(index) {
    state.selectedVersion = index;
    const all = notesForVersion().sort((a, b) => a.frame - b.frame);
    if (all.length && !all.some((n) => n.frame === state.currentFrame)) {
      state.currentFrame = all[0].frame;
    }
    // Show full history by default for version review.
    state.noteFilter = 'all';
    syncNoteFilterButtons();
    state.focusedNote = null;
    state.hoveredNote = null;
    renderAll();
  }
  function selectNote(note) {
    if (!note) return;
    const idx = activeShot().versions.findIndex((v) => v.v === note.version);
    if (idx >= 0 && idx !== state.selectedVersion) {
      state.selectedVersion = idx;
      state.noteFilter = 'all';
      syncNoteFilterButtons();
    }
    state.focusedNote = note.id;
    state.currentFrame = note.frame;
    setRightTab('notes');
    renderAll();
  }

  function activeShot() { return state.shots[state.selectedShot]; }
  function activeVersionMeta() { return activeShot().versions[state.selectedVersion] || activeShot().versions[0]; }
  function activeVersion() { return activeVersionMeta()?.v || ''; }
  function latestVersionTag() { return activeShot().versions[0]?.v || activeVersion(); }
  function versionIndexForTag(vTag) {
    const i = activeShot().versions.findIndex((v) => v.v === vTag);
    return i < 0 ? 999 : i;
  }
  function isSupervisorRw() {
    if (rwTreatAsSupervisor) return true;
    return typeof User !== 'undefined' && User.current && User.current.role === 'supervisor';
  }
  function notesForFrame() { return state.notes.filter((n) => n.shot === activeShot().id && n.version === activeVersion() && n.frame === state.currentFrame); }
  function notesForVersion() { return state.notes.filter((n) => n.shot === activeShot().id && n.version === activeVersion()); }
  function notesForListFilter() {
    const shot = activeShot();
    const sel = state.selectedVersion;
    const curTag = activeVersion();
    const vIdx = (tag) => versionIndexForTag(tag);
    const local = state.notes
      .filter((n) => n.shot === shot.id && n.version === curTag)
      .sort((a, b) => a.frame - b.frame);
    if (state.noteFilter === 'open') return local.filter((n) => !n.resolved);
    if (state.noteFilter === 'resolved') return local.filter((n) => !!n.resolved);
    const olderResolved = state.notes.filter((n) => {
      if (n.shot !== shot.id || !n.resolved) return false;
      return vIdx(n.version) > sel;
    });
    const byId = new Map();
    local.forEach((n) => byId.set(String(n.id), n));
    olderResolved.forEach((n) => byId.set(String(n.id), n));
    return Array.from(byId.values()).sort((a, b) => {
      const ai = vIdx(a.version);
      const bi = vIdx(b.version);
      if (ai !== bi) return ai - bi;
      return a.frame - b.frame;
    });
  }
  function noteStatusChipsHtml(n) {
    const cur = activeVersion();
    const chips = [];
    if (!n.resolved && n.revisedFromVersion) {
      chips.push(`<span class="note-chip revised-from" title="Supervisor reopened this feedback for the current version">Reopened from ${n.revisedFromVersion}</span>`);
    }
    if (n.version && n.version !== cur) {
      chips.push(`<span class="note-chip ver" title="Feedback from an older publish">${n.version}</span>`);
    }
    if (n.resolved) {
      if (n.resolvedBySupervisor) {
        chips.push('<span class="note-chip res-sup">Supervisor resolved</span>');
      } else if (versionIndexForTag(n.version) > 0) {
        chips.push('<span class="note-chip res-auto">Auto-resolved (superseded by newer version)</span>');
      } else {
        chips.push('<span class="note-chip res-openver">Resolved</span>');
      }
    } else if (state.noteFilter !== 'open') {
      chips.push('<span class="note-chip open">Open</span>');
    }
    return chips.length ? `<div class="note-card-chips">${chips.join('')}</div>` : '';
  }
  function colorOf(c) {
    return ({ y: '#f5b945', o: '#fb923c', r: '#ef5b5b', g: '#34d399', b: '#60a5fa', p: '#eaab48' })[c] || '#eaab48';
  }
  function colorSoftOf(c) {
    return ({ y: 'rgba(245,185,69,.3)', o: 'rgba(251,146,60,.3)', r: 'rgba(239,91,91,.3)', g: 'rgba(52,211,153,.3)', b: 'rgba(96,165,250,.3)', p: 'rgba(234,171,72,.3)' })[c] || 'rgba(234,171,72,.3)';
  }
  function drawAnnotation(ctx, a, W, H, focused, draft, dim) {
    const col = colorOf(a.color || 'p');
    ctx.save();
    if (dim) ctx.globalAlpha = 0.32;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = focused ? 3 : 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (focused || draft) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
    }
    if (a.type === 'rect') {
      ctx.strokeRect(a.x * W, a.y * H, a.w * W, a.h * H);
    } else if (a.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(a.x * W + (a.w * W) / 2, a.y * H + (a.h * H) / 2, (a.w * W) / 2, (a.h * H) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.type === 'arrow' && a.points && a.points.length >= 2) {
      const p1 = a.points[0];
      const p2 = a.points[1];
      const x1 = p1.x * W;
      const y1 = p1.y * H;
      const x2 = p2.x * W;
      const y2 = p2.y * H;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = 12;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 6), y2 - head * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 6), y2 - head * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (a.type === 'free' && a.points && a.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(a.points[0].x * W, a.points[0].y * H);
      for (let i = 1; i < a.points.length; i += 1) ctx.lineTo(a.points[i].x * W, a.points[i].y * H);
      ctx.stroke();
    }
    ctx.restore();
  }

  function tc(frame) {
    const f = frame % state.fps;
    const s = Math.floor(frame / state.fps);
    return `00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
  const timelineThumbCache = new Map();
  let thumbRequestId = 0;
  async function ensureVideoThumbs(shot, source = 'video', count = 16) {
    const srcUrl = source === 'compare' ? (shot.compareVideo || shot.video || '') : (shot.video || '');
    const key = `${shot.id}::${source}::${srcUrl}`;
    const cached = timelineThumbCache.get(key);
    if (cached?.frames?.length === count) return cached.frames;
    if (cached?.loading) return null;
    timelineThumbCache.set(key, { loading: true, frames: [] });
    const requestId = ++thumbRequestId;
    try {
      const sampler = document.createElement('video');
      sampler.muted = true;
      sampler.preload = 'auto';
      sampler.playsInline = true;
      sampler.crossOrigin = 'anonymous';
      sampler.src = srcUrl;
      await new Promise((resolve, reject) => {
        const onOk = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error('video metadata failed')); };
        const cleanup = () => {
          sampler.removeEventListener('loadedmetadata', onOk);
          sampler.removeEventListener('error', onErr);
        };
        sampler.addEventListener('loadedmetadata', onOk);
        sampler.addEventListener('error', onErr);
      });
      const duration = Math.max(0.2, Number(sampler.duration) || 8);
      const canvas = document.createElement('canvas');
      canvas.width = 180;
      canvas.height = 60;
      const ctxThumb = canvas.getContext('2d');
      const frames = [];
      for (let i = 0; i < count; i += 1) {
        const t = (i / Math.max(1, count - 1)) * Math.max(0.1, duration - 0.1);
        await new Promise((resolve) => {
          const onSeek = () => { sampler.removeEventListener('seeked', onSeek); resolve(); };
          sampler.addEventListener('seeked', onSeek);
          try { sampler.currentTime = t; } catch (_e) { sampler.removeEventListener('seeked', onSeek); resolve(); }
        });
        if (ctxThumb) {
          ctxThumb.clearRect(0, 0, canvas.width, canvas.height);
          ctxThumb.drawImage(sampler, 0, 0, canvas.width, canvas.height);
          try {
            frames.push(canvas.toDataURL('image/jpeg', 0.72));
          } catch (_e) {
            frames.push('');
          }
        } else {
          frames.push('');
        }
      }
      timelineThumbCache.set(key, { loading: false, frames });
      if (requestId === thumbRequestId && activeShot().id === shot.id) renderFrameStrip();
      return frames;
    } catch (_error) {
      timelineThumbCache.set(key, { loading: false, frames: [] });
      return null;
    }
  }

  function renderOverlay() {
    const items = notesForFrame().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const activeId = state.focusedNote || state.hoveredNote;
    const pins = items.map((n, i) => `<button class="pin" data-note-id="${n.id}" style="left:${n.x}%;top:${n.y}%;background:${colorOf(n.color)};box-shadow:0 2px 8px rgba(0,0,0,.5),0 0 0 3px ${colorSoftOf(n.color)}">${i + 1}</button>`).join('');
    const active = items.find((n) => n.id === activeId);
    let callout = '';
    if (active) {
      const idx = items.findIndex((n) => n.id === active.id) + 1;
      callout = `<div class="callout" data-note-id="${active.id}" style="left:clamp(8px, calc(${active.x}% + 16px), calc(100% - 228px)); top:clamp(8px, calc(${active.y}% - 34px), calc(100% - 120px)); --c:${colorOf(active.color)};">
        <div class="head"><span class="num">${idx}</span></div>
        <div class="text">${active.text}</div>
        <div class="meta"><span class="av">${active.initials || 'MP'}</span><b>${active.author}</b><span class="sep"></span><span>Frame ${active.frame}</span></div>
      </div>`;
    }
    el.calloutHost.innerHTML = `${pins}${callout}`;
    el.calloutHost.querySelectorAll('.pin').forEach((pin, i) => {
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        selectNote(items[i]);
      });
      pin.addEventListener('mouseenter', () => { state.hoveredNote = items[i]?.id || null; renderOverlay(); });
      pin.addEventListener('mouseleave', () => { if (!state.focusedNote) { state.hoveredNote = null; renderOverlay(); } });
    });
  }

  const canvas = el.annLayer;
  const ctx = canvas?.getContext?.('2d');
  let drawing = false;
  let drawStart = null;
  let drawCur = null;
  let freePath = [];
  let pendingShape = null;
  function resizeCanvas() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(r.width));
    canvas.height = Math.max(1, Math.floor(r.height));
  }
  function makeShapeFromPoints(tool, p1, p2) {
    if (!canvas) return null;
    const W = canvas.width || 1;
    const H = canvas.height || 1;
    const x1n = p1.x / W;
    const y1n = p1.y / H;
    const x2n = p2.x / W;
    const y2n = p2.y / H;
    if (tool === 'rect') return { type: 'rect', x: Math.min(x1n, x2n), y: Math.min(y1n, y2n), w: Math.abs(x2n - x1n), h: Math.abs(y2n - y1n), color: 'p' };
    if (tool === 'circle') return { type: 'circle', x: Math.min(x1n, x2n), y: Math.min(y1n, y2n), w: Math.abs(x2n - x1n), h: Math.abs(y2n - y1n), color: 'p' };
    if (tool === 'arrow') return { type: 'arrow', points: [{ x: x1n, y: y1n }, { x: x2n, y: y2n }], color: 'p' };
    return null;
  }
  function noteContainsPoint(note, nx, ny) {
    for (const a of (note.annotations || [])) {
      if (a.type === 'rect' || a.type === 'circle') {
        const cx = a.x + a.w / 2;
        const cy = a.y + a.h / 2;
        if (a.type === 'rect') {
          if (nx >= a.x && nx <= a.x + a.w && ny >= a.y && ny <= a.y + a.h) return true;
        } else {
          const rx = Math.max(a.w / 2, 0.005);
          const ry = Math.max(a.h / 2, 0.005);
          const dx = (nx - cx) / rx;
          const dy = (ny - cy) / ry;
          if (dx * dx + dy * dy <= 1.05) return true;
        }
      } else if (a.type === 'arrow' && a.points && a.points.length >= 2) {
        const p1 = a.points[0];
        const p2 = a.points[1];
        const A = nx - p1.x;
        const B = ny - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;
        const dot = A * C + B * D;
        const len = C * C + D * D;
        const t = len ? Math.max(0, Math.min(1, dot / len)) : 0;
        const xx = p1.x + t * C;
        const yy = p1.y + t * D;
        if (Math.hypot(nx - xx, ny - yy) < 0.02) return true;
      } else if (a.type === 'free' && a.points) {
        for (let i = 1; i < a.points.length; i += 1) {
          const p1 = a.points[i - 1];
          const p2 = a.points[i];
          const A = nx - p1.x;
          const B = ny - p1.y;
          const C = p2.x - p1.x;
          const D = p2.y - p1.y;
          const dot = A * C + B * D;
          const len = C * C + D * D;
          const t = len ? Math.max(0, Math.min(1, dot / len)) : 0;
          const xx = p1.x + t * C;
          const yy = p1.y + t * D;
          if (Math.hypot(nx - xx, ny - yy) < 0.02) return true;
        }
      }
    }
    return false;
  }
  function hitTestNote(nx, ny) {
    const candidates = notesForFrame();
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (noteContainsPoint(candidates[i], nx, ny)) return candidates[i];
    }
    return null;
  }
  function renderAnnotations() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const visibleNotes = notesForFrame();
    const hasActive = state.focusedNote != null || state.hoveredNote != null;
    visibleNotes.forEach((n) => {
      const isActive = state.focusedNote === n.id || state.hoveredNote === n.id;
      const dim = (hasActive && !isActive) || !!n.resolved;
      (n.annotations || []).forEach((a) => drawAnnotation(ctx, a, canvas.width, canvas.height, isActive, false, dim));
    });
    if (drawing && drawStart && drawCur) {
      if (state.tool === 'draw' && freePath.length > 1) {
        drawAnnotation(ctx, { type: 'free', points: freePath, color: 'p' }, canvas.width, canvas.height, true, true, false);
      } else {
        const a = makeShapeFromPoints(state.tool, drawStart, drawCur);
        if (a) drawAnnotation(ctx, a, canvas.width, canvas.height, true, true, false);
      }
    }
  }

  function renderTimelineMarkers() {
    const items = notesForVersion();
    const labels = [1, 48, 96, 144, 192, 240]
      .map((f) => `<span class="lbl ${f === 1 ? 'start' : ''} ${f === 240 ? 'end' : ''}" style="left:${((f - 1) / (state.duration - 1)) * 100}%">${f}</span>`)
      .join('');
    const markers = items
      .map((n) => `<button class="marker${n.resolved ? ' resolved' : ''}" data-note-id="${n.id}" style="left:${(n.frame / state.duration) * 100}%;" title="Frame ${n.frame}${n.resolved ? ' · resolved' : ''}"></button>`)
      .join('');
    el.tcRuler.innerHTML = `${labels}${markers}`;
    el.tcRuler.querySelectorAll('.marker[data-note-id]').forEach((m) => {
      m.addEventListener('click', () => {
        const id = m.getAttribute('data-note-id');
        selectNote(notesForVersion().find((n) => String(n.id) === String(id)));
      });
    });
  }

  function renderFrameStrip() {
    const totalCells = 16;
    const playheadLeft = (state.currentFrame / state.duration) * 100;
    const keyMain = `${activeShot().id}::video::${activeShot().video || ''}`;
    const keyCompare = `${activeShot().id}::compare::${activeShot().compareVideo || activeShot().video || ''}`;
    const thumbs = timelineThumbCache.get(keyMain)?.frames || [];
    const compareThumbs = timelineThumbCache.get(keyCompare)?.frames || [];
    const cells = Array.from({ length: totalCells }).map((_, i) => {
      const frameAt = Math.max(1, Math.round((i / (totalCells - 1)) * state.duration));
      const src = thumbs[i];
      const cmp = compareThumbs[i];
      if (state.compare && src && cmp) {
        return `<div class="fcell compare" data-frame="${frameAt}">
          <div class="fcompare-top"><span class="fmini-tag">B</span><img class="fthumbimg" src="${src}" alt="base frame ${i + 1}" /></div>
          <div class="fcompare-bottom"><span class="fmini-tag">C</span><img class="fthumbimg" src="${cmp}" alt="compare frame ${i + 1}" /></div>
        </div>`;
      }
      if (src) {
        return `<div class="fcell" data-frame="${frameAt}"><img class="fthumbimg" src="${src}" alt="frame thumbnail ${i + 1}" /></div>`;
      }
      return `<div class="fcell" data-frame="${frameAt}"><canvas class="fthumb" data-idx="${i}"></canvas></div>`;
    }).join('');
    el.frameStrip.innerHTML = `${cells}<div class="ph" style="left:${playheadLeft}%"></div><div class="ph-pill" style="left:${playheadLeft}%">${state.currentFrame}</div>`;
    el.frameStrip.querySelectorAll('.fcell[data-frame]').forEach((cell) => {
      cell.addEventListener('click', () => {
        state.currentFrame = Number(cell.dataset.frame || state.currentFrame);
        renderAll();
      });
    });

    // Fallback generated thumbnails if real video thumbs not ready
    el.frameStrip.querySelectorAll('canvas.fthumb').forEach((cv) => {
      const i = Number(cv.dataset.idx || 0);
      const w = Math.max(24, cv.clientWidth || 40);
      const h = Math.max(24, cv.clientHeight || 60);
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d');
      if (!g) return;
      const hue = (220 + i * 6) % 360;
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsla(${hue},55%,22%,1)`);
      grad.addColorStop(1, `hsla(${(hue + 35) % 360},60%,10%,1)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(140,105,255,0.16)';
      g.beginPath();
      g.ellipse(w * 0.62, h * 0.45, w * 0.28, h * 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.1)';
      for (let s = 0; s < 10; s += 1) g.fillRect((s * 37 + i * 11) % w, (s * 19 + i * 7) % h, 1.2, 1.2);
    });
  }

  function renderRight() {
    if (state.rightTab === 'notes') {
      const sup = isSupervisorRw();
      const ns = notesForListFilter();
      el.notesList.innerHTML = ns.map((n, i) => {
        const resolveBtn = sup && !n.resolved
          ? `<button class="note-act note-resolve-btn" data-note-id="${n.id}" type="button">Resolve</button>`
          : '';
        const reviseBtn = sup && n.resolved
          ? `<button class="note-act note-revise-btn" data-note-id="${n.id}" type="button">Revise</button>`
          : '';
        return `<article class="note-card ${n.frame === state.currentFrame ? 'focused' : ''}" data-note-id="${n.id}" data-note-frame="${n.frame}">
        <div class="row"><span class="num">${i + 1}</span><span class="frame-lbl">Frame ${n.frame}</span><span class="grow"></span><span class="ago">Just now</span></div>
        ${noteStatusChipsHtml(n)}
        <div class="text">${n.text}</div>
        <div class="foot">
          <span class="author">${n.author}</span>
          <span class="grow"></span>
          ${resolveBtn}${reviseBtn}
          <button class="note-act note-reply-btn" data-note-id="${n.id}" type="button">Reply</button>
          <button class="note-act note-edit-btn" data-note-id="${n.id}" type="button">Edit</button>
          <button class="note-act note-del-btn" data-note-id="${n.id}" type="button">Delete</button>
        </div>
        <div class="note-del-confirm" data-del-confirm="${n.id}" style="display:none;">
          <span class="note-del-msg">Delete this note and its on-frame annotation?</span>
          <button class="note-act note-del-cancel" data-del-cancel="${n.id}" type="button">Cancel</button>
          <button class="note-act note-del-confirm-btn" data-del-confirm-btn="${n.id}" type="button">Delete</button>
        </div>
        <div class="note-compose reply-compose" data-compose-for="${n.id}" style="display:none;">
          <input class="note-input" data-reply-input="${n.id}" placeholder="Write a reply..." />
          <button class="note-send-reply" data-send-reply="${n.id}" type="button">Reply</button>
        </div>
        <div class="note-compose edit-compose" data-edit-for="${n.id}" style="display:none;">
          <textarea class="note-input edit" data-edit-input="${n.id}">${n.text}</textarea>
          <button class="note-save-edit" data-save-edit="${n.id}" type="button">Save</button>
          <button class="note-cancel-edit" data-cancel-edit="${n.id}" type="button">Cancel</button>
        </div>
        ${Array.isArray(n.repliesData) && n.repliesData.length ? `<div class="reply-thread">${n.repliesData.map((r) => `<div class="reply"><div class="reply-head"><span class="av">${r.initials || ''}</span><b>${r.author}</b><span class="grow"></span><span>${r.when || ''}</span></div><div class="reply-text">${r.text}</div></div>`).join('')}</div>` : ''}
      </article>`;
      }).join('') || '<p class="review-note-empty">No notes.</p>';
      el.notesList.querySelectorAll('.note-card[data-note-id]').forEach((node) => {
        node.addEventListener('click', (event) => {
          if (event.target.closest('.note-act') || event.target.closest('.note-compose') || event.target.closest('.note-del-confirm') || event.target.closest('input') || event.target.closest('textarea')) return;
          const id = node.getAttribute('data-note-id');
          const note = ns.find((x) => String(x.id) === String(id));
          if (note) selectNote(note);
        });
        node.addEventListener('mouseenter', () => {
          const id = node.getAttribute('data-note-id');
          const note = ns.find((x) => String(x.id) === String(id));
          state.hoveredNote = note?.id || null;
          renderOverlay();
        });
        node.addEventListener('mouseleave', () => {
          state.hoveredNote = null;
          renderOverlay();
        });
      });
      el.notesList.querySelectorAll('.note-resolve-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!isSupervisorRw()) return;
          const noteId = btn.getAttribute('data-note-id');
          updateNoteById(noteId, (note) => ({ ...note, resolved: true, resolvedBySupervisor: true, revisedFromVersion: undefined }));
          renderAll();
        });
      });
      el.notesList.querySelectorAll('.note-revise-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!isSupervisorRw()) return;
          const noteId = btn.getAttribute('data-note-id');
          const latest = latestVersionTag();
          updateNoteById(noteId, (note) => ({
            ...note,
            resolved: false,
            resolvedBySupervisor: false,
            version: latest,
            revisedFromVersion: note.version
          }));
          state.selectedVersion = 0;
          state.noteFilter = 'open';
          syncNoteFilterButtons();
          const nn = getNoteById(noteId);
          if (nn) {
            state.focusedNote = nn.id;
            state.currentFrame = nn.frame;
          }
          renderAll();
        });
      });
      el.notesList.querySelectorAll('.note-reply-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-note-id');
          const compose = el.notesList.querySelector(`[data-compose-for="${noteId}"]`);
          if (compose) compose.style.display = compose.style.display === 'none' ? 'flex' : 'none';
        });
      });
      el.notesList.querySelectorAll('.note-edit-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-note-id');
          const compose = el.notesList.querySelector(`[data-edit-for="${noteId}"]`);
          if (compose) compose.style.display = compose.style.display === 'none' ? 'flex' : 'none';
        });
      });
      el.notesList.querySelectorAll('.note-del-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-note-id');
          const confirm = el.notesList.querySelector(`[data-del-confirm="${noteId}"]`);
          if (confirm) confirm.style.display = confirm.style.display === 'none' ? 'flex' : 'none';
        });
      });
      el.notesList.querySelectorAll('.note-del-cancel').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-del-cancel');
          const confirm = el.notesList.querySelector(`[data-del-confirm="${noteId}"]`);
          if (confirm) confirm.style.display = 'none';
        });
      });
      el.notesList.querySelectorAll('.note-del-confirm-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-del-confirm-btn');
          deleteNoteById(noteId);
          renderAll();
        });
      });
      el.notesList.querySelectorAll('.note-send-reply').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-send-reply');
          const input = el.notesList.querySelector(`[data-reply-input="${noteId}"]`);
          const value = String(input?.value || '').trim();
          if (!value) return;
          updateNoteById(noteId, (note) => ({
            ...note,
            repliesData: [...(Array.isArray(note.repliesData) ? note.repliesData : []), { author: 'Supervisor', initials: 'SV', color: 'p', text: value, when: 'now' }]
          }));
          renderAll();
        });
      });
      el.notesList.querySelectorAll('.note-save-edit').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-save-edit');
          const input = el.notesList.querySelector(`[data-edit-input="${noteId}"]`);
          const value = String(input?.value || '').trim();
          if (!value) return;
          updateNoteById(noteId, (note) => ({ ...note, text: value }));
          renderAll();
        });
      });
      el.notesList.querySelectorAll('.note-cancel-edit').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          const noteId = btn.getAttribute('data-cancel-edit');
          const compose = el.notesList.querySelector(`[data-edit-for="${noteId}"]`);
          if (compose) compose.style.display = 'none';
        });
      });
    } else if (state.rightTab === 'versions') {
      el.notesList.innerHTML = activeShot().versions.map((v, i) => {
        const count = state.notes.filter((n) => n.shot === activeShot().id && n.version === v.v).length;
        const prev = activeShot().versions[i + 1];
        const prevNotes = prev ? state.notes.filter((n) => n.shot === activeShot().id && n.version === prev.v) : [];
        const nowNotes = state.notes.filter((n) => n.shot === activeShot().id && n.version === v.v);
        const deltaResolved = Math.max(0, prevNotes.filter((n) => !n.resolved).length - nowNotes.filter((n) => !n.resolved).length);
        return `<button class="versions-panel-item ${i === state.selectedVersion ? 'active' : ''}" data-version-index="${i}">
          <div class="top"><b>${v.v}</b><span>${count} notes</span></div>
          <div class="bottom">${v.when || `${i + 1} day ago`} ${v.status === 'current' ? '· Current' : v.status === 'approved' ? '· Final' : ''}</div>
          <div class="summary">${i === activeShot().versions.length - 1 ? 'Baseline version.' : `${deltaResolved} issue${deltaResolved === 1 ? '' : 's'} resolved since ${prev?.v || 'prev'}.`}</div>
        </button>`;
      }).join('');
      el.notesList.querySelectorAll('[data-version-index]').forEach((btn) => btn.addEventListener('click', () => {
        selectVersion(Number(btn.dataset.versionIndex));
      }));
    } else {
      const s = activeShot();
      el.notesList.innerHTML = `<div class="info-card"><div><b>Shot</b> ${s.id}</div><div><b>Task</b> ${s.task}</div><div><b>Artist</b> ${s.artist}</div><div><b>Version</b> ${activeVersion()}</div></div>`;
    }
  }

  function renderAll() {
    const s = activeShot();
    const prevShot = state.selectedShot > 0 ? state.shots[state.selectedShot - 1] : null;
    const nextShot = state.selectedShot < state.shots.length - 1 ? state.shots[state.selectedShot + 1] : null;
    el.queueCount.textContent = String(state.shots.length);
    el.completedLbl.textContent = `0 of ${state.shots.length} completed`;
    el.shotTitle.textContent = s.id;
    el.shotSub.textContent = s.task;
    const latestVersion = s.versions[0];
    el.shotMeta.textContent = `Episode 01 · Sequence 02 · ${s.id} · Task: Final Comp · Artist: ${s.artist} · Latest: ${latestVersion?.v || activeVersion()} (${latestVersion?.when || 'recent'})`;
    el.activeVersionLbl.textContent = activeVersion();
    const mainSrc = s.video || '';
    const compareSrc = s.compareVideo || s.video || '';
    if (mainSrc && el.mainImage.src !== mainSrc) {
      el.mainImage.src = mainSrc;
      el.mainImage.loop = true;
      el.mainImage.currentTime = 0;
      if (state.playing) el.mainImage.play().catch(() => {});
    }
    if (compareSrc && el.compareImage.src !== compareSrc) {
      el.compareImage.src = compareSrc;
      el.compareImage.loop = true;
      el.compareImage.currentTime = 0;
      if (state.playing && state.compare) el.compareImage.play().catch(() => {});
    }
    el.compareImage.style.display = state.compare ? 'block' : 'none';
    el.compareImage.style.opacity = '0.45';
    ensureVideoThumbs(s, 'video');
    if (state.compare) ensureVideoThumbs(s, 'compare');
    if (nextShot) {
      ensureVideoThumbs(nextShot, 'video');
      if (state.compare) ensureVideoThumbs(nextShot, 'compare');
    }
    root.querySelector('#prevShotLbl').textContent = prevShot ? prevShot.id : '--';
    root.querySelector('#nextShotLbl').textContent = nextShot ? nextShot.id : '--';
    const sectionOrder = ['CURRENT', 'UP NEXT', 'OTHER ASSIGNED'];
    el.shotList.innerHTML = sectionOrder.map((section) => {
      const rows = state.shots
        .map((shot, i) => ({ shot, i }))
        .filter((x) => x.shot.section === section)
        .filter((x) => state.shotFilter === 'all' ? true : state.shotFilter === 'mine' ? x.i === state.selectedShot : x.shot.section !== 'OTHER ASSIGNED');
      if (!rows.length) return '';
      const cards = rows.map(({ shot, i }) => {
      const status = shot.status || (i === state.selectedShot ? 'review' : 'progress');
      const statusText = status === 'review' ? 'In Review' : 'In Progress';
      return `<button class="shot-card ${i === state.selectedShot ? 'active' : ''}" data-shot-index="${i}">
        <div class="shot-thumb"><div class="thumb-fill" style="background-image:linear-gradient(180deg, rgba(10,10,13,0.15), rgba(10,10,13,0.55)), url('${shot.image}')"></div></div>
        <div class="shot-info">
          <div class="shot-name">${shot.id}</div>
          <div class="shot-task">${shot.task}</div>
          <div class="shot-meta">${shot.versions[0]?.v || ''} · ${shot.when || `${i + 2}h ago`}</div>
          <div class="shot-status"><span class="dot ${status}"></span><span class="lbl">${statusText}</span></div>
        </div>
        <span class="menu-dot">•••</span>
      </button>`;
      }).join('');
      return `<div class="shot-section">${section}</div>${cards}`;
    }).join('');
    el.shotList.querySelectorAll('[data-shot-index]').forEach((btn) => btn.addEventListener('click', () => {
      state.selectedShot = Number(btn.dataset.shotIndex);
      state.selectedVersion = 0;
      state.noteFilter = 'open';
      syncNoteFilterButtons();
      renderAll();
    }));
    el.versionsRow.innerHTML = s.versions.map((v, i) => {
      const tag = v.status === 'current'
        ? '<span class="v-tag current">Current</span>'
        : (v.status === 'approved' ? '<span class="v-tag approved">Approved</span>' : '');
      return `<button class="v-card ${i === state.selectedVersion ? 'active' : ''}" data-version-index="${i}">
        <div class="v-thumb"><div class="v-fill" style="background-image:linear-gradient(180deg, rgba(10,10,13,0.12), rgba(10,10,13,0.55)), url('${s.image}')"></div></div>
        <div class="v-info"><span class="v-name">${v.v}</span>${tag}</div>
        <div class="v-when">${v.when || `${i + 1} day ago`}</div>
      </button>`;
    }).join('') + `
      <button class="v-card upload" type="button">
        <span style="font-size:18px;line-height:1;">+</span>
        <span>Upload</span>
        <span class="lbl">New Version</span>
      </button>
    `;
    el.versionsRow.querySelectorAll('[data-version-index]').forEach((btn) => btn.addEventListener('click', () => {
      selectVersion(Number(btn.dataset.versionIndex));
    }));
    el.timelineInput.value = String(state.currentFrame);
    el.frameLbl.textContent = `${state.currentFrame}/${state.duration}`;
    el.tcDisplay.textContent = tc(state.currentFrame);
    const openCount = notesForVersion().filter((n) => !n.resolved).length;
    el.openCount.textContent = `${openCount} Open`;
    if (el.notesCountBadge) el.notesCountBadge.textContent = String(notesForVersion().length);
    if (el.filterRow) el.filterRow.style.display = state.rightTab === 'notes' ? '' : 'none';
    if (el.notesMeta) el.notesMeta.style.display = state.rightTab === 'notes' ? '' : 'none';
    const vCurrentLbl = root.querySelector('#vCurrentLbl');
    if (vCurrentLbl) vCurrentLbl.textContent = activeVersion();
    const nextShotLbl2 = root.querySelector('#nextShotLbl2');
    if (nextShotLbl2) nextShotLbl2.textContent = nextShot ? nextShot.id : '--';
    renderTimelineMarkers();
    renderFrameStrip();
    renderAnnotations();
    renderOverlay();
    renderRight();
  }

  root.querySelectorAll('.left-tabs .tab').forEach((btn) => btn.addEventListener('click', () => {
    root.querySelectorAll('.left-tabs .tab').forEach((t) => t.classList.remove('active'));
    btn.classList.add('active');
    state.shotFilter = btn.dataset.tab || 'all';
    renderAll();
  }));
  root.querySelectorAll('.right-tabs .rtab').forEach((btn) => btn.addEventListener('click', () => {
    setRightTab(btn.dataset.rtab || 'notes');
    renderRight();
  }));
  root.querySelectorAll('.ann-toolbar .ann-tool').forEach((btn) => btn.addEventListener('click', () => {
    root.querySelectorAll('.ann-toolbar .ann-tool').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.tool = btn.dataset.tool || 'pointer';
    if (canvas) canvas.className = `annotation-layer tool-${state.tool}`;
    root.querySelector('#viewerStage')?.classList.toggle('tool-active', state.tool !== 'pointer');
  }));
  root.querySelectorAll('.filter-tabs button').forEach((btn) => btn.addEventListener('click', () => {
    root.querySelectorAll('.filter-tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.noteFilter = btn.dataset.filter || 'open';
    renderRight();
  }));

  root.querySelector('#timelineInput')?.addEventListener('input', (e) => { state.currentFrame = Number(e.target.value || 1); renderAll(); });
  let stripScrubbing = false;
  const scrubToClientX = (clientX) => {
    const rect = el.frameStrip.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    state.currentFrame = Math.max(1, Math.min(state.duration, Math.round(ratio * state.duration)));
    renderAll();
  };
  el.frameStrip?.addEventListener('pointerdown', (e) => {
    stripScrubbing = true;
    el.frameStrip.setPointerCapture?.(e.pointerId);
    scrubToClientX(e.clientX);
  });
  el.frameStrip?.addEventListener('pointermove', (e) => {
    if (!stripScrubbing) return;
    scrubToClientX(e.clientX);
  });
  el.frameStrip?.addEventListener('pointerup', () => { stripScrubbing = false; });
  el.frameStrip?.addEventListener('pointercancel', () => { stripScrubbing = false; });
  root.querySelector('#btnPrev')?.addEventListener('click', () => { state.currentFrame = Math.max(1, state.currentFrame - 1); renderAll(); });
  root.querySelector('#btnNext')?.addEventListener('click', () => { state.currentFrame = Math.min(state.duration, state.currentFrame + 1); renderAll(); });
  root.querySelector('#btnFirst')?.addEventListener('click', () => { state.currentFrame = 1; renderAll(); });
  root.querySelector('#btnLast')?.addEventListener('click', () => { state.currentFrame = state.duration; renderAll(); });
  root.querySelector('#prevShot')?.addEventListener('click', () => {
    if (state.selectedShot <= 0) return;
    state.selectedShot -= 1;
    state.selectedVersion = 0;
    renderAll();
  });
  root.querySelector('#nextShot')?.addEventListener('click', () => {
    if (state.selectedShot >= state.shots.length - 1) return;
    state.selectedShot += 1;
    state.selectedVersion = 0;
    renderAll();
  });
  root.querySelector('#compareToggle')?.addEventListener('click', () => { state.compare = !state.compare; renderAll(); });
  root.querySelector('#btnPlay')?.addEventListener('click', () => {
    state.playing = !state.playing;
    const btn = root.querySelector('#btnPlay');
    btn.innerHTML = state.playing
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>';
    if (state.playing) {
      el.mainImage?.play?.().catch(() => {});
      if (state.compare) el.compareImage?.play?.().catch(() => {});
      clearInterval(state.timer);
      state.timer = setInterval(() => {
        state.currentFrame = state.currentFrame >= state.duration ? 1 : state.currentFrame + 1;
        renderAll();
      }, 1000 / state.fps);
    } else {
      el.mainImage?.pause?.();
      el.compareImage?.pause?.();
      clearInterval(state.timer);
    }
  });

  let pendingNotePos = null;
  function closeFloatInput() {
    if (!el.floatInput) return;
    el.floatInput.style.display = 'none';
    if (el.floatText) el.floatText.value = '';
    pendingNotePos = null;
  }
  root.querySelector('#viewerStage')?.addEventListener('click', (event) => {
    if (event.target.closest('.pin') || event.target.closest('.ann-toolbar') || event.target.closest('.float-input')) return;
    if (state.tool !== 'text') {
      state.focusedNote = null;
      renderOverlay();
      return;
    }
    const stage = event.currentTarget;
    const rect = stage.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100));
    pendingNotePos = { x, y };
    if (!el.floatInput) return;
    el.floatInput.style.left = `${event.clientX - rect.left + 10}px`;
    el.floatInput.style.top = `${event.clientY - rect.top + 10}px`;
    el.floatInput.style.display = 'block';
    el.floatText?.focus();
  });
  el.floatCancel?.addEventListener('click', closeFloatInput);
  el.floatText?.addEventListener('keydown', (event) => {
    // Keep typing behavior natural inside note input.
    // Prevent global workspace/player shortcuts from hijacking Space/Arrows.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFloatInput();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      el.floatSave?.click();
    }
  });
  root.addEventListener('keydown', (event) => {
    // Extra guard: when note composer is open, block global playback hotkeys.
    if (el.floatInput?.style.display === 'block') {
      const key = event.key;
      if (key === ' ' || key === 'Spacebar' || key === 'ArrowLeft' || key === 'ArrowRight' || key === 'j' || key === 'J' || key === 'k' || key === 'K' || key === 'l' || key === 'L') {
        event.stopPropagation();
      }
    }
  }, true);
  el.floatSave?.addEventListener('click', () => {
    const text = (el.floatText?.value || '').trim();
    if (!text) {
      closeFloatInput();
      return;
    }
    let ax = pendingNotePos?.x ?? 50;
    let ay = pendingNotePos?.y ?? 50;
    let annotations = [];
    if (pendingShape) {
      annotations = [pendingShape];
      if (pendingShape.type === 'rect' || pendingShape.type === 'circle') {
        ax = (pendingShape.x + pendingShape.w / 2) * 100;
        ay = (pendingShape.y + pendingShape.h / 2) * 100;
      } else if (pendingShape.points && pendingShape.points.length) {
        const mid = pendingShape.points[Math.floor(pendingShape.points.length / 2)];
        ax = mid.x * 100;
        ay = mid.y * 100;
      }
    }
    state.notes.push({
      id: `n-${Date.now()}`,
      shot: activeShot().id,
      version: activeVersion(),
      frame: state.currentFrame,
      x: ax,
      y: ay,
      text,
      author: 'Supervisor',
      initials: 'SV',
      color: 'p',
      resolved: false,
      resolvedBySupervisor: false,
      annotations
    });
    state.focusedNote = state.notes[state.notes.length - 1].id;
    pendingShape = null;
    if (state.tool !== 'text') {
      state.tool = 'pointer';
      root.querySelectorAll('.ann-toolbar .ann-tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === 'pointer'));
      canvas.className = 'annotation-layer tool-pointer';
      root.querySelector('#viewerStage')?.classList.remove('tool-active');
    }
    setRightTab('notes');
    closeFloatInput();
    renderAll();
  });

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  canvas?.addEventListener('pointermove', (e) => {
    if (drawing || state.tool !== 'pointer') return;
    const r = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    const hit = hitTestNote(nx, ny);
    canvas.classList.toggle('has-target', !!hit);
    const nextHover = hit?.id || null;
    if (nextHover !== state.hoveredNote) {
      state.hoveredNote = nextHover;
      renderOverlay();
      renderAnnotations();
    }
  });
  canvas?.addEventListener('pointerleave', () => {
    canvas.classList.remove('has-target');
    if (state.hoveredNote != null) {
      state.hoveredNote = null;
      renderOverlay();
      renderAnnotations();
    }
  });
  canvas?.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    if (state.tool === 'pointer') {
      const hit = hitTestNote(nx, ny);
      state.focusedNote = hit?.id || null;
      renderAll();
      return;
    }
    if (state.tool === 'text') return;
    drawing = true;
    drawStart = { x: (e.clientX - r.left), y: (e.clientY - r.top) };
    drawCur = drawStart;
    freePath = [{ x: nx, y: ny }];
  });
  canvas?.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const r = canvas.getBoundingClientRect();
    drawCur = { x: (e.clientX - r.left), y: (e.clientY - r.top) };
    if (state.tool === 'draw') freePath.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    renderAnnotations();
  });
  canvas?.addEventListener('pointerup', (e) => {
    if (!drawing) return;
    drawing = false;
    const r = canvas.getBoundingClientRect();
    const end = { x: (e.clientX - r.left), y: (e.clientY - r.top) };
    let shape = null;
    if (state.tool === 'draw') {
      if (freePath.length > 2) shape = { type: 'free', points: freePath, color: 'p' };
    } else {
      shape = makeShapeFromPoints(state.tool, drawStart, end);
    }
    if (shape) {
      pendingShape = shape;
      if (!el.floatInput) return;
      el.floatInput.style.left = `${Math.min(Math.max(8, end.x + 12), r.width - 260)}px`;
      el.floatInput.style.top = `${Math.min(Math.max(60, end.y + 12), r.height - 140)}px`;
      el.floatInput.style.display = 'block';
      el.floatText?.focus();
    }
    renderAnnotations();
  });

  renderAll();
}
window.initReviewWorkspace = initReviewWorkspace;

// Auto-mount in integration scenarios where app provides #main-content.
document.addEventListener('DOMContentLoaded', () => {
  const mainContent = document.querySelector('#main-content');
  const supervisorApp = document.getElementById('supervisor-app');
  if (mainContent && !supervisorApp) {
    initReviewWorkspace(mainContent, { treatAsSupervisor: true });
  }
});

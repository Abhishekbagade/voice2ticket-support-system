// Voice2Ticket: role-separated UI + working MediaRecorder + S3 upload
const AWS_CONFIG = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_vI6aXYQqF',
  userPoolWebClientId: '7kh12ff34k1gkunrnv8afh8tj3',
  apiUrl: 'https://tyftzwfqj5.execute-api.us-east-1.amazonaws.com/', // include trailing slash
  identityPoolId: 'us-east-1:6762d36d-b641-43a5-b4e8-27dd3ce68de7',
  s3Bucket: 'voice2ticket-audio-uploads',
  s3Prefix: 'audio/'
};

class App {
  constructor() {
    this.user = null;
    this.tickets = [];
    this.filteredTickets = [];
    this.pagination = { page: 1, perPage: 10 };

    this.media = {
      recording: false,
      recorder: null,
      chunks: [],
      blob: null,
      timer: null,
      startedAt: 0
    };
  }

  async init() {
    await this.ready();
    this.cache();
    this.bind();
    this.restore();
  }

  ready() { return new Promise(r => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r())); }

  cache() {
    // auth
    this.$auth = document.getElementById('auth');
    this.$loginForm = document.getElementById('login-form');
    this.$signupForm = document.getElementById('signup-form');
    this.$tabLogin = document.getElementById('tab-login');
    this.$tabSignup = document.getElementById('tab-signup');

    // app
    this.$app = document.getElementById('app');
    this.$adminNav = document.getElementById('admin-nav');
    this.$pageTitle = document.getElementById('page-title');
    this.$chipName = document.getElementById('chip-name');
    this.$chipRole = document.getElementById('chip-role');

    // nav
    this.$navLinks = Array.from(document.querySelectorAll('.nav-link'));

    // text ticket
    this.$ticketTitle = document.getElementById('ticket-title');
    this.$ticketDesc = document.getElementById('ticket-desc');
    this.$ticketDept = document.getElementById('ticket-dept');
    this.$ticketPriority = document.getElementById('ticket-priority');
    this.$createTicket = document.getElementById('create-ticket');

    // voice
    this.$recordBtn = document.getElementById('record-btn');
    this.$reRecord = document.getElementById('re-record');
    this.$submitRecording = document.getElementById('submit-recording');
    this.$recordTimer = document.getElementById('record-timer');
    this.$recordStatus = document.getElementById('record-status');
    this.$recordPreview = document.getElementById('recording-preview');
    this.$voiceDept = document.getElementById('voice-dept');
    this.$voicePriority = document.getElementById('voice-priority');

    // admin tickets
    this.$ticketsTbody = document.getElementById('tickets-tbody');
    this.$search = document.getElementById('search-tickets');
    this.$filterStatus = document.getElementById('filter-status');
    this.$filterDept = document.getElementById('filter-department');
    this.$filterPriority = document.getElementById('filter-priority');
    this.$prev = document.getElementById('prev-page');
    this.$next = document.getElementById('next-page');
    this.$pageIndicator = document.getElementById('page-indicator');

    // admin audio
    this.$audioList = document.getElementById('audio-list');
    this.$refreshAudio = document.getElementById('refresh-audio');

    // topbar
    this.$signOut = document.getElementById('sign-out');
    this.$themeToggle = document.getElementById('theme-toggle');
  }

  bind() {
    // auth tabs
    this.$tabLogin.addEventListener('click', () => this.switchTab('login'));
    this.$tabSignup.addEventListener('click', () => this.switchTab('signup'));

    // forms
    this.$loginForm.addEventListener('submit', (e) => this.login(e));
    this.$signupForm.addEventListener('submit', (e) => this.signup(e));

    // nav
    this.$navLinks.forEach(l => l.addEventListener('click', (e) => this.nav(e)));

    // ticket
    this.$createTicket.addEventListener('click', () => this.submitTextTicket());

    // voice
    this.$recordBtn.addEventListener('click', () => this.toggleRecording());
    this.$reRecord.addEventListener('click', () => this.resetRecording());
    this.$submitRecording.addEventListener('click', () => this.submitRecording());

    // filters
    this.$search.addEventListener('input', () => this.refreshTickets());
    this.$filterStatus.addEventListener('change', () => this.refreshTickets());
    this.$filterDept.addEventListener('change', () => this.refreshTickets());
    this.$filterPriority.addEventListener('change', () => this.refreshTickets());

    this.$prev.addEventListener('click', () => { if (this.pagination.page > 1) { this.pagination.page--; this.renderTickets(); } });
    this.$next.addEventListener('click', () => { this.pagination.page++; this.renderTickets(); });

    // admin audio
    this.$refreshAudio.addEventListener('click', () => this.loadS3AudioList());

    // topbar
    this.$signOut.addEventListener('click', () => this.signOut());
    this.$themeToggle.addEventListener('click', (e) => this.toggleTheme(e));
  }

  switchTab(tab) {
    const login = this.$loginForm, signup = this.$signupForm;
    const a = this.$tabLogin, b = this.$tabSignup;
    if (tab === 'login') {
      login.classList.add('visible'); signup.classList.remove('visible');
      a.classList.add('active'); b.classList.remove('active');
    } else {
      signup.classList.add('visible'); login.classList.remove('visible');
      b.classList.add('active'); a.classList.remove('active');
    }
  }

  // Simulated auth (swap to Cognito Hosted UI later if needed)
  login(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const role = document.getElementById('login-role').value;
    if (!email || !password) return this.toast('Enter email & password', 'error');
    const name = email.split('@')[0];
    this.user = { email, name, role: role === 'admin' ? 'admin' : 'user', department: 'IT' };
    localStorage.setItem('v2t_user', JSON.stringify(this.user));
    this.afterLogin();
  }

  signup(e) {
    e.preventDefault();
    const first = document.getElementById('signup-first').value.trim();
    const last = document.getElementById('signup-last').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const dept = document.getElementById('signup-department').value;
    const pwd = document.getElementById('signup-password').value.trim();
    if (!first || !last || !email || !dept || !pwd) return this.toast('Complete all fields', 'error');
    this.user = { email, name: `${first} ${last}`, role: 'user', department: dept };
    localStorage.setItem('v2t_user', JSON.stringify(this.user));
    this.afterLogin();
  }

  restore() {
    const s = localStorage.getItem('v2t_user');
    if (s) try { this.user = JSON.parse(s); } catch {}
    if (this.user) this.afterLogin(true);
  }

  afterLogin(isRestore=false) {
    // set header
    this.$chipName.textContent = this.user.name || 'User';
    this.$chipRole.textContent = this.user.role;
    this.$chipRole.className = `role-indicator ${this.user.role}`;

    // show app
    this.$auth.classList.add('hidden');
    this.$app.classList.remove('hidden');

    // nav gating
    if (this.user.role === 'admin') {
      this.$adminNav.classList.remove('hidden');
      this.goto('dashboard');
      this.fetchTickets();
      this.loadS3AudioList();
    } else {
      this.$adminNav.classList.add('hidden');
      this.goto('raise-ticket');
    }

    if (!isRestore) this.toast('Signed in', 'success');
  }

  signOut() {
    localStorage.removeItem('v2t_user');
    this.user = null;
    this.$app.classList.add('hidden');
    this.$auth.classList.remove('hidden');
    this.toast('Signed out', 'info');
  }

  nav(e) {
    e.preventDefault();
    let page = e.currentTarget.dataset.page;
    this.goto(page);
  }

  goto(page) {
    if (this.user?.role !== 'admin' && page !== 'raise-ticket') page = 'raise-ticket';

    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    const el = document.getElementById(`${page}-page`);
    const link = document.querySelector(`.nav-link[data-page="${page}"]`);
    el?.classList.remove('hidden');
    link?.classList.add('active');
    this.$pageTitle.textContent = this.pretty(page);

    if (page === 'dashboard') this.updateStats();
    if (page === 'tickets') this.renderTickets();
    if (page === 'audio') this.loadS3AudioList();
  }

  pretty(s) { return s.replace('-', ' ').replace(/\b\w/g, m => m.toUpperCase()); }

  toggleTheme(e) {
    const html = document.documentElement;
    const cur = html.getAttribute('data-color-scheme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-color-scheme', next);
    e.currentTarget.textContent = next === 'dark' ? '☀️' : '🌙';
  }

  toast(msg, type='info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type}`;
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  api(path='') { return `${AWS_CONFIG.apiUrl}${path.replace(/^\//,'')}`; }

  // ---------- Tickets ----------
  async fetchTickets() {
    try {
      const res = await fetch(this.api('tickets'), { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.tickets = await res.json();
    } catch (e) {
      this.tickets = []; // fallback
    }
    this.refreshTickets();
    this.updateStats();
  }

  refreshTickets() {
    const q = (this.$search?.value || '').toLowerCase();
    const fs = this.$filterStatus?.value || '';
    const fd = this.$filterDept?.value || '';
    const fp = this.$filterPriority?.value || '';

    this.filteredTickets = this.tickets
      .filter(t => (!q || `${t.title||''} ${t.description||''}`.toLowerCase().includes(q)))
      .filter(t => (!fs || (t.status === fs)))
      .filter(t => (!fd || (t.department === fd)))
      .filter(t => (!fp || (t.priority === fp)))
      .sort((a,b) => (new Date(b.createdAt||0)) - (new Date(a.createdAt||0)) );

    this.pagination.page = 1;
    this.renderTickets();
  }

  renderTickets() {
    if (!this.$ticketsTbody) return;
    const start = (this.pagination.page-1) * this.pagination.perPage;
    const rows = this.filteredTickets.slice(start, start + this.pagination.perPage);
    this.$ticketsTbody.innerHTML = rows.map(t => `
      <tr>
        <td>${this.dt(t.createdAt)}</td>
        <td>${this.esc(t.title)||'-'}</td>
        <td>${this.esc(t.department)||'-'}</td>
        <td>${this.esc(t.priority)||'-'}</td>
        <td>${this.esc(t.status)||'Open'}</td>
        <td>${t.audioKey ? `<a target="_blank" href="${this.s3Url(t.audioKey)}">Play</a>` : '-'}</td>
      </tr>
    `).join('');

    const totalPages = Math.max(1, Math.ceil(this.filteredTickets.length / this.pagination.perPage));
    this.$pageIndicator.textContent = `${this.pagination.page} / ${totalPages}`;
  }

  // ---------- Create Tickets ----------
  async submitTextTicket() {
    const title = this.$ticketTitle.value.trim();
    const description = this.$ticketDesc.value.trim();
    const department = this.$ticketDept.value;
    const priority = this.$ticketPriority.value;
    if (!title || !description) return this.toast('Title & description required', 'error');

    const payload = {
      title, description, department, priority,
      createdAt: new Date().toISOString(),
      status: 'Open',
      userEmail: this.user.email
    };

    try {
      const res = await fetch(this.api('tickets'), {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.toast('Ticket submitted', 'success');
      this.$ticketTitle.value = '';
      this.$ticketDesc.value = '';
      if (this.user.role === 'admin') await this.fetchTickets();
    } catch (e) {
      // local fallback
      this.tickets.unshift(payload);
      this.toast('Ticket saved (local). Connect API for persistence.', 'info');
      if (this.user.role === 'admin') this.refreshTickets();
    }
  }

  // ---------- Recording ----------
  async toggleRecording() {
    if (this.media.recording) {
      this.media.recorder.stop();
      this.media.recording = false;
      this.$recordBtn.textContent = 'Start Recording';
      this.$recordStatus.textContent = 'Recorded';
      this.$reRecord.disabled = false;
      this.$submitRecording.disabled = false;
      clearInterval(this.media.timer);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      this.media.chunks = [];
      mr.ondataavailable = (e) => { if (e.data.size) this.media.chunks.push(e.data); };
      mr.onstop = () => {
        this.media.blob = new Blob(this.media.chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(this.media.blob);
        this.$recordPreview.src = url;
        this.$recordPreview.classList.remove('hidden');
      };
      mr.start();
      this.media.recorder = mr;
      this.media.recording = true;
      this.media.startedAt = Date.now();
      this.$recordBtn.textContent = 'Stop Recording';
      this.$recordStatus.textContent = 'Recording…';
      this.$reRecord.disabled = true;
      this.$submitRecording.disabled = true;
      this.$recordPreview.classList.add('hidden');
      clearInterval(this.media.timer);
      this.media.timer = setInterval(() => {
        const s = Math.floor((Date.now() - this.media.startedAt)/1000);
        const mm = String(Math.floor(s/60)).padStart(2,'0');
        const ss = String(s%60).padStart(2,'0');
        this.$recordTimer.textContent = `${mm}:${ss}`;
      }, 250);
    } catch (e) {
      console.error(e);
      this.toast('Mic permission denied', 'error');
    }
  }

  resetRecording() {
    this.media.blob = null;
    this.media.chunks = [];
    this.$recordPreview.src = '';
    this.$recordPreview.classList.add('hidden');
    this.$recordTimer.textContent = '00:00';
    this.$recordStatus.textContent = 'Idle';
    this.$submitRecording.disabled = true;
  }

  // ---------- AWS ----------
  async ensureCreds() {
    AWS.config.update({ region: AWS_CONFIG.region });
    if (!AWS_CONFIG.identityPoolId || !AWS_CONFIG.identityPoolId.includes('-')) {
      throw new Error('Set a valid Cognito Identity Pool ID');
    }
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId: AWS_CONFIG.identityPoolId
    });
    return new Promise((resolve, reject) => {
      AWS.config.credentials.refresh(err => err ? reject(err) : resolve());
    });
  }

  s3Url(key) {
    return `https://${AWS_CONFIG.s3Bucket}.s3.${AWS_CONFIG.region}.amazonaws.com/${encodeURIComponent(key)}`;
  }

  async submitRecording() {
    if (!this.media.blob) return this.toast('No recording to upload', 'error');
    // 1) Upload to S3
    const key = `${AWS_CONFIG.s3Prefix}${encodeURIComponent(this.user.email)}/${Date.now()}.webm`;
    try {
      await this.ensureCreds();
      const s3 = new AWS.S3({ params: { Bucket: AWS_CONFIG.s3Bucket } });
      await s3.putObject({
        Bucket: AWS_CONFIG.s3Bucket,
        Key: key,
        Body: this.media.blob,
        ContentType: 'audio/webm',
        ACL: 'private'
      }).promise();
      this.toast('Audio uploaded to S3', 'success');
    } catch (e) {
      console.error(e);
      return this.toast(`S3 upload failed: ${e.message}`, 'error');
    }

    // 2) Create ticket referencing audio
    const payload = {
      title: 'Voice Ticket',
      description: 'Submitted via voice',
      department: document.getElementById('voice-dept').value,
      priority: document.getElementById('voice-priority').value,
      createdAt: new Date().toISOString(),
      status: 'Open',
      userEmail: this.user.email,
      audioKey: key
    };
    try {
      const res = await fetch(this.api('tickets'), {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.toast('Ticket submitted', 'success');
      this.resetRecording();
      if (this.user.role === 'admin') await this.fetchTickets();
    } catch (e) {
      // local fallback
      this.tickets.unshift(payload);
      this.toast('Ticket saved (local). Connect API for persistence.', 'info');
      if (this.user.role === 'admin') this.refreshTickets();
      this.resetRecording();
    }
  }

  // ---------- Admin: S3 list ----------
  async loadS3AudioList() {
    if (this.user?.role !== 'admin') return;
    try {
      await this.ensureCreds();
      const s3 = new AWS.S3({ params: { Bucket: AWS_CONFIG.s3Bucket } });
      const all = [];
      let token;
      do {
        const out = await s3.listObjectsV2({
          Bucket: AWS_CONFIG.s3Bucket,
          Prefix: AWS_CONFIG.s3Prefix,
          ContinuationToken: token
        }).promise();
        (out.Contents || []).forEach(o => { if (o.Key.endsWith('.webm')) all.push(o); });
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (token);

      this.$audioList.innerHTML = all
        .sort((a,b) => (new Date(b.LastModified)) - (new Date(a.LastModified)))
        .map(o => {
          const url = this.s3Url(o.Key);
          const name = o.Key.split('/').pop();
          const when = new Date(o.LastModified).toLocaleString();
          return `<li class="audio-item">
            <div class="audio-meta">
              <div class="audio-name">${this.esc(name)}</div>
              <div class="audio-time">${this.esc(when)}</div>
            </div>
            <audio controls src="${url}"></audio>
          </li>`;
        }).join('') || `<li class="audio-item">No audio found.</li>`;
    } catch (e) {
      console.error(e);
      this.toast(`Audio list failed: ${e.message}`, 'error');
    }
  }

  // ---------- Stats ----------
  updateStats() {
    const total = this.tickets.length;
    const open = this.tickets.filter(t => t.status === 'Open').length;
    const closed = this.tickets.filter(t => t.status === 'Closed').length;
    const $t = document.getElementById('total-tickets');
    const $o = document.getElementById('open-tickets');
    const $c = document.getElementById('closed-tickets');
    if ($t) $t.textContent = total;
    if ($o) $o.textContent = open;
    if ($c) $c.textContent = closed;
  }

  // ---------- utils ----------
  dt(v) { try { return new Date(v).toLocaleString(); } catch { return v || ''; } }
  esc(s) { return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
}

const app = new App();
app.init();

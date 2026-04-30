(function () {
  const NOTE_STORAGE_KEY = 'frameshift.reviewEngine.notes';
  const DEFAULT_NOTES = [
    { id: 101, version: 'v012', frame: 84, text: 'Increase the fire intensity in this area.', author: 'Sarah Connor', replies: [] },
    { id: 102, version: 'v012', frame: 125, text: 'Add more debris falling from the top.', author: 'Sarah Connor', replies: [] },
    { id: 103, version: 'v011', frame: 72, text: 'Glow is too strong in the mid frame.', author: 'Sarah Connor', replies: [] },
    { id: 104, version: 'v010', frame: 98, text: 'Smoke interaction looks good here.', author: 'Sarah Connor', replies: [] }
  ];

  function loadNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTE_STORAGE_KEY)) || DEFAULT_NOTES;
    } catch {
      return DEFAULT_NOTES;
    }
  }

  function saveNotes(notes) {
    try {
      localStorage.setItem(NOTE_STORAGE_KEY, JSON.stringify(notes));
    } catch {}
  }

  const VERSION_STATUS = {
    WIP: 'wip',
    SUBMITTED: 'submitted',
    REVIEW: 'review',
    REVISE: 'revise',
    APPROVED: 'approved'
  };

  const EventBus = {
    events: {},

    on(event, cb) {
      (this.events[event] ||= []).push(cb);
    },

    emit(event, data) {
      (this.events[event] || []).forEach(cb => cb(data));
    }
  };

  const PipelineVersionStore = {
    versions: [],

    add(version) {
      const created = {
        id: version.id || version.tag || `version-${Date.now()}`,
        version: version.version || version.num || this.versions.length + 1,
        status: version.status || VERSION_STATUS.WIP,
        updatedAt: Date.now(),
        ...version
      };
      this.versions.push(created);
      EventBus.emit('version:updated', created);
      return created;
    },

    updateStatus(id, status) {
      let v = this.versions.find(version => version.id === id || version.tag === id);
      if (!v && window.VersionStore?.get?.(id)) {
        const existing = window.VersionStore.get(id);
        v = this.add({
          id: existing.tag,
          tag: existing.tag,
          shot: existing.task || ReviewSession.shot,
          version: existing.num,
          status: existing.status
        });
      }
      if (!v) return;

      v.status = status;
      v.updatedAt = Date.now();
      window.VersionStore?.updateStatus?.(v.tag || v.id, status);
      EventBus.emit('version:updated', v);
    },

    getLatest(shot) {
      return this.versions
        .filter(v => v.shot === shot)
        .sort((a, b) => b.version - a.version)[0];
    }
  };

  const SupervisorQueue = {
    queue: [],

    add(versionId) {
      if (!this.queue.includes(versionId)) this.queue.push(versionId);
      this.render();
    },

    next() {
      return this.queue[0];
    },

    remove(versionId) {
      this.queue = this.queue.filter(id => id !== versionId);
      this.render();
    },

    render() {
      const count = document.querySelector('#nav-supervisor-review span');
      if (count) count.textContent = this.queue.length;
    }
  };

  const Player = {
    frame: 0,
    fps: 24,
    duration: 240,
    playing: false,
    interval: null,
    speed: 1,

    play() {
      if (this.playing) return;
      this.playing = true;
      this.interval = setInterval(() => {
        this.frame += this.speed;
        if (this.frame >= this.duration) this.frame = 0;
        UI.updateFrame();
      }, 1000 / this.fps);
    },

    pause() {
      this.playing = false;
      clearInterval(this.interval);
      this.interval = null;
    },

    toggle() {
      this.playing ? this.pause() : this.play();
    },

    seek(frame) {
      this.frame = Math.max(0, Math.min(frame, this.duration));
      UI.updateFrame();
    },

    setSpeed(s) {
      this.speed = s;
      if (this.playing) {
        this.pause();
        this.play();
      }
    }
  };

  const AnnotationStore = {
    notes: loadNotes(),

    add(note) {
      const created = {
        id: Date.now(),
        replies: [],
        ...note
      };
      this.notes.push(created);
      saveNotes(this.notes);
      return created;
    },

    get(version) {
      return this.notes.filter(n => n.version === version);
    },

    addReply(noteId, text) {
      const note = this.notes.find(n => n.id === noteId);
      if (note) {
        note.replies.push({
          text,
          author: 'Artist'
        });
        saveNotes(this.notes);
      }
    }
  };

  const DrawTool = {
    active: false,
    tool: 'pen',
    drawings: [],
    current: null,

    start(x, y) {
      this.active = true;
      this.current = { frame: Math.round(Player.frame), points: [{ x, y }] };
    },

    move(x, y) {
      if (!this.active || !this.current) return;
      this.current.points.push({ x, y });
      this.render();
    },

    end() {
      if (!this.active || !this.current) return;
      this.active = false;
      this.drawings.push(this.current);
      this.current = null;
      this.render();
    },

    resize() {
      const canvas = document.getElementById('draw-layer');
      const area = document.getElementById('video-area');
      if (!canvas || !area) return;
      const rect = area.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      this.render();
    },

    render() {
      const canvas = document.getElementById('draw-layer');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const frame = Math.round(Player.frame);
      const visible = [
        ...this.drawings.filter(d => d.frame === frame),
        ...(this.current && this.current.frame === frame ? [this.current] : [])
      ];

      visible.forEach(d => {
        ctx.beginPath();
        d.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.strokeStyle = '#7B35F5';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    },

    bind() {
      const canvas = document.getElementById('draw-layer');
      if (!canvas || canvas.dataset.bound === 'true') return;
      canvas.dataset.bound = 'true';

      canvas.addEventListener('mousedown', e => {
        if (UI.tool !== 'draw') return;
        e.stopPropagation();
        this.start(e.offsetX, e.offsetY);
      });
      canvas.addEventListener('mousemove', e => {
        if (UI.tool !== 'draw') return;
        e.stopPropagation();
        this.move(e.offsetX, e.offsetY);
      });
      canvas.addEventListener('mouseup', e => {
        if (UI.tool !== 'draw') return;
        e.stopPropagation();
        this.end();
      });
      canvas.addEventListener('mouseleave', () => this.end());
      window.addEventListener('resize', () => this.resize());
      this.resize();
    }
  };

  const Compare = {
    enabled: false,

    toggle() {
      this.enabled = !this.enabled;
      document.body.classList.toggle('compare-mode', this.enabled);
    }
  };

  const ReviewSession = {
    shot: null,
    version: null,

    start(shot, version) {
      this.shot = shot;
      this.version = version;
      const existingVersion = window.VersionStore?.get?.(version);
      if (existingVersion && !PipelineVersionStore.versions.some(v => v.id === version || v.tag === version)) {
        PipelineVersionStore.add({
          id: existingVersion.tag,
          tag: existingVersion.tag,
          shot,
          version: existingVersion.num,
          status: existingVersion.status
        });
      }
      const shotEl = document.getElementById('review-shot');
      const versionEl = document.getElementById('review-version');
      if (shotEl) shotEl.textContent = shot;
      if (versionEl) versionEl.textContent = version;
      DrawTool.bind();

      Player.pause();
      Player.seek(0);

      UI.setTool('note');
      UI.renderVersions();
      UI.renderNotes();
      UI.updateFrame();
    }
  };

  const UI = {
    tool: 'note',

    updateFrame() {
      const frameEl = document.getElementById('frame');
      if (frameEl) frameEl.textContent = Player.frame;
      this.renderNotes();
      this.renderTimelineMarkers();
      DrawTool.render();
      const progressEl = document.getElementById('timeline-progress');
      if (progressEl) {
        const progress = (Player.frame / Player.duration) * 100;
        progressEl.style.width = progress + '%';
      }
    },

    renderNotes() {
      const container = document.getElementById('notes-list');
      const overlay = document.getElementById('annotation-layer');
      if (!container) return;

      const notes = AnnotationStore.get(ReviewSession.version);
      container.innerHTML = '';
      if (overlay) overlay.innerHTML = '';

      if (!notes.length) {
        container.innerHTML = '<div class="empty-state">No notes for this version yet. Write a note, then click Add or click the viewer in Note Mode.</div>';
      }

      notes.forEach(n => {
        container.innerHTML += `
          <div class="note" onclick="Player.seek(${n.frame})">
            <div>Frame ${n.frame}: ${this.escape(n.text)}</div>
            <button onclick="UI.reply(event, ${n.id})">Reply</button>
            ${(n.replies || []).map(r => `<div class="reply">${this.escape(r.author)}: ${this.escape(r.text)}</div>`).join('')}
          </div>
        `;

        if (overlay && n.frame === Math.round(Player.frame)) {
          overlay.innerHTML += `
            <div class="annotation-bubble">
              ${this.escape(n.text)}
            </div>
          `;
        }
      });
    },

    addNote() {
      const input = document.getElementById('note-input');
      if (!input || !input.value.trim()) return;

      AnnotationStore.add({
        version: ReviewSession.version,
        frame: Player.frame,
        text: input.value.trim(),
        author: 'Supervisor'
      });

      input.value = '';
      this.renderNotes();
      this.renderTimelineMarkers();
    },

    handleViewerClick(event) {
      if (this.tool !== 'note') return;
      if (event.target.closest('#draw-layer')) return;
      this.addNoteFromViewer();
    },

    addNoteFromViewer() {
      const input = document.getElementById('note-input');
      const text = input?.value.trim() || 'Fix this';
      AnnotationStore.add({
        version: ReviewSession.version,
        frame: Player.frame,
        text,
        author: 'Supervisor'
      });
      if (input) input.value = '';
      this.renderNotes();
      this.renderTimelineMarkers();
    },

    setTool(tool) {
      this.tool = tool;
      document.body.classList.toggle('draw-mode', tool === 'draw');
    },

    renderVersions() {
      const select = document.getElementById('review-version-picker');
      if (!select) return;
      const versions = window.VersionStore?.forCurrentTask?.() || window.VersionStore?.versions || [];
      select.innerHTML = versions.map(v => `
        <option value="${v.tag}"${v.tag === ReviewSession.version ? ' selected' : ''}>${v.tag} · ${v.status}</option>
      `).join('');
      if (!select.innerHTML && ReviewSession.version) {
        select.innerHTML = `<option value="${ReviewSession.version}">${ReviewSession.version}</option>`;
      }
    },

    changeVersion(version) {
      ReviewSession.version = version;
      window.VersionStore?.select?.(version);
      Player.seek(0);
      this.renderVersions();
      this.renderNotes();
      this.renderTimelineMarkers();
    },

    reply(event, noteId) {
      event.stopPropagation();
      const text = prompt('Reply to note');
      if (!text) return;
      AnnotationStore.addReply(noteId, text);
      this.renderNotes();
    },

    renderTimelineMarkers() {
      const timeline = document.querySelector('.timeline');
      if (!timeline) return;
      timeline.innerHTML = '<div id="timeline-progress"></div>';

      AnnotationStore.get(ReviewSession.version).forEach(n => {
        const marker = document.createElement('div');
        marker.className = 'timeline-marker';
        marker.style.left = (n.frame / Player.duration * 100) + '%';
        marker.onclick = e => {
          e.stopPropagation();
          Player.seek(n.frame);
        };
        timeline.appendChild(marker);
      });
    },

    seekFromTimeline(e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      const frame = Math.floor(percent * Player.duration);
      Player.seek(frame);
    },

    approve() {
      PipelineVersionStore.updateStatus(ReviewSession.version, VERSION_STATUS.APPROVED);
      SupervisorQueue.remove(ReviewSession.version);
      const next = SupervisorQueue.next();
      if (next) {
        const nextVersion = PipelineVersionStore.versions.find(v => v.id === next || v.tag === next);
        ReviewSession.start(nextVersion?.shot || ReviewSession.shot, next);
      }
      alert('Approved');
    },

    requestChanges() {
      PipelineVersionStore.updateStatus(ReviewSession.version, VERSION_STATUS.REVISE);
      alert('Changes requested');
    },

    escape(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };

  window.Player = Player;
  window.AnnotationStore = AnnotationStore;
  window.ReviewSession = ReviewSession;
  window.UI = UI;
  window.DrawTool = DrawTool;
  window.Compare = Compare;
  window.VERSION_STATUS = VERSION_STATUS;
  window.EventBus = EventBus;
  window.PipelineVersionStore = PipelineVersionStore;
  window.SupervisorQueue = SupervisorQueue;

  window.canSubmit = function canSubmit(versionId) {
    const v = PipelineVersionStore.versions.find(version => version.id === versionId || version.tag === versionId)
      || window.VersionStore?.get?.(versionId);
    return !v || v.status === VERSION_STATUS.WIP || v.status === VERSION_STATUS.REVISE || v.status === 'working' || v.status === 'revise';
  };

  window.submitVersion = function submitVersion(versionId) {
    if (!window.canSubmit(versionId)) return false;
    PipelineVersionStore.updateStatus(versionId, VERSION_STATUS.SUBMITTED);
    EventBus.emit('review:requested', versionId);
    window.TaskFlow?.lock?.(versionId);
    return true;
  };

  EventBus.on('review:requested', versionId => {
    SupervisorQueue.add(versionId);
  });

  EventBus.on('version:updated', () => {
    UI.renderNotes();
    UI.updateFrame();
  });

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case ' ':
        e.preventDefault();
        Player.toggle();
        break;
      case 'ArrowRight':
        Player.seek(Player.frame + 1);
        break;
      case 'ArrowLeft':
        Player.seek(Player.frame - 1);
        break;
    }
  });
})();

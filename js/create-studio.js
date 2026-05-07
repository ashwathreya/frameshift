(function () {
  const overlay = document.getElementById("createStudioOverlay");
  if (!overlay) return;
  const createStudioBtn = document.getElementById("createStudioBtn");

  let initialized = false;
  const state = {
    currentStep: 1,
    completed: new Set(),
    studioName: "",
    website: "",
    country: "",
    timezone: "",
    tags: new Set(["VFX"]),
    departments: [
      { id: "d1", name: "FX", people: 12 },
      { id: "d2", name: "Lighting", people: 18 },
      { id: "d3", name: "Compositing", people: 25 },
      { id: "d4", name: "CFX", people: 10 }
    ],
    roles: new Set(["Artist", "Supervisor"]),
    teamMembers: []
  };

  const ui = {};
  const OVERLAY_TEMPLATE = `
<section class="cs-panel" aria-label="Create studio onboarding">
  <header class="cs-head">
    <div>
      <h2>Create Your Studio</h2>
      <p>Set up your studio and team in a few simple steps.</p>
    </div>
    <button type="button" class="cs-close" data-cs-close aria-label="Close onboarding">&times;</button>
  </header>
  <nav class="cs-stepper" data-cs-stepper>
    <div class="cs-step-item active" data-step="1"><span class="cs-dot">1</span><span>Company Info</span></div>
    <div class="cs-step-item" data-step="2"><span class="cs-dot">2</span><span>Departments</span></div>
    <div class="cs-step-item" data-step="3"><span class="cs-dot">3</span><span>Roles &amp; Permissions</span></div>
    <div class="cs-step-item" data-step="4"><span class="cs-dot">4</span><span>Team Members</span></div>
    <div class="cs-step-item" data-step="5"><span class="cs-dot">5</span><span>Review &amp; Launch</span></div>
  </nav>
  <section class="cs-body">
    <div class="cs-step active" data-panel="1">
      <h3>Company Information</h3>
      <p class="cs-sub">Let's start with the basics about your studio.</p>
      <div class="cs-grid one">
        <label class="cs-field"><span>Studio Name</span><input type="text" data-field="studioName" placeholder="Frameshift Studios" /><small data-error="studioName"></small></label>
        <label class="cs-field"><span>Website (Optional)</span><input type="text" data-field="website" placeholder="www.frameshift.com" /></label>
        <label class="cs-field"><span>Country / Region</span><select data-field="country"><option value="">Select country</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>India</option></select><small data-error="country"></small></label>
        <label class="cs-field"><span>Time Zone</span><select data-field="timezone"><option value="">Select timezone</option><option>(GMT -8:00) Pacific Time</option><option>(GMT -5:00) Eastern Time</option><option>(GMT +0:00) GMT</option><option>(GMT +5:30) India Time</option></select><small data-error="timezone"></small></label>
      </div>
      <div class="cs-field"><span>Industry Focus (Optional)</span><div class="cs-tags" data-cs-tags><button type="button" class="cs-tag selected" data-tag="VFX">VFX</button><button type="button" class="cs-tag" data-tag="Animation">Animation</button><button type="button" class="cs-tag" data-tag="Virtual Production">Virtual Production</button><button type="button" class="cs-tag" data-tag="Design">Design</button></div></div>
    </div>
    <div class="cs-step" data-panel="2"><h3>Departments</h3><p class="cs-sub">Add departments that exist in your studio.</p><div class="cs-list" data-cs-departments></div><small class="cs-error" data-error="departments"></small><div class="cs-inline-add" data-cs-department-inline hidden><input type="text" data-field="departmentName" placeholder="Department name" /><input type="number" data-field="departmentPeople" min="0" step="1" placeholder="People" /><button type="button" class="cs-primary" data-cs-save-department>Add</button><button type="button" class="cs-ghost" data-cs-cancel-department>Cancel</button></div><button type="button" class="cs-ghost cs-block" data-cs-add-department>+ Add Department</button></div>
    <div class="cs-step" data-panel="3"><h3>Roles &amp; Permissions</h3><p class="cs-sub">Define roles and set basic permissions.</p><div class="cs-role-grid" data-cs-roles><button type="button" class="cs-role selected" data-role="Artist"><b>Artist</b><span>Create &amp; update</span></button><button type="button" class="cs-role selected" data-role="Supervisor"><b>Supervisor</b><span>Review &amp; approve</span></button><button type="button" class="cs-role" data-role="Producer"><b>Producer</b><span>Manage projects</span></button><button type="button" class="cs-role" data-role="Client"><b>Client</b><span>Review feedback</span></button><button type="button" class="cs-role" data-role="Head of FX"><b>Head of FX</b><span>Oversee FX</span></button><button type="button" class="cs-role" data-role="Head of CG"><b>Head of CG</b><span>Oversee CG</span></button></div><small class="cs-error" data-error="roles"></small><button type="button" class="cs-ghost cs-block" data-cs-custom-role>+ Create Custom Role</button></div>
    <div class="cs-step" data-panel="4"><h3>Team Members</h3><p class="cs-sub">Add your team members.</p><div class="cs-tabs"><button type="button" class="cs-tab active" data-mode="csv">Import CSV</button><button type="button" class="cs-tab" data-mode="manual">Add Manually</button></div><div class="cs-mode active" data-mode-panel="csv"><div class="cs-dropzone" data-cs-dropzone>Drag &amp; drop your CSV file here<br />or click to browse</div><button type="button" class="cs-link">Download CSV Template</button></div><div class="cs-mode" data-mode-panel="manual"><div class="cs-manual-grid"><input type="text" data-field="memberName" placeholder="Member name" /><select data-field="memberRole"><option value="">Role</option><option>Artist</option><option>Supervisor</option><option>Producer</option></select><select data-field="memberDepartment"><option value="">Department</option><option>FX</option><option>Lighting</option><option>Compositing</option></select><button type="button" class="cs-ghost" data-cs-add-member>+ Add</button></div></div><small class="cs-error" data-error="team"></small><div class="cs-list compact" data-cs-team></div></div>
    <div class="cs-step" data-panel="5"><h3>Review &amp; Launch</h3><p class="cs-sub">Review your settings and launch your studio.</p><div class="cs-summary"><div><span>Studio Name</span><b data-summary="studioName">—</b></div><div><span>Departments</span><b data-summary="departments">0</b></div><div><span>Roles</span><b data-summary="roles">0</b></div><div><span>Team Members</span><b data-summary="members">0</b></div></div><div class="cs-note">Your data is secure and never shared.</div></div>
  </section>
  <footer class="cs-actions"><button type="button" class="cs-ghost" data-cs-back>Back</button><button type="button" class="cs-primary" data-cs-next>Next</button></footer>
  <div class="cs-footnote">🔒 Your data is secure and never shared.</div>
</section>`;

  function field(sel) { return overlay.querySelector(sel); }
  function errorEl(key) { return overlay.querySelector(`[data-error="${key}"]`); }
  function setError(key, msg = "") { const el = errorEl(key); if (el) el.textContent = msg; }
  function clearErrors() { overlay.querySelectorAll("[data-error]").forEach((e) => { e.textContent = ""; }); }

  function updateStepper() {
    ui.stepItems.forEach((item) => {
      const step = Number(item.dataset.step);
      item.classList.toggle("active", step === state.currentStep);
      item.classList.toggle("completed", state.completed.has(step));
    });
  }

  function showStep(step) {
    state.currentStep = step;
    ui.panels.forEach((panel) => {
      const panelStep = Number(panel.dataset.panel);
      const isActive = panelStep === step;
      const isCompleted = state.completed.has(panelStep) && panelStep < step;
      const isLocked = panelStep > step;

      panel.classList.toggle("active", isActive);
      panel.classList.toggle("completed", isCompleted);
      panel.classList.toggle("locked", isLocked);

      const nextBtn = panel.querySelector("[data-card-next]");
      const backBtn = panel.querySelector("[data-card-back]");
      if (!nextBtn || !backBtn) return;

      if (isActive) {
        nextBtn.hidden = false;
        nextBtn.disabled = false;
        nextBtn.classList.remove("is-done");
        nextBtn.textContent = panelStep === 5 ? "Launch Studio" : "Next";
        backBtn.hidden = panelStep === 1;
      } else if (isCompleted) {
        nextBtn.hidden = false;
        nextBtn.disabled = true;
        nextBtn.classList.add("is-done");
        nextBtn.textContent = "Done";
        backBtn.hidden = true;
      } else {
        nextBtn.hidden = true;
        nextBtn.disabled = true;
        backBtn.hidden = true;
      }

      const controls = Array.from(panel.querySelectorAll("input, select, textarea, button"));
      controls.forEach((control) => {
        const isCardNav = control.matches("[data-card-next]") || control.matches("[data-card-back]");
        if (isCardNav) return;
        control.disabled = !isActive;
      });
    });

    updateStepper();
    renderSummary();
  }

  function validateStep() {
    clearErrors();
    if (state.currentStep === 1) {
      state.studioName = String(field('[data-field="studioName"]')?.value || "").trim();
      state.website = String(field('[data-field="website"]')?.value || "").trim();
      state.country = String(field('[data-field="country"]')?.value || "").trim();
      state.timezone = String(field('[data-field="timezone"]')?.value || "").trim();
      let ok = true;
      if (!state.studioName) { setError("studioName", "Studio name is required."); ok = false; }
      if (!state.country) { setError("country", "Country is required."); ok = false; }
      if (!state.timezone) { setError("timezone", "Timezone is required."); ok = false; }
      return ok;
    }
    if (state.currentStep === 2 && !state.departments.length) { setError("departments", "Add at least one department."); return false; }
    if (state.currentStep === 3 && !state.roles.size) { setError("roles", "Select at least one role."); return false; }
    if (state.currentStep === 4) {
      const csvMode = overlay.querySelector('.cs-tab[data-mode="csv"]')?.classList.contains("active");
      if (!csvMode && !state.teamMembers.length) { setError("team", "Add at least one team member."); return false; }
    }
    return true;
  }

  function renderDepartments() {
    ui.departments.innerHTML = state.departments.map((d) => `
      <div class="cs-list-item">
        <div class="cs-list-main"><b>${d.name}</b><span>${d.people} people</span></div>
        <button type="button" class="cs-remove" data-remove-dept="${d.id}">&times;</button>
      </div>
    `).join("");
    ui.departments.querySelectorAll("[data-remove-dept]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove-dept");
        state.departments = state.departments.filter((d) => d.id !== id);
        renderDepartments();
      });
    });
  }

  function renderTeam() {
    ui.team.innerHTML = state.teamMembers.length
      ? state.teamMembers.map((m, i) => `
        <div class="cs-list-item">
          <div class="cs-list-main"><b>${m.name}</b><span>${m.role} • ${m.department}</span></div>
          <button type="button" class="cs-remove" data-remove-member="${i}">&times;</button>
        </div>
      `).join("")
      : `<div class="cs-list-item"><div class="cs-list-main"><b>No team members yet</b><span>Add manually or import CSV.</span></div></div>`;
    ui.team.querySelectorAll("[data-remove-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-remove-member"));
        state.teamMembers.splice(idx, 1);
        renderTeam();
      });
    });
  }

  function renderSummary() {
    field('[data-summary="studioName"]').textContent = state.studioName || "—";
    field('[data-summary="departments"]').textContent = String(state.departments.length);
    field('[data-summary="roles"]').textContent = String(state.roles.size);
    field('[data-summary="members"]').textContent = String(state.teamMembers.length);
  }

  function nextStep() {
    if (!validateStep()) return;
    state.completed.add(state.currentStep);
    if (state.currentStep < 5) {
      showStep(state.currentStep + 1);
      return;
    }
    closeCreateStudioOverlay();
  }

  function prevStep() {
    if (state.currentStep <= 1) return;
    clearErrors();
    showStep(state.currentStep - 1);
  }

  function injectCardActions() {
    ui.panels.forEach((panel) => {
      if (panel.querySelector(".cs-card-actions")) return;
      const panelStep = Number(panel.dataset.panel);
      const actions = document.createElement("div");
      actions.className = "cs-card-actions";
      actions.innerHTML = `
        <button type="button" class="cs-ghost" data-card-back>Back</button>
        <button type="button" class="cs-primary" data-card-next>${panelStep === 5 ? "Launch Studio" : "Next"}</button>
      `;
      panel.appendChild(actions);
    });
  }

  function bindEvents() {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-cs-close]")) {
        closeCreateStudioOverlay();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (overlay.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeCreateStudioOverlay();
      }
    });

    overlay.querySelector("[data-cs-tags]").querySelectorAll(".cs-tag").forEach((tag) => {
      tag.addEventListener("click", () => {
        const key = tag.dataset.tag;
        if (!key) return;
        if (state.tags.has(key)) state.tags.delete(key); else state.tags.add(key);
        tag.classList.toggle("selected", state.tags.has(key));
      });
    });

    ui.addDepartment.addEventListener("click", () => {
      if (!ui.departmentInline) return;
      ui.departmentInline.hidden = false;
      setError("departments", "");
      ui.departmentName?.focus();
    });
    ui.cancelDepartment.addEventListener("click", () => {
      if (ui.departmentInline) ui.departmentInline.hidden = true;
      if (ui.departmentName) ui.departmentName.value = "";
      if (ui.departmentPeople) ui.departmentPeople.value = "";
      setError("departments", "");
    });
    ui.saveDepartment.addEventListener("click", () => {
      const name = String(ui.departmentName?.value || "").trim();
      const people = Number(ui.departmentPeople?.value || 0);
      if (!name) {
        setError("departments", "Department name is required.");
        ui.departmentName?.focus();
        return;
      }
      setError("departments", "");
      state.departments.push({
        id: `d-${Date.now()}`,
        name,
        people: Number.isFinite(people) ? Math.max(0, people) : 0
      });
      if (ui.departmentInline) ui.departmentInline.hidden = true;
      if (ui.departmentName) ui.departmentName.value = "";
      if (ui.departmentPeople) ui.departmentPeople.value = "";
      renderDepartments();
    });

    ui.roles.querySelectorAll(".cs-role").forEach((roleCard) => {
      roleCard.addEventListener("click", () => {
        const role = roleCard.dataset.role;
        if (!role) return;
        if (state.roles.has(role)) state.roles.delete(role); else state.roles.add(role);
        roleCard.classList.toggle("selected", state.roles.has(role));
      });
    });

    ui.customRole.addEventListener("click", () => {
      const role = String(window.prompt("Custom role name") || "").trim();
      if (!role) return;
      state.roles.add(role);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "cs-role selected";
      el.dataset.role = role;
      el.innerHTML = `<b>${role}</b><span>Create a custom role</span>`;
      el.addEventListener("click", () => {
        if (state.roles.has(role)) state.roles.delete(role); else state.roles.add(role);
        el.classList.toggle("selected", state.roles.has(role));
      });
      ui.roles.appendChild(el);
    });

    ui.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        ui.tabs.forEach((t) => t.classList.toggle("active", t === tab));
        const mode = tab.dataset.mode;
        ui.modes.forEach((m) => m.classList.toggle("active", m.dataset.modePanel === mode));
      });
    });

    ui.dropzone.addEventListener("click", () => {
      state.teamMembers = [{ name: "Imported via CSV", role: "Artist", department: "FX" }];
      setError("team", "");
      renderTeam();
    });

    ui.addMember.addEventListener("click", () => {
      const name = String(field('[data-field="memberName"]').value || "").trim();
      const role = String(field('[data-field="memberRole"]').value || "").trim();
      const dep = String(field('[data-field="memberDepartment"]').value || "").trim();
      if (!name || !role || !dep) { setError("team", "Name, role, and department are required."); return; }
      setError("team", "");
      state.teamMembers.push({ name, role, department: dep });
      field('[data-field="memberName"]').value = "";
      field('[data-field="memberRole"]').value = "";
      field('[data-field="memberDepartment"]').value = "";
      renderTeam();
    });

    ui.panels.forEach((panel) => {
      const panelStep = Number(panel.dataset.panel);
      const nextBtn = panel.querySelector("[data-card-next]");
      const backBtn = panel.querySelector("[data-card-back]");

      if (nextBtn) {
        nextBtn.addEventListener("click", () => {
          if (state.currentStep !== panelStep) return;
          nextStep();
        });
      }
      if (backBtn) {
        backBtn.addEventListener("click", () => {
          if (state.currentStep !== panelStep) return;
          prevStep();
        });
      }
    });
  }

  async function initializeOverlay() {
    if (initialized) return;
    overlay.innerHTML = OVERLAY_TEMPLATE;
    ui.panels = Array.from(overlay.querySelectorAll(".cs-step"));
    ui.stepItems = Array.from(overlay.querySelectorAll(".cs-step-item"));
    ui.departments = field("[data-cs-departments]");
    ui.team = field("[data-cs-team]");
    ui.roles = field("[data-cs-roles]");
    ui.tabs = Array.from(overlay.querySelectorAll(".cs-tab"));
    ui.modes = Array.from(overlay.querySelectorAll(".cs-mode"));
    ui.dropzone = field("[data-cs-dropzone]");
    ui.addDepartment = field("[data-cs-add-department]");
    ui.departmentInline = field("[data-cs-department-inline]");
    ui.departmentName = field('[data-field="departmentName"]');
    ui.departmentPeople = field('[data-field="departmentPeople"]');
    ui.saveDepartment = field("[data-cs-save-department]");
    ui.cancelDepartment = field("[data-cs-cancel-department]");
    ui.customRole = field("[data-cs-custom-role]");
    ui.addMember = field("[data-cs-add-member]");
    injectCardActions();
    renderDepartments();
    renderTeam();
    renderSummary();
    bindEvents();
    showStep(1);
    initialized = true;
  }

  async function openCreateStudioOverlay() {
    await initializeOverlay();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => overlay.classList.add("open"));
  }

  function closeCreateStudioOverlay() {
    overlay.classList.remove("open");
    window.setTimeout(() => {
      overlay.hidden = true;
      document.body.style.overflow = "";
    }, 180);
  }

  if (createStudioBtn) {
    createStudioBtn.addEventListener("click", function (event) {
      event.preventDefault();
      openCreateStudioOverlay();
    });
  }

  window.openCreateStudioOverlay = openCreateStudioOverlay;
  window.closeCreateStudioOverlay = closeCreateStudioOverlay;
})();

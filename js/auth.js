(function () {
  const loginForm = document.getElementById("loginForm");
  const passwordInput = document.getElementById("passwordInput");
  const togglePassword = document.getElementById("togglePassword");
  const ssoButtons = Array.from(document.querySelectorAll(".sso-btn"));

  let roleModal = null;
  let cancelRoleModal = null;
  let roleButtons = [];
  let lastFocusedBeforeModal = null;

  function ensureRoleModal() {
    if (roleModal) return roleModal;
    const markup = `
      <div class="role-modal-backdrop" id="roleModal">
        <section class="role-modal" role="dialog" aria-modal="true" aria-labelledby="roleModalTitle">
          <h3 id="roleModalTitle">Demo Sign In</h3>
          <p>This is a prototype demo. Which role do you want to sign in as?</p>
          <div class="role-list">
            <button type="button" class="role-btn active-role" data-role="supervisor">FX Supervisor</button>
            <button type="button" class="role-btn active-role" data-role="artist">FX Artist</button>
            <button type="button" class="role-btn" disabled>Producer <small>Coming soon</small></button>
            <button type="button" class="role-btn" disabled>Admin <small>Coming soon</small></button>
            <button type="button" class="role-btn" disabled>Client <small>Coming soon</small></button>
            <button type="button" class="role-btn" disabled>Head of FX <small>Coming soon</small></button>
            <button type="button" class="role-btn" disabled>CG Head <small>Coming soon</small></button>
          </div>
          <div class="role-actions">
            <button type="button" class="cancel-btn" id="cancelRoleModal">Cancel</button>
          </div>
        </section>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", markup);
    roleModal = document.getElementById("roleModal");
    cancelRoleModal = document.getElementById("cancelRoleModal");
    roleButtons = Array.from(roleModal.querySelectorAll(".role-btn.active-role"));

    if (cancelRoleModal) {
      cancelRoleModal.addEventListener("click", closeRoleModal);
    }

    roleModal.addEventListener("click", function (event) {
      if (event.target === roleModal) closeRoleModal();
    });

    roleModal.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRoleModal();
        return;
      }
      if (event.key !== "Tab") return;
      const modalRoot = roleModal.querySelector(".role-modal");
      if (!modalRoot) return;
      const focusables = Array.from(
        modalRoot.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    roleButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const role = button.getAttribute("data-role");
        if (!role) return;
        persistDemoSession(role);
      });

      button.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const role = button.getAttribute("data-role");
        if (!role) return;
        persistDemoSession(role);
      });
    });

    return roleModal;
  }

  function openRoleModal() {
    ensureRoleModal();
    if (!roleModal) return;
    lastFocusedBeforeModal = document.activeElement;
    roleModal.removeAttribute("hidden");
    if (roleButtons.length) roleButtons[0].focus();
  }

  function closeRoleModal() {
    if (!roleModal) return;
    roleModal.setAttribute("hidden", "hidden");
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
      lastFocusedBeforeModal.focus();
    }
  }

  function routeForRole(role) {
    if (role === "supervisor") {
      return {
        profile: { name: "Sarah Chen", role: "supervisor", department: "FX" },
        redirectTo: "../../index.html?fromLogin=1"
      };
    }
    return {
      profile: { name: "Maya Patel", role: "artist", department: "FX" },
      redirectTo: "../../index.html?fromLogin=1"
    };
  }

  function persistDemoSession(role) {
    const session = routeForRole(role);
    localStorage.setItem("frameshift.currentUser", JSON.stringify(session.profile));
    localStorage.setItem("frameshift.authRole", role);
    window.location.href = session.redirectTo;
  }

  if (togglePassword && passwordInput) {
    togglePassword.addEventListener("click", function () {
      const isMasked = passwordInput.type === "password";
      passwordInput.type = isMasked ? "text" : "password";
      togglePassword.setAttribute("aria-label", isMasked ? "Hide password" : "Show password");
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      openRoleModal();
    });
  }

  ssoButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      openRoleModal();
    });
  });
})();

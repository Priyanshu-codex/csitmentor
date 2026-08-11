    // CSP-safe bridge for this legacy single-file app. It lifts inline event
    // attributes into data attributes, removes the blocked inline handlers, and
    // then runs the same code from normal delegated listeners.
    (function installCspSafeInlineHandlers() {
      const eventNames = ['click', 'keydown', 'change', 'input', 'focus', 'blur', 'mouseover', 'mouseout'];
      const attrNames = eventNames.map(name => 'on' + name);

      function dataNameFor(eventName) {
        return 'cspOn' + eventName.charAt(0).toUpperCase() + eventName.slice(1);
      }

      function dataAttrFor(dataName) {
        return 'data-' + dataName.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
      }

      function liftHandlers(root) {
        if (!root || root.nodeType !== 1) return;
        const selector = attrNames.map(name => '[' + name + ']').join(',');
        const nodes = [root, ...root.querySelectorAll(selector)];
        nodes.forEach(node => {
          attrNames.forEach(attrName => {
            if (!node.hasAttribute(attrName)) return;
            const eventName = attrName.slice(2);
            node.dataset[dataNameFor(eventName)] = node.getAttribute(attrName);
            node.removeAttribute(attrName);
          });
        });
      }

      function runLiftedHandler(eventName, event) {
        const dataName = dataNameFor(eventName);
        const target = event.target && event.target.closest ? event.target.closest('[' + dataAttrFor(dataName) + ']') : null;
        if (!target) return;
        const code = target.dataset[dataName];
        if (!code) return;
        const result = Function('event', code).call(target, event);
        if (result === false) {
          event.preventDefault();
          event.stopPropagation();
        }
      }

      eventNames.forEach(eventName => {
        document.addEventListener(eventName, event => runLiftedHandler(eventName, event), true);
      });

      liftHandlers(document.documentElement);
      new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(liftHandlers));
      }).observe(document.documentElement, { childList: true, subtree: true });
    })();
    // ══════════════════════════════════════════════════════
    //  MOBILE SIDEBAR  (defined first — used by navigate())
    // ══════════════════════════════════════════════════════
    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        sidebar.classList.add('open');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
      }
    }

    function closeSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      if (!sidebar) return;
      sidebar.classList.remove('open');
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    // ══════════════════════════════════════════════════════
    //  CONFIGURATION
    //  Change API_BASE to match your backend URL.
    //  For local dev: 'http://localhost:5000/api'
    //  For production: 'https://yourdomain.com/api'
    // ══════════════════════════════════════════════════════
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:5000/api'
      : '/api';  // Same-origin in production (Nginx/Caddy proxies /api)

    // ── JWT helpers (decode only — signing happens server-side) ──────────────────
    function parseJWT(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(base64));
      } catch { return null; }
    }

    function isTokenValid(token) {
      const payload = parseJWT(token);
      if (!payload) return false;
      // JWT exp is in seconds
      return payload.exp * 1000 > Date.now();
    }

    // Validate inputs (client-side pre-checks before hitting API)
    function validateEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    function validatePassword(pw) {
      return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
    }

    let currentUser = null;
    let sessionTimer = null;
    let allUsers = []; // cache for admin user management
    let isApplyingRoute = false;

    // Real session storage (token only — user data fetched from API)
    const SESSION = {
      set(token) { sessionStorage.setItem('csit_jwt', token); },
      get() { return sessionStorage.getItem('csit_jwt'); },
      clear() { sessionStorage.removeItem('csit_jwt'); }
    };

    function getActivePanelId() {
      const activePanel = document.querySelector('.panel.active');
      return activePanel ? activePanel.id.replace('panel-', '') : 'dashboard';
    }

    function isAuthOverlayVisible() {
      const overlay = document.getElementById('auth-overlay');
      return !!overlay && !overlay.classList.contains('hidden');
    }

    function isAppVisible() {
      const app = document.getElementById('app');
      return !!app && app.classList.contains('visible');
    }

    function normalizeRoute(route = {}) {
      if (route.screen === 'about-app') {
        return {
          screen: 'about-app',
        };
      }

      if (route.screen === 'auth') {
        return {
          screen: 'auth',
          tab: ['signup', 'login', 'forgot', 'reset-password'].includes(route.tab) ? route.tab : 'login',
          token: route.token || '',
        };
      }

      if (route.screen === 'app') {
        return {
          screen: 'app',
          panel: route.panel || 'dashboard',
          studentId: route.studentId || '',
          studentName: route.studentName || '',
        };
      }

      return {
        screen: 'landing',
        hash: typeof route.hash === 'string' ? route.hash : window.location.hash,
      };
    }

    function buildUrlForRoute(route) {
      const normalized = normalizeRoute(route);
      const url = new URL(window.location.href);

      ['screen', 'tab', 'panel', 'student', 'token'].forEach(key => url.searchParams.delete(key));

      if (normalized.screen === 'about-app') {
        url.searchParams.set('screen', 'about-app');
        url.hash = '';
      } else if (normalized.screen === 'auth') {
        url.searchParams.set('screen', 'auth');
        url.searchParams.set('tab', normalized.tab);
        if (normalized.token) url.searchParams.set('token', normalized.token);
        url.hash = '';
      } else if (normalized.screen === 'app') {
        url.searchParams.set('screen', 'app');
        url.searchParams.set('panel', normalized.panel);
        if (normalized.studentId) url.searchParams.set('student', normalized.studentId);
        url.hash = '';
      } else {
        url.hash = normalized.hash || '';
      }

      const query = url.searchParams.toString();
      return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
    }

    function parseRouteFromLocation() {
      const params = new URLSearchParams(window.location.search);
      const screen = params.get('screen');

      if (screen === 'about-app') {
        return {
          screen: 'about-app',
        };
      }

      if (screen === 'auth') {
        const tab = params.get('tab');
        return {
          screen: 'auth',
          tab: ['signup', 'login', 'forgot', 'reset-password'].includes(tab) ? tab : 'login',
          token: params.get('token') || '',
        };
      }

      if (screen === 'app') {
        return {
          screen: 'app',
          panel: params.get('panel') || 'dashboard',
          studentId: params.get('student') || '',
        };
      }

      return {
        screen: 'landing',
        hash: window.location.hash,
      };
    }

    function commitRoute(route, historyMode = 'push') {
      if (historyMode === 'none') return;

      const normalized = normalizeRoute(route);
      const state = { __mentorDiaryRoute: true, route: normalized };
      const method = historyMode === 'replace' ? 'replaceState' : 'pushState';

      window.history[method](state, '', buildUrlForRoute(normalized));
    }

    async function applyRoute(route, options = {}) {
      const historyMode = options.historyMode || 'none';
      const normalized = normalizeRoute(route);

      if (historyMode !== 'none') {
        commitRoute(normalized, historyMode);
      }

      isApplyingRoute = true;

      try {
        if (normalized.screen === 'about-app') {
          document.getElementById('auth-overlay').classList.add('hidden');
          document.getElementById('app').classList.remove('visible');
          hideLandingPage();
          showAboutPage();
          return;
        }

        if (normalized.screen === 'landing') {
          hideAboutPage();
          document.getElementById('auth-overlay').classList.add('hidden');
          document.getElementById('app').classList.remove('visible');
          showLandingPage();
          return;
        }

        if (normalized.screen === 'auth') {
          hideAboutPage();
          showAuthOverlay(normalized.tab, { historyMode: 'none', token: normalized.token });
          return;
        }

        if (!currentUser) {
          hideAboutPage();
          showAuthOverlay('login', { historyMode: 'none' });
          if (historyMode === 'none') {
            commitRoute({ screen: 'auth', tab: 'login' }, 'replace');
          }
          return;
        }

        hideLandingPage();
        hideAboutPage();
        document.getElementById('auth-overlay').classList.add('hidden');
        document.getElementById('app').classList.add('visible');

        if (currentUser.role !== 'student') {
          if (normalized.studentId) {
            await openStudentProfile(normalized.studentId, normalized.studentName || '', normalized.panel, { historyMode: 'none' });
            return;
          }

          if (selectedStudentId) {
            clearStudentContext({ historyMode: 'none', targetPanel: normalized.panel || 'dashboard' });
            return;
          }
        }

        navigate(normalized.panel || 'dashboard', { historyMode: 'none' });
      } finally {
        isApplyingRoute = false;
      }
    }

    // ── Core API fetch wrapper ────────────────────────────────────────────────────
    async function api(method, path, body = null, useAuth = true) {
      const headers = { 'Content-Type': 'application/json' };
      if (useAuth) {
        const token = SESSION.get();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      const opts = { method, headers, credentials: 'include' };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(API_BASE + path, opts);
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    }

    // ══════════════════════════════════════════════════════
    //  AUTH FUNCTIONS — wired to real backend
    // ══════════════════════════════════════════════════════
    let selectedRole = 'student';

    function selectRole(role) {
      selectedRole = role;
      document.querySelectorAll('.role-chip').forEach(c => c.classList.remove('active'));
      document.querySelector(`[data-role="${role}"]`).classList.add('active');
      document.getElementById('admin-key-group').style.display = role === 'admin' ? 'block' : 'none';
      document.getElementById('mentor-key-group').style.display = role === 'mentor' ? 'block' : 'none';
    }

    function switchAuthTab(tab, options = {}) {
      const isHeaderTab = ['login', 'signup'].includes(tab);
      document.querySelectorAll('.auth-tab').forEach((t, i) => {
        t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'signup'));
        t.style.display = isHeaderTab ? '' : 'none';
      });

      // Show/hide sub panels
      document.getElementById('login-panel').style.display = tab === 'login' ? 'block' : 'none';
      document.getElementById('signup-panel').style.display = tab === 'signup' ? 'block' : 'none';
      document.getElementById('forgot-panel').style.display = tab === 'forgot' ? 'block' : 'none';
      document.getElementById('reset-password-panel').style.display = tab === 'reset-password' ? 'block' : 'none';

      document.getElementById('login-panel').classList.toggle('active', tab === 'login');
      document.getElementById('signup-panel').classList.toggle('active', tab === 'signup');
      document.getElementById('forgot-panel').classList.toggle('active', tab === 'forgot');
      document.getElementById('reset-password-panel').classList.toggle('active', tab === 'reset-password');

      if (isAuthOverlayVisible() && !isApplyingRoute) {
        const routeObj = { screen: 'auth', tab };
        if (options.token) routeObj.token = options.token;
        commitRoute(routeObj, options.historyMode || 'push');
      }
    }

    function hideLandingPage() {
      document.getElementById('landing-page').classList.add('hidden');
    }

    function showLandingPage() {
      document.getElementById('landing-page').classList.remove('hidden');
    }

    function showForgotOverlay() {
      document.getElementById('forgot-email').value = '';
      document.getElementById('forgot-msg').textContent = '';
      document.getElementById('forgot-msg').className = 'auth-msg';
      showAuthOverlay('forgot');
    }
    window.showForgotOverlay = showForgotOverlay;

    function showResetPasswordOverlay(token) {
      document.getElementById('reset-token-value').value = token || '';
      document.getElementById('reset-new-password').value = '';
      document.getElementById('reset-confirm-password').value = '';
      document.getElementById('reset-password-msg').textContent = '';
      document.getElementById('reset-password-msg').className = 'auth-msg';
      
      // Reset strength indicator
      document.getElementById('password-strength-bar').style.width = '0';
      document.getElementById('password-strength-bar').style.backgroundColor = 'var(--error)';
      document.getElementById('password-strength-text').textContent = 'Strength: Empty';
      
      // Hide login back button until success
      document.getElementById('btn-reset-back-login').style.display = 'none';
      document.getElementById('btn-reset-submit').style.display = 'block';

      showAuthOverlay('reset-password', { token });
    }
    window.showResetPasswordOverlay = showResetPasswordOverlay;

    function showAuthOverlay(tab = 'login', options = {}) {
      hideLandingPage();
      switchAuthTab(tab, { historyMode: 'none', token: options.token });
      document.getElementById('auth-overlay').classList.remove('hidden');

      if (!isApplyingRoute) {
        commitRoute({ screen: 'auth', tab, token: options.token }, options.historyMode || 'push');
      }

      let focusId = 'login-email';
      if (tab === 'signup') focusId = 'signup-name';
      if (tab === 'forgot') focusId = 'forgot-email';
      if (tab === 'reset-password') focusId = 'reset-new-password';

      const focusEl = document.getElementById(focusId);
      if (focusEl) setTimeout(() => focusEl.focus(), 120);
    }

    // Show the auth overlay on the Register tab so admins can create new accounts
    function showAddUserOverlay() {
      selectRole('student');
      document.getElementById('signup-name').value = '';
      document.getElementById('signup-email').value = '';
      document.getElementById('signup-password').value = '';
      document.getElementById('admin-key').value = '';
      document.getElementById('mentor-key').value = '';
      document.getElementById('signup-msg').textContent = '';
      document.getElementById('signup-msg').className = 'auth-msg';
      showAuthOverlay('signup');
    }

    function showAuthMsg(panelId, msg, type) {
      const el = document.getElementById(panelId);
      el.textContent = msg; el.className = 'auth-msg ' + type;
    }

    async function handleLogin() {
      const email = document.getElementById('login-email').value.trim();
      const pw = document.getElementById('login-password').value;

      if (!validateEmail(email)) { showAuthMsg('login-msg', '⚠ Please enter a valid email address.', 'error'); return; }
      if (!pw) { showAuthMsg('login-msg', '⚠ Password is required.', 'error'); return; }

      const btn = document.querySelector('#login-panel .btn-primary');
      btn.textContent = 'Signing in...'; btn.disabled = true;

      try {
        const { ok, data } = await api('POST', '/auth/login', { email, password: pw }, false);
        if (!ok) {
          showAuthMsg('login-msg', '❌ ' + (data.message || 'Invalid credentials.'), 'error');
          return;
        }
        SESSION.set(data.token);
        currentUser = data.user;
        await initApp();
      } catch (err) {
        showAuthMsg('login-msg', '⚠ Cannot reach server. Is the backend running?', 'error');
        console.error(err);
      } finally {
        btn.textContent = 'Secure Sign In'; btn.disabled = false;
      }
    }

    async function handleForgotPassword() {
      const email = document.getElementById('forgot-email').value.trim();
      if (!validateEmail(email)) {
        showAuthMsg('forgot-msg', '⚠ Please enter a valid email address.', 'error');
        return;
      }

      const btn = document.getElementById('btn-forgot-submit');
      const originalText = btn.textContent;
      btn.textContent = 'Sending link...';
      btn.disabled = true;

      try {
        const { ok, data } = await api('POST', '/auth/forgot-password', { email }, false);
        if (!ok) {
          showAuthMsg('forgot-msg', '❌ ' + (data.message || 'Verification failed.'), 'error');
          return;
        }
        showAuthMsg('forgot-msg', '✅ ' + data.message, 'success');
        document.getElementById('forgot-email').value = '';
      } catch (err) {
        showAuthMsg('forgot-msg', '⚠ Connection failed. Is the server online?', 'error');
        console.error(err);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
    window.handleForgotPassword = handleForgotPassword;

    async function handleResetPassword() {
      const token = document.getElementById('reset-token-value').value;
      const newPassword = document.getElementById('reset-new-password').value;
      const confirmPassword = document.getElementById('reset-confirm-password').value;

      if (!token) {
        showAuthMsg('reset-password-msg', '❌ Missing token. Please use the link in your email.', 'error');
        return;
      }

      // Strong validation matching backend rules
      const hasLength = newPassword.length >= 8;
      const hasUpper = /[A-Z]/.test(newPassword);
      const hasLower = /[a-z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

      if (!hasLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        showAuthMsg('reset-password-msg', '⚠ Password must be 8+ chars and contain uppercase, lowercase, number, and special character.', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showAuthMsg('reset-password-msg', '⚠ Confirm password does not match.', 'error');
        return;
      }

      const btn = document.getElementById('btn-reset-submit');
      const originalText = btn.textContent;
      btn.textContent = 'Updating password...';
      btn.disabled = true;

      try {
        const { ok, data } = await api('POST', `/auth/reset-password/${token}`, { password: newPassword }, false);
        if (!ok) {
          showAuthMsg('reset-password-msg', '❌ ' + (data.message || 'Reset failed.'), 'error');
          return;
        }
        
        showAuthMsg('reset-password-msg', '✅ ' + data.message + ' Redirecting to login...', 'success');
        
        // Success state UI modifications
        document.getElementById('reset-new-password').value = '';
        document.getElementById('reset-confirm-password').value = '';
        btn.style.display = 'none';
        document.getElementById('btn-reset-back-login').style.display = 'block';

        // Auto redirect after 2 seconds
        setTimeout(() => {
          // Verify we are still on the auth screen/overlay before redirecting
          if (isAuthOverlayVisible()) {
            switchAuthTab('login', { historyMode: 'replace' });
          }
        }, 2000);
      } catch (err) {
        showAuthMsg('reset-password-msg', '⚠ Server connection failed.', 'error');
        console.error(err);
      } finally {
        btn.textContent = originalText;
        if (btn.style.display !== 'none') btn.disabled = false;
      }
    }
    window.handleResetPassword = handleResetPassword;

    window.validatePasswordStrength = function(pw) {
      let score = 0;
      if (pw.length >= 8) score++;
      if (/[A-Z]/.test(pw)) score++;
      if (/[a-z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;

      const bar = document.getElementById('password-strength-bar');
      const text = document.getElementById('password-strength-text');
      
      let width = '0%';
      let color = 'var(--error)';
      let status = 'Empty';

      if (pw.length > 0) {
        if (score <= 2) {
          width = '33%';
          color = '#e74c3c';
          status = 'Weak';
        } else if (score <= 4) {
          width = '66%';
          color = '#f39c12';
          status = 'Medium';
        } else {
          width = '100%';
          color = 'var(--success)';
          status = 'Strong';
        }
      }

      bar.style.width = width;
      bar.style.backgroundColor = color;
      text.textContent = `Strength: ${status}`;
    };

    window.togglePasswordVisibility = function(inputId, btn) {
      const input = document.getElementById(inputId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'HIDE';
      } else {
        input.type = 'password';
        btn.textContent = 'SHOW';
      }
    };

    async function handleSignup() {
      const name = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const pw = document.getElementById('signup-password').value;
      const adminKey = document.getElementById('admin-key').value;
      const mentorKey = document.getElementById('mentor-key').value;

      if (!name) { showAuthMsg('signup-msg', '⚠ Name is required.', 'error'); return; }
      if (!validateEmail(email)) { showAuthMsg('signup-msg', '⚠ Invalid email address.', 'error'); return; }
      if (!validatePassword(pw)) { showAuthMsg('signup-msg', '⚠ Password must be 8+ chars with uppercase and number.', 'error'); return; }

      const btn = document.querySelector('#signup-panel .btn-primary');
      btn.textContent = 'Creating account...'; btn.disabled = true;

      try {
        const body = { name, email, password: pw, role: selectedRole };
        if (selectedRole === 'admin') {
          body.adminKey = adminKey;
          body.adminRegistrationKey = adminKey;
        } else if (selectedRole === 'mentor') {
          body.mentorRegistrationKey = mentorKey;
        }

        const { ok, data } = await api('POST', '/auth/register', body, false);
        if (!ok) {
          showAuthMsg('signup-msg', '❌ ' + (data.message || 'Registration failed.'), 'error');
          return;
        }
        showAuthMsg('signup-msg', '✅ Account created successfully!', 'success');
        // If an admin triggered this from User Management, close overlay and refresh the list
        if (currentUser) {
          setTimeout(() => {
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('signup-name').value = '';
            document.getElementById('signup-email').value = '';
            document.getElementById('signup-password').value = '';
            document.getElementById('signup-msg').className = 'auth-msg';
            renderUserMgmt();
            navigate('user-mgmt', { historyMode: 'replace' });
          }, 1200);
        } else {
          setTimeout(() => switchAuthTab('login', { historyMode: 'replace' }), 1500);
        }
      } catch (err) {
        showAuthMsg('signup-msg', '⚠ Cannot reach server. Is the backend running?', 'error');
        console.error(err);
      } finally {
        btn.textContent = 'Create Account'; btn.disabled = false;
      }
    }

    async function handleLogout() {
      try { await api('POST', '/auth/logout'); } catch (_) { }
      SESSION.clear(); currentUser = null;
      selectedStudentId = null;
      selectedStudentName = '';
      _myStudentsCache = null;
      _allRecordsCache = null;
      clearTimeout(sessionTimer);
      document.getElementById('app').classList.remove('visible');
      document.getElementById('auth-overlay').classList.add('hidden');
      showLandingPage();
      switchAuthTab('login');
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
      document.getElementById('login-msg').className = 'auth-msg';
      commitRoute({ screen: 'landing' }, 'replace');
    }

    async function initApp(options = {}) {
      hideLandingPage();
      document.getElementById('auth-overlay').classList.add('hidden');
      document.getElementById('app').classList.add('visible');

      const avatarEl = document.getElementById('user-avatar');
      avatarEl.textContent = currentUser.name.charAt(0).toUpperCase();
      avatarEl.className = 'user-avatar ' + currentUser.role;
      document.getElementById('user-name').textContent = currentUser.name;
      const roleEl = document.getElementById('user-role');
      roleEl.textContent = currentUser.role.toUpperCase();
      roleEl.className = 'role-tag role-' + currentUser.role;

      // Session expiry from real JWT
      const payload = parseJWT(SESSION.get());
      if (payload) {
        const expDate = new Date(payload.exp * 1000);
        document.getElementById('expiry-time').textContent = expDate.toLocaleString();
        const remaining = payload.exp * 1000 - Date.now();
        clearTimeout(sessionTimer); // clear any previous timer before setting a new one
        sessionTimer = setTimeout(() => {
          alert('Your session has expired. You will be logged out.');
          handleLogout();
        }, remaining);
      }

      setupSidebar();
      setupDashboard();
      await renderAllPanels();
      updateSaveButtonsForRole();

      const initialRoute = options.initialRoute;
      const routeToApply = initialRoute && initialRoute.screen === 'app'
        ? initialRoute
        : { screen: 'app', panel: 'dashboard' };

      await applyRoute(routeToApply, { historyMode: 'replace' });
    }

    // Check for existing valid session on load
    window.addEventListener('load', async () => {
      console.log(
        "%cCSIT Mentor Diary\n%cDeveloped by Priyanshu Mahobia",
        "font-weight: bold; font-size: 16px; color: #c9a84c;",
        "font-size: 12px; color: #0d1b2a;"
      );
      const initialRoute = parseRouteFromLocation();

      // Check if this is a password reset URL loaded directly
      if (initialRoute.screen === 'auth' && initialRoute.tab === 'reset-password' && initialRoute.token) {
        SESSION.clear();
        showResetPasswordOverlay(initialRoute.token);
        return;
      }

      const token = SESSION.get();
      if (token && isTokenValid(token)) {
        try {
          const { ok, data } = await api('GET', '/auth/me');
          if (ok) {
            currentUser = data.user;
            await initApp({ initialRoute });
            return;
          }
        } catch (_) { }
      }
      SESSION.clear();
      const publicRoute = initialRoute.screen === 'app' ? { screen: 'auth', tab: 'login' } : initialRoute;
      await applyRoute(publicRoute, { historyMode: 'replace' });
    });

    window.addEventListener('popstate', event => {
      const route = event.state && event.state.__mentorDiaryRoute
        ? event.state.route
        : parseRouteFromLocation();

      applyRoute(route, { historyMode: 'none' });
    });

    // ══════════════════════════════════════════════════════
    //  ROLE-BASED ACCESS
    // ══════════════════════════════════════════════════════
    const ACCESS = {
      admin: ['dashboard', 'mentor-profile', 'objectives', 'roles', 'parameters', 'personal', 'family', 'academic-cred', 'prizes', 'academic-rec', 'participation', 'performance', 'improvement', 'interaction', 'effectiveness', 'overall-score', 'user-mgmt', 'deactivated-users', 'assign-mentor', 'all-records', 'about'],
      mentor: ['dashboard', 'mentor-profile', 'objectives', 'roles', 'parameters', 'my-students', 'about'],
      student: ['dashboard', 'objectives', 'roles', 'parameters', 'personal', 'family', 'academic-cred', 'prizes', 'academic-rec', 'participation', 'performance', 'improvement', 'interaction', 'effectiveness', 'overall-score', 'about'],
    };

    const STUDENT_PANEL_CONTENT_AREAS = {
      'personal': ['personal-content'],
      'family': ['family-content'],
      'academic-cred': ['academic-cred-content'],
      'prizes': ['prizes-content', 'cocurricular-content'],
      'academic-rec': ['academic-rec-content'],
      'participation': ['participation-content'],
      'performance': ['performance-content'],
      'improvement': ['improvement-content'],
      'interaction': ['interaction-content'],
      'effectiveness': ['effectiveness-content'],
      'overall-score': ['overall-score-content'],
    };

    function canAccess(panelId) {
      if (!currentUser) return false;
      const baseAccess = (ACCESS[currentUser.role] || []).includes(panelId);
      if (baseAccess) return true;
      // Mentors can access student data panels when a student is selected
      if (currentUser.role === 'mentor' && STUDENT_DATA_PANELS.has(panelId) && selectedStudentId) return true;
      return false;
    }

    function clearTransientPanelState(panelId) {
      const panel = document.getElementById('panel-' + panelId);
      if (!panel) return;
      panel.querySelectorAll('.access-denied[data-transient="true"]').forEach(el => el.remove());
    }

    function showStudentSelectionPlaceholder(panelId) {
      const contentIds = STUDENT_PANEL_CONTENT_AREAS[panelId] || [];
      if (!contentIds.length) return false;

      const listPanel = currentUser.role === 'admin' ? 'all-records' : 'my-students';
      const listLabel = currentUser.role === 'admin' ? 'All Student Records' : 'My Students';
      const placeholder = `
    <div class="access-denied" data-transient="true" style="padding:32px 24px;">
      <div class="lock">&#x1F464;</div>
      <h3>No Student Selected</h3>
      <p style="max-width:320px;">Please select a student first, then open their profile sections.</p>
      <button onclick="navigate('${listPanel}')" style="margin-top:18px;background:var(--navy);color:var(--gold);border:none;padding:10px 24px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;">
        Go to ${listLabel} &#x2192;
      </button>
    </div>`;

      contentIds.forEach((contentId, index) => {
        const container = document.getElementById(contentId);
        if (!container) return;
        container.innerHTML = index === 0 ? placeholder : '';
      });

      return true;
    }

    function setupSidebar() {
      document.getElementById('admin-section').style.display = currentUser.role === 'admin' ? 'block' : 'none';
      document.getElementById('mentor-section').style.display = currentUser.role === 'mentor' ? 'block' : 'none';

      if (currentUser.role === 'mentor') {
        // Mentors access student data only via "My Students" → openStudentProfile().
        // Hide the student-data nav items so mentors don't think these are their own forms.
        STUDENT_DATA_PANELS.forEach(panelId => {
          const btn = document.getElementById('nav-' + panelId);
          if (btn) btn.style.display = 'none';
        });
      }
      // Lock or hide inaccessible nav items
      document.querySelectorAll('.nav-item[id]').forEach(btn => {
        const id = btn.id.replace('nav-', '');
        if (!canAccess(id)) {
          // For students: fully hide nav items they can't use (cleaner than greyed-out)
          if (currentUser.role === 'student') {
            btn.style.display = 'none';
          } else {
            btn.classList.add('locked');
          }
        } else {
          btn.classList.remove('locked');
          btn.style.display = '';
        }
      });
    }

    async function setupDashboard() {
      const role = currentUser.role;

      // Default static stats
      const statsHtml = {
        admin: `<div class="stat-card gold"><div class="stat-num" id="stat-users">…</div><div class="stat-label">Total Users</div></div>
            <div class="stat-card green"><div class="stat-num">8</div><div class="stat-label">Semesters</div></div>
            <div class="stat-card blue"><div class="stat-num">10</div><div class="stat-label">Assessment Params</div></div>
            <div class="stat-card purple"><div class="stat-num">6</div><div class="stat-label">Rubric Criteria</div></div>`,
        mentor: `<div class="stat-card gold"><div class="stat-num" id="stat-students">…</div><div class="stat-label">Assigned Students</div></div>
             <div class="stat-card green"><div class="stat-num">8</div><div class="stat-label">Semesters</div></div>
             <div class="stat-card blue"><div class="stat-num">10</div><div class="stat-label">Assessment Params</div></div>`,
        student: `<div class="stat-card gold"><div class="stat-num">8</div><div class="stat-label">Semesters</div></div>
              <div class="stat-card green"><div class="stat-num">10</div><div class="stat-label">Assessment Params</div></div>
              <div class="stat-card blue"><div class="stat-num">6</div><div class="stat-label">Rubric Criteria</div></div>`,
      };
      document.getElementById('stats-grid').innerHTML = statsHtml[role] || '';

      // Fetch live counts from API
      try {
        if (role === 'admin') {
          const { ok, data } = await api('GET', '/users');
          if (ok && document.getElementById('stat-users')) {
            document.getElementById('stat-users').textContent = data.count || 0;
          }
        } else if (role === 'mentor') {
          const { ok, data } = await api('GET', '/records');
          if (ok && document.getElementById('stat-students')) {
            document.getElementById('stat-students').textContent = data.count || 0;
          }
        }
      } catch (_) { /* stats remain as "…" */ }

      const welcomeHtml = {
        admin: '<div style="background:#edf7f1;border-radius:10px;padding:14px 18px;font-size:13.5px;color:#1a6e3f;border-left:4px solid var(--success);">🔑 <strong>Admin Access:</strong> You have full system access — manage users, view all student records, and oversee all mentor activities. Data is persisted in <strong>MongoDB</strong>.</div>',
        mentor: '<div style="background:#e8f4fc;border-radius:10px;padding:14px 18px;font-size:13.5px;color:#1a5276;border-left:4px solid #2980b9;">👤 <strong>Mentor Access:</strong> You can manage your assigned students, update records, and track their academic progress across all semesters.</div>',
        student: '<div style="background:#f3eafc;border-radius:10px;padding:14px 18px;font-size:13.5px;color:#5b2c8d;border-left:4px solid #8e44ad;">🎓 <strong>Student Access:</strong> Use the cards below to fill in your personal, family, and academic data. All changes are saved directly to the database.</div>',
      };
      document.getElementById('role-welcome').innerHTML = welcomeHtml[role] || '';

      // Student quick-access: show clickable cards to fill their own data
      const quickAccess = document.getElementById('student-quick-access');
      if (quickAccess) {
        if (role === 'student') {
          const sections = [
            { id: 'personal', icon: '🪪', label: 'Personal Profile' },
            { id: 'family', icon: '👨‍👩‍👧', label: 'Family Profile' },
            { id: 'academic-cred', icon: '🎓', label: 'Credentials' },
            { id: 'prizes', icon: '🏆', label: 'Prizes & Activities' },
            { id: 'academic-rec', icon: '📈', label: 'Academic Records' },
            { id: 'participation', icon: '🌟', label: 'Participation' },
          ];
          quickAccess.innerHTML = `
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:10px;">📋 Enter Your Data</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">
          ${sections.map(s => `
            <button onclick="navigate('${s.id}')"
              style="background:var(--white);border:1.5px solid var(--border);border-radius:10px;
                     padding:14px 10px;cursor:pointer;text-align:center;transition:all 0.18s;
                     font-size:13px;font-weight:600;color:var(--text);width:100%;"
              onmouseover="this.style.borderColor='var(--gold)';this.style.background='#fffbf0';"
              onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--white)';">
              <div style="font-size:22px;margin-bottom:6px;">${s.icon}</div>${s.label}
            </button>`).join('')}
        </div>`;
          quickAccess.style.display = 'block';
        } else {
          quickAccess.style.display = 'none';
        }
      }
    }

    // ══════════════════════════════════════════════════════
    //  NAVIGATION
    // Panels that hold student-specific data (admin/mentor need a student selected first)
    const STUDENT_DATA_PANELS = new Set([
      'personal', 'family', 'academic-cred', 'prizes',
      'academic-rec', 'participation', 'performance',
      'improvement', 'interaction', 'effectiveness', 'overall-score'
    ]);

    function navigate(panelId, options = {}) {
      const historyMode = options.historyMode || 'push';
      clearTransientPanelState(panelId);

      if (!canAccess(panelId)) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('panel-' + panelId);
        if (panel) {
          panel.classList.add('active');
          if (!panel.querySelector('.access-denied[data-transient="true"]')) {
            const denied = document.createElement('div');
            denied.className = 'access-denied';
            denied.dataset.transient = 'true';
            denied.innerHTML = `<div class="lock">&#x1F512;</div><h3>Access Restricted</h3><p>Your current role (${currentUser.role}) does not have permission to view this section.</p>`;
            panel.appendChild(denied);
          }
        }

        if (!isApplyingRoute) {
          commitRoute({
            screen: 'app',
            panel: panelId,
            studentId: currentUser.role !== 'student' ? (selectedStudentId || '') : '',
            studentName: currentUser.role !== 'student' ? (selectedStudentName || '') : '',
          }, historyMode);
        }

        return;
      }

      // Admin/mentor: must select a student before viewing student data panels
      if (currentUser.role !== 'student' && STUDENT_DATA_PANELS.has(panelId) && !selectedStudentId) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const panel = document.getElementById('panel-' + panelId);
        if (panel) {
          panel.classList.add('active');
          if (!showStudentSelectionPlaceholder(panelId)) {
            const denied = document.createElement('div');
            denied.className = 'access-denied';
            denied.dataset.transient = 'true';
            denied.style.padding = '32px 24px';
            denied.innerHTML = `<div class="lock">&#x1F464;</div><h3>No Student Selected</h3><p style="max-width:320px;">Please select a student first, then open their profile sections.</p>`;
            panel.appendChild(denied);
          }
        }
        const navBtn = document.getElementById('nav-' + panelId);
        if (navBtn) navBtn.classList.add('active');
        if (window.innerWidth <= 768) closeSidebar();

        if (!isApplyingRoute) {
          commitRoute({
            screen: 'app',
            panel: panelId,
            studentId: currentUser.role !== 'student' ? (selectedStudentId || '') : '',
            studentName: currentUser.role !== 'student' ? (selectedStudentName || '') : '',
          }, historyMode);
        }

        return;
      }

      // Hide all panels (reset animation state) then show target with animation
      document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = '';      // clear inline style so CSS .panel{display:none} takes effect
        p.style.animation = 'none'; // reset animation so it replays on next show
      });
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

      const panel = document.getElementById('panel-' + panelId);
      if (panel) {
        clearTransientPanelState(panelId);
        // Two-frame trick: display:block first, then add .active on the next frame
        // so the browser registers the element before the transition fires
        panel.style.display = 'block';
        panel.style.animation = 'none';
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            panel.style.animation = '';
            panel.classList.add('active');
          });
        });
      }

      const navBtn = document.getElementById('nav-' + panelId);
      if (navBtn) navBtn.classList.add('active');
      else if (panelId === 'dashboard') document.querySelector('.nav-item').classList.add('active');

      // Render dynamic panels on navigate
      if (panelId === 'user-mgmt') renderUserMgmt();
      if (panelId === 'deactivated-users') renderDeactivatedUsers();
      if (panelId === 'assign-mentor') renderAssignMentor();
      if (panelId === 'all-records') renderAllRecords(true);
      if (panelId === 'my-students') renderMyStudents(true);

      // Close sidebar on mobile after navigation
      if (window.innerWidth <= 768) closeSidebar();

      if (!isApplyingRoute) {
        commitRoute({
          screen: 'app',
          panel: panelId,
          studentId: currentUser.role !== 'student' ? (selectedStudentId || '') : '',
          studentName: currentUser.role !== 'student' ? (selectedStudentName || '') : '',
        }, historyMode);
      }
    }

    // --- Deactivated Users State Management ---
    let deactivatedFilterRole = '';
    let deactivatedFilterDept = '';
    let deactivatedSearchQuery = '';
    let deactivatedSortOrder = 'newest';
    let deactivatedCurrentPage = 1;
    const deactivatedPageLimit = 8;

    window.toggleDeactivateReasonTextarea = function() {
      const type = document.getElementById('deactivate-reason-type').value;
      const otherContainer = document.getElementById('deactivate-reason-other-container');
      otherContainer.style.display = type === 'Other' ? 'block' : 'none';
    };

    window.closeDeactivateReasonModal = function() {
      document.getElementById('deactivate-reason-modal').style.display = 'none';
      document.getElementById('deactivate-target-userid').value = '';
      document.getElementById('deactivate-target-username').value = '';
      document.getElementById('deactivate-reason-text').value = '';
      document.getElementById('deactivate-reason-type').value = 'Completed Course';
      toggleDeactivateReasonTextarea();
    };

    window.submitDeactivateUser = async function() {
      const userId = document.getElementById('deactivate-target-userid').value;
      const reasonType = document.getElementById('deactivate-reason-type').value;
      const reasonText = document.getElementById('deactivate-reason-text').value.trim();

      if (reasonType === 'Other' && !reasonText) {
        alert('Please specify the reason.');
        return;
      }

      try {
        const { ok, data } = await api('PATCH', `/users/admin/users/${userId}/deactivate`, {
          reasonType,
          reason: reasonText,
        });

        if (!ok) throw new Error(data.message || 'Deactivation failed.');
        
        closeDeactivateReasonModal();
        alert('User deactivated successfully.');
        
        // Refresh User Management list
        if (getActivePanelId() === 'user-mgmt') {
          renderUserMgmt();
        }
      } catch (err) {
        alert('❌ ' + err.message);
      }
    };

    // Override deactivateUser to show modal
    window.deactivateUser = function(userId, name) {
      document.getElementById('deactivate-target-userid').value = userId;
      document.getElementById('deactivate-target-username').value = name;
      document.getElementById('deactivate-reason-modal').style.display = 'flex';
      toggleDeactivateReasonTextarea();
    };

    window.restoreUser = async function(userId, name) {
      if (!confirm(`Restore this user?\n\nRestore: ${name}\n\nCancel | Activate`)) return;
      try {
        const { ok, data } = await api('PATCH', `/users/admin/users/${userId}/activate`);
        if (!ok) throw new Error(data.message || 'Activation failed.');
        alert('User activated successfully!');
        renderDeactivatedUsers();
      } catch (err) {
        alert('❌ ' + err.message);
      }
    };

    window.changeDeactivatedFilter = function(key, val) {
      if (key === 'role') deactivatedFilterRole = val;
      if (key === 'dept') deactivatedFilterDept = val;
      if (key === 'search') deactivatedSearchQuery = val;
      if (key === 'sort') deactivatedSortOrder = val;
      deactivatedCurrentPage = 1;
      renderDeactivatedUsers();
    };

    window.changeDeactivatedPage = function(page) {
      deactivatedCurrentPage = page;
      renderDeactivatedUsers();
    };

    async function renderDeactivatedUsers() {
      const container = document.getElementById('deactivated-users-content');
      if (!container) return;

      container.innerHTML = `
        <div class="card">
          <div class="card-body" style="text-align:center;color:var(--text-muted);padding:40px;">
            <div style="font-size:24px;margin-bottom:12px;">⏳</div>
            <div>Loading deactivated accounts...</div>
          </div>
        </div>`;

      try {
        const queryParams = new URLSearchParams({
          search: deactivatedSearchQuery,
          role: deactivatedFilterRole,
          department: deactivatedFilterDept,
          sort: deactivatedSortOrder,
          page: deactivatedCurrentPage,
          limit: deactivatedPageLimit
        });

        const { ok, data } = await api('GET', `/users/admin/deactivated-users?${queryParams.toString()}`);
        if (!ok) throw new Error(data.message || 'Failed to load deactivated users');

        const users = data.users || [];
        const total = data.total || 0;
        const totalPages = Math.ceil(total / deactivatedPageLimit) || 1;

        let tableRows = '';
        if (users.length === 0) {
          tableRows = `
            <tr>
              <td colspan="12" style="text-align:center;padding:48px var(--card-padding);color:var(--text-muted);">
                <div style="font-size:32px;margin-bottom:12px;">🔍</div>
                <div style="font-weight:600;font-size:15px;color:var(--text);">No Deactivated Users Found</div>
                <div style="font-size:13px;margin-top:4px;">Try adjusting your filters or search terms.</div>
              </td>
            </tr>`;
        } else {
          tableRows = users.map(u => {
            const avatarHtml = u.photoUrl
              ? `<div style="width:36px;height:36px;border-radius:50%;background-image:url('${u.photoUrl}');background-size:cover;background-position:center;border:1.5px solid var(--border);"></div>`
              : `<div style="width:36px;height:36px;border-radius:50%;background:var(--cream);color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:1.5px solid var(--border);">${u.name.charAt(0).toUpperCase()}</div>`;

            return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:10px;">
                    ${avatarHtml}
                    <div style="font-weight:600;color:var(--text);">${u.name}</div>
                  </div>
                </td>
                <td style="font-size:13px;">${u.email}</td>
                <td><span class="tag ${u.role === 'admin' ? 'tag-excellent' : u.role === 'mentor' ? 'tag-good' : 'tag-average'}">${u.role.toUpperCase()}</span></td>
                <td>${u.department || '<span style="color:var(--text-muted);">—</span>'}</td>
                <td>${u.registrationNo || '<span style="color:var(--text-muted);">—</span>'}</td>
                <td>${u.phone || '<span style="color:var(--text-muted);">—</span>'}</td>
                <td style="font-size:12px;color:var(--text-muted);">${new Date(u.createdAt).toLocaleDateString()}</td>
                <td style="font-size:12px;color:var(--text-muted);">${new Date(u.deactivatedAt).toLocaleDateString()}</td>
                <td style="font-size:12px;">
                  <div style="font-weight:600;">${u.deactivatedBy ? u.deactivatedBy.name : 'Admin'}</div>
                  <div style="font-size:10px;color:var(--text-muted);">${u.deactivatedBy ? u.deactivatedBy.email : ''}</div>
                </td>
                <td style="font-size:12px;">
                  <span style="font-weight:600;color:var(--error);">${u.deactivationReasonType}</span>
                  ${u.deactivationReason ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${u.deactivationReason}">${u.deactivationReason}</div>` : ''}
                </td>
                <td><span class="tag" style="background:#fde8e8;color:#e02424;border:1px solid #fbd5d5;font-weight:600;font-size:11px;">DEACTIVATED</span></td>
                <td>
                  <button onclick="restoreUser('${u.id}','${u.name.replace(/'/g, "\\'")}')" class="btn-action" style="padding:6px 14px;background:var(--success);color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;">Activate</button>
                </td>
              </tr>`;
          }).join('');
        }

        // Pagination buttons
        let paginationHtml = '';
        if (totalPages > 1) {
          paginationHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
              <div style="font-size:13px;color:var(--text-muted);">Showing page ${deactivatedCurrentPage} of ${totalPages}</div>
              <div style="display:flex;gap:6px;">
                <button onclick="changeDeactivatedPage(${deactivatedCurrentPage - 1})" ${deactivatedCurrentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} class="btn-info-action" style="padding:6px 12px;font-size:12px;">Previous</button>
                ${Array.from({ length: totalPages }).map((_, idx) => `
                  <button onclick="changeDeactivatedPage(${idx + 1})" class="btn-info-action" style="padding:6px 12px;font-size:12px;font-weight:600;${deactivatedCurrentPage === idx + 1 ? 'background:var(--navy);color:var(--gold);border-color:var(--navy);' : ''}">${idx + 1}</button>
                `).join('')}
                <button onclick="changeDeactivatedPage(${deactivatedCurrentPage + 1})" ${deactivatedCurrentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} class="btn-info-action" style="padding:6px 12px;font-size:12px;">Next</button>
              </div>
            </div>`;
        }

        container.innerHTML = `
          <div class="card" style="margin-bottom:20px;">
            <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
              <div style="flex:1;min-width:200px;position:relative;">
                <input type="text" placeholder="Search by name, email, registration..." value="${deactivatedSearchQuery}" oninput="changeDeactivatedFilter('search', this.value)" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;outline:none;">
              </div>
              <select onchange="changeDeactivatedFilter('role', this.value)" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg-panel);color:var(--text);outline:none;">
                <option value="">All Roles</option>
                <option value="student" ${deactivatedFilterRole === 'student' ? 'selected' : ''}>Student</option>
                <option value="mentor" ${deactivatedFilterRole === 'mentor' ? 'selected' : ''}>Mentor</option>
                <option value="admin" ${deactivatedFilterRole === 'admin' ? 'selected' : ''}>Admin</option>
              </select>
              <select onchange="changeDeactivatedFilter('dept', this.value)" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg-panel);color:var(--text);outline:none;">
                <option value="">All Departments</option>
                <option value="CSE" ${deactivatedFilterDept === 'CSE' ? 'selected' : ''}>CSE</option>
                <option value="IT" ${deactivatedFilterDept === 'IT' ? 'selected' : ''}>IT</option>
                <option value="Civil" ${deactivatedFilterDept === 'Civil' ? 'selected' : ''}>Civil</option>
                <option value="Mechanical" ${deactivatedFilterDept === 'Mechanical' ? 'selected' : ''}>Mechanical</option>
                <option value="Electrical" ${deactivatedFilterDept === 'Electrical' ? 'selected' : ''}>Electrical</option>
                <option value="AI/ML" ${deactivatedFilterDept === 'AI/ML' ? 'selected' : ''}>AI/ML</option>
                <option value="AIDS" ${deactivatedFilterDept === 'AIDS' ? 'selected' : ''}>AIDS</option>
              </select>
              <select onchange="changeDeactivatedFilter('sort', this.value)" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg-panel);color:var(--text);outline:none;">
                <option value="newest" ${deactivatedSortOrder === 'newest' ? 'selected' : ''}>Newest First</option>
                <option value="oldest" ${deactivatedSortOrder === 'oldest' ? 'selected' : ''}>Oldest First</option>
              </select>
            </div>
          </div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">Deactivated Users (${total})</span>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table style="width:100%;min-width:1100px;">
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Registration No</th>
                      <th>Phone</th>
                      <th>Date Joined</th>
                      <th>Deactivated Date</th>
                      <th>Deactivated By</th>
                      <th>Reason</th>
                      <th>Status Badge</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${tableRows}
                  </tbody>
                </table>
              </div>
              ${paginationHtml}
            </div>
          </div>`;
      } catch (err) {
        container.innerHTML = `
          <div class="card">
            <div class="card-body" style="color:var(--error);padding:20px;">
              &#10060; Failed to load deactivated users: ${err.message}
            </div>
          </div>`;
      }
    }


    // ══════════════════════════════════════════════════════
    //  REAL SAVE — collects form data and posts to MongoDB
    // ══════════════════════════════════════════════════════

    // Map panel id → API section name and data collector function
    const SECTION_MAP = {
      'personal': { apiKey: 'personal', collect: collectPersonal },
      'family': { apiKey: 'family', collect: collectFamily },
      'academic-cred': { apiKey: 'academicCredentials', collect: collectAcademicCred },
      'prizes': { apiKey: 'prizes', collect: collectPrizes },
      'academic-rec': { apiKey: 'academicRecords', collect: collectAcademicRec },
      'performance': { apiKey: 'performanceChart', collect: collectPerformanceChart },
      'improvement': { apiKey: 'improvementChart', collect: collectImprovementChart },
      'participation': { apiKey: 'participationRecords', collect: collectParticipation },
      'interaction': { apiKey: 'interactionRecords', collect: collectInteraction },
      'overall-score': { apiKey: 'overallScores', collect: collectOverallScore },
      'mentor-profile': { apiKey: 'mentor-profile', collect: collectMentorProfile },
    };

    // Panels that contain fields belonging to another section (e.g. certifications in academic-cred
    // panel is stored in personal). When saving these panels, also silently save the linked section
    // so none of the cross-panel data is lost.
    const ALSO_SAVE_MAP = {
      'academic-cred': 'personal',  // ac-certs textarea lives here but saves to personal
      'prizes': 'personal',  // p-hobbies textarea lives here but saves to personal
    };

    async function saveSection(event, id) {
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = '⏳ Saving...'; btn.disabled = true;

      try {
        const def = SECTION_MAP[id];
        if (!def) { alert('Unknown section: ' + id); return; }

        let res;
        if (id === 'mentor-profile') {
          const profile = def.collect();
          res = await api('PATCH', `/mentor-profile/me`, { profile });
        } else {
          const target = getRecordTarget();
          if (!target) {
            alert('No student selected. Please open a student profile first.');
            btn.textContent = originalText; btn.disabled = false;
            return;
          }
          const data = def.collect();
          res = await api('PATCH', `/records/${target}/${def.apiKey}`, { data });
        }

        if (!res.ok) throw new Error(res.data.message || 'Save failed');

        // Silently also save any cross-panel section (e.g. certifications / hobbies
        // that live in a different panel but belong to the personal section).
        const alsoId = ALSO_SAVE_MAP[id];
        if (alsoId && id !== 'mentor-profile') {
          const alsoDef = SECTION_MAP[alsoId];
          if (alsoDef) {
            const target2 = getRecordTarget();
            if (target2) {
              // Fire-and-forget: failure is non-critical and shouldn't block the UI
              api('PATCH', `/records/${target2}/${alsoDef.apiKey}`, { data: alsoDef.collect() })
                .catch(err => console.warn(`Silent also-save for "${alsoId}" failed:`, err));
            }
          }
        }

        btn.textContent = '✓ Saved!';
        btn.style.background = 'var(--success)';
        btn.style.borderColor = 'var(--success)';
        btn.style.color = '#fff';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
          btn.style.borderColor = '';
          btn.style.color = '';
          btn.disabled = false;
        }, 2000);
      } catch (err) {
        btn.textContent = '❌ Error — retry';
        btn.style.background = 'var(--error)';
        btn.style.color = '#fff';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
          btn.style.color = '';
          btn.disabled = false;
        }, 2500);
        console.error('Save error:', err);
      }
    }

    // ── Data collectors (read form values) ───────────────────────────────────────
    function collectPersonal() {
      return {
        name: v('p-name'), admissionNo: v('p-admno'), registrationNo: v('p-regno'),
        dateOfBirth: v('p-dob'), age: v('p-age'), bloodGroup: v('p-blood'),
        category: v('p-cat'), personalCell: v('p-cell'), residencePhone: v('p-rphone'),
        email: v('p-email'), address: v('p-addr'),
        branch: v('p-branch'),
        currentSemester: v('p-cursem'),
        certifications: (document.getElementById('ac-certs') || {}).value || '',
        hobbies: (document.getElementById('p-hobbies') || {}).value || '',
        photoUrl: document.getElementById('p-photo-data')?.value || '',
      };
    }

    function collectFamily() {
      return {
        fatherName: v('f-fname'), fatherMobile: v('f-fmob'), fatherOccupation: v('f-focc'),
        fatherEducation: v('f-fedu'), fatherIncome: v('f-finc'),
        motherName: v('f-mname'), motherMobile: v('f-mmob'), motherOccupation: v('f-mocc'),
        motherEducation: v('f-medu'), motherIncome: v('f-minc'),
        noOfSiblings: v('f-siblings'),
        feesPaidBy: v('f-feespaid'), stayingAt: v('f-staying'),
        lgName: v('f-lgname'), lgRelationship: v('f-lgrel'),
        lgContact: v('f-lgcontact'), lgAddress: v('f-lgaddr'),
        siblings: collectIndexedRows('family-siblings-table', ['name', 'relationship', 'education', 'occupation', 'mobile'], 'order'),
      };
    }

    function collectAcademicCred() {
      const table = document.getElementById('ac-cred-table');
      if (!table) return [];

      const rows = [];
      table.querySelectorAll('tbody tr').forEach((tr, index) => {
        const examination = tr.querySelector('input[type="hidden"]')?.value?.trim() || '';
        const inputs = tr.querySelectorAll('input:not([type="hidden"]), select, textarea');
        const row = {
          order: index + 1,
          examination,
          school: inputs[0]?.value.trim() || '',
          board: inputs[1]?.value.trim() || '',
          medium: inputs[2]?.value.trim() || '',
          year: inputs[3]?.value.trim() || '',
          percentage: inputs[4]?.value.trim() || '',
          division: inputs[5]?.value.trim() || '',
        };

        if (['school', 'board', 'medium', 'year', 'percentage', 'division'].some(f => row[f])) {
          rows.push(row);
        }
      });

      return rows;
    }

    function collectPrizes() {
      const cats = ['Academic', 'Co-Curricular', 'Extra-Curricular'];
      const rows = [];
      let sNo = 1;
      cats.forEach(cat => {
        const safeId = cat.replace(/[^a-zA-Z]/g, '-').toLowerCase();
        const tbody = document.getElementById('prizes-tbody-' + safeId);
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
          const category = tr.querySelector('input[type="hidden"]')?.value?.trim() || cat;
          const inputs = tr.querySelectorAll('input:not([type="hidden"]), select, textarea');
          const row = {
            sNo: sNo,
            category,
            institution: inputs[0]?.value.trim() || '',
            activity: inputs[1]?.value.trim() || '',
            prize: inputs[2]?.value.trim() || '',
          };
          if (['institution', 'activity', 'prize'].some(f => row[f])) {
            rows.push(row);
            sNo++;
          }
        });
      });
      return rows;
    }

    function collectAcademicRec() {
      // Each semester spans 3 rows; inputs are tagged with data-sem and data-field attributes.
      const table = document.getElementById('academic-rec-table');
      if (!table) return [];
      const semMap = {};
      table.querySelectorAll('input[data-sem]').forEach(input => {
        const sem = input.getAttribute('data-sem');
        const field = input.getAttribute('data-field');
        if (!semMap[sem]) semMap[sem] = { semester: sem };
        semMap[sem][field] = input.value.trim();
      });
      // Skip completely empty semester entries
      const dataFields = ['monthYear', 'theoryMarks', 'spi', 'practicalPct', 'backlogs', 'att', 'ta', 'ct1', 'ct2'];
      return Object.values(semMap).filter(row =>
        dataFields.some(f => row[f] && row[f] !== '')
      );
    }

    function collectPerformanceChart() {
      return collectIndexedRows('performance-table', ['semester', 'subject', 'performanceCategory', 'attendance', 'classTest', 'ese', 'presentations', 'date']);
    }

    function collectImprovementChart() {
      return collectIndexedRows('improvement-table', ['semester', 'subject', 'performanceCategory', 'attendance', 'classTest', 'ese', 'presentations', 'date']);
    }

    function collectParticipation() {
      return collectIndexedRows('participation-table-body', ['semester', 'date', 'type', 'title', 'venue', 'organizer', 'award', 'details']);
    }

    function collectInteraction() {
      return collectIndexedRows('interaction-table', ['date', 'issueDiscussed', 'tgRemarks', 'followUpDate', 'followUpRemark']);
    }

    function collectOverallScore() {
      const table = document.getElementById('overall-score-table');
      if (!table) return [];

      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const semester = tr.querySelector('input[type="hidden"]')?.value?.trim() || '';
        const inputs = tr.querySelectorAll('input:not([type="hidden"]), select, textarea');
        const row = {
          semester,
          A: inputs[0]?.value.trim() || '',
          B: inputs[1]?.value.trim() || '',
          C: inputs[2]?.value.trim() || '',
          D: inputs[3]?.value.trim() || '',
          E: inputs[4]?.value.trim() || '',
          F: inputs[5]?.value.trim() || '',
          total: inputs[6]?.value.trim() || '',
          performance: inputs[7]?.value.trim() || '',
        };

        if (['A', 'B', 'C', 'D', 'E', 'F', 'total', 'performance'].some(f => row[f])) {
          rows.push(row);
        }
      });

      return rows;
    }

    function collectMentorProfile() {
      return {
        designation: v('mp-designation'), department: v('mp-dept'),
        employeeId: v('mp-empid'), contact: v('mp-contact'),
      };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────
    function v(id) {
      const el = document.getElementById(id);
      return el ? el.value.trim() : '';
    }

    function getSectionRows(containerId) {
      const el = document.getElementById(containerId);
      if (!el) return [];
      if (el.tagName === 'TBODY') {
        return Array.from(el.children).filter(child => child.tagName === 'TR');
      }
      if (el.tagName === 'TABLE') {
        const tbody = el.querySelector('tbody');
        if (!tbody) return [];
        return Array.from(tbody.children).filter(child => child.tagName === 'TR');
      }
      return Array.from(el.querySelectorAll('tr'));
    }

    function collectTableRows(tableId, fields) {
      const rowsInSection = getSectionRows(tableId);
      if (!rowsInSection.length) return [];
      const rows = [];
      rowsInSection.forEach(tr => {
        const inputs = tr.querySelectorAll('input, select, textarea');
        const row = {};
        fields.forEach((f, i) => { if (inputs[i]) row[f] = inputs[i].value.trim(); });
        // Skip completely empty rows (all fields blank) to avoid overwriting saved data with blanks
        const hasData = fields.some(f => row[f] && row[f] !== '');
        if (hasData) rows.push(row);
      });
      return rows;
    }

    function collectIndexedRows(tableId, fields, slotField = 'sNo') {
      const rowsInSection = getSectionRows(tableId);
      if (!rowsInSection.length) return [];

      const rows = [];
      rowsInSection.forEach((tr, index) => {
        const inputs = tr.querySelectorAll('input, select, textarea');
        const row = { [slotField]: index + 1 };
        fields.forEach((f, i) => { if (inputs[i]) row[f] = inputs[i].value.trim(); });
        const hasData = fields.some(f => row[f] && row[f] !== '');
        if (hasData) rows.push(row);
      });
      return rows;
    }

    // ── Student context (admin/mentor select a student; students always = self) ───
    let selectedStudentId = null;   // null until a student is chosen
    let selectedStudentName = '';

    function getRecordTarget() {
      if (currentUser.role === 'student') return 'me';
      return selectedStudentId || null;
    }

    // ── Load saved data and populate form fields ──────────────────────────────────
    async function loadStudentRecord() {
      const target = getRecordTarget();
      if (!target) return null;
      try {
        const { ok, data } = await api('GET', `/records/${target}`);
        if (!ok) return null;
        return data.record;
      } catch (err) {
        console.warn('Could not load student record:', err);
        return null;
      }
    }

    async function loadMentorProfile() {
      try {
        const { ok, data } = await api('GET', `/mentor-profile/me`);
        if (!ok) return null;
        return data.record;
      } catch (err) {
        console.warn('Could not load mentor profile:', err);
        return null;
      }
    }

    function populateField(id, value) {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null) el.value = value;
    }

    function populatePersonal(d) {
      if (!d) return;
      populateField('p-name', d.name); populateField('p-admno', d.admissionNo);
      populateField('p-regno', d.registrationNo); populateField('p-age', d.age);
      populateField('p-blood', d.bloodGroup); populateField('p-cat', d.category);
      populateField('p-cell', d.personalCell); populateField('p-rphone', d.residencePhone);
      populateField('p-email', d.email); populateField('p-addr', d.address);
      populateField('p-branch', d.branch);
      populateField('p-cursem', d.currentSemester);
      if (d.dateOfBirth) populateField('p-dob', d.dateOfBirth.split('T')[0]);
      // Restore certifications textarea (stored in personal section)
      const certsEl = document.getElementById('ac-certs');
      if (certsEl && d.certifications != null) certsEl.value = d.certifications;
      // Restore hobbies textarea (stored in personal section)
      const hobbiesEl = document.getElementById('p-hobbies');
      if (hobbiesEl && d.hobbies != null) hobbiesEl.value = d.hobbies;
      if (d.photoUrl) {
        setProfilePhoto(d.photoUrl);
        // Restore sidebar avatar for the logged-in student
        if (currentUser.role === 'student') updateSidebarAvatar(d.photoUrl);
      }
    }

    function populateFamily(d) {
      if (!d) return;
      populateField('f-fname', d.fatherName); populateField('f-fmob', d.fatherMobile);
      populateField('f-focc', d.fatherOccupation); populateField('f-fedu', d.fatherEducation);
      populateField('f-finc', d.fatherIncome); populateField('f-mname', d.motherName);
      populateField('f-mmob', d.motherMobile); populateField('f-mocc', d.motherOccupation);
      populateField('f-medu', d.motherEducation); populateField('f-minc', d.motherIncome);
      populateField('f-feespaid', d.feesPaidBy); populateField('f-staying', d.stayingAt);
      populateField('f-lgname', d.lgName); populateField('f-lgrel', d.lgRelationship);
      populateField('f-lgcontact', d.lgContact); populateField('f-lgaddr', d.lgAddress);
      // Restore sibling count field and sibling detail rows
      populateField('f-siblings', d.noOfSiblings != null ? d.noOfSiblings : (d.siblings ? d.siblings.length : ''));
      populateIndexedRows('family-siblings-table', d.siblings || [], ['name', 'relationship', 'education', 'occupation', 'mobile'], 'order');
    }

    // ══════════════════════════════════════════════════════
    //  PANEL RENDERERS  (same HTML, now loads real data)
    // ══════════════════════════════════════════════════════
    async function renderAllPanels() {
      // 1. Render all HTML shells instantly (no network delay)
      renderMentorProfile();
      renderPersonal();
      renderFamily();
      renderAcademicCred();
      renderPrizes();
      renderCoCurricular();
      renderAcademicRec();
      renderParticipation();
      renderPerformance();
      renderImprovement();
      renderInteraction();
      renderEffectiveness();
      renderOverallScore();
      if (currentUser.role === 'admin') await renderUserMgmt();

      // 2. Load mentor profile for mentor/admin
      if (currentUser.role === 'mentor' || currentUser.role === 'admin') {
        const mp = await loadMentorProfile();
        if (mp && mp.profile) populateMentorProfile(mp.profile);
      }

      // 3. Load student record — only for students (admin/mentor load via openStudentProfile)
      if (currentUser.role !== 'student') return;

      const rec = await loadStudentRecord();
      if (!rec) return;
      populateStudentRecord(rec);
    }

    // ── Populate all form fields from a record object ─────────────────────────────
    function populateStudentRecord(rec) {
      if (!rec) return;
      populatePersonal(rec.personal);
      populateFamily(rec.family);
      // For academicCredentials, support both 'year' (new) and 'passingYear' (legacy) keys
      const normCreds = (rec.academicCredentials || []).map(c => ({
        ...c,
        year: c.year || c.passingYear || '',
      }));
      populateAcademicCredSection(normCreds);
      populatePrizesSection((rec.prizes || []).map(p => ({
        ...p,
        category: p.category || p.type || '',
        institution: p.institution || '',
        activity: p.activity || p.activityName || '',
        prize: p.prize || p.achievement || '',
      })));
      // Academic records: use data-attribute based population to match the multi-row layout
      (rec.academicRecords || []).forEach(rowData => {
        if (!rowData.semester) return;
        const fields = ['monthYear', 'theoryMarks', 'spi', 'practicalPct', 'backlogs', 'att', 'ta', 'ct1', 'ct2'];
        fields.forEach(f => {
          const input = document.querySelector(`#academic-rec-table input[data-sem="${rowData.semester}"][data-field="${f}"]`);
          if (input && rowData[f] != null) input.value = rowData[f];
        });
      });
      populateIndexedRows('performance-table', rec.performanceChart || [], ['semester', 'subject', 'performanceCategory', 'attendance', 'classTest', 'ese', 'presentations', 'date']);
      populateIndexedRows('improvement-table', rec.improvementChart || [], ['semester', 'subject', 'performanceCategory', 'attendance', 'classTest', 'ese', 'presentations', 'date']);
      populateIndexedRows('participation-table-body', rec.participationRecords || [], ['semester', 'date', 'type', 'title', 'venue', 'organizer', 'award', 'details']);
      populateIndexedRows('interaction-table', rec.interactionRecords || [], ['date', 'issueDiscussed', 'tgRemarks', 'followUpDate', 'followUpRemark']);
      populateOverallScoreSection(rec.overallScores || []);
    }

    // Fill table rows with saved data from MongoDB
    function populateTableSection(tableId, dataRows, fields) {
      if (!dataRows || !dataRows.length) return;
      const trs = getSectionRows(tableId);
      if (!trs.length) return;
      dataRows.forEach((rowData, ri) => {
        if (!trs[ri]) return;
        const inputs = trs[ri].querySelectorAll('input, select, textarea');
        fields.forEach((f, fi) => {
          if (!inputs[fi] || rowData[f] === undefined || rowData[f] === null) return;
          inputs[fi].value = rowData[f];
        });
      });
    }

    function populateIndexedRows(tableId, dataRows, fields, slotField = 'sNo') {
      if (!dataRows || !dataRows.length) return;
      const trs = getSectionRows(tableId);
      if (!trs.length) return;

      const usedRows = new Set();
      const fallbackRows = [];

      dataRows.forEach(rowData => {
        const slotValue = Number(rowData[slotField]);
        const targetRow = Number.isInteger(slotValue) && slotValue > 0 ? trs[slotValue - 1] : null;
        if (!targetRow || usedRows.has(targetRow)) {
          fallbackRows.push(rowData);
          return;
        }

        const inputs = targetRow.querySelectorAll('input, select, textarea');
        fields.forEach((f, fi) => {
          if (!inputs[fi] || rowData[f] === undefined || rowData[f] === null) return;
          inputs[fi].value = rowData[f];
        });
        usedRows.add(targetRow);
      });

      if (!fallbackRows.length) return;

      const remainingRows = trs.filter(tr => !usedRows.has(tr));
      fallbackRows.forEach((rowData, index) => {
        const targetRow = remainingRows[index];
        if (!targetRow) return;
        const inputs = targetRow.querySelectorAll('input, select, textarea');
        fields.forEach((f, fi) => {
          if (!inputs[fi] || rowData[f] === undefined || rowData[f] === null) return;
          inputs[fi].value = rowData[f];
        });
      });
    }

    function fillVisibleInputs(tr, values) {
      if (!tr) return;
      const inputs = tr.querySelectorAll('input:not([type="hidden"]), select, textarea');
      values.forEach((value, index) => {
        if (!inputs[index] || value === undefined || value === null) return;
        inputs[index].value = value;
      });
    }

    function populateAcademicCredSection(dataRows) {
      if (!dataRows || !dataRows.length) return;
      const table = document.getElementById('ac-cred-table');
      if (!table) return;

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const namedRows = new Map();
      const unnamedRows = [];
      rows.forEach(tr => {
        const examination = tr.querySelector('input[type="hidden"]')?.value?.trim() || '';
        if (examination) namedRows.set(examination, tr);
        else unnamedRows.push(tr);
      });

      const usedRows = new Set();
      const overflowRows = [];

      dataRows.forEach(rowData => {
        const order = Number(rowData.order);
        const orderedRow = Number.isInteger(order) && order > 0 ? rows[order - 1] : null;
        if (orderedRow && !usedRows.has(orderedRow)) {
          fillVisibleInputs(orderedRow, [
            rowData.school,
            rowData.board,
            rowData.medium,
            rowData.year,
            rowData.percentage,
            rowData.division,
          ]);
          usedRows.add(orderedRow);
          return;
        }

        const examination = (rowData.examination || '').trim();
        const targetRow = examination && namedRows.has(examination) ? namedRows.get(examination) : null;
        if (!targetRow || usedRows.has(targetRow)) {
          overflowRows.push(rowData);
          return;
        }

        fillVisibleInputs(targetRow, [
          rowData.school,
          rowData.board,
          rowData.medium,
          rowData.year,
          rowData.percentage,
          rowData.division,
        ]);
        usedRows.add(targetRow);
      });

      const remainingRows = [
        ...unnamedRows.filter(tr => !usedRows.has(tr)),
        ...rows.filter(tr => !usedRows.has(tr) && !unnamedRows.includes(tr)),
      ];

      overflowRows.forEach((rowData, index) => {
        const targetRow = remainingRows[index];
        if (!targetRow) return;
        fillVisibleInputs(targetRow, [
          rowData.school,
          rowData.board,
          rowData.medium,
          rowData.year,
          rowData.percentage,
          rowData.division,
        ]);
      });
    }

    function normalizePrizeCategory(category) {
      const value = (category || '').trim().toLowerCase();
      if (value === 'academic') return 'Academic';
      if (value === 'co-curricular' || value === 'cocurricular') return 'Co-Curricular';
      if (value === 'extra-curricular' || value === 'extracurricular') return 'Extra-Curricular';
      return '';
    }

    function populatePrizesSection(dataRows) {
      if (!dataRows || !dataRows.length) return;

      const cats = ['Academic', 'Co-Curricular', 'Extra-Curricular'];

      // Group incoming data by category
      const groupedData = { 'Academic': [], 'Co-Curricular': [], 'Extra-Curricular': [] };
      dataRows.forEach(rowData => {
        const cat = normalizePrizeCategory(rowData.category);
        if (cat && groupedData[cat]) groupedData[cat].push(rowData);
      });

      cats.forEach(cat => {
        const safeId = cat.replace(/[^a-zA-Z]/g, '-').toLowerCase();
        const tbody = document.getElementById('prizes-tbody-' + safeId);
        if (!tbody) return;
        const existingRows = Array.from(tbody.querySelectorAll('tr'));
        const dataForCat = groupedData[cat] || [];

        dataForCat.forEach((rowData, index) => {
          let tr = existingRows[index];
          if (!tr) {
            // Need to add a new row for this category
            tr = document.createElement('tr');
            tr.innerHTML = `<td><input type="hidden" value="${cat}"><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>`;
            tbody.appendChild(tr);
          }
          fillVisibleInputs(tr, [rowData.institution, rowData.activity, rowData.prize]);
        });
      });
    }

    function populateOverallScoreSection(dataRows) {
      if (!dataRows || !dataRows.length) return;
      const table = document.getElementById('overall-score-table');
      if (!table) return;

      const rowsBySemester = new Map();
      Array.from(table.querySelectorAll('tr')).forEach(tr => {
        const semester = tr.querySelector('input[type="hidden"]')?.value?.trim() || '';
        if (semester) rowsBySemester.set(semester, tr);
      });

      dataRows.forEach(rowData => {
        const targetRow = rowsBySemester.get((rowData.semester || '').trim());
        if (!targetRow) return;
        fillVisibleInputs(targetRow, [
          rowData.A !== undefined ? Number(rowData.A) : rowData.A,
          rowData.B !== undefined ? Number(rowData.B) : rowData.B,
          rowData.C !== undefined ? Number(rowData.C) : rowData.C,
          rowData.D !== undefined ? Number(rowData.D) : rowData.D,
          rowData.E !== undefined ? Number(rowData.E) : rowData.E,
          rowData.F !== undefined ? Number(rowData.F) : rowData.F,
          rowData.total,
          rowData.performance,
        ]);
      });
    }

    function field(label, id, value = '', type = 'text', full = false) {
      return `<div class="profile-field${full ? ' full' : ''}">
    <label>${label}</label>
    <input type="${type}" id="${id}" value="${value}" placeholder="${label}">
  </div>`;
    }

    function renderMentorProfile() {
      document.getElementById('mentor-profile-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Mentor Information</span></div>
      <div class="card-body">
        <div class="mentor-profile-display">
          <div class="mentor-avatar-big">${currentUser.name.charAt(0)}</div>
          <div class="mentor-meta">
            <h2>${currentUser.name}</h2>
            <p>${currentUser.email} &nbsp;|&nbsp; ${currentUser.role.toUpperCase()}</p>
          </div>
        </div>
        <div class="profile-grid">
          <div class="profile-field"><label>Full Name <span style="font-size:10px;color:var(--text-muted);">(from account)</span></label><input type="text" id="mp-name" value="${currentUser.name}" readonly style="background:#f0ece2;cursor:not-allowed;color:var(--text-muted);"></div>
          ${field('Designation', 'mp-designation', '')}
          ${field('Department', 'mp-dept', '')}
          ${field('Employee ID', 'mp-empid', '')}
          ${field('Contact Number', 'mp-contact', '', 'tel')}
          <div class="profile-field"><label>Email <span style="font-size:10px;color:var(--text-muted);">(from account)</span></label><input type="email" id="mp-email" value="${currentUser.email}" readonly style="background:#f0ece2;cursor:not-allowed;color:var(--text-muted);"></div>
        </div>
      </div>
    </div>`;
    }

    function populateMentorProfile(p) {
      populateField('mp-designation', p.designation);
      populateField('mp-dept', p.department);
      populateField('mp-empid', p.employeeId);
      populateField('mp-contact', p.contact);
    }

    function renderPersonal() {
      document.getElementById('personal-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Student Personal Information</span></div>
      <div class="card-body">
        <div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;">
          <!-- Profile Photo -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;flex-shrink:0;">
            <div id="p-photo-preview"
              style="width:110px;height:130px;border-radius:10px;border:2px dashed var(--gold);
                     background:var(--bg-panel);display:flex;align-items:center;justify-content:center;
                     overflow:hidden;cursor:pointer;position:relative;"
              onclick="document.getElementById('p-photo-input').click()"
              title="Click to upload photo">
              <span id="p-photo-placeholder" style="font-size:36px;color:var(--text-muted);">📷</span>
              <img id="p-photo-img" src="" alt="Profile Photo"
                style="display:none;width:100%;height:100%;object-fit:cover;border-radius:8px;">
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
              <button type="button"
                style="background:var(--navy);color:var(--gold);border:1.5px solid var(--gold);
                       padding:5px 14px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;"
                onclick="document.getElementById('p-photo-input').click()">Upload Photo</button>
              <button type="button" id="p-photo-remove"
                style="display:none;background:transparent;color:var(--error,#c0392b);border:1px solid var(--error,#c0392b);
                       padding:4px 12px;border-radius:7px;cursor:pointer;font-size:11px;"
                onclick="clearProfilePhoto()">Remove</button>
            </div>
            <span style="font-size:10px;color:var(--text-muted);text-align:center;max-width:110px;">
              JPG/PNG · max 100KB<br>Passport size preferred
            </span>
            <input type="file" id="p-photo-input" accept="image/jpeg,image/png"
              style="display:none;" onchange="handlePhotoUpload(event)">
            <input type="hidden" id="p-photo-data" value="">
          </div>
          <!-- Personal fields -->
          <div class="profile-grid" style="flex:1;min-width:260px;">
            ${field('Full Name', 'p-name', '')}
            ${field('Admission Number', 'p-admno', '')}
            ${field('Registration Number', 'p-regno', '')}
            ${field('Date of Birth', 'p-dob', '', 'date')}
            ${field('Age', 'p-age', '')}
            ${field('Blood Group', 'p-blood', '')}
            ${field('Category', 'p-cat', '')}
            <div class="profile-field">
              <label>Branch / Department</label>
              <select id="p-branch" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg-panel);color:var(--text);transition:border-color 0.2s;outline:none;" onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
                <option value="">-- Select Branch --</option>
                <option value="CSE">Computer Science &amp; Engineering (CSE)</option>
                <option value="IT">Information Technology (IT)</option>
                <option value="Civil">Civil Engineering</option>
                <option value="Mechanical">Mechanical Engineering</option>
                <option value="Electrical">Electrical Engineering</option>
                <option value="AI/ML">Artificial Intelligence &amp; Machine Learning (AI/ML)</option>
                <option value="AIDS">Artificial Intelligence &amp; Data Science (AIDS)</option>
                <option value="Mechatronics">Mechatronics Engineering</option>
                <option value="EEE">Electrical &amp; Electronics Engineering (EEE)</option>
                <option value="ECE">Electronics &amp; Telecommunication Engineering (ECE)</option>
              </select>
            </div>
            <div class="profile-field">
              <label>Current Semester</label>
              <select id="p-cursem" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg-panel);color:var(--text);transition:border-color 0.2s;outline:none;" onfocus="this.style.borderColor='var(--gold)'" onblur="this.style.borderColor='var(--border)'">
                <option value="">-- Select Semester --</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
                <option value="3">Semester 3</option>
                <option value="4">Semester 4</option>
                <option value="5">Semester 5</option>
                <option value="6">Semester 6</option>
                <option value="7">Semester 7</option>
                <option value="8">Semester 8</option>
              </select>
            </div>
            ${field('Personal Cell No.', 'p-cell', '', 'tel')}
            ${field('Residence Phone No.', 'p-rphone', '', 'tel')}
            ${field('Email', 'p-email', '', 'email')}
            ${field('Address (Full)', 'p-addr', '', 'text', true)}
          </div>
        </div>
      </div>
    </div>`;
    }

    // ── Photo upload handler ──────────────────────────────────────────────────
    function handlePhotoUpload(event) {
      const file = event.target.files[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        alert('Only JPG and PNG images are supported.'); return;
      }
      if (file.size > 100 * 1024) {
        alert('Photo must be under 100KB. Please compress it first.'); return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        document.getElementById('p-photo-data').value = dataUrl;
        const img = document.getElementById('p-photo-img');
        const placeholder = document.getElementById('p-photo-placeholder');
        img.src = dataUrl; img.style.display = 'block';
        placeholder.style.display = 'none';
        document.getElementById('p-photo-remove').style.display = '';
        // Also update sidebar avatar if this is the logged-in student
        if (currentUser.role === 'student') updateSidebarAvatar(dataUrl);
      };
      reader.readAsDataURL(file);
    }

    function clearProfilePhoto() {
      document.getElementById('p-photo-data').value = '';
      document.getElementById('p-photo-img').src = '';
      document.getElementById('p-photo-img').style.display = 'none';
      document.getElementById('p-photo-placeholder').style.display = '';
      document.getElementById('p-photo-remove').style.display = 'none';
      document.getElementById('p-photo-input').value = '';
      if (currentUser.role === 'student') updateSidebarAvatar(null);
    }

    function updateSidebarAvatar(dataUrl) {
      const avatarEl = document.getElementById('user-avatar');
      if (!avatarEl) return;
      if (dataUrl) {
        avatarEl.style.backgroundImage = `url('${dataUrl}')`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.style.backgroundPosition = 'center';
        avatarEl.textContent = '';
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.style.backgroundSize = '';
        avatarEl.textContent = currentUser.name.charAt(0).toUpperCase();
      }
    }

    function setProfilePhoto(dataUrl) {
      if (!dataUrl) return;
      const img = document.getElementById('p-photo-img');
      const placeholder = document.getElementById('p-photo-placeholder');
      const removeBtn = document.getElementById('p-photo-remove');
      const hiddenInput = document.getElementById('p-photo-data');
      if (!img) return; // panel not rendered yet
      img.src = dataUrl; img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      if (removeBtn) removeBtn.style.display = '';
      if (hiddenInput) hiddenInput.value = dataUrl;
    }

    function renderFamily() {
      document.getElementById('family-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Father's Details</span></div>
      <div class="card-body">
        <div class="profile-grid">
          ${field("Father's Name", 'f-fname', '')}
          ${field('Mobile Number', 'f-fmob', '', 'tel')}
          ${field('Occupation', 'f-focc', '')}
          ${field('Education', 'f-fedu', '')}
          ${field('Monthly Income', 'f-finc', '')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Mother's Details</span></div>
      <div class="card-body">
        <div class="profile-grid">
          ${field("Mother's Name", 'f-mname', '')}
          ${field('Mobile Number', 'f-mmob', '', 'tel')}
          ${field('Occupation', 'f-mocc', '')}
          ${field('Education', 'f-medu', '')}
          ${field('Monthly Income', 'f-minc', '')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Siblings & Accommodation</span></div>
      <div class="card-body">
        <div class="profile-grid">
          ${field('No. of Siblings', 'f-siblings', '')}
          <div class="profile-field">
            <label>Fees Paid By</label>
            <input type="text" id="f-feespaid" placeholder="Father / Mother / Self / Scholarship">
          </div>
          <div class="profile-field">
            <label>Staying At</label>
            <select id="f-staying">
              <option value="">Select...</option>
              <option>Hostel</option>
              <option>Day Scholar</option>
              <option>Private Hostel/Room</option>
            </select>
          </div>
        </div>
        <div style="margin-top:18px;">
          <div class="section-heading" style="font-size:15px;margin-bottom:12px;">Siblings Details</div>
          <div class="table-wrap">
            <table id="family-siblings-table">
              <thead><tr><th>Name</th><th>Relationship</th><th>Education</th><th>Occupation</th><th>Mobile Number</th></tr></thead>
              <tbody>
                ${[1, 2, 3, 4, 5, 6].map(i => `<tr><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td></tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div style="margin-top:20px;">
          <div class="section-heading" style="font-size:15px;margin-bottom:12px;">Local Guardian Details (for Hostel / Private Room)</div>
          <div class="profile-grid">
            ${field("Local Guardian's Name", 'f-lgname', '')}
            ${field('Relationship with LG', 'f-lgrel', '')}
            ${field('Contact Details of LG', 'f-lgcontact', '', 'tel')}
            ${field('LG Address', 'f-lgaddr', '', 'text', true)}
          </div>
        </div>
      </div>
    </div>`;
    }

    function renderAcademicCred() {
      const rows = ['12th', '10th', 'Diploma', 'Any other', '', ''].map(cls => `
    <tr>
      <td style="font-weight:600;white-space:nowrap;">${cls}<input type="hidden" value="${cls}"></td>
      <td><input style="border:none;width:100%;min-width:120px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:100%;min-width:120px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:80px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:80px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;" placeholder="—"></td>
    </tr>`).join('');
      document.getElementById('academic-cred-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Academic Credentials</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table id="ac-cred-table">
            <thead><tr><th>Class</th><th>Name of School/Institute</th><th>Board/University</th><th>Medium</th><th>Year of Passing</th><th>%</th><th>Division</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:18px;">
          <div class="profile-field full">
            <label>Any Other Certifications</label>
            <textarea id="ac-certs" rows="3" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;" placeholder="List certifications here..."></textarea>
          </div>
        </div>
      </div>
    </div>`;
    }

    // ── Add More helpers ──────────────────────────────────────────────────────────

    function addMoreRowsToTable(tableId, buildRowFn) {
      const el = document.getElementById(tableId);
      if (!el) return;
      // If ID is on <table>, target its <tbody>; otherwise use the element directly (already a tbody)
      const tbody = el.tagName === 'TABLE' ? el.querySelector('tbody') : el;
      if (!tbody) return;
      const existingRows = tbody.querySelectorAll('tr');
      const nextIndex = existingRows.length + 1;
      const newRow = document.createElement('tr');
      newRow.innerHTML = buildRowFn(nextIndex);
      tbody.appendChild(newRow);
    }


    function addMorePrizesRows(category) {
      // Override: now each category has its own tbody with id prizes-tbody-{cat}
      const safeId = category.replace(/[^a-zA-Z]/g, '-').toLowerCase();
      const tbody = document.getElementById('prizes-tbody-' + safeId);
      if (!tbody) return;
      const newRow = document.createElement('tr');
      newRow.innerHTML = `<td><input type="hidden" value="${category}"><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td><td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>`;
      tbody.appendChild(newRow);
    }

    function renderPrizes() {
      const cats = ['Academic', 'Co-Curricular', 'Extra-Curricular'];

      // Build one sub-table per category, each with its own Add button directly below
      const sections = cats.map(cat => {
        const safeId = cat.replace(/[^a-zA-Z]/g, '-').toLowerCase();
        // First row: category label spans 4 rows; rows 2-4 plain
        let bodyRows = `<tr>
      <td rowspan="4" style="font-weight:700;background:#faf7f0;vertical-align:middle;text-align:center;width:130px;">${cat}<input type="hidden" value="${cat}"></td>
      <td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
    </tr>`;
        bodyRows += [1, 2, 3].map(() => `<tr>
      <td><input type="hidden" value="${cat}"><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
    </tr>`).join('');

        return `
      <div class="table-wrap" style="margin-bottom:4px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th>Category</th><th>Institution</th><th>Activity</th><th>Prize Details</th></tr></thead>
          <tbody id="prizes-tbody-${safeId}">${bodyRows}</tbody>
        </table>
      </div>
      <div style="margin-top:6px;margin-bottom:16px;text-align:left;">
        <button type="button" onclick="addMorePrizesRows('${cat}')" style="background:var(--primary,#1a3c6e);color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:13px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
          <span style="font-size:16px;line-height:1;">＋</span> Add ${cat}
        </button>
      </div>`;
      }).join('');

      document.getElementById('prizes-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Prizes Awarded / Earned</span></div>
      <div class="card-body">
        ${sections}
      </div>
    </div>`;
    }

    function renderCoCurricular() {
      document.getElementById('cocurricular-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Co-Curricular and Extra-Curricular Performance Chart</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
          <div style="background:linear-gradient(135deg,#edf7f1,#f8f5ef);border-radius:12px;padding:18px;border:1px solid #b8dcc8;">
            <div style="font-weight:700;color:var(--success);font-size:14px;margin-bottom:8px;">CO-CURRICULAR</div>
            <p style="font-size:13px;color:var(--text-muted);line-height:1.7;">Activities that supplement syllabi learning and enhance performance outcomes. They supplement and strengthen classroom learning. Examples: Certificate Courses, College-sponsored Sporting Activities like Yoga Courses, Club Activities from different discipline-related clubs like Science Club, etc.</p>
          </div>
          <div style="background:linear-gradient(135deg,#f3eafc,#f8f5ef);border-radius:12px;padding:18px;border:1px solid #c8b8dc;">
            <div style="font-weight:700;color:#5b2c8d;font-size:14px;margin-bottom:8px;">EXTRA-CURRICULAR</div>
            <p style="font-size:13px;color:var(--text-muted);line-height:1.7;">Activities indispensable but not directly related to curriculum. They enhance personality, well-being and confidence while ingraining codes of discipline. NSS, NCC, RED CROSS, SCOUTS and GUIDES come under this category.</p>
          </div>
        </div>
        <div class="section-heading" style="font-size:16px;margin-bottom:12px;">Special Interests and Hobbies</div>
        <textarea id="p-hobbies" rows="3" style="width:100%;padding:12px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;" placeholder="Enter student's special interests and hobbies..."></textarea>
      </div>
    </div>`;
    }

    function renderAcademicRec() {
      const sems = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
      const rows = sems.map(s => `
    <tr>
      <td class="sem-label" rowspan="3" style="text-align:center;width:40px;">${s}</td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">Month/Year</td>
      <td colspan="2"><input data-sem="${s}" data-field="monthYear" style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="e.g. Nov 2024"></td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">Theory Marks/%</td>
      <td><input data-sem="${s}" data-field="theoryMarks" style="border:none;width:80px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">SPI</td>
      <td><input data-sem="${s}" data-field="spi" style="border:none;width:70px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">Practical %</td>
      <td><input data-sem="${s}" data-field="practicalPct" style="border:none;width:70px;background:transparent;font-family:inherit;" placeholder="—"></td>
    </tr>
    <tr>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">AC/Backlogs</td>
      <td colspan="2"><input data-sem="${s}" data-field="backlogs" style="border:none;width:100%;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">ATT %</td>
      <td><input data-sem="${s}" data-field="att" style="border:none;width:80px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">TA %</td>
      <td><input data-sem="${s}" data-field="ta" style="border:none;width:70px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td style="font-size:11px;font-weight:600;color:var(--text-muted);">CT 1</td>
      <td><input data-sem="${s}" data-field="ct1" style="border:none;width:70px;background:transparent;font-family:inherit;" placeholder="—"></td>
    </tr>
    <tr>
      <td colspan="8" style="border-bottom:2px solid var(--border);padding-bottom:6px;">
        <span style="font-size:11px;font-weight:600;color:var(--text-muted);">CT 2:</span>
        <input data-sem="${s}" data-field="ct2" style="border:none;width:80px;background:transparent;font-family:inherit;" placeholder="—">
      </td>
    </tr>`).join('');
      document.getElementById('academic-rec-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Academic Records — All Semesters</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table id="academic-rec-table">
            <thead><tr><th>Sem</th><th>Exam Details</th><th colspan="2">Details</th><th>Performance</th><th>Value</th><th>Metric</th><th>Value</th><th>Component</th><th>Value</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
    }

    function buildParticipationRow(index) {
      return `<td>${index}</td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;" placeholder="Sem"></td>
      <td><input style="border:none;width:90px;background:transparent;font-family:inherit;" placeholder="DD/MM/YY" type="date"></td>
      <td>
        <select style="border:none;background:transparent;font-family:inherit;font-size:12px;">
          <option value="">Select...</option>
          <option>Co-curricular</option>
          <option>Cultural</option>
          <option>Sports</option>
        </select>
      </td>
      <td><input style="border:none;width:120px;background:transparent;font-family:inherit;" placeholder="Event Title"></td>
      <td>
        <select style="border:none;background:transparent;font-family:inherit;font-size:12px;">
          <option value="">Select...</option>
          <option>In-house</option>
          <option>Outside</option>
        </select>
      </td>
      <td><input style="border:none;width:100px;background:transparent;font-family:inherit;" placeholder="Organized by"></td>
      <td>
        <select style="border:none;background:transparent;font-family:inherit;font-size:12px;">
          <option value="">Select...</option>
          <option>1st Position</option>
          <option>2nd Position</option>
          <option>3rd Position</option>
          <option>Participation</option>
        </select>
      </td>
      <td><input style="border:none;width:90px;background:transparent;font-family:inherit;" placeholder="—"></td>`;
    }

    function renderParticipation() {
      const rows = Array(12).fill(0).map((_, i) => `<tr>${buildParticipationRow(i + 1)}</tr>`).join('');
      document.getElementById('participation-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Participation Records</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table>
            <thead><tr><th>S.No.</th><th>Semester</th><th>Date (DD/MM/YY)</th><th>Type of Event</th><th>Title of Event</th><th>In-house/Outside</th><th>Organized By</th><th>Award / Position / Participation</th><th>Any Other Detail</th></tr></thead>
            <tbody id="participation-table-body">${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:10px;text-align:right;">
          <button type="button" onclick="addMoreRowsToTable('participation-table-body', buildParticipationRow)" style="background:var(--primary,#1a3c6e);color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:13px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span style="font-size:16px;line-height:1;">＋</span> Add More Rows</button>
        </div>
      </div>
    </div>`;
    }

    function buildPerformanceRow(index) {
      return `<td>${index}</td>
      <td><select style="border:none;background:transparent;font-size:12px;"><option value="">Select...</option><option>I</option><option>II</option><option>III</option><option>IV</option><option>V</option><option>VI</option><option>VII</option><option>VIII</option></select></td>
      <td><input style="border:none;width:100px;background:transparent;font-family:inherit;" placeholder="Subject name"></td>
      <td>
        <select style="border:none;background:transparent;font-size:12px;">
          <option value="">Select...</option><option>Excellent</option><option>Good</option><option>Average</option><option>Below Average</option>
        </select>
      </td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;" placeholder="%"></td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;" placeholder="Marks"></td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;" placeholder="Score"></td>
      <td><input style="border:none;width:70px;background:transparent;font-family:inherit;" placeholder="—"></td>
      <td><input style="border:none;width:90px;background:transparent;font-family:inherit;" type="date"></td>`;
    }

    function renderPerformanceTable(containerId, titleSuffix, dateCOlLabel, tableId) {
      const rows = Array(8).fill(0).map((_, i) => `
    <tr>${buildPerformanceRow(i + 1)}</tr>`).join('');
      document.getElementById(containerId).innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Academic ${titleSuffix}</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table id="${tableId}">
            <thead>
              <tr><th>S.No.</th><th>Semester</th><th>Subject</th><th>Performance Category</th><th>Attendance</th><th>Class Test</th><th>ESE</th><th>Presentations / Any Other</th><th>${dateCOlLabel}</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:10px;text-align:right;">
          <button type="button" onclick="addMoreRowsToTable('${tableId}', buildPerformanceRow)" style="background:var(--primary,#1a3c6e);color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:13px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span style="font-size:16px;line-height:1;">＋</span> Add More Rows</button>
        </div>
      </div>
    </div>`;
    }

    function renderPerformance() { renderPerformanceTable('performance-content', 'Performance Chart', 'Date of Counseling', 'performance-table'); }
    function renderImprovement() { renderPerformanceTable('improvement-content', 'Improvement Chart', 'Date of Review', 'improvement-table'); }

    function buildInteractionRow(index) {
      return `<td>${index}</td>
      <td><input style="border:none;width:90px;background:transparent;font-family:inherit;" type="date"></td>
      <td><textarea style="border:none;width:140px;min-height:44px;background:transparent;font-family:inherit;resize:vertical;font-size:12px;" placeholder="Issue discussed..."></textarea></td>
      <td><textarea style="border:none;width:140px;min-height:44px;background:transparent;font-family:inherit;resize:vertical;font-size:12px;" placeholder="TG remarks / action plan..."></textarea></td>
      <td><input style="border:none;width:90px;background:transparent;font-family:inherit;" type="date"></td>
      <td><textarea style="border:none;width:100px;min-height:44px;background:transparent;font-family:inherit;resize:vertical;font-size:12px;" placeholder="Follow-up remark..."></textarea></td>`;
    }

    function renderInteraction() {
      const rows = Array(8).fill(0).map((_, i) => `<tr>${buildInteractionRow(i + 1)}</tr>`).join('');
      document.getElementById('interaction-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Interaction Records</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>S.No.</th><th>Date</th><th>Issue Discussed</th><th>Remarks of TG / Remedial Action Plan</th><th>Follow Up Date</th><th>Follow Up Remark</th></tr>
            </thead>
            <tbody id="interaction-table">${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:10px;text-align:right;">
          <button type="button" onclick="addMoreRowsToTable('interaction-table', buildInteractionRow)" style="background:var(--primary,#1a3c6e);color:#fff;border:none;border-radius:6px;padding:7px 18px;font-size:13px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span style="font-size:16px;line-height:1;">＋</span> Add More Rows</button>
        </div>
      </div>
    </div>`;
    }

    function renderEffectiveness() {
      const criteria = [
        { id: 'A', wt: 30, param: 'Was your mentee regularly approached and talked with?', excellent: 'Detailed and extensive coverage regularly approach and talk', good: 'Good number of regularly approach and talk', avg: 'Average coverage of regularly approach and talk', acc: 'Moderate coverage of regularly approach and talk', unac: 'Minimal coverage of regularly approach and talk' },
        { id: 'B', wt: 20, param: 'Did/does your mentee accept advice and encouragement from you with respect to your independent goals?', excellent: 'Extensive acceptance on advice and encouragements', good: 'Good acceptance on advice and encouragements', avg: 'Average acceptance on advice and encouragements', acc: 'Moderate acceptance on advice and encouragements', unac: 'Minimal acceptance on advice and encouragements' },
        { id: 'C', wt: 10, param: 'The feedback and constructive criticism provided by you is accepted by your mentee?', excellent: 'Extensively accepted the feedback and constructive criticism', good: 'Acceptance level of feedback and constructive criticism was Good', avg: 'Average Acceptance of feedback and constructive criticism', acc: 'Moderate acceptance of the feedback and constructive criticism', unac: 'Minimal Acceptance of the feedback and constructive criticism' },
        { id: 'D', wt: 10, param: 'Did your mentee exhibit integrity?', excellent: 'Extensively accepted', good: 'Acceptance level was Good', avg: 'Average level only', acc: 'Moderate level only', unac: 'Minimal only' },
        { id: 'E', wt: 20, param: 'Did you and your mentee complete the goals planned?', excellent: 'Extensively complete the goals planned', good: 'Completion of the goals planned level was Good', avg: 'Completion of the goals planned level was Average level only', acc: 'Completion of the goals planned level was Moderate level only', unac: 'Completion of the goals planned level was Minimal only' },
        { id: 'F', wt: 10, param: 'Overall Score Given by Mentor from his/her feedback', excellent: 'Extensively accepted', good: 'Acceptance level was Good', avg: 'Average level only', acc: 'Moderate level only', unac: 'Minimal only' },
      ];
      const rubricRows = criteria.map(c => `
    <tr>
      <td><strong>${c.id}</strong></td>
      <td style="font-size:12px;">${c.param}</td>
      <td style="font-size:11px;color:#1a6e3f;">${c.excellent}</td>
      <td style="font-size:11px;color:#1a5276;">${c.good}</td>
      <td style="font-size:11px;color:#7d6608;">${c.avg}</td>
      <td style="font-size:11px;color:#784212;">${c.acc}</td>
      <td style="font-size:11px;color:#922b21;">${c.unac}</td>
      <td style="text-align:center;font-weight:700;color:var(--navy);">${c.wt}</td>
    </tr>`).join('');
      document.getElementById('effectiveness-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Rubric for Attainment Calculation</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table class="rubric-table">
            <thead>
              <tr>
                <th>Sl.No.</th>
                <th>Parameters for Assessment</th>
                <th>Excellent (10)</th>
                <th>Good (08)</th>
                <th>Average (06)</th>
                <th>Acceptable (04)</th>
                <th>Unacceptable (02)</th>
                <th>Weightage</th>
              </tr>
            </thead>
            <tbody>${rubricRows}</tbody>
          </table>
        </div>
        <div style="margin-top:20px;">
          <div class="section-heading" style="font-size:16px;margin-bottom:12px;">Performance Ranges</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Performance</th><th>Excellent</th><th>Very Good</th><th>Good</th><th>Satisfactory</th></tr></thead>
              <tbody>
                <tr>
                  <td style="font-weight:600;">Range (100)</td>
                  <td><span class="tag tag-excellent">&gt; 90</span></td>
                  <td><span class="tag tag-good">70 – 89</span></td>
                  <td><span class="tag tag-average">50 – 69</span></td>
                  <td><span class="tag tag-satisfactory">&lt; 50</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
    }

    function renderOverallScore() {
      const sems = ['1', '2', '3', '4', '5', '6', '7', '8'];
      const rows = sems.map(s => `
    <tr>
      <td style="font-weight:700;text-align:center;">${s}<input type="hidden" value="${s}"></td>
      <td><input style="border:none;width:50px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td><input style="border:none;width:50px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td><input style="border:none;width:50px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td><input style="border:none;width:50px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td><input style="border:none;width:50px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td><input style="border:none;width:50px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td><input style="border:none;width:60px;background:transparent;font-family:inherit;text-align:center;" placeholder="—"></td>
      <td>
        <select style="border:none;background:transparent;font-family:inherit;font-size:12px;">
          <option value="">—</option>
          <option>Excellent</option>
          <option>Very Good</option>
          <option>Good</option>
          <option>Satisfactory</option>
        </select>
      </td>
    </tr>`).join('');
      document.getElementById('overall-score-content').innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">Overall Score — Semester-wise</span></div>
      <div class="card-body">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Sem</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>Total</th><th>Performance</th></tr>
            </thead>
            <tbody id="overall-score-table">${rows}</tbody>
          </table>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:14px;">A(30), B(20), C(10), D(10), E(20), F(10) — Total weightage: 100 | Excellent: &gt;90 | Very Good: 70–89 | Good: 50–69 | Satisfactory: &lt;50</p>
      </div>
    </div>`;
    }

    let userMgmtSearchQuery = '';
    let userMgmtSearchTimeout = null;

    window.handleUserMgmtSearch = function(val) {
      userMgmtSearchQuery = val;
      if (userMgmtSearchTimeout) clearTimeout(userMgmtSearchTimeout);
      userMgmtSearchTimeout = setTimeout(() => {
        renderUserMgmt(true); // pass true to preserve input focus / prevent full container flash
      }, 300);
    };

    async function renderUserMgmt(isSubsequent = false) {
      if (!isSubsequent) {
        document.getElementById('user-mgmt-content').innerHTML = `
      <div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:30px;">⏳ Loading users from database...</div></div>`;
      }

      try {
        const path = userMgmtSearchQuery 
          ? `/users?search=${encodeURIComponent(userMgmtSearchQuery)}`
          : '/users';

        const { ok, data } = await api('GET', path);
        if (!ok) throw new Error(data.message || 'Failed to load users');
        allUsers = data.users || [];
        const currentUserId = String(currentUser?._id || currentUser?.id || '');

        let rows = '';
        if (allUsers.length === 0) {
          rows = `
        <tr>
          <td colspan="6" style="text-align:center;padding:48px var(--card-padding);color:var(--text-muted);">
            <div style="font-size:32px;margin-bottom:12px;">🔍</div>
            <div style="font-weight:600;font-size:15px;color:var(--text);">No Users Found</div>
            <div style="font-size:13px;margin-top:4px;">Try searching for a different name, email, role, or department.</div>
          </td>
        </tr>`;
        } else {
          rows = allUsers.map(u => `
        <tr>
          <td style="font-size:11px;font-family:'DM Mono',monospace;color:var(--text-muted);">${u._id.slice(-8)}</td>
          <td><strong>${u.name}</strong></td>
          <td>${u.email}</td>
          <td><span class="tag ${u.role === 'admin' ? 'tag-excellent' : u.role === 'mentor' ? 'tag-good' : 'tag-average'}">${u.role.toUpperCase()}</span></td>
          <td style="font-size:11px;">${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : '<span style="color:var(--text-muted);">Never</span>'}</td>
          <td>
            ${String(u._id) !== currentUserId
              ? `<button onclick="deactivateUser('${u._id}','${u.name.replace(/'/g, "\\'")}')" style="border:none;background:#c0392b;color:#fff;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Deactivate</button>`
              : '<span style="font-size:11px;color:var(--text-muted);">(you)</span>'}
          </td>
        </tr>`).join('');
        }

        const inputHtml = `
        <div class="card" style="margin-bottom:20px;">
          <div class="card-body" style="display:flex;gap:12px;align-items:center;">
            <div style="flex:1;position:relative;display:flex;align-items:center;">
              <span style="position:absolute;left:14px;color:var(--text-muted);font-size:14px;">🔍</span>
              <input type="text" id="user-mgmt-search-input" placeholder="Search by name, email, registration number, phone, role, or department..." value="${userMgmtSearchQuery}" oninput="handleUserMgmtSearch(this.value)" style="width:100%;padding:10px 12px 10px 38px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;outline:none;background:var(--bg-panel);color:var(--text);">
            </div>
          </div>
        </div>`;

        const tableHtml = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">All Users (${allUsers.length})</span>
          <button class="btn-action" onclick="showAddUserOverlay()">+ Add User</button>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table>
              <thead><tr><th>ID (last 8)</th><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th><th>Actions</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>`;

        document.getElementById('user-mgmt-content').innerHTML = inputHtml + tableHtml;

        // Restore cursor position if user is typing
        if (isSubsequent) {
          const input = document.getElementById('user-mgmt-search-input');
          if (input) {
            input.focus();
            input.setSelectionRange(userMgmtSearchQuery.length, userMgmtSearchQuery.length);
          }
        }
      } catch (err) {
        document.getElementById('user-mgmt-content').innerHTML = `
      <div class="card"><div class="card-body" style="color:var(--error);padding:20px;">&#10060; Failed to load users: ${err.message}</div></div>`;
      }
    }

    async function deactivateUser(userId, name) {
      if (!confirm(`Deactivate "${name}"?\nThey will lose access immediately.`)) return;
      try {
        const { ok, data } = await api('DELETE', `/users/${userId}`);
        if (!ok) throw new Error(data.message);
        await renderUserMgmt();
      } catch (err) {
        alert('❌ ' + err.message);
      }
    }

    // ══════════════════════════════════════════════════════
    //  ASSIGN MENTOR (Admin)
    // ══════════════════════════════════════════════════════
    async function renderAssignMentor() {
      const el = document.getElementById('assign-mentor-content');
      el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:30px;">⏳ Loading users...</div></div>';
      try {
        const [usersRes, recordsRes] = await Promise.all([
          api('GET', '/users'),
          api('GET', '/records'),
        ]);
        if (!usersRes.ok) throw new Error(usersRes.data.message || 'Failed to load users');
        if (!recordsRes.ok) throw new Error(recordsRes.data.message || 'Failed to load records');

        const users = usersRes.data.users || [];
        const records = recordsRes.data.records || [];
        const students = users.filter(u => u.role === 'student');
        const mentors = users.filter(u => u.role === 'mentor');

        if (mentors.length === 0) {
          el.innerHTML = '<div class="card"><div class="card-body" style="color:var(--warning);padding:20px;">⚠️ No mentor accounts found. Create mentor accounts first via User Management.</div></div>';
          return;
        }

        const mentorOptions = mentors.map(m => `<option value="${m._id}">${m.name} (${m.email})</option>`).join('');

        // Build a map of studentId -> current mentor name
        const assignedMap = {};
        records.forEach(r => {
          if (r.student && r.mentor) {
            assignedMap[r.student._id || r.student] = r.mentor.name || r.mentor;
          }
        });

        const rows = students.map(s => {
          const currentMentor = assignedMap[s._id] || '<span style="color:var(--text-muted);">Unassigned</span>';
          return `<tr>
        <td><strong>${s.name}</strong><br><span style="font-size:11px;color:var(--text-muted);">${s.email}</span></td>
        <td id="cur-mentor-${s._id}">${currentMentor}</td>
        <td>
          <div style="display:flex;gap:8px;align-items:center;">
            <select id="sel-mentor-${s._id}" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px;flex:1;">
              <option value="">— Select Mentor —</option>
              ${mentorOptions}
            </select>
            <button onclick="doAssignMentor('${s._id}','${s.name.replace(/'/g, "\\'")}','cur-mentor-${s._id}')"
              style="background:var(--navy);color:var(--gold);border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">
              Assign
            </button>
          </div>
        </td>
      </tr>`;
        }).join('');

        el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Students (${students.length})</span>
          <span style="font-size:12px;color:var(--text-muted);">${mentors.length} mentor(s) available</span>
        </div>
        <div class="card-body">
          ${students.length === 0
            ? '<p style="color:var(--text-muted);">No student accounts found.</p>'
            : `<div class="table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Current Mentor</th><th style="min-width:280px;">Assign New Mentor</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
               </div>`}
        </div>
      </div>`;
      } catch (err) {
        el.innerHTML = `<div class="card"><div class="card-body" style="color:var(--error);padding:20px;">❌ ${err.message}</div></div>`;
      }
    }

    async function doAssignMentor(studentId, studentName, curMentorCellId) {
      const sel = document.getElementById('sel-mentor-' + studentId);
      const mentorId = sel ? sel.value : '';
      if (!mentorId) { alert('Please select a mentor first.'); return; }

      try {
        const { ok, data } = await api('PATCH', `/records/${studentId}/assign-mentor`, { mentorId });
        if (!ok) throw new Error(data.message || 'Failed to assign mentor');

        // Find the mentor name from dropdown
        const mentorName = sel.options[sel.selectedIndex].text;
        const cell = document.getElementById(curMentorCellId);
        if (cell) cell.innerHTML = mentorName;
        sel.value = '';
        // Invalidate all-records cache so next visit picks up the new mentor
        _allRecordsCache = null;
        alert(`✅ ${mentorName} assigned to ${studentName}`);
      } catch (err) {
        alert('❌ ' + err.message);
      }
    }


    // ══════════════════════════════════════════════════════
    //  SHARED FILTER & BACKLOG UTILITIES  (Admin + Mentor)
    // ══════════════════════════════════════════════════════

    /** Count backlogs: FAIL entries in performanceChart not cleared by PASS in improvementChart */
    function computeBacklogs(r) {
      const perf = r.performanceChart || [];
      const impr = r.improvementChart || [];
      let backlogs = 0;
      perf.forEach(fs => {
        if ((fs.performanceCategory || '').toUpperCase() !== 'FAIL') return;
        const cleared = impr.some(i =>
          (i.subject || '').toLowerCase() === (fs.subject || '').toLowerCase() &&
          (i.semester || '') === (fs.semester || '') &&
          (i.performanceCategory || '').toUpperCase() === 'PASS'
        );
        if (!cleared) backlogs++;
      });
      return backlogs;
    }

    /** Count PASS entries in performanceChart */
    function computePassCount(r) {
      return (r.performanceChart || [])
        .filter(s => (s.performanceCategory || '').toUpperCase() === 'PASS').length;
    }

    /** Read current filter state from DOM for a given prefix */
    function readFilters(prefix) {
      return {
        search: (document.getElementById(prefix + '-search')?.value || '').trim().toLowerCase(),
        branch: (document.getElementById(prefix + '-branch')?.value || ''),
        semester: (document.getElementById(prefix + '-semester')?.value || ''),
        status: (document.getElementById(prefix + '-status')?.value || ''),
        sort: (document.getElementById(prefix + '-sort')?.value || ''),
      };
    }

    /** Apply all active filters + sort to a records array (non-destructive) */
    function applyFilters(records, f) {
      let result = records.slice();
      if (f.search) {
        result = result.filter(r => {
          const name = (r.student?.name || r.personal?.name || '').toLowerCase();
          return name.includes(f.search);
        });
      }
      if (f.branch) {
        result = result.filter(r => (r.personal?.branch || '') === f.branch);
      }
      if (f.semester) {
        result = result.filter(r => (r.personal?.currentSemester || '') === f.semester);
      }
      if (f.status === 'backlog') {
        result = result.filter(r => computeBacklogs(r) > 0);
      } else if (f.status === 'cleared') {
        result = result.filter(r => computeBacklogs(r) === 0);
      }
      if (f.sort === 'backlog-desc') {
        result.sort((a, b) => computeBacklogs(b) - computeBacklogs(a));
      } else if (f.sort === 'backlog-asc') {
        result.sort((a, b) => computeBacklogs(a) - computeBacklogs(b));
      } else if (f.sort === 'name-asc') {
        result.sort((a, b) => {
          const na = (a.student?.name || a.personal?.name || '').toLowerCase();
          const nb = (b.student?.name || b.personal?.name || '').toLowerCase();
          return na.localeCompare(nb);
        });
      }
      return result;
    }

    /** Build the advanced filter bar HTML for a given prefix */
    function buildFilterBar(prefix, totalCount, filteredCount) {
      const BRANCH_OPTIONS = [
        ['', 'All Branches'],
        ['CSE', 'CSE – Computer Science & Engineering'],
        ['IT', 'IT – Information Technology'],
        ['Civil', 'Civil Engineering'],
        ['Mechanical', 'Mechanical Engineering'],
        ['Electrical', 'Electrical Engineering'],
        ['AI/ML', 'AI/ML – Artificial Intelligence & Machine Learning'],
        ['AIDS', 'AIDS – Artificial Intelligence & Data Science'],
        ['Mechatronics', 'Mechatronics Engineering'],
        ['EEE', 'EEE – Electrical & Electronics Engineering'],
        ['ECE', 'ECE – Electronics & Telecommunication Engineering'],
      ];
      const SEM_OPTIONS = [
        ['', 'All Semesters'],
        ['1', 'Semester 1'], ['2', 'Semester 2'], ['3', 'Semester 3'], ['4', 'Semester 4'],
        ['5', 'Semester 5'], ['6', 'Semester 6'], ['7', 'Semester 7'], ['8', 'Semester 8'],
      ];
      const STATUS_OPTIONS = [
        ['', 'All Students'],
        ['backlog', '🔴 Only Backlog'],
        ['cleared', '🟢 Only Cleared'],
      ];
      const SORT_OPTIONS = [
        ['', 'Default Order'],
        ['backlog-desc', '↓ Highest Backlog First'],
        ['backlog-asc', '↑ Lowest Backlog First'],
        ['name-asc', '🔤 Name (A–Z)'],
      ];

      const f = readFilters(prefix);
      const hasFilter = !!(f.search || f.branch || f.semester || f.status || f.sort);

      const selSt = 'padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:12px;background:var(--bg-panel);color:var(--text);cursor:pointer;outline:none;transition:border-color 0.2s;min-width:0;';
      function mkSel(id, opts, val, fn) {
        return '<select id="' + id + '" style="' + selSt + '" onchange="' + fn + '" onfocus="this.style.borderColor=\'var(--gold)\'" onblur="this.style.borderColor=\'var(--border)\'">'
          + opts.map(function (o) { return '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
          + '</select>';
      }

      const resetBtn = '<button id="' + prefix + '-reset" onclick="resetFilters(\'' + prefix + '\')" style="padding:7px 14px;background:var(--navy);color:var(--gold);border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;flex-shrink:0;display:' + (hasFilter ? 'block' : 'none') + '">↺ Reset Filters</button>';

      const countLabel = '<span id="' + prefix + '-count" style="font-size:12px;color:var(--text-muted);">' +
        (hasFilter ? 'Showing <strong style="color:var(--navy);">' + filteredCount + '</strong> of ' + totalCount + ' student(s)'
          : '<strong>' + totalCount + '</strong> student(s) total') +
        '</span>';

      const clearX = '<button id="' + prefix + '-clear" onclick="document.getElementById(\'' + prefix + '-search\').value=\'\';applyAndRender(\'' + prefix + '\')" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted);line-height:1;padding:2px 4px;display:' + (f.search ? 'block' : 'none') + '">&times;</button>';

      return '<div style="display:flex;flex-direction:column;gap:10px;padding:14px 16px;background:var(--cream);border-top:1px solid var(--border);border-bottom:1px solid var(--border);">'
        + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
        + '<div style="position:relative;flex:1;min-width:180px;">'
        + '<span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none;">🔍</span>'
        + '<input id="' + prefix + '-search" type="text" value="' + f.search.replace(/"/g, '&quot;') + '" autocomplete="off"'
        + ' placeholder="Search student by name…"'
        + ' oninput="applyAndRender(\'' + prefix + '\')"'
        + ' style="width:100%;box-sizing:border-box;padding:8px 32px 8px 34px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;background:var(--bg-panel);color:var(--text);transition:border-color 0.2s;outline:none;"'
        + ' onfocus="this.style.borderColor=\'var(--gold)\'" onblur="this.style.borderColor=\'var(--border)\'">'
        + clearX
        + '</div>'
        + resetBtn
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">'
        + mkSel(prefix + '-branch', BRANCH_OPTIONS, f.branch, 'applyAndRender(\'' + prefix + '\')')
        + mkSel(prefix + '-semester', SEM_OPTIONS, f.semester, 'applyAndRender(\'' + prefix + '\')')
        + mkSel(prefix + '-status', STATUS_OPTIONS, f.status, 'applyAndRender(\'' + prefix + '\')')
        + mkSel(prefix + '-sort', SORT_OPTIONS, f.sort, 'applyAndRender(\'' + prefix + '\')')
        + '<div style="margin-left:auto;">' + countLabel + '</div>'
        + '</div>'
        + '</div>';
    }

    /** Reset all filters for a prefix */
    function resetFilters(prefix) {
      ['search', 'branch', 'semester', 'status', 'sort'].forEach(function (id) {
        var el = document.getElementById(prefix + '-' + id);
        if (el) el.value = '';
      });
      applyAndRender(prefix);
    }

    /** Called by all filter change events */
    function applyAndRender(prefix) {
      const activeEl = document.activeElement;
      const activeId = activeEl ? activeEl.id : null;
      let start = null, end = null;
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'text') {
        try {
          start = activeEl.selectionStart;
          end = activeEl.selectionEnd;
        } catch (e) { }
      }

      if (prefix === 'ar' && _allRecordsCache) renderAllRecordsTable(_allRecordsCache);
      if (prefix === 'ms' && _myStudentsCache) renderMyStudentsCards(_myStudentsCache);

      if (activeId) {
        const newEl = document.getElementById(activeId);
        if (newEl) {
          newEl.focus();
          if (start !== null && end !== null && newEl.tagName === 'INPUT') {
            try { newEl.setSelectionRange(start, end); } catch (e) { }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════
    //  ALL STUDENT RECORDS (Admin)
    // ══════════════════════════════════════════════════════
    let _allRecordsCache = null;

    async function renderAllRecords(forceRefresh = false) {
      const el = document.getElementById('all-records-content');
      if (!_allRecordsCache || forceRefresh) {
        el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:30px;">&#9203; Loading records...</div></div>';
        try {
          const { ok, data } = await api('GET', '/records');
          if (!ok) throw new Error(data.message || 'Failed to load records');
          _allRecordsCache = (data.records || []).filter(r => !r.student?.role || r.student.role === 'student');
        } catch (err) {
          el.innerHTML = `<div class="card"><div class="card-body" style="color:var(--error);padding:20px;">&#10060; ${err.message}</div></div>`;
          return;
        }
      }
      renderAllRecordsTable(_allRecordsCache);
    }

    function renderAllRecordsTable(studentRecords) {
      const el = document.getElementById('all-records-content');
      const f = readFilters('ar');
      const filtered = applyFilters(studentRecords, f);

      // Branch label map
      const BRANCH_LABELS = {
        'CSE': 'CSE', 'IT': 'IT', 'Civil': 'Civil', 'Mechanical': 'Mech',
        'Electrical': 'Elec', 'AI/ML': 'AI/ML', 'AIDS': 'AIDS', 'Mechatronics': 'Mecha',
        'EEE': 'EEE', 'ECE': 'ECE'
      };

      const rows = filtered.map(r => {
        const s = r.student || {};
        const m = r.mentor || {};
        const p = r.personal || {};
        const sid = s._id || r.student;
        const sname = s.name || p.name || '&mdash;';
        const branch = p.branch || '';
        const sem = p.currentSemester ? `Sem ${p.currentSemester}` : '&mdash;';
        const backlogCount = computeBacklogs(r);
        const passCount = computePassCount(r);
        const isCleared = backlogCount === 0;
        const subjectCount = (r.performanceChart || []).length;
        const statusBadge = subjectCount === 0
          ? `<span style="font-size:11px;background:#f4f1eb;color:var(--text-muted);padding:3px 9px;border-radius:20px;">No Data</span>`
          : isCleared
            ? `<span style="font-size:11px;background:#e8f8f0;color:#1a7a4a;padding:3px 9px;border-radius:20px;font-weight:600;">&#10003; Cleared</span>`
            : `<span style="font-size:11px;background:#fdecea;color:#c0392b;padding:3px 9px;border-radius:20px;font-weight:600;">&#9888; Backlog Pending</span>`;
        const branchBadge = branch
          ? `<span style="font-size:11px;background:#eef2ff;color:#3730a3;padding:2px 8px;border-radius:20px;">${BRANCH_LABELS[branch] || branch}</span>`
          : `<span style="color:var(--text-muted);">&mdash;</span>`;
        return `<tr>
      <td>
        <strong>${sname}</strong><br>
        <span style="font-size:11px;color:var(--text-muted);">${s.email || ''}</span>
      </td>
      <td>${branchBadge}</td>
      <td style="text-align:center;">${sem}</td>
      <td style="text-align:center;color:#1a7a4a;font-weight:600;">${subjectCount > 0 ? passCount : '&mdash;'}</td>
      <td style="text-align:center;color:${backlogCount > 0 ? '#c0392b' : 'var(--text-muted)'};font-weight:${backlogCount > 0 ? '700' : '400'};">${subjectCount > 0 ? backlogCount : '&mdash;'}</td>
      <td>${statusBadge}</td>
      <td>
        <button onclick="openStudentProfile('${sid}','${sname.replace(/'/g, "\\'")}','personal')"
          style="background:var(--navy);color:var(--gold);border:none;padding:6px 14px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">
          Open Profile &#8594;
        </button>
      </td>
    </tr>`;
      }).join('');

      const emptyRow = filtered.length === 0
        ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:28px;">
         ${(f.search || f.branch || f.semester || f.status) ? '&#128269; No students match the current filters.' : 'No student records found yet.'}
       </td></tr>`
        : '';

      const tbody = el.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = rows || emptyRow;

        const hasFilter = !!(f.search || f.branch || f.semester || f.status || f.sort);
        const countLabel = document.getElementById('ar-count');
        if (countLabel) countLabel.innerHTML = hasFilter ? 'Showing <strong style="color:var(--navy);">' + filtered.length + '</strong> of ' + studentRecords.length + ' student(s)' : '<strong>' + studentRecords.length + '</strong> student(s) total';

        const resetBtn = document.getElementById('ar-reset');
        if (resetBtn) resetBtn.style.display = hasFilter ? 'block' : 'none';

        const clearX = document.getElementById('ar-clear');
        if (clearX) clearX.style.display = f.search ? 'block' : 'none';
        return;
      }

      el.innerHTML = `
    <div class="card" style="overflow:visible;">
      <div class="card-header" style="padding-bottom:0;border-bottom:none;">
        <span class="card-title">All Student Records</span>
        <span style="font-size:12px;color:var(--text-muted);">Click &ldquo;Open Profile&rdquo; to view or edit</span>
      </div>
      ${buildFilterBar('ar', studentRecords.length, filtered.length)}
      <div class="card-body" style="padding:0;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Branch</th>
                <th style="text-align:center;">Semester</th>
                <th style="text-align:center;">Passed</th>
                <th style="text-align:center;">Backlogs</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${rows || emptyRow}</tbody>
          </table>
        </div>
      </div>
    </div>`;
    }

    // ══════════════════════════════════════════════════════
    //  MY ASSIGNED STUDENTS (Mentor)
    // ══════════════════════════════════════════════════════
    let _myStudentsCache = null;

    async function renderMyStudents(forceRefresh = false) {
      const el = document.getElementById('my-students-content');
      if (!_myStudentsCache || forceRefresh) {
        el.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;color:var(--text-muted);padding:30px;">&#9203; Loading your students...</div></div>';
        try {
          const { ok, data } = await api('GET', '/records');
          if (!ok) throw new Error(data.message || 'Failed to load records');
          _myStudentsCache = data.records || [];
        } catch (err) {
          el.innerHTML = `<div class="card"><div class="card-body" style="color:var(--error);padding:20px;">&#10060; ${err.message}</div></div>`;
          return;
        }
      }
      if (_myStudentsCache.length === 0) {
        document.getElementById('my-students-content').innerHTML =
          '<div class="card"><div class="card-body" style="color:var(--text-muted);padding:20px;">No students have been assigned to you yet. Contact your admin.</div></div>';
        return;
      }
      renderMyStudentsCards(_myStudentsCache);
    }

    function renderMyStudentsCards(records) {
      const el = document.getElementById('my-students-content');
      const f = readFilters('ms');
      const filtered = applyFilters(records, f);

      const BRANCH_LABELS = {
        'CSE': 'CSE', 'IT': 'IT', 'Civil': 'Civil', 'Mechanical': 'Mech',
        'Electrical': 'Elec', 'AI/ML': 'AI/ML', 'AIDS': 'AIDS', 'Mechatronics': 'Mecha',
        'EEE': 'EEE', 'ECE': 'ECE'
      };

      const cards = filtered.map(r => {
        const s = r.student || {};
        const p = r.personal || {};
        const sid = s._id || r.student;
        const sname = s.name || p.name || 'Unknown';
        const branch = p.branch || '';
        const sem = p.currentSemester ? `Semester ${p.currentSemester}` : null;
        const interactions = r.interactionRecords || [];
        const lastInteraction = interactions.length
          ? new Date(interactions[interactions.length - 1].date || '').toLocaleDateString()
          : 'None';
        const backlogCount = computeBacklogs(r);
        const passCount = computePassCount(r);
        const subjectCount = (r.performanceChart || []).length;
        const isCleared = backlogCount === 0;

        const statusBadge = subjectCount === 0
          ? `<span style="font-size:11px;background:#f4f1eb;color:var(--text-muted);padding:3px 9px;border-radius:20px;">No Subject Data</span>`
          : isCleared
            ? `<span style="font-size:11px;background:#e8f8f0;color:#1a7a4a;padding:3px 9px;border-radius:20px;font-weight:600;">&#10003; Cleared</span>`
            : `<span style="font-size:11px;background:#fdecea;color:#c0392b;padding:3px 9px;border-radius:20px;font-weight:600;">&#9888; ${backlogCount} Backlog${backlogCount > 1 ? 's' : ''}</span>`;

        return `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;
                  padding:18px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--navy);">${sname}</div>
            <div style="font-size:12px;color:var(--text-muted);">${s.email || ''}</div>
            ${p.admissionNo ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Adm: ${p.admissionNo}</div>` : ''}
          </div>
          <div style="text-align:right;display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
            ${branch ? `<span style="font-size:11px;background:#eef2ff;color:#3730a3;padding:2px 8px;border-radius:20px;">${BRANCH_LABELS[branch] || branch}</span>` : ''}
            ${sem ? `<span style="font-size:11px;background:#f4f1eb;color:var(--text-muted);padding:2px 8px;border-radius:20px;">${sem}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${statusBadge}
          ${subjectCount > 0 ? `<span style="font-size:11px;background:#f4f1eb;padding:3px 9px;border-radius:20px;">&#9989; ${passCount} Passed</span>` : ''}
          <span style="font-size:11px;background:#f4f1eb;padding:3px 9px;border-radius:20px;">&#128172; ${interactions.length} interaction(s)</span>
          <span style="font-size:11px;background:#f4f1eb;padding:3px 9px;border-radius:20px;">&#128197; ${lastInteraction}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px;">
          <button onclick="openStudentProfile('${sid}','${sname.replace(/'/g, "\\'")}','personal')"
            style="background:var(--navy);color:var(--gold);border:none;padding:9px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">
            &#128203; View Profile
          </button>
          <button onclick="openStudentProfile('${sid}','${sname.replace(/'/g, "\\'")}','interaction')"
            style="background:var(--gold);color:var(--navy);border:none;padding:9px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">
            &#128172; Interactions
          </button>
        </div>
      </div>`;
      }).join('');

      const gridHTML = filtered.length
        ? cards
        : `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:28px;">
             ${(f.search || f.branch || f.semester || f.status) ? '&#128269; No students match the current filters.' : 'No students found.'}
           </div>`;

      const gridContainer = el.querySelector('#ms-grid-container');
      if (gridContainer) {
        gridContainer.innerHTML = gridHTML;

        const hasFilter = !!(f.search || f.branch || f.semester || f.status || f.sort);
        const countLabel = document.getElementById('ms-count');
        if (countLabel) countLabel.innerHTML = hasFilter ? 'Showing <strong style="color:var(--navy);">' + filtered.length + '</strong> of ' + records.length + ' student(s)' : '<strong>' + records.length + '</strong> student(s) total';

        const resetBtn = document.getElementById('ms-reset');
        if (resetBtn) resetBtn.style.display = hasFilter ? 'block' : 'none';

        const clearX = document.getElementById('ms-clear');
        if (clearX) clearX.style.display = f.search ? 'block' : 'none';
        return;
      }

      el.innerHTML = `
    <div class="card" style="overflow:visible;">
      <div class="card-header" style="padding-bottom:0;border-bottom:none;">
        <span class="card-title">My Assigned Students</span>
      </div>
      ${buildFilterBar('ms', records.length, filtered.length)}
      <div id="ms-grid-container" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;padding:16px;">
        ${gridHTML}
      </div>
    </div>`;
    }

    // ══════════════════════════════════════════════════════
    //  OPEN STUDENT PROFILE  (admin / mentor)
    //  Loads a student's data into all panels and navigates
    //  to the requested section.
    // ══════════════════════════════════════════════════════
    function updateStudentContextBanner(studentId, studentName) {
      const banner = document.getElementById('student-context-banner');
      if (!banner) return;

      document.getElementById('banner-student-name').textContent = studentName || 'Student Record';
      document.getElementById('banner-student-id').textContent = studentId ? 'ID: ' + studentId.slice(-8) : '';
      banner.classList.add('visible');
      document.getElementById('main-content').classList.add('banner-active');
    }

    async function openStudentProfile(studentId, studentName, section, options = {}) {
      const historyMode = options.historyMode || 'push';

      // 1. Set global context
      selectedStudentId = studentId;
      selectedStudentName = studentName || '';

      // 2. Show fixed context banner
      updateStudentContextBanner(studentId, selectedStudentName);

      // 3. Re-render all panel shells (clears previous student data)
      renderPersonal(); renderFamily(); renderAcademicCred();
      renderPrizes(); renderCoCurricular(); renderAcademicRec();
      renderParticipation(); renderPerformance(); renderImprovement();
      renderInteraction(); renderEffectiveness(); renderOverallScore();

      // 4. Load and populate selected student record
      const rec = await loadStudentRecord();
      if (rec) {
        populateStudentRecord(rec);
        selectedStudentName = rec.personal?.name || rec.student?.name || selectedStudentName || 'Student Record';
        updateStudentContextBanner(studentId, selectedStudentName);
      }

      // 5. For mentors: reveal the student data nav items in the sidebar now that a student is selected
      if (currentUser.role === 'mentor') {
        STUDENT_DATA_PANELS.forEach(panelId => {
          const btn = document.getElementById('nav-' + panelId);
          if (btn) { btn.style.display = ''; btn.classList.remove('locked'); }
        });
      }

      // 6. Navigate to requested section
      navigate(section || 'personal', { historyMode });

      // 7. Show Save buttons now that a student is selected
      updateSaveButtonsForRole();
    }

    function clearStudentContext(options = {}) {
      const historyMode = options.historyMode || 'push';
      const targetPanel = options.targetPanel || 'dashboard';

      selectedStudentId = null;
      selectedStudentName = '';
      const banner = document.getElementById('student-context-banner');
      if (banner) banner.classList.remove('visible');
      const main = document.getElementById('main-content');
      if (main) main.classList.remove('banner-active');
      // Reset all student data panels to empty shells
      renderPersonal(); renderFamily(); renderAcademicCred();
      renderPrizes(); renderCoCurricular(); renderAcademicRec();
      renderParticipation(); renderPerformance(); renderImprovement();
      renderInteraction(); renderEffectiveness(); renderOverallScore();

      // For mentors: hide the student data nav items again (no student selected)
      if (currentUser.role === 'mentor') {
        STUDENT_DATA_PANELS.forEach(panelId => {
          const btn = document.getElementById('nav-' + panelId);
          if (btn) btn.style.display = 'none';
        });
      }

      updateSaveButtonsForRole();
      navigate(targetPanel, { historyMode });
    }

    // Show/hide Save buttons based on role and whether a student is selected
    function updateSaveButtonsForRole() {
      if (currentUser.role === 'student') return; // Students always see save buttons
      const hasStu = !!selectedStudentId;
      document.querySelectorAll('.page-header .btn-action').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || btn.dataset.cspOnClick || '';
        if (onclickAttr.includes('saveSection')) {
          // mentor-profile is the mentor's OWN profile — always show it regardless of student selection
          const isMentorProfile = onclickAttr.includes("'mentor-profile'") || onclickAttr.includes('"mentor-profile"');
          if (isMentorProfile) {
            btn.style.display = '';
          } else {
            btn.style.display = hasStu ? '' : 'none';
          }
        }
      });
    }



    const PDF_SECTIONS = [
      { id: 'cover', label: '📄 Cover Page', icon: '📄' },
      { id: 'personal', label: '🪪 Personal Profile', icon: '🪪' },
      { id: 'family', label: '👨‍👩‍👧 Family Profile', icon: '👨‍👩‍👧' },
      { id: 'academic-cred', label: '🎓 Academic Credentials', icon: '🎓' },
      { id: 'prizes', label: '🏆 Prizes & Activities', icon: '🏆' },
      { id: 'academic-rec', label: '📈 Academic Records', icon: '📈' },
      { id: 'participation', label: '🌟 Participation Records', icon: '🌟' },
      { id: 'performance', label: '📉 Performance Chart', icon: '📉' },
      { id: 'improvement', label: '📈 Improvement Chart', icon: '📈' },
      { id: 'interaction', label: '💬 Interaction Records', icon: '💬' },
      { id: 'overall-score', label: '🏅 Overall Score', icon: '🏅' },
    ];

    function openPdfModal() {
      // Admin/mentor must have a student selected to export
      if (currentUser.role !== 'student' && !selectedStudentId) {
        alert('Please open a student profile first before exporting a PDF.');
        return;
      }

      const modal = document.getElementById('pdf-modal');
      modal.style.display = 'flex';

      // Update modal title to show whose diary is being exported
      const exportName = selectedStudentName || (currentUser.role === 'student' ? currentUser.name : '');
      const titleEl = modal.querySelector('[style*="Playfair Display"]');
      if (titleEl) titleEl.textContent = exportName ? `Export: ${exportName}` : 'Export Student Diary';

      // Render section checkboxes
      const list = document.getElementById('pdf-section-list');
      list.innerHTML = PDF_SECTIONS.map(s => `
    <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:500;transition:border-color 0.2s;user-select:none;"
      onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor=this.querySelector('input').checked?'var(--navy)':'var(--border)'">
      <input type="checkbox" data-pdf-sec="${s.id}" checked onchange="this.closest('label').style.borderColor=this.checked?'var(--navy)':'var(--border)'"
        style="accent-color:var(--navy);width:15px;height:15px;">
      <span>${s.label}</span>
    </label>`).join('');
    }

    function closePdfModal() {
      document.getElementById('pdf-modal').style.display = 'none';
    }

    function pdfSelectAll(checked) {
      document.querySelectorAll('[data-pdf-sec]').forEach(cb => {
        cb.checked = checked;
        cb.closest('label').style.borderColor = checked ? 'var(--navy)' : 'var(--border)';
      });
    }

    // Read a field's current value (works for input, select, textarea)
    function pdfVal(id) {
      const el = document.getElementById(id);
      if (!el) return '';
      return (el.value || '').trim();
    }

    // Read all rows from a table body.
    // Uses the LAST input/select/textarea in each td — this correctly handles cells that
    // contain both a hidden input (carrying a category value) AND a visible input for user data.
    // Falls back to the td's textContent when no input exists (e.g. serial-number cells).
    function pdfTableRows(tbodyId) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return [];
      const rows = [];
      tbody.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('td').forEach(td => {
          const inputs = td.querySelectorAll('input,select,textarea');
          if (inputs.length > 0) {
            // Use the LAST input — hidden inputs always come first (they hold category/sem values),
            // and the last input is the one the user actually fills in.
            // For tds with only one input, last === first, so behaviour is unchanged.
            const lastInput = inputs[inputs.length - 1];
            cells.push((lastInput.value || '').trim());
          } else {
            cells.push(td.textContent.trim());
          }
        });
        rows.push(cells);
      });
      return rows;
    }

    function kvRow(label, value) {
      return `<div class="pdf-kv-item">
    <span class="pdf-kv-label">${label}</span>
    <span class="pdf-kv-value">${value || '<span style="color:#aaa;">—</span>'}</span>
  </div>`;
    }

    function pdfSectionHeader(title) {
      return `<div class="pdf-section-header">${title}</div>`;
    }

    // Build HTML for each section
    function buildCover() {
      // For admin/mentor: use selectedStudentName; for student: use their own form field or login name
      const studentName = pdfVal('p-name') || selectedStudentName || (currentUser?.name || 'Student');
      const admNo = pdfVal('p-admno');
      const regNo = pdfVal('p-regno');
      const photoUrl = document.getElementById('p-photo-data')?.value || '';
      const exportedBy = (currentUser.role !== 'student')
        ? `Exported by: ${currentUser.name} (${currentUser.role.toUpperCase()}) &nbsp;|&nbsp; ` : '';
      const now = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
      return `<div class="pdf-cover">
    <div class="pdf-cover-logo">📘</div>
    <div class="pdf-cover-title">CSIT Mentor Diary</div>
    <div class="pdf-cover-sub">Chhatrapati Shivaji Institute of Technology<br>Teacher Guardian's Comprehensive Record System</div>
    <div class="pdf-cover-divider"></div>
    ${photoUrl ? `<img src="${photoUrl}" alt="" style="width:80px;height:96px;object-fit:cover;border-radius:8px;border:2px solid #c9b87a;margin-bottom:10px;">` : ''}
    <div class="pdf-cover-student">${studentName}</div>
    <div class="pdf-cover-meta">
      ${admNo ? `Admission No: ${admNo}` : ''}
      ${admNo && regNo ? ' &nbsp;|&nbsp; ' : ''}
      ${regNo ? `Registration No: ${regNo}` : ''}
    </div>
    <div class="pdf-cover-date">${exportedBy}Exported on ${now}</div>
  </div>`;
    }

    function buildPersonal() {
      const photoUrl = document.getElementById('p-photo-data')?.value || '';
      const photoHtml = photoUrl
        ? `<img src="${photoUrl}" alt="Profile Photo"
         style="width:90px;height:108px;object-fit:cover;border-radius:6px;
                border:1.5px solid #c9b87a;float:right;margin:0 0 8px 16px;">`
        : '';
      return `<div class="pdf-section">
    ${pdfSectionHeader('I. Personal Profile')}
    <div style="overflow:hidden;">
      ${photoHtml}
      <div class="pdf-kv-grid">
        ${kvRow('Full Name', pdfVal('p-name'))}
        ${kvRow('Admission Number', pdfVal('p-admno'))}
        ${kvRow('Registration Number', pdfVal('p-regno'))}
        ${kvRow('Date of Birth', pdfVal('p-dob'))}
        ${kvRow('Age', pdfVal('p-age'))}
        ${kvRow('Blood Group', pdfVal('p-blood'))}
        ${kvRow('Category', pdfVal('p-cat'))}
        ${kvRow('Personal Cell', pdfVal('p-cell'))}
        ${kvRow('Residence Phone', pdfVal('p-rphone'))}
        ${kvRow('Email', pdfVal('p-email'))}
      </div>
    </div>
    <div style="border:1px solid #d8cdb4;border-top:none;clear:both;">
      <div style="padding:7px 12px;">
        <span class="pdf-kv-label">Address</span>
        <span class="pdf-kv-value" style="display:block;font-size:10.5pt;font-weight:600;color:#1a2332;">${pdfVal('p-addr') || '—'}</span>
      </div>
    </div>
  </div>`;
    }

    function buildFamily() {
      const siblingsRows = pdfTableRows('family-siblings-table').filter(r => r.some(c => c));
      const sibTable = siblingsRows.length ? `
    <table class="pdf-table" style="margin-top:10px;">
      <thead><tr><th>Name</th><th>Relationship</th><th>Education</th><th>Occupation</th><th>Mobile</th></tr></thead>
      <tbody>${siblingsRows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>` : '';

      function parentKvCell(label, value) {
        return `<td style="padding:7px 12px;border:1px solid #d8cdb4;vertical-align:top;width:25%;">
      <span class="pdf-kv-label">${label}</span>
      <span class="pdf-kv-value" style="display:block;">${value || '<span style="color:#aaa;">—</span>'}</span>
    </td>`;
      }
      return `<div class="pdf-section">
    ${pdfSectionHeader('II. Family Profile')}
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <thead>
        <tr>
          <th colspan="2" style="padding:8px 12px;font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:0.5px;background:#faf7f0;border:1px solid #d8cdb4;border-right:none;text-align:left;width:50%;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Father's Details</th>
          <th colspan="2" style="padding:8px 12px;font-weight:700;font-size:9pt;text-transform:uppercase;letter-spacing:0.5px;background:#faf7f0;border:1px solid #d8cdb4;text-align:left;width:50%;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Mother's Details</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          ${parentKvCell("Father's Name", pdfVal('f-fname'))}
          ${parentKvCell('Mobile', pdfVal('f-fmob'))}
          ${parentKvCell("Mother's Name", pdfVal('f-mname'))}
          ${parentKvCell('Mobile', pdfVal('f-mmob'))}
        </tr>
        <tr>
          ${parentKvCell('Occupation', pdfVal('f-focc'))}
          ${parentKvCell('Education', pdfVal('f-fedu'))}
          ${parentKvCell('Occupation', pdfVal('f-mocc'))}
          ${parentKvCell('Education', pdfVal('f-medu'))}
        </tr>
        <tr>
          ${parentKvCell('Monthly Income', pdfVal('f-finc'))}
          <td style="border:1px solid #d8cdb4;"></td>
          ${parentKvCell('Monthly Income', pdfVal('f-minc'))}
          <td style="border:1px solid #d8cdb4;"></td>
        </tr>
      </tbody>
    </table>
    <div class="pdf-kv-grid" style="border-top:none;">
      ${kvRow('Fees Paid By', pdfVal('f-feespaid'))}
      ${kvRow('Staying At', pdfVal('f-staying'))}
    </div>
    ${siblingsRows.length ? `<div style="padding:8px 12px;font-weight:700;font-size:9pt;background:#faf7f0;border:1px solid #d8cdb4;border-top:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Siblings</div>${sibTable}` : ''}
    <div class="pdf-kv-grid" style="border-top:none;">
      ${kvRow("Local Guardian", pdfVal('f-lgname'))}
      ${kvRow('Relationship', pdfVal('f-lgrel'))}
      ${kvRow('LG Contact', pdfVal('f-lgcontact'))}
      ${kvRow('LG Address', pdfVal('f-lgaddr'))}
    </div>
  </div>`;
    }

    function buildAcademicCred() {
      const rows = pdfTableRows('ac-cred-table').filter(r => r.some(c => c));
      const certs = pdfVal('ac-certs');
      if (!rows.length && !certs) return '';
      return `<div class="pdf-section">
    ${pdfSectionHeader('III. Academic Credentials')}
    ${rows.length ? `<table class="pdf-table">
      <thead><tr><th>Examination</th><th>School/College</th><th>Board/University</th><th>Medium</th><th>Year</th><th>%</th><th>Division</th></tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>` : ''}
    ${certs ? `<div style="margin-top:10px;"><div style="font-weight:700;font-size:9pt;margin-bottom:4px;">Certifications</div><div class="pdf-text-block">${certs}</div></div>` : ''}
  </div>`;
    }

    function buildPrizesAndActivities() {
      // Collect prize rows from all three category tbodies
      const cats = ['Academic', 'Co-Curricular', 'Extra-Curricular'];
      const allPrizeRows = [];
      cats.forEach(cat => {
        const safeId = cat.replace(/[^a-zA-Z]/g, '-').toLowerCase();
        const tbody = document.getElementById('prizes-tbody-' + safeId);
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(tr => {
          const tds = tr.querySelectorAll('td');
          // Collect only visible user inputs — skip hidden inputs (category/rowspan cells)
          const dataInputs = [];
          tds.forEach(td => {
            const visibleInputs = [...td.querySelectorAll('input,select,textarea')]
              .filter(i => i.type !== 'hidden');
            if (visibleInputs.length > 0) {
              dataInputs.push((visibleInputs[visibleInputs.length - 1].value || '').trim());
            }
          });
          // Only include rows with at least one filled value
          if (dataInputs.some(v => v)) {
            // Always output exactly 4 columns: category, institution, activity, prize
            allPrizeRows.push([
              cat,
              dataInputs[0] || '—',
              dataInputs[1] || '—',
              dataInputs[2] || '—'
            ]);
          }
        });
      });
      const prizeRows = allPrizeRows;
      const hobbiesEl = document.getElementById('p-hobbies');
      const hobbies = hobbiesEl ? hobbiesEl.value.trim() : '';

      const prizeTable = prizeRows.length ? `
    <table class="pdf-table" style="margin-bottom:12px;">
      <thead><tr><th>Category</th><th>Institution</th><th>Activity</th><th>Prize Details</th></tr></thead>
      <tbody>${prizeRows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>` : '<p style="color:#aaa;font-size:10pt;padding:8px 0;">No prizes recorded.</p>';

      const coInfo = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;table-layout:fixed;">
      <tbody>
        <tr>
          <td style="width:50%;padding:0 5px 0 0;vertical-align:top;">
            <div class="pdf-info-card">
              <div class="pdf-info-card-title" style="color:#2d7a4f;">CO-CURRICULAR</div>
              <div class="pdf-info-card-body">Supplements syllabi learning — Certificate Courses, Sporting Activities, Club Activities (Science Club, etc.)</div>
            </div>
          </td>
          <td style="width:50%;padding:0 0 0 5px;vertical-align:top;">
            <div class="pdf-info-card">
              <div class="pdf-info-card-title" style="color:#5b2c8d;">EXTRA-CURRICULAR</div>
              <div class="pdf-info-card-body">Personality &amp; well-being activities — NSS, NCC, Red Cross, Scouts &amp; Guides</div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>`;

      return `<div class="pdf-section">
    ${pdfSectionHeader('IV & V. Prizes, Co-Curricular & Extra-Curricular')}
    <div style="padding:10px 0 4px;">${prizeTable}</div>
    ${coInfo}
    <div style="font-weight:700;font-size:9pt;margin-bottom:4px;">Special Interests &amp; Hobbies</div>
    <div class="pdf-text-block">${hobbies || '—'}</div>
  </div>`;
    }

    function buildAcademicRec() {
      // The academic-rec-table uses data-sem / data-field attributes — not a simple grid.
      // Re-use the same logic as collectAcademicRec() to read the correct values.
      const table = document.getElementById('academic-rec-table');
      if (!table) return '';
      const semMap = {};
      table.querySelectorAll('input[data-sem]').forEach(input => {
        const sem = input.getAttribute('data-sem');
        const field = input.getAttribute('data-field');
        if (!semMap[sem]) semMap[sem] = { sem };
        semMap[sem][field] = input.value.trim();
      });
      const entries = Object.values(semMap).filter(r =>
        Object.values(r).some(v => v && v !== r.sem)
      );
      if (!entries.length) return '';
      const bodyRows = entries.map(r => `<tr>
    <td>${r.sem || '—'}</td>
    <td>${r.monthYear || '—'}</td>
    <td>${r.theoryMarks || '—'}</td>
    <td>${r.spi || '—'}</td>
    <td>${r.practicalPct || '—'}</td>
    <td>${r.backlogs || '—'}</td>
    <td>${r.att || '—'}</td>
    <td>${r.ta || '—'}</td>
    <td>${r.ct1 || '—'}</td>
    <td>${r.ct2 || '—'}</td>
  </tr>`).join('');
      return `<div class="pdf-section">
    ${pdfSectionHeader('Academic Records (Semester-wise)')}
    <table class="pdf-table">
      <thead><tr><th>Sem</th><th>Month/Year</th><th>Theory %</th><th>SPI</th><th>Practical %</th><th>Backlogs</th><th>Att%</th><th>TA</th><th>CT1</th><th>CT2</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
    }

    function buildParticipation() {
      const rows = pdfTableRows('participation-table-body').filter(r => r.some(c => c));
      if (!rows.length) return '';
      return `<div class="pdf-section">
    ${pdfSectionHeader('Participation Records')}
    <table class="pdf-table">
      <thead><tr><th>Sem</th><th>Date</th><th>Type</th><th>Title</th><th>Venue</th><th>Organizer</th><th>Award</th><th>Details</th></tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>`;
    }

    function buildPerformanceTable(tableId, title) {
      const rows = pdfTableRows(tableId).filter(r => r.some(c => c));
      if (!rows.length) return '';
      return `<div class="pdf-section">
    ${pdfSectionHeader(title)}
    <table class="pdf-table">
      <thead><tr><th>Sem</th><th>Subject</th><th>Category</th><th>Att%</th><th>Class Test</th><th>ESE</th><th>Presentations</th><th>Date</th></tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>`;
    }

    function buildInteraction() {
      const rows = pdfTableRows('interaction-table').filter(r => r.some(c => c));
      if (!rows.length) return '';
      return `<div class="pdf-section">
    ${pdfSectionHeader('Interaction Records')}
    <table class="pdf-table">
      <thead><tr><th>Date</th><th>Issue / Discussion</th><th>TG Remarks</th><th>Follow-up Date</th><th>Follow-up Remark</th></tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>`;
    }

    function buildOverallScore() {
      const rows = pdfTableRows('overall-score-table').filter(r => r.some(c => c));
      if (!rows.length) return '';
      return `<div class="pdf-section">
    ${pdfSectionHeader('Overall Score (Semester-wise)')}
    <table class="pdf-table">
      <thead><tr><th>Sem</th><th>A(30)</th><th>B(20)</th><th>C(10)</th><th>D(10)</th><th>E(20)</th><th>F(10)</th><th>Total</th><th>Performance</th></tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    <p style="font-size:8pt;color:#5a6a7e;margin-top:6px;">Excellent &gt;90 | Very Good 70–89 | Good 50–69 | Satisfactory &lt;50</p>
  </div>`;
    }

    const SECTION_BUILDERS = {
      'cover': buildCover,
      'personal': buildPersonal,
      'family': buildFamily,
      'academic-cred': buildAcademicCred,
      'prizes': buildPrizesAndActivities,
      'academic-rec': buildAcademicRec,
      'participation': buildParticipation,
      'performance': () => buildPerformanceTable('performance-table', 'Performance Chart'),
      'improvement': () => buildPerformanceTable('improvement-table', 'Improvement Chart'),
      'interaction': buildInteraction,
      'overall-score': buildOverallScore,
    };

    function generatePDF() {
      const selected = [...document.querySelectorAll('[data-pdf-sec]:checked')].map(c => c.dataset.pdfSec);
      if (!selected.length) { alert('Please select at least one section.'); return; }

      const paper = document.querySelector('input[name="pdf-paper"]:checked').value;

      // Build print HTML
      let html = `<div style="font-family:'DM Sans',Arial,sans-serif;color:#1a2332;">`;

      selected.forEach(id => {
        const builder = SECTION_BUILDERS[id];
        if (builder) {
          const content = builder();
          if (content) html += content;
        }
      });

      html += `<div class="pdf-page-footer">CSIT Mentor Diary &mdash; ${pdfVal('p-name') || currentUser?.name || ''} &mdash; Confidential</div>`;
      html += `</div>`;

      // Set paper size via @page
      const pageStyle = paper === 'Letter'
        ? `@page { size: letter; margin: 15mm; }`
        : `@page { size: A4; margin: 15mm; }`;

      document.getElementById('pdf-print-area').innerHTML = html;

      // Inject page style
      let pageEl = document.getElementById('pdf-page-size');
      if (!pageEl) {
        pageEl = document.createElement('style');
        pageEl.id = 'pdf-page-size';
        document.head.appendChild(pageEl);
      }
      pageEl.textContent = pageStyle;

      closePdfModal();

      // Small delay to let DOM settle, then print
      setTimeout(() => {
        window.print();
        // Clear print area after printing
        setTimeout(() => { document.getElementById('pdf-print-area').innerHTML = ''; }, 1000);
      }, 120);
    }

    // Close modal on backdrop click
    document.getElementById('pdf-modal').addEventListener('click', function (e) {
      if (e.target === this) closePdfModal();
    });

    // ══════════════════════════════════════════════════════
    //  ABOUT APP VIEW (Dynamic Standalone Route & Actions)
    // ══════════════════════════════════════════════════════
    let aboutPageInitialized = false;

    function hideAboutPage() {
      const page = document.getElementById('about-page');
      if (page) page.style.display = 'none';
      window.removeEventListener('scroll', handleAboutScrollEffects);
    }

    function showAboutPage() {
      const page = document.getElementById('about-page');
      if (!page) return;
      
      // Reset animations
      page.querySelectorAll('.about-section').forEach(sec => {
        sec.classList.remove('visible');
      });

      page.style.display = 'block';
      // Load config and render
      renderAboutPageData();

      // Scroll reveals setup
      window.addEventListener('scroll', handleAboutScrollEffects);
      // Run once immediately
      setTimeout(handleAboutScrollEffects, 100);
    }

    function renderAboutPageData() {
      if (typeof AboutAppConfig === 'undefined') return;
      const { developer, app } = AboutAppConfig;

      // Hero Elements
      document.getElementById('about-app-name').textContent = app.name;
      document.getElementById('about-app-tagline').textContent = app.tagline;
      document.getElementById('about-app-desc').textContent = app.description;

      // Social Links
      const socialsBox = document.getElementById('about-social-links');
      if (socialsBox) {
        socialsBox.innerHTML = `
          <a href="${developer.socials.github}" target="_blank" rel="noopener noreferrer" class="dev-social-btn" style="pointer-events: auto; z-index: 100; position: relative;">GitHub</a>
          <a href="${developer.socials.linkedin}" target="_blank" rel="noopener noreferrer" class="dev-social-btn" style="pointer-events: auto; z-index: 100; position: relative;">LinkedIn</a>
          <a href="${developer.socials.email}" class="dev-social-btn" style="pointer-events: auto; z-index: 100; position: relative;">Email</a>
        `;
      }

      // App Specifications Elements
      document.getElementById('about-spec-version').textContent = app.metadata.version;
      document.getElementById('about-spec-release').textContent = app.metadata.releaseDate;
      const appSpecsBuild = document.getElementById('about-spec-build');
      if (appSpecsBuild) appSpecsBuild.textContent = app.metadata.buildNumber;

      // Legal Anchors
      document.getElementById('about-link-privacy').href = app.metadata.privacyPolicyUrl;
      document.getElementById('about-link-terms').href = app.metadata.termsConditionsUrl;
      document.getElementById('about-link-website').href = app.metadata.websiteUrl;
      document.getElementById('about-link-contact').href = app.metadata.contactUrl;

      // Spotlight Mouse Movement Handler & Intersection Observer reveals
      if (!aboutPageInitialized) {
        const pageContainer = document.getElementById('about-page');
        pageContainer.addEventListener('mousemove', e => {
          const hoverItems = pageContainer.querySelectorAll('.dev-portfolio-card, .info-card');
          hoverItems.forEach(item => {
            const rect = item.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            item.style.setProperty('--mouse-x', `${x}px`);
            item.style.setProperty('--mouse-y', `${y}px`);
          });
        });

        // IntersectionObserver for Scroll Reveals
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            }
          });
        }, { threshold: 0.15 });

        pageContainer.querySelectorAll('.about-section').forEach(sec => {
          observer.observe(sec);
        });

        aboutPageInitialized = true;
      }
    }

    function handleAboutScrollEffects() {
      // Static scroll reveal helper
    }

    let toastTimeout = null;

    function showAboutToast(message) {
      const toast = document.getElementById('about-share-toast');
      if (!toast) return;
      if (toastTimeout) {
        clearTimeout(toastTimeout);
      }
      toast.textContent = message;
      toast.classList.add('visible');
      toastTimeout = setTimeout(() => {
        toast.classList.remove('visible');
        toastTimeout = null;
      }, 2500);
    }

    function shareApp() {
      const url = (typeof AboutAppConfig !== 'undefined' && AboutAppConfig.app && AboutAppConfig.app.metadata && AboutAppConfig.app.metadata.shareUrl)
        ? AboutAppConfig.app.metadata.shareUrl
        : window.location.href;

      const copyToClipboardFallback = (text) => {
        return new Promise((resolve, reject) => {
          try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
              resolve();
            } else {
              reject(new Error("execCommand copy failed"));
            }
          } catch (err) {
            reject(err);
          }
        });
      };

      const copyPromise = (navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        ? navigator.clipboard.writeText(url)
        : copyToClipboardFallback(url);

      copyPromise
        .then(() => {
          showAboutToast("Link copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy text: ", err);
          showAboutToast("Failed to copy link. Please copy it manually.");
        });
    }

    function rateApp() {
      const ratingModal = document.getElementById('about-rating-modal');
      if (ratingModal) {
        ratingModal.style.display = ratingModal.style.display === 'none' ? 'block' : 'none';
      }
    }

    function submitRating(stars) {
      const starsContainer = document.querySelector('.rating-stars');
      if (!starsContainer) return;
      const spans = starsContainer.querySelectorAll('span');
      spans.forEach((span, index) => {
        if (index < stars) {
          span.classList.add('active');
        } else {
          span.classList.remove('active');
        }
      });
      showAboutToast(`Thank you for rating us ${stars} stars!`);
      setTimeout(() => {
        const ratingModal = document.getElementById('about-rating-modal');
        if (ratingModal) {
          ratingModal.style.display = 'none';
        }
      }, 2000);
    }

    // High-performance landing animations. Visual-only: no auth, API, form, or data logic.
    (function initLandingPerformanceAnimations() {
      const landing = document.getElementById('landing-page');
      if (!landing) return;

      const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const nav = landing.querySelector('.landing-nav');
      const signalEl = landing.querySelector('.landing-signal');
      const panelEl = landing.querySelector('.landing-panel');

      let pointerRaf = null;
      let scrollRaf = null;
      let pointerX = 0;
      let pointerY = 0;
      let scrollY = window.scrollY || 0;
      let navScrolled = false;
      let cachedRect = null;

      function getLandingRect() {
        if (!cachedRect) {
          cachedRect = landing.getBoundingClientRect();
        }
        return cachedRect;
      }

      window.addEventListener('resize', () => {
        cachedRect = null;
      }, { passive: true });

      function requestPointerUpdate() {
        if (pointerRaf) return;
        pointerRaf = requestAnimationFrame(() => {
          pointerRaf = null;
          updatePointer();
        });
      }

      function requestScrollUpdate() {
        if (scrollRaf) return;
        scrollRaf = requestAnimationFrame(() => {
          scrollRaf = null;
          updateScroll();
        });
      }

      function reveal(el, index = 0) {
        if (!el || el.dataset.motionPlayed === 'true') return;
        el.dataset.motionPlayed = 'true';
        el.style.setProperty('--motion-delay', `${Math.min(index * 54, 280)}ms`);
        el.classList.add('motion-in');
      }

      function updatePointer() {
        if (signalEl) {
          signalEl.style.setProperty('--landing-drift-x-reverse', `${pointerX * -6}px`);
          signalEl.style.setProperty('--landing-drift-y-reverse', `${pointerY * -6}px`);
        }
        if (panelEl) {
          panelEl.style.setProperty('--landing-tilt-x', `${pointerY * -0.55}deg`);
          panelEl.style.setProperty('--landing-tilt-y', `${pointerX * 0.55}deg`);
        }
      }

      let lastRingOpacity = null;
      function updateScroll() {
        const scrollRatio = Math.min(1, Math.max(0, scrollY / 700));
        if (panelEl) {
          const newOpacity = (0.24 + (scrollRatio * 0.22)).toFixed(3);
          if (newOpacity !== lastRingOpacity) {
            lastRingOpacity = newOpacity;
            panelEl.style.setProperty('--landing-panel-ring-opacity', newOpacity);
          }
        }

        const shouldShrink = scrollY > 18;
        if (nav && shouldShrink !== navScrolled) {
          navScrolled = shouldShrink;
          nav.classList.toggle('is-scrolled', navScrolled);
        }
      }

      function initScrollReveals() {
        const selector = [
          '.landing-feature-card',
          '.landing-benefit-card',
          '.landing-role-card',
          '.landing-step',
          '.landing-side-card',
          '.landing-mini-grid > article',
          '.landing-proof-card',
          '.landing-section-header',
          '.landing-cta-banner'
        ].join(',');
        const items = Array.from(landing.querySelectorAll(selector));

        if (!('IntersectionObserver' in window)) {
          items.forEach((el, index) => reveal(el, index));
          return;
        }

        const observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const group = Array.from((entry.target.parentElement || landing).querySelectorAll(selector));
            reveal(entry.target, Math.max(0, group.indexOf(entry.target)));
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.16, rootMargin: '0px 0px -10% 0px' });

        items.forEach(el => observer.observe(el));
      }

      if (reducedMotion) {
        landing.querySelectorAll('.landing-feature-card, .landing-benefit-card, .landing-role-card, .landing-step, .landing-side-card, .landing-mini-grid > article, .landing-proof-card, .landing-section-header, .landing-cta-banner')
          .forEach(el => {
            el.classList.add('motion-in');
            el.style.opacity = '1';
            el.style.transform = 'none';
          });
      } else {
        initScrollReveals();
      }

      updatePointer();
      updateScroll();

      if (!reducedMotion) {
        landing.addEventListener('pointermove', event => {
          const rect = getLandingRect();
          pointerX = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
          pointerY = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
          requestPointerUpdate();
        }, { passive: true });
      }

      window.addEventListener('scroll', () => {
        scrollY = window.scrollY || 0;
        requestScrollUpdate();
      }, { passive: true });
    })();

    // ══════════════════════════════════════════════════════
    //  ABOUT APP ACTIONS (Share & Rate)
    // ══════════════════════════════════════════════════════
    function shareApp() {
      const url = window.location.origin;
      const text = (typeof AboutAppConfig !== 'undefined' && AboutAppConfig.app) 
        ? `Check out CSIT Mentor Diary: ${AboutAppConfig.app.tagline}` 
        : 'Check out CSIT Mentor Diary';
      const toast = document.getElementById('about-share-toast');

      const copyToClipboardFallback = (textToCopy) => {
        return new Promise((resolve, reject) => {
          try {
            const textArea = document.createElement("textarea");
            textArea.value = textToCopy;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
              resolve();
            } else {
              reject(new Error("execCommand copy failed"));
            }
          } catch (err) {
            reject(err);
          }
        });
      };

      const fallbackCopy = () => {
        const copyPromise = (navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
          ? navigator.clipboard.writeText(`${text} - ${url}`)
          : copyToClipboardFallback(`${text} - ${url}`);
          
        copyPromise.then(() => {
          if (toast) {
            toast.textContent = "Link copied to clipboard!";
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 3000);
          }
        }).catch(err => {
          console.error('Failed to copy', err);
          if (toast) {
            toast.textContent = "Failed to copy link";
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 3000);
          }
        });
      };

      if (navigator.share) {
        navigator.share({
          title: 'CSIT Mentor Diary',
          text: text,
          url: url
        }).catch(err => {
          console.error('Share failed', err);
          fallbackCopy();
        });
      } else {
        fallbackCopy();
      }
    }
    window.shareApp = shareApp;

    function rateApp() {
      const modal = document.getElementById('about-rating-modal');
      if (modal) {
        modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
      }
    }
    window.rateApp = rateApp;

    function submitRating(stars) {
      const modal = document.getElementById('about-rating-modal');
      const toast = document.getElementById('about-share-toast');
      
      if (modal) {
        const starElements = modal.querySelectorAll('.rating-stars span');
        starElements.forEach((span, index) => {
          if (index < stars) {
            span.style.color = '#c9a84c'; // Gold color
          } else {
            span.style.color = '#5a6a7e';
          }
        });
      }
      
      if (toast) {
        toast.textContent = `Thank you for your ${stars}-star rating!`;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3000);
      }
      
      setTimeout(() => {
        if (modal) modal.style.display = 'none';
        // Reset stars
        if (modal) {
          const starElements = modal.querySelectorAll('.rating-stars span');
          starElements.forEach(span => {
            span.style.color = '#5a6a7e';
          });
        }
      }, 1500);
    }
    window.submitRating = submitRating;

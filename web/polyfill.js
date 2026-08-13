// Force inject Gemini 3.7 models if not present in dropdown
(function injectGemini37Models() {
  const models = [
    { value: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash (High)' },
    { value: 'gemini-3.7-flash-medium', label: 'Gemini 3.7 Flash (Medium)' },
    { value: 'gemini-3.7-flash-low', label: 'Gemini 3.7 Flash (Low)' }
  ];

  function checkAndInject() {
    var selectors = document.querySelectorAll("select, [role='listbox'], [data-radix-popper-content-wrapper]");
    selectors.forEach(function(el) {
      if (el.innerHTML.includes("Gemini") && !el.innerHTML.includes("Gemini 3.7 Flash (High)")) {
        if (el.tagName === "SELECT") {
          models.forEach(function(m) {
            if (!el.querySelector('option[value="' + m.value + '"]')) {
              var opt = document.createElement("option");
              opt.value = m.value;
              opt.innerText = m.label;
              el.appendChild(opt);
            }
          });
        }
      }
    });
  }
  setInterval(checkAndInject, 1500);
})();


// Auto-Redirect to /login on Authentication Error / Unauthenticated State
(function checkAuthFailure() {
  function check() {
    if (window.location.pathname === "/login") return;
    var text = document.body ? (document.body.innerText || "") : "";
    if (text.includes("Authentication Required") || text.includes("To start using the agent, please sign in") || (text.includes("Authentication failed") && text.includes("Sign In"))) {
      console.warn("[AuthGuard] Unauthenticated state detected in DOM! Redirecting to /login...");
      window.location.href = "/login";
    }
  }

  var observer = new MutationObserver(check);
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    check();
  } else {
    document.addEventListener("DOMContentLoaded", function() {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      check();
    });
  }
})();


// Suppress routine reconnectableStream logs from console
(function filterStreamLogs() {
  var origError = console.error;
  var origWarn = console.warn;

  console.error = function() {
    var str = String(arguments[0] || "");
    if (str.includes("stream error:") || str.includes("Error in input stream")) return;
    if (arguments[1] && String(arguments[1]).includes("Error in input stream")) return;
    return origError.apply(console, arguments);
  };

  console.warn = function() {
    var str = String(arguments[0] || "");
    if (str.includes("disconnected") || str.includes("Disconnected") || str.includes("retrying in")) return;
    return origWarn.apply(console, arguments);
  };
})();

// Antigravity Web Polyfill & Native Bridges (Synchronous Top-Level)
(function(win) {
  function createEmitter() {
    var listeners = [];
    var fn = function(cb) {
      if (typeof cb === "function") listeners.push(cb);
      return function() {
        listeners = listeners.filter(function(l) { return l !== cb; });
      };
    };
    fn.fire = function(data) {
      listeners.forEach(function(l) { try { l(data); } catch(e) {} });
    };
    fn.event = fn;
    return fn;
  }

  // 1. Native Storage Bridge (Required for main.js z6a init)
  var storageEmitter = createEmitter();
  win.nativeStorage = win.nativeStorage || {
    getItems: function() {
      var r = {};
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          r[k] = localStorage.getItem(k);
        }
      } catch(e) {}
      return Promise.resolve(r);
    },
    updateItems: function(changes) {
      try {
        for (var k in changes) {
          if (changes[k] === null || changes[k] === undefined) {
            localStorage.removeItem(k);
          } else {
            localStorage.setItem(k, changes[k]);
          }
        }
        storageEmitter.fire(changes);
      } catch(e) {}
      return Promise.resolve();
    },
    onChanged: storageEmitter
  };

  // 2. Electron Native Bridge
  var maximizeEmitter = createEmitter();
  win.electronNative = win.electronNative || {
    getZoomLevel: function() { return 1; },
    setZoomLevel: function() {},
    onZoomIn: function() {},
    onZoomOut: function() {},
    onResetZoom: function() {},
    setTitleBarOverlay: function() {},
    minimize: function() {},
    maximize: function() {},
    unmaximize: function() {},
    isMaximized: function() { return false; },
    close: function() {},
    toggleDevTools: function() {},
    zoomIn: function() {},
    zoomOut: function() {},
    resetZoom: function() {},
    onMaximizeChange: maximizeEmitter
  };

  // 3. Electron Updater Bridge
  var stateChangedEmitter = createEmitter();
  win.electronUpdater = win.electronUpdater || {
    onStateChanged: stateChangedEmitter,
    checkForUpdates: function() { return Promise.resolve(); },
    downloadUpdate: function() { return Promise.resolve(); },
    applyUpdate: function() { return Promise.resolve(); },
    quitAndInstall: function() {}
  };

  // 4. Native Notifications Bridge
  var clickEmitter = createEmitter();
  win.nativeNotifications = win.nativeNotifications || {
    send: function(n) {
      try {
        if (win.Notification && Notification.permission === "granted") {
          new Notification(n.title || "Antigravity", { body: n.body || "" });
        }
      } catch(e) {}
      return Promise.resolve();
    },
    onClicked: clickEmitter,
    openSystemPreferences: function() {},
    showNotification: function() {},
    requestPermission: function() {
      if (win.Notification) {
        return Notification.requestPermission().then(function() { return "granted"; });
      }
      return Promise.resolve("granted");
    }
  };

  // 5. Dialog, IDE, DeepLink, Agent Bridges
  win.dialog = win.dialog || {
    showOpenDialog: function() { return Promise.resolve({ canceled: true, filePaths: [] }); }
  };

  win.ide = win.ide || {
    isInstalled: function() { return Promise.resolve(false); }
  };

  var deepLinkEmitter = createEmitter();
  win.deepLink = win.deepLink || {
    getStoredDeepLink: function() { return Promise.resolve(null); },
    onDeepLink: deepLinkEmitter
  };

  win.agent = win.agent || {
    updateActiveAgentCount: function() { return Promise.resolve(); }
  };

  // Redirect /onboarding to /login
  if (win.location.pathname.startsWith("/onboarding")) {
    win.location.href = "/login";
    return;
  }

  // Intercept Sign in / Logout buttons
  document.addEventListener("click", function(e) {
    var target = e.target;
    if (!target) return;
    var text = (target.innerText || target.textContent || "").toLowerCase().trim();
    if (text.includes("sign in") || text.includes("log out") || text.includes("logout") || text.includes("войти")) {
      if (win.location.pathname !== "/login") {
        win.location.href = "/login";
      }
    }
  }, true);

  // Favicon Injector
  (function setGlobalFavicon() {
    function injectFav() {
      var links = document.querySelectorAll("link[rel*='icon']");
      links.forEach(function(l) { l.parentNode.removeChild(l); });

      var svgLink = document.createElement("link");
      svgLink.rel = "icon";
      svgLink.type = "image/svg+xml";
      svgLink.href = "/favicon.svg";

      var icoLink = document.createElement("link");
      icoLink.rel = "alternate icon";
      icoLink.type = "image/x-icon";
      icoLink.href = "/favicon.ico";

      if (document.head) {
        document.head.appendChild(svgLink);
        document.head.appendChild(icoLink);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectFav);
    } else {
      injectFav();
    }
  })();

  })(window);

// Accounts Menu Dropdown Module for Top Navbar
  

// Accounts Menu Dropdown Module for Top Navbar
(function initAccountsMenu() {
  function injectAccountsMenu() {
    var buttons = document.querySelectorAll("button");
    var windowBtn = null;
    buttons.forEach(function(btn) {
      if (btn.textContent && btn.textContent.trim() === "Window") {
        windowBtn = btn;
      }
    });

    if (!windowBtn) return;

    var parentRel = windowBtn.closest(".relative");
    if (!parentRel) return;

    if (parentRel.querySelector(".ag-accounts-dropdown")) return;

    windowBtn.textContent = "Accounts";
    windowBtn.classList.add("ag-accounts-btn");

    var dropdown = document.createElement("div");
    dropdown.className = "ag-accounts-dropdown";
    dropdown.style.cssText = "display:none; position:absolute; top:calc(100% + 4px); left:0; min-width:260px; background:#181818; border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:6px; box-shadow:0 12px 30px rgba(0,0,0,0.85); z-index:999999; font-family:Inter,sans-serif;";

    parentRel.appendChild(dropdown);

    windowBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      var isOpen = dropdown.style.display === "block";
      closeAllDropdowns();
      if (!isOpen) {
        renderAccountsDropdown(dropdown);
        dropdown.style.display = "block";
      }
    });

    document.addEventListener("click", function() {
      dropdown.style.display = "none";
    });
    
    dropdown.addEventListener("click", function(e) {
      e.stopPropagation();
    });
  }

  function closeAllDropdowns() {
    var dds = document.querySelectorAll(".ag-accounts-dropdown");
    dds.forEach(function(d) { d.style.display = "none"; });
  }

  async function renderAccountsDropdown(dropdown) {
    dropdown.innerHTML = '<div style="padding:10px; text-align:center; color:#888; font-size:12px;">Загрузка аккаунтов...</div>';
    try {
      var res = await fetch("/auth-api/accounts");
      var data = await res.json();
      if (!data.success || !data.accounts) {
        dropdown.innerHTML = '<div style="padding:10px; color:#f87171; font-size:12px;">Ошибка загрузки</div>';
        return;
      }

      var html = '<div style="padding:4px 8px 8px; font-size:11px; font-weight:600; color:#666; text-transform:uppercase; letter-spacing:0.05em;">Подключенные аккаунты</div>';

      data.accounts.forEach(function(acc) {
        var initial = (acc.name || acc.email || "A").charAt(0).toUpperCase();
        var isActive = acc.isActive;
        var activeBadge = isActive ? '<span style="font-size:10px; background:rgba(49,134,255,0.2); color:#60a5fa; border:1px solid rgba(49,134,255,0.3); padding:1px 5px; border-radius:8px; font-weight:600;">✓</span>' : '';
        var activeBg = isActive ? 'background:rgba(49,134,255,0.1); border-color:rgba(49,134,255,0.3);' : 'background:#222222; border-color:rgba(255,255,255,0.06);';

        html += `
          <div class="ag-acc-item" data-id="${acc.id}" style="display:flex; align-items:center; justify-space-between; padding:8px 10px; border-radius:6px; margin-bottom:4px; border:1px solid transparent; ${activeBg} cursor:pointer; transition:all 0.15s ease;">
            <div style="display:flex; align-items:center; gap:8px; min-width:0;">
              <div style="width:24px; height:24px; border-radius:50%; background:linear-gradient(135deg,#3186ff,#fc413d); display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:700; flex-shrink:0;">${initial}</div>
              <div style="display:flex; flex-direction:column; min-width:0;">
                <div style="font-size:12px; font-weight:500; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(acc.name)}</div>
                <div style="font-size:11px; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(acc.email)}</div>
              </div>
            </div>
            ${activeBadge}
          </div>
        `;
      });

      html += `
        <div style="height:1px; background:rgba(255,255,255,0.08); margin:6px 0;"></div>
        <div id="agAddAccBtn" style="display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:6px; font-size:12px; color:#e3e3e3; cursor:pointer; transition:background 0.15s ease;" onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background='transparent'">
          <span>➕</span> <span>Add Account</span>
        </div>
        <div id="agManageAccBtn" style="display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:6px; font-size:12px; color:#e3e3e3; cursor:pointer; transition:background 0.15s ease;" onmouseover="this.style.background='#2a2a2a'" onmouseout="this.style.background='transparent'">
          <span>⚙️</span> <span>Accounts Manager</span>
        </div>
      `;

      dropdown.innerHTML = html;

      dropdown.querySelectorAll(".ag-acc-item").forEach(function(item) {
        item.addEventListener("mouseenter", function() {
          if (!this.style.background.includes("rgba")) this.style.background = "#2a2a2a";
        });
        item.addEventListener("mouseleave", function() {
          if (!this.style.background.includes("rgba")) this.style.background = "#222222";
        });
        item.addEventListener("click", function() {
          var accId = this.getAttribute("data-id");
          dropdown.style.display = "none";
          triggerGlobalSwitch(accId);
        });
      });

      var addBtn = document.getElementById("agAddAccBtn");
      if (addBtn) addBtn.addEventListener("click", function() { window.location.href = "/login"; });

      var manageBtn = document.getElementById("agManageAccBtn");
      if (manageBtn) manageBtn.addEventListener("click", function() { window.location.href = "/login"; });

    } catch(e) {
      dropdown.innerHTML = '<div style="padding:10px; color:#f87171; font-size:12px;">Ошибка: ' + e.message + '</div>';
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  setInterval(injectAccountsMenu, 800);
})();

async function triggerGlobalSwitch(accId) {
  var modal = document.getElementById("agGlobalProgressModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "agGlobalProgressModal";
    modal.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(13,13,13,0.92); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; z-index:9999999; font-family:Inter,sans-serif;";
    modal.innerHTML = `
      <div style="background:#181818; border:1px solid rgba(255,255,255,0.12); border-radius:16px; padding:1.75rem; max-width:440px; width:92%; text-align:center; box-shadow:0 24px 50px rgba(0,0,0,0.85);">
        <div id="agIcon" style="font-size:2.2rem; margin-bottom:0.6rem;">⚡</div>
        <h3 id="agTitle" style="font-size:1.1rem; font-weight:600; color:#f1f5f9; margin-bottom:0.4rem;">Переключение аккаунта</h3>
        <p id="agStatus" style="font-size:0.85rem; color:#888888; margin-bottom:1.25rem;">Синхронизация токена авторизации...</p>
        <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden; margin-bottom:0.75rem;">
          <div id="agBarFill" style="width:15%; height:100%; background:linear-gradient(90deg, #3186ff, #00b95c); transition:width 0.4s ease;"></div>
        </div>
        <div id="agPercent" style="font-size:0.75rem; color:#666666; font-weight:600;">15%</div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  var bar = document.getElementById("agBarFill");
  var status = document.getElementById("agStatus");
  var percent = document.getElementById("agPercent");
  var icon = document.getElementById("agIcon");

  bar.style.width = "20%";
  status.innerText = "Установка нового токена авторизации...";
  percent.innerText = "20%";
  icon.innerText = "⚡";

  try {
    var res = await fetch("/auth-api/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: accId })
    });
    var data = await res.json();
    if (!data.success) {
      modal.style.display = "none";
      alert("Ошибка переключения аккаунта: " + (data.error || "Неизвестная ошибка"));
      return;
    }

    bar.style.width = "65%";
    status.innerText = "Перезапуск сервиса Antigravity...";
    percent.innerText = "65%";

    var attempts = 0;
    var maxAttempts = 25;
    var checkReady = async function() {
      attempts++;
      var curPct = Math.min(95, 65 + attempts * 1.5);
      bar.style.width = curPct + "%";
      percent.innerText = Math.round(curPct) + "%";

      try {
        var pingRes = await fetch("/auth-api/ping");
        var pingData = await pingRes.json();
        if (pingData.ready) {
          bar.style.width = "100%";
          percent.innerText = "100%";
          status.innerText = "Аккаунт успешно активирован! Перезагрузка IDE...";
          icon.innerText = "✓";
          setTimeout(function() { window.location.reload(); }, 600);
          return;
        }
      } catch(e) {}

      if (attempts < maxAttempts) {
        setTimeout(checkReady, 700);
      } else {
        bar.style.width = "100%";
        percent.innerText = "100%";
        status.innerText = "Готово! Перезагрузка...";
        setTimeout(function() { window.location.reload(); }, 700);
      }
    };

    setTimeout(checkReady, 800);

  } catch(e) {
    modal.style.display = "none";
    alert("Ошибка сети при смене аккаунта: " + e.message);
  }
}

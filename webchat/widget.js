/*
 * Nuvadesk web chat widget. Embed on the client's site:
 *   <script src="https://ops.<DOMAIN>/widget.js" data-client="<client_id>" async></script>
 * Talks only to /in/<client_id>/webchat* on the same host that served this file.
 * Styles live in a shadow root so the host page and the widget can't affect each other.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.dataset.client) return;
  var clientId = script.dataset.client;
  var base = new URL(script.src).origin + "/in/" + encodeURIComponent(clientId) + "/webchat";
  var storeKey = "nuvadesk:" + clientId;
  var state = { token: null, open: false, sending: false, pollTimer: null, accent: "#0E7C86", name: "Assistant", business: "" };

  function load() {
    try { return JSON.parse(localStorage.getItem(storeKey) || "null"); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(storeKey, JSON.stringify(v)); } catch (e) { /* private mode: session stays in memory */ }
  }

  var host = document.createElement("div");
  host.setAttribute("data-nuvadesk-chat", "");
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.launcher{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;padding:14px 18px;color:#fff;background:var(--accent);font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.18)}' +
    '.launcher:focus-visible,.send:focus-visible,.close:focus-visible{outline:3px solid #1f2933;outline-offset:2px}' +
    '.panel{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);display:none;flex-direction:column;background:#fff;color:#1f2933;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);overflow:hidden}' +
    '.panel.open{display:flex;animation:in .18s ease-out}' +
    '@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '@media (prefers-reduced-motion:reduce){.panel.open{animation:none}}' +
    '.head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--accent);color:#fff}' +
    '.head b{font-size:15px}.head small{display:block;opacity:.85;font-size:12px}' +
    '.close{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}' +
    '.log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f7f8fa}' +
    '.msg{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
    '.bot{background:#fff;border:1px solid #e5e7eb;align-self:flex-start;border-bottom-left-radius:4px}' +
    '.me{background:var(--accent);color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
    '.note{align-self:center;color:#6b7280;font-size:12px}' +
    'form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}' +
    'textarea{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:9px 10px;font-size:14px;max-height:96px;color:#1f2933;background:#fff}' +
    'textarea:focus{outline:2px solid var(--accent);border-color:transparent}' +
    '.send{border:0;border-radius:10px;padding:0 14px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer}' +
    '.send[disabled]{opacity:.5;cursor:default}' +
    '@media (prefers-color-scheme:dark){.panel{background:#111827;color:#f3f4f6}.log{background:#0b1220}.bot{background:#1f2937;border-color:#374151;color:#f3f4f6}form{background:#111827;border-color:#374151}textarea{background:#1f2937;color:#f3f4f6;border-color:#374151}}' +
    '</style>' +
    '<button class="launcher" type="button" aria-expanded="false" aria-controls="nuvadesk-panel">Chat with us</button>' +
    '<section class="panel" id="nuvadesk-panel" role="dialog" aria-label="Chat">' +
    '  <div class="head"><div><b class="title">Chat</b><small>Virtual assistant · replies in seconds</small></div><button class="close" type="button" aria-label="Close chat">×</button></div>' +
    '  <div class="log" role="log" aria-live="polite"></div>' +
    '  <form><label for="nuvadesk-input" style="position:absolute;left:-9999px">Message</label><textarea id="nuvadesk-input" rows="1" placeholder="Type your message…" maxlength="2000"></textarea><button class="send" type="submit">Send</button></form>' +
    '</section>';

  var $ = function (sel) { return root.querySelector(sel); };
  var launcher = $(".launcher"), panel = $(".panel"), log = $(".log"), form = $("form"), input = $("textarea"), send = $(".send");

  function add(text, who) {
    var el = document.createElement("div");
    el.className = "msg " + who;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    var saved = load() || {};
    saved.history = (saved.history || []).concat([{ t: text, w: who }]).slice(-40);
    saved.token = state.token;
    save(saved);
  }

  function request(method, path, body) {
    return fetch(base + path, {
      method: method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function ensureSession() {
    if (state.token) return Promise.resolve();
    return request("POST", "/session").then(function (s) {
      state.token = s.token;
      state.accent = s.accent || state.accent;
      state.name = s.assistant || state.name;
      state.business = s.business || "";
      applyBranding();
      var saved = load() || {};
      saved.token = s.token;
      saved.branding = { accent: state.accent, name: state.name, business: state.business };
      save(saved);
    });
  }

  function applyBranding() {
    host.style.setProperty("--accent", state.accent);
    $(".title").textContent = state.business ? state.business : state.name;
  }

  function poll() {
    if (!state.token || !state.open) return;
    request("GET", "/poll?token=" + encodeURIComponent(state.token)).then(function (r) {
      (r.messages || []).forEach(function (m) { add(m.text, "bot"); });
    }).catch(function () { /* transient; next poll retries */ });
  }

  function setOpen(open) {
    state.open = open;
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    clearInterval(state.pollTimer);
    if (open) {
      state.pollTimer = setInterval(poll, 5000);
      ensureSession().then(function () { input.focus(); }).catch(function () {
        add("Chat is unavailable right now. Please call us instead.", "note");
      });
    } else {
      launcher.focus();
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || state.sending) return;
    state.sending = true;
    send.disabled = true;
    input.value = "";
    add(text, "me");
    var sendOnce = function () {
      return ensureSession().then(function () { return request("POST", "", { token: state.token, text: text }); });
    };
    sendOnce()
      .catch(function (err) {
        // Expired or foreign session token: start a new session and try once more.
        if (String(err && err.message) !== "HTTP 400") throw err;
        state.token = null;
        return sendOnce();
      })
      .then(function (r) { (r.replies || []).forEach(function (t) { add(t, "bot"); }); })
      .catch(function () { add("Sorry, that didn't send. Please try again.", "note"); })
      .then(function () { state.sending = false; send.disabled = false; input.focus(); });
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  launcher.addEventListener("click", function () { setOpen(!state.open); });
  $(".close").addEventListener("click", function () { setOpen(false); });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });

  var saved = load();
  if (saved) {
    state.token = saved.token || null;
    if (saved.branding) { state.accent = saved.branding.accent; state.name = saved.branding.name; state.business = saved.branding.business; }
    (saved.history || []).forEach(function (m) {
      var el = document.createElement("div");
      el.className = "msg " + m.w;
      el.textContent = m.t;
      log.appendChild(el);
    });
  }
  applyBranding();
  (document.body || document.documentElement).appendChild(host);
})();

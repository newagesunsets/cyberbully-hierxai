function pageText() {
  // Pull visible text; PDF viewer selections also work for "selection" path
  const b = document.body;
  if (!b) return "";
  // remove scripts/styles
  const clone = b.cloneNode(true);
  [...clone.querySelectorAll('script,style,noscript,svg,canvas')].forEach(n => n.remove());
  return clone.innerText || "";
}

function ensureOverlay() {
  let el = document.getElementById("cyberxai-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "cyberxai-overlay";
    el.innerHTML = `
      <div class="cxai-card">
        <div class="cxai-header">
          <span id="cxai-title">CyberXAI</span>
          <button id="cxai-close" title="Close">✕</button>
        </div>
        <pre id="cxai-body"></pre>
      </div>`;
    document.documentElement.appendChild(el);
    document.getElementById("cxai-close").onclick = () => el.remove();
  }
  return el;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.cmd === "ping") {
    sendResponse({ ok: true });
    return true;
  }

  if (msg && msg.cmd === "getSelectionText") {
    const text = (window.getSelection && window.getSelection().toString()) || "";
    sendResponse({ text });
    return true;
  }

  if (msg && msg.cmd === "getPageText") {
    const b = document.body;
    if (!b) { sendResponse({ text: "" }); return true; }
    const clone = b.cloneNode(true);
    [...clone.querySelectorAll('script,style,noscript,svg,canvas')].forEach(n => n.remove());
    const text = (clone.innerText || "").slice(0, 50000);
    sendResponse({ text });
    return true;
  }

  if (msg && msg.cmd === "showOverlay") {
    const el = ensureOverlay();
    el.querySelector("#cxai-title").textContent = msg.payload?.title || "CyberXAI";
    el.querySelector("#cxai-body").textContent = msg.payload?.body || "";
  }
});

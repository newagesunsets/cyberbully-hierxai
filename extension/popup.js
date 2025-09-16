async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { cmd: "ping" });
    return true; // already injected
  } catch (e) {
    // Inject CSS then JS
    try { await chrome.scripting.insertCSS({ target: { tabId }, files: ["overlay.css"] }); } catch {}
    await chrome.scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
    // tiny wait to let it initialize
    await new Promise(r => setTimeout(r, 50));
    return true;
  }
}

async function sendWithEnsure(tabId, cmd) {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, { cmd });
}

function connectHost() {
  return chrome.runtime.connectNative("com.cyberxai.native");
}

document.getElementById("btnSel").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const out = document.getElementById("out");

  try {
    const sel = await sendWithEnsure(tab.id, "getSelectionText");
    const text = (sel && sel.text) ? sel.text.trim() : "";
    if (!text) { out.textContent = "No selection on this tab."; return; }

    const port = connectHost();
    port.onMessage.addListener((msg) => {
      if (msg.ok && msg.mode === "classify") {
        const r = msg.result;
        out.textContent = r.binary === "bullying"
          ? `CYBERBULLYING (${r.type})  p=${r.p_bully.toFixed(3)}`
          : `NOT CYBERBULLYING  p=${r.p_bully.toFixed(3)}`;
      } else out.textContent = "Host error.";
      port.disconnect();
    });
    port.postMessage({ cmd: "classify", text });
  } catch (e) {
    out.textContent = "Cannot talk to this page. Try reloading it.";
    console.error(e);
  }
};

document.getElementById("btnPage").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const out = document.getElementById("out");

  try {
    const page = await sendWithEnsure(tab.id, "getPageText");
    const text = (page && page.text) ? page.text.trim() : "";
    if (!text) { out.textContent = "No page text."; return; }

    const port = connectHost();
    port.onMessage.addListener((msg) => {
      if (msg.ok && msg.mode === "scan") {
        const res = msg.result;
        if (!res.hits || res.hits.length === 0) {
          out.textContent = `No bullying detected (chunks: ${res.total_chunks}).`;
        } else {
          out.textContent = res.hits.slice(0,5).map(h =>
            `[${h.type}] p=${h.p_bully.toFixed(2)} — ${h.snippet}`
          ).join("\n");
        }
      } else out.textContent = "Host error.";
      port.disconnect();
    });
    port.postMessage({ cmd: "scan", text });
  } catch (e) {
    out.textContent = "Cannot talk to this page. Try reloading it.";
    console.error(e);
  }
};

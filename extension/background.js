// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cyberxai-selection",
    title: "Check cyberbullying (selected text)",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "cyberxai-scan-page",
    title: "Scan page for cyberbullying",
    contexts: ["page"]
  });
});

async function getSelection(tabId) {
  return chrome.tabs.sendMessage(tabId, { cmd: "getSelectionText" });
}
async function getPageText(tabId) {
  return chrome.tabs.sendMessage(tabId, { cmd: "getPageText" });
}

function connectHost() {
  return chrome.runtime.connectNative("com.cyberxai.native");
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  try {
    if (info.menuItemId === "cyberxai-selection") {
      const sel = await getSelection(tab.id);
      const text = (sel && sel.text) ? sel.text.trim() : "";
      if (!text) {
        chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI", body: "No selection detected." }});
        return;
      }
      const port = connectHost();
      port.onMessage.addListener((msg) => {
        if (msg.ok && msg.mode === "classify") {
          const r = msg.result;
          const body = r.binary === "bullying"
            ? `Result: CYBERBULLYING (${r.type})\nP(bully)=${r.p_bully.toFixed(2)}`
            : `Result: NOT CYBERBULLYING\nP(bully)=${r.p_bully.toFixed(2)}`;
          chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI — Selection", body }});
        } else {
          chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI", body: "Host error." }});
        }
        port.disconnect();
      });
      port.postMessage({ cmd: "classify", text });
    }

    if (info.menuItemId === "cyberxai-scan-page") {
      const page = await getPageText(tab.id);
      const text = (page && page.text) ? page.text.trim() : "";
      if (!text) {
        chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI", body: "No text found on page." }});
        return;
      }
      const port = connectHost();
      port.onMessage.addListener((msg) => {
        if (msg.ok && msg.mode === "scan") {
          const res = msg.result;
          if (!res.hits || res.hits.length === 0) {
            chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI — Page Scan", body: `No bullying detected (chunks: ${res.total_chunks}).` }});
          } else {
            const top = res.hits.slice(0, 5).map(h =>
              `• [${h.type}] p=${h.p_bully.toFixed(2)} — ${h.snippet}`
            ).join("\n");
            chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: `CyberXAI — ${res.hits.length} hit(s)`, body: top }});
          }
        } else {
          chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI", body: "Host error." }});
        }
        port.disconnect();
      });
      port.postMessage({ cmd: "scan", text });
    }
  } catch (e) {
    chrome.tabs.sendMessage(tab.id, { cmd: "showOverlay", payload: { title: "CyberXAI", body: "Extension error: " + String(e) }});
  }
});

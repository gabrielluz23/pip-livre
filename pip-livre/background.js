// Lista padrão de sites (já liberados em host_permissions no manifest).
const SITES_PADRAO = ["netflix.com", "crunchyroll.com"];
const ID_SCRIPT = "botao-pip";

// Padrão de URL que cobre o domínio e os subdomínios (ex.: static.crunchyroll.com).
const padroes = (dominio) => [`*://*.${dominio}/*`];

// ---------- Botão flutuante: registrado só para os sites da lista que têm permissão
async function sitesLiberados() {
  const { sites } = await chrome.storage.sync.get("sites");
  const lista = Array.isArray(sites) ? sites : [];
  const liberados = [];
  for (const d of lista) {
    if (await chrome.permissions.contains({ origins: padroes(d) })) liberados.push(d);
  }
  return liberados;
}

let fila = Promise.resolve();
function sincronizarScripts() {
  // Encadeia as chamadas para não registrar duas vezes em paralelo.
  fila = fila.then(async () => {
    const liberados = await sitesLiberados();
    const existentes = await chrome.scripting.getRegisteredContentScripts({ ids: [ID_SCRIPT] });
    if (existentes.length) await chrome.scripting.unregisterContentScripts({ ids: [ID_SCRIPT] });
    if (!liberados.length) return;

    await chrome.scripting.registerContentScripts([{
      id: ID_SCRIPT,
      js: ["botao.js"],
      matches: liberados.flatMap(padroes),
      allFrames: true,
      runAt: "document_idle",
      persistAcrossSessions: true
    }]);

    // Abas já abertas desses sites recebem o botão sem precisar recarregar.
    const abas = await chrome.tabs.query({ url: liberados.flatMap(padroes) });
    for (const aba of abas) {
      chrome.scripting.executeScript({ target: { tabId: aba.id, allFrames: true }, files: ["botao.js"] })
        .catch(() => {});
    }
  }).catch((erro) => console.warn("[PiP Livre] Falha ao registrar o botão:", erro));
  return fila;
}

chrome.runtime.onInstalled.addListener(async () => {
  const { sites } = await chrome.storage.sync.get("sites");
  if (!Array.isArray(sites)) await chrome.storage.sync.set({ sites: SITES_PADRAO });
  sincronizarScripts();
});
chrome.runtime.onStartup.addListener(sincronizarScripts);
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "sync" && mudancas.sites) sincronizarScripts();
});
chrome.permissions.onAdded.addListener(sincronizarScripts);
chrome.permissions.onRemoved.addListener(sincronizarScripts);

// ---------- Abrir o PiP em qualquer aba (usa activeTab)
// Atalho de teclado (Alt+Shift+P).
chrome.commands.onCommand.addListener(async (comando, tab) => {
  if (comando !== "alternar-pip") return;
  const aba = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (aba) alternarPiP(aba.id);
});

// Botão "Open PiP in this tab" do painel.
chrome.runtime.onMessage.addListener((msg, _remetente, responder) => {
  if (msg && msg.tipo === "alternar-pip") {
    alternarPiP(msg.tabId).then(responder);
    return true;
  }
});

async function alternarPiP(tabId) {
  try {
    // allFrames: true alcança players em iframe nos sites com permissão
    // (ex.: o player da Crunchyroll, em static.crunchyroll.com).
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["pip.js"]
    });
    const algumVideo = results.some((r) => r && r.result === true);
    if (!algumVideo) avisar(tabId, "—", "No video found on this page");
    return algumVideo;
  } catch (erro) {
    // Ex.: páginas internas (opera://, chrome://) ou lojas de extensões.
    avisar(tabId, "✕", "PiP can't be used on this page");
    return false;
  }
}

function avisar(tabId, texto, titulo) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
  chrome.action.setBadgeText({ tabId, text: texto });
  chrome.action.setTitle({ tabId, title: titulo });
  setTimeout(() => {
    chrome.action.setBadgeText({ tabId, text: "" });
    chrome.action.setTitle({ tabId, title: "PiP Livre: sites" });
  }, 2500);
}

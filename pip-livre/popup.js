// Painel da extensão: lista de sites onde o botão PiP aparece.
// Cada site da lista precisa de permissão de acesso, pedida ao adicioná-lo.

const lista = document.getElementById("lista");
const vazio = document.getElementById("vazio");
const contagem = document.getElementById("contagem");
const form = document.getElementById("form-adicionar");
const campo = document.getElementById("campo-site");
const erro = document.getElementById("erro");
const botaoAtual = document.getElementById("adicionar-atual");
const botaoPiP = document.getElementById("abrir-pip");

let sites = [];
let liberados = new Set(); // sites da lista que já têm permissão
let abaAtual = null;
let dominioAtual = null;

const padroes = (dominio) => [`*://*.${dominio}/*`];

// Aceita "netflix.com", "www.netflix.com" ou uma URL inteira.
function normalizar(texto) {
  let t = texto.trim().toLowerCase();
  if (!t) return null;
  if (!/^[a-z]+:\/\//.test(t)) t = "https://" + t;
  try {
    const host = new URL(t).hostname.replace(/^www\./, "");
    return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

function jaCoberto(dominio) {
  return sites.some((d) => dominio === d || dominio.endsWith("." + d));
}

async function atualizarLiberados() {
  const resultado = new Set();
  for (const d of sites) {
    if (await chrome.permissions.contains({ origins: padroes(d) })) resultado.add(d);
  }
  liberados = resultado;
}

// Pede a permissão do site. Precisa ser chamada direto no clique (sem await antes),
// senão o navegador recusa o pedido.
function pedirPermissao(dominio) {
  return chrome.permissions.request({ origins: padroes(dominio) }).catch(() => false);
}

// Adiciona o site à lista e pede a permissão no mesmo clique.
// A lista é salva antes do pedido: se o painel fechar enquanto o navegador
// pergunta, o site continua na lista e a extensão o ativa quando a permissão chegar.
function adicionar(dominio) {
  const novos = [...new Set([...sites, dominio])].sort();
  chrome.storage.sync.set({ sites: novos });
  const pedido = pedirPermissao(dominio);
  sites = novos;
  desenhar();
  pedido.then(async () => {
    await atualizarLiberados();
    desenhar();
  });
}

async function remover(dominio) {
  sites = sites.filter((d) => d !== dominio);
  await chrome.storage.sync.set({ sites });
  // Devolve a permissão (os sites padrão vêm do manifest e não podem ser devolvidos).
  await chrome.permissions.remove({ origins: padroes(dominio) }).catch(() => {});
  await atualizarLiberados();
  desenhar();
}

function desenhar() {
  lista.replaceChildren(
    ...sites.map((dominio) => {
      const li = document.createElement("li");
      const nome = document.createElement("span");
      nome.className = "nome";
      nome.textContent = dominio;
      li.append(nome);

      if (!liberados.has(dominio)) {
        const permitir = document.createElement("button");
        permitir.className = "permitir";
        permitir.type = "button";
        permitir.textContent = "Allow access";
        permitir.title = `Allow PiP Livre to show the PiP button on ${dominio}`;
        permitir.addEventListener("click", () => {
          pedirPermissao(dominio).then(async () => {
            await atualizarLiberados();
            desenhar();
          });
        });
        li.append(permitir);
      }

      const botaoRemover = document.createElement("button");
      botaoRemover.className = "remover";
      botaoRemover.type = "button";
      botaoRemover.textContent = "×";
      botaoRemover.title = `Remove ${dominio}`;
      botaoRemover.setAttribute("aria-label", `Remove ${dominio}`);
      botaoRemover.addEventListener("click", () => remover(dominio));
      li.append(botaoRemover);
      return li;
    })
  );
  vazio.hidden = sites.length > 0;
  contagem.textContent = sites.length === 1 ? "1 site" : `${sites.length} sites`;

  // Atalho para adicionar o site da aba atual.
  if (dominioAtual && !jaCoberto(dominioAtual)) {
    botaoAtual.textContent = `+ Add this site (${dominioAtual})`;
    botaoAtual.hidden = false;
  } else {
    botaoAtual.hidden = true;
  }
}

function mostrarErro(msg) {
  erro.textContent = msg;
  erro.hidden = !msg;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const dominio = normalizar(campo.value);
  if (!dominio) return mostrarErro("Enter a valid domain, like primevideo.com.");
  if (sites.includes(dominio)) return mostrarErro(`${dominio} is already in the list.`);
  mostrarErro("");
  campo.value = "";
  adicionar(dominio);
});

campo.addEventListener("input", () => mostrarErro(""));

botaoAtual.addEventListener("click", () => {
  if (dominioAtual) adicionar(dominioAtual);
});

botaoPiP.addEventListener("click", async () => {
  if (!abaAtual) return;
  await chrome.runtime.sendMessage({ tipo: "alternar-pip", tabId: abaAtual.id });
  window.close();
});

async function iniciar() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  abaAtual = aba || null;
  if (aba && aba.url && /^https?:/.test(aba.url)) {
    dominioAtual = normalizar(aba.url);
  } else {
    botaoPiP.disabled = true;
    botaoPiP.style.opacity = "0.5";
    botaoPiP.title = "PiP can't be used on this page";
  }

  const salvo = await chrome.storage.sync.get("sites");
  sites = Array.isArray(salvo.sites) ? [...salvo.sites].sort() : ["crunchyroll.com", "netflix.com"];
  await atualizarLiberados();
  desenhar();
}

iniciar();

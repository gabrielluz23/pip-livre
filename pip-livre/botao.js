// Botão flutuante de PiP que aparece sobre o vídeo quando o mouse passa por cima.
// Roda apenas nos sites da lista (e seus iframes) e só observa a posição do mouse:
// não lê o conteúdo da página e não envia nada para lugar nenhum.

(() => {
  if (window.__pipLivreBotao) return;
  window.__pipLivreBotao = true;

  const TAMANHO_MINIMO = { largura: 240, altura: 135 }; // ignora miniaturas e prévias
  const TEMPO_PARA_ESCONDER = 2500;

  // ---------- Elemento do botão (isolado em Shadow DOM para o CSS do site não interferir)
  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; display: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      button {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 12px 0 10px;
        border-radius: 18px;
        background: rgba(20, 20, 24, 0.82);
        color: #fff;
        font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.18);
        transition: background 0.15s ease;
        user-select: none;
      }
      button[hidden] { display: none; }
      button:hover { background: rgba(250, 30, 78, 0.95); border-color: transparent; }
      button:focus-visible { outline: 2px solid #fa1e4e; outline-offset: 2px; }
      .fechar { width: 36px; padding: 0; justify-content: center; font-size: 20px; font-weight: 400; }
      .grupo {
        display: flex;
        gap: 6px;
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 0.15s ease, transform 0.15s ease;
      }
      .grupo.visivel { opacity: 1; transform: none; }
      svg { width: 18px; height: 18px; flex: none; }
    </style>
    <div class="grupo">
      <button class="principal" type="button" aria-label="Open Picture-in-Picture">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="2.5" y="4.5" width="19" height="15" rx="2"/>
          <rect x="12" y="11.5" width="7" height="5" rx="1" fill="currentColor" stroke="none"/>
        </svg>
        <span>PiP</span>
      </button>
      <button class="fechar" type="button" aria-label="Exit Picture-in-Picture" title="Exit PiP" hidden>×</button>
    </div>`;
  const grupo = shadow.querySelector(".grupo");
  const botao = shadow.querySelector(".principal");
  const botaoFechar = shadow.querySelector(".fechar");
  const rotulo = shadow.querySelector("span");

  let videoAtual = null;
  let timerEsconder = null;

  // ---------- Lista de sites (editável no painel da extensão)
  // Confere o domínio deste frame e também o da página principal, para que
  // players em iframe de outro domínio funcionem com o site cadastrado.
  const dominios = [location.hostname];
  if (location.ancestorOrigins) {
    for (const origem of location.ancestorOrigins) {
      try { dominios.push(new URL(origem).hostname); } catch {}
    }
  }

  let siteNaLista = false;
  function aplicarLista(sites) {
    const lista = Array.isArray(sites) ? sites : [];
    siteNaLista = dominios.some((h) => lista.some((d) => h === d || h.endsWith("." + d)));
  }
  chrome.storage.sync.get("sites").then(({ sites }) => aplicarLista(sites)).catch(() => {});
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === "sync" && mudancas.sites) aplicarLista(mudancas.sites.newValue);
  });

  // ---------- Encontrar vídeos (inclusive dentro de Shadow DOM), com cache
  let cacheVideos = [];
  let ultimaBusca = 0;

  function buscarVideos(raiz, lista) {
    raiz.querySelectorAll("video").forEach((v) => lista.push(v));
    raiz.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) buscarVideos(el.shadowRoot, lista);
    });
    return lista;
  }

  function videosDaPagina() {
    const agora = Date.now();
    if (agora - ultimaBusca > 2000) {
      cacheVideos = buscarVideos(document, []);
      ultimaBusca = agora;
    }
    return cacheVideos;
  }

  // Este script só é carregado nos sites da lista; a checagem abaixo esconde o
  // botão se o site for removido da lista com a aba aberta.
  function precisaDoBotao(_video) {
    return siteNaLista || !!document.pictureInPictureElement;
  }

  function videoSobOMouse(x, y) {
    let escolhido = null;
    let maiorArea = 0;
    for (const v of videosDaPagina()) {
      if (!v.isConnected || v.readyState === 0) continue;
      if (!precisaDoBotao(v)) continue;
      const r = v.getBoundingClientRect();
      if (r.width < TAMANHO_MINIMO.largura || r.height < TAMANHO_MINIMO.altura) continue;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const area = r.width * r.height;
      if (area > maiorArea) {
        maiorArea = area;
        escolhido = v;
      }
    }
    return escolhido;
  }

  // ---------- Mostrar / posicionar / esconder
  function anexar() {
    // Em tela cheia, só o que está dentro do elemento em tela cheia aparece.
    let pai = document.fullscreenElement || document.documentElement;
    if (pai.tagName === "VIDEO") pai = document.documentElement;
    if (host.parentNode !== pai) pai.appendChild(host);
  }

  function posicionar(video) {
    const r = video.getBoundingClientRect();
    const margem = 14;
    const larguraBotao = grupo.offsetWidth || 80;
    host.style.top = `${Math.max(r.top, 0) + margem}px`;
    const esquerda = Math.max(r.left, 0);
    const direita = Math.min(r.right, window.innerWidth);
    host.style.left = `${(esquerda + direita) / 2 - larguraBotao / 2}px`;
  }

  function atualizarRotulo() {
    const emPiP = !!document.pictureInPictureElement;
    rotulo.textContent = emPiP ? "Bring to front" : "PiP";
    botao.setAttribute(
      "aria-label",
      emPiP ? "Bring the Picture-in-Picture window to the front" : "Open Picture-in-Picture"
    );
    botaoFechar.hidden = !emPiP;
    if (videoAtual && host.style.display !== "none") posicionar(videoAtual);
  }

  function mostrar(video) {
    videoAtual = video;
    anexar();
    atualizarRotulo();
    host.style.display = "block";
    posicionar(video);
    requestAnimationFrame(() => grupo.classList.add("visivel"));
    clearTimeout(timerEsconder);
    timerEsconder = setTimeout(esconder, TEMPO_PARA_ESCONDER);
  }

  function esconder() {
    clearTimeout(timerEsconder);
    grupo.classList.remove("visivel");
    timerEsconder = setTimeout(() => {
      host.style.display = "none";
    }, 160);
  }

  // ---------- Abrir / fechar o PiP
  function liberarEPedirPiP(video) {
    const estavaBloqueado =
      video.disablePictureInPicture || video.hasAttribute("disablepictureinpicture");
    video.removeAttribute("disablePictureInPicture");
    video.disablePictureInPicture = false;

    const observador = new MutationObserver(() => {
      if (video.hasAttribute("disablePictureInPicture")) {
        video.removeAttribute("disablePictureInPicture");
      }
    });
    observador.observe(video, { attributes: true, attributeFilter: ["disablepictureinpicture"] });

    // Ao sair do PiP, devolve o bloqueio original para que o botão do próprio
    // Opera não apareça junto com o nosso.
    const restaurar = () => {
      observador.disconnect();
      if (estavaBloqueado) video.setAttribute("disablepictureinpicture", "");
    };
    video.addEventListener("leavepictureinpicture", restaurar, { once: true });

    return video.requestPictureInPicture().catch((erro) => {
      video.removeEventListener("leavepictureinpicture", restaurar);
      restaurar();
      console.warn("[PiP Livre] Could not open PiP:", erro);
    });
  }

  // Botão principal: abre o PiP ou, se já estiver aberto, traz a janela para frente.
  // A extensão não pode mover a janela de PiP; reabri-la faz o navegador
  // criá-la de novo, sempre por cima das outras janelas.
  async function abrirOuTrazerParaFrente() {
    const emPiP = document.pictureInPictureElement;
    if (emPiP) {
      await document.exitPictureInPicture().catch(() => {});
      // Espera o evento de saída terminar antes de reabrir.
      await new Promise((r) => setTimeout(r, 0));
      await liberarEPedirPiP(emPiP);
    } else if (videoAtual) {
      await liberarEPedirPiP(videoAtual);
    }
    atualizarRotulo();
    esconder();
  }

  async function sairDoPiP() {
    await document.exitPictureInPicture().catch(() => {});
    atualizarRotulo();
    esconder();
  }

  // ---------- Eventos
  botao.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    abrirOuTrazerParaFrente();
  });

  botaoFechar.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    sairDoPiP();
  });

  // Impede que o clique nos botões chegue ao player (que pausaria o vídeo).
  for (const tipo of ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "touchstart"]) {
    grupo.addEventListener(tipo, (e) => e.stopPropagation());
  }

  // Mantém visível enquanto o mouse está sobre os botões.
  grupo.addEventListener("mouseenter", () => clearTimeout(timerEsconder));
  grupo.addEventListener("mouseleave", () => {
    timerEsconder = setTimeout(esconder, TEMPO_PARA_ESCONDER);
  });

  let agendado = false;
  document.addEventListener(
    "mousemove",
    (e) => {
      if (agendado) return;
      agendado = true;
      requestAnimationFrame(() => {
        agendado = false;
        if (e.composedPath().includes(host)) return;
        const video = videoSobOMouse(e.clientX, e.clientY);
        if (video) mostrar(video);
        else if (host.style.display !== "none") esconder();
      });
    },
    { passive: true, capture: true }
  );

  document.addEventListener("mouseleave", esconder);
  window.addEventListener("scroll", esconder, { passive: true, capture: true });
  document.addEventListener("fullscreenchange", () => {
    esconder();
    anexar();
  });
  document.addEventListener("enterpictureinpicture", atualizarRotulo, true);
  document.addEventListener("leavepictureinpicture", atualizarRotulo, true);
})();

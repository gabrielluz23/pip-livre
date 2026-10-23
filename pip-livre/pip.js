// Injetado em cada frame da aba pelo atalho ou pelo painel da extensão.
// Retorna true se este frame tinha um vídeo e agiu sobre ele.

(() => {
  // 1) Se este frame já está em PiP, fecha.
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
    return true;
  }

  // 2) Encontra todos os <video>, inclusive dentro de Shadow DOM.
  function encontrarVideos(raiz, lista = []) {
    raiz.querySelectorAll("video").forEach((v) => lista.push(v));
    raiz.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) encontrarVideos(el.shadowRoot, lista);
    });
    return lista;
  }

  function area(video) {
    const r = video.getBoundingClientRect();
    return Math.max(0, r.width) * Math.max(0, r.height);
  }

  const candidatos = encontrarVideos(document).filter(
    (v) => v.readyState > 0 && area(v) > 100 * 60 // ignora vídeos minúsculos (anúncios, prévias)
  );
  if (candidatos.length === 0) return false;

  // 3) Prefere o vídeo que está tocando; depois, o maior na tela.
  candidatos.sort((a, b) => {
    const tocandoA = !a.paused && !a.ended ? 1 : 0;
    const tocandoB = !b.paused && !b.ended ? 1 : 0;
    if (tocandoA !== tocandoB) return tocandoB - tocandoA;
    return area(b) - area(a);
  });

  const video = candidatos[0];

  // 4) Remove o bloqueio que sites como a Netflix colocam no player.
  const estavaBloqueado =
    video.disablePictureInPicture || video.hasAttribute("disablepictureinpicture");
  video.removeAttribute("disablePictureInPicture");
  video.disablePictureInPicture = false;

  // Alguns players recolocam o bloqueio; este observador o remove de novo
  // enquanto o vídeo estiver em PiP.
  const observador = new MutationObserver(() => {
    if (video.hasAttribute("disablePictureInPicture")) {
      video.removeAttribute("disablePictureInPicture");
    }
  });
  observador.observe(video, { attributes: true, attributeFilter: ["disablepictureinpicture"] });

  // Ao sair do PiP, devolve o bloqueio original (evita o botão do Opera
  // aparecer junto com o da extensão).
  const restaurar = () => {
    observador.disconnect();
    if (estavaBloqueado) video.setAttribute("disablepictureinpicture", "");
  };
  video.addEventListener("leavepictureinpicture", restaurar, { once: true });

  video.requestPictureInPicture().catch((erro) => {
    video.removeEventListener("leavepictureinpicture", restaurar);
    restaurar();
    console.warn("[PiP Livre] Could not open PiP:", erro);
  });

  return true;
})();

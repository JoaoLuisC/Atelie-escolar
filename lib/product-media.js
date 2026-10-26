// ════════════════════════════════════════════════════════════════════
// LINKS DE MÍDIA E ARQUIVO DO PRODUTO — validados na gravação (13-ROADMAP §3.11).
//
// Imagens, vídeos e o arquivo de download eram gravados como texto livre. O
// registro de 24/05 dizia que um schema bloqueava `javascript:`/`data:`, mas ele
// morava numa rota de dev que foi removida — a proteção afirmada não existia.
//
// As regras:
//   • imagem e vídeo: só `https://` com host. Viram `src` na página pública;
//     `http:` quebraria o HTTPS da loja e `javascript:`/`data:` não têm uso
//     legítimo aqui.
//   • arquivo de download: precisa ser uma referência que a ENTREGA aceita —
//     a mesma `parseStorageRef` de lib/storage-signed-url.js (bucket da
//     allowlist, sem travessia de caminho). Antes, um link do Drive ou um
//     caminho errado era aceito no cadastro e só falhava na hora em que a
//     cliente, já tendo pago, clicava em "Baixar".
//   • vazio é permitido no arquivo (produto ainda sem arquivo, completado depois).
// ════════════════════════════════════════════════════════════════════

const { parseStorageRef } = require('./storage-signed-url');

const MAX_URL_LENGTH = 1000;

function isHttpsUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Devolve a mensagem de erro (para a pessoa) ou `null` quando tudo é válido.
 *
 * @param {object} media
 * @param {string[]} [media.images]
 * @param {string}   [media.imageUrl]
 * @param {string[]} [media.videos]
 * @param {string}   [media.downloadUrl]
 */
function validateProductMedia({ images = [], imageUrl = '', videos = [], downloadUrl = '' } = {}) {
  const allImages = [...(Array.isArray(images) ? images : []), imageUrl].filter((url) =>
    String(url || '').trim(),
  );
  if (allImages.some((url) => !isHttpsUrl(url))) {
    return 'Toda imagem do produto precisa ser um endereço https:// (use o envio de imagem do painel).';
  }

  if ((Array.isArray(videos) ? videos : []).some((url) => !isHttpsUrl(url))) {
    return 'Todo vídeo do produto precisa ser um endereço https:// (ex.: link do YouTube).';
  }

  const file = String(downloadUrl || '').trim();
  if (file && !parseStorageRef(file)) {
    return 'O arquivo para download precisa ser um arquivo enviado pelo painel (Storage da loja). Links externos, como Google Drive, não são entregues.';
  }

  return null;
}

module.exports = { validateProductMedia, isHttpsUrl };

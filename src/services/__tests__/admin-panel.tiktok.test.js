import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadTikTokVideo } from '../admin-panel';

// XHR falso: guarda método, URL, cabeçalhos e corpo, e deixa o teste disparar
// os eventos de progresso e de resposta.
class FakeXhr {
  static instances = [];

  constructor() {
    this.headers = {};
    this.listeners = {};
    this.uploadListeners = {};
    this.upload = {
      addEventListener: (event, fn) => {
        this.uploadListeners[event] = fn;
      },
    };
    FakeXhr.instances.push(this);
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name, value) {
    this.headers[name] = value;
  }

  addEventListener(event, fn) {
    this.listeners[event] = fn;
  }

  send(body) {
    this.body = body;
  }
}

const video = new File(['0123456789'], 'video.mp4', { type: 'video/mp4' });

describe('uploadTikTokVideo', () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('faz PUT na URL do TikTok com Content-Range do arquivo inteiro e reporta progresso', async () => {
    const onProgress = vi.fn();
    const pending = uploadTikTokVideo('https://upload.tiktok.test/v', video, onProgress);
    const [xhr] = FakeXhr.instances;

    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://upload.tiktok.test/v');
    expect(xhr.headers).toEqual({ 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-9/10' });
    expect(xhr.body).toBe(video);

    xhr.uploadListeners.progress({ lengthComputable: true, loaded: 5, total: 10 });
    expect(onProgress).toHaveBeenCalledWith(50);

    xhr.status = 201;
    xhr.listeners.load();
    await expect(pending).resolves.toBeUndefined();
  });

  it('resposta fora de 2xx é recusa do TikTok', async () => {
    const pending = uploadTikTokVideo('https://upload.tiktok.test/v', video);
    const [xhr] = FakeXhr.instances;
    xhr.status = 400;
    xhr.listeners.load();
    await expect(pending).rejects.toThrow('O TikTok recusou o envio do vídeo.');
  });

  it('sem URL de upload não abre pedido nenhum', async () => {
    await expect(uploadTikTokVideo('', video)).rejects.toThrow('não devolveu a URL');
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

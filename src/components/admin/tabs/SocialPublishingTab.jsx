import { useEffect, useState } from 'react';
import {
  fetchSocialConnections,
  publishSocialContent,
  uploadProductAsset,
  uploadTikTokVideo,
} from '../../../services/admin-panel';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { friendlyAdminError } from '../utils/errors';

const PLATFORMS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['pinterest', 'Pinterest'],
  ['tiktok', 'TikTok'],
  ['whatsapp', 'WhatsApp'],
];

const INPUT_CLASS = 'rounded-lg border border-slate-200 px-3 py-2';
const LABEL_CLASS = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

function emptyForm(platform = 'facebook') {
  return {
    platform,
    title: '',
    caption: '',
    link: '',
    recipient: '',
    privacy: 'SELF_ONLY',
  };
}

export function SocialPublishingTab() {
  const [connections, setConnections] = useState({});
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState(emptyForm());
  const [file, setFile] = useState(null);
  // Remonta o `<input type="file">`: é a única forma de limpá-lo (valor
  // controlado por JS não existe para arquivo).
  const [fileInputKey, setFileInputKey] = useState(0);
  const [mediaUrl, setMediaUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  // { tone: 'success' | 'error', text } — o tom decide o papel ARIA.
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSocialConnections()
      .then((data) => {
        if (cancelled) return;
        setConnections(data.platforms || {});
        setLoadError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setConnections({});
        setLoadError(friendlyAdminError(err, 'Não foi possível verificar as redes conectadas.'));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function resetMedia() {
    setFile(null);
    setMediaUrl('');
    setProgress(0);
    setFileInputKey((n) => n + 1);
  }

  function changePlatform(platform) {
    setForm((current) => ({ ...current, platform }));
    // Mídia aceita muda de rede para rede (vídeo no TikTok, imagem no
    // Pinterest): o arquivo escolhido para uma não vale para a outra.
    resetMedia();
    setMessage(null);
  }

  function setField(name) {
    return (event) => {
      const { value } = event.target;
      setForm((current) => ({ ...current, [name]: value }));
    };
  }

  async function submit(event) {
    event.preventDefault();
    setPublishing(true);
    setMessage(null);
    try {
      let uploadedUrl = mediaUrl;
      if (file && form.platform !== 'tiktok') {
        const kind = file.type.startsWith('video/') ? 'video' : 'image';
        const uploaded = await uploadProductAsset({ kind, file, onProgress: setProgress });
        uploadedUrl = uploaded.url;
        setMediaUrl(uploaded.url);
      }
      const data = await publishSocialContent({
        ...form,
        mediaUrl: uploadedUrl,
        videoSize: form.platform === 'tiktok' ? file?.size : undefined,
      });
      if (form.platform === 'tiktok' && file) {
        await uploadTikTokVideo(data.result?.data?.upload_url, file, setProgress);
      }
      setForm(emptyForm(form.platform));
      resetMedia();
      setMessage({
        tone: 'success',
        text: 'Conteúdo enviado. A rede ainda pode processar ou moderar a publicação.',
      });
    } catch (error) {
      setMessage({ tone: 'error', text: friendlyAdminError(error, 'Não foi possível publicar.') });
    } finally {
      setPublishing(false);
    }
  }

  const needsImage = ['instagram', 'pinterest'].includes(form.platform);
  const needsMedia = needsImage || form.platform === 'tiktok';

  return (
    <Card
      title="Publicar nas redes"
      subtitle="A publicação só acontece após clicar em Publicar; tokens ficam no servidor."
    >
      {loadError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <p>{loadError}</p>
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-clockwise"
            onClick={() => setReloadKey((n) => n + 1)}
          >
            Tentar de novo
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid max-w-2xl gap-4">
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className={LABEL_CLASS}>Rede</legend>
            {PLATFORMS.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"
              >
                <input
                  type="radio"
                  name="social-platform"
                  value={value}
                  checked={form.platform === value}
                  onChange={(event) => changePlatform(event.target.value)}
                />
                <span className="font-semibold">{label}</span>
                <span
                  className={`ml-auto text-xs ${connections[value] ? 'text-emerald-700' : 'text-amber-700'}`}
                >
                  {connections[value] ? 'Conectado' : 'Configuração pendente'}
                </span>
              </label>
            ))}
          </fieldset>

          {form.platform === 'pinterest' ? (
            <div>
              <label htmlFor="social-title" className={LABEL_CLASS}>
                Título do Pin
              </label>
              <input
                id="social-title"
                value={form.title}
                onChange={setField('title')}
                maxLength={100}
                placeholder="Título do Pin"
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="social-caption" className={LABEL_CLASS}>
              {form.platform === 'whatsapp' ? 'Mensagem ao cliente' : 'Legenda da publicação'}
            </label>
            <textarea
              id="social-caption"
              value={form.caption}
              onChange={setField('caption')}
              maxLength={2200}
              rows={5}
              required
              placeholder={
                form.platform === 'whatsapp' ? 'Mensagem ao cliente' : 'Legenda da publicação'
              }
              className={`${INPUT_CLASS} w-full`}
            />
          </div>

          {form.platform === 'whatsapp' ? (
            <div>
              <label htmlFor="social-recipient" className={LABEL_CLASS}>
                Telefone do cliente
              </label>
              <input
                id="social-recipient"
                value={form.recipient}
                onChange={setField('recipient')}
                placeholder="Telefone com DDI, por exemplo 5511999999999"
                required
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
          ) : null}

          {!['whatsapp', 'tiktok'].includes(form.platform) ? (
            <div>
              <label htmlFor="social-link" className={LABEL_CLASS}>
                Link da página ou produto (opcional)
              </label>
              <input
                id="social-link"
                type="url"
                value={form.link}
                onChange={setField('link')}
                placeholder="https://"
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
          ) : null}

          {form.platform !== 'whatsapp' ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm">
              <label htmlFor="social-file" className="block font-semibold">
                {form.platform === 'tiktok' ? 'Vídeo' : 'Imagem ou vídeo'}
              </label>
              <input
                key={fileInputKey}
                id="social-file"
                type="file"
                accept={
                  form.platform === 'tiktok' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'
                }
                required={needsMedia}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="mt-2 block w-full"
              />
              {progress ? <span className="mt-1 block text-xs">Upload: {progress}%</span> : null}
            </div>
          ) : null}

          {form.platform === 'tiktok' ? (
            <div>
              <label htmlFor="social-privacy" className={LABEL_CLASS}>
                Privacidade no TikTok
              </label>
              <select
                id="social-privacy"
                value={form.privacy}
                onChange={setField('privacy')}
                className={`${INPUT_CLASS} w-full`}
              >
                <option value="SELF_ONLY">Somente eu</option>
                <option value="FOLLOWER_OF_CREATOR">Seguidores</option>
                <option value="MUTUAL_FOLLOW_FRIENDS">Amigos</option>
                <option value="PUBLIC_TO_EVERYONE">Público</option>
              </select>
            </div>
          ) : null}

          <div>
            <Button type="submit" disabled={publishing || !connections[form.platform]}>
              {publishing ? 'Publicando…' : 'Publicar agora'}
            </Button>
          </div>

          {message ? (
            <p
              role={message.tone === 'error' ? 'alert' : 'status'}
              className={`text-sm ${message.tone === 'error' ? 'text-rose-700' : 'text-slate-700'}`}
            >
              {message.text}
            </p>
          ) : null}
        </form>
      )}
    </Card>
  );
}

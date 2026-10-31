import { useEffect, useState } from 'react';
import {
  fetchSocialConnections,
  publishSocialContent,
  uploadProductAsset,
} from '../../../services/admin-panel';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const PLATFORMS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['pinterest', 'Pinterest'],
  ['tiktok', 'TikTok'],
  ['whatsapp', 'WhatsApp'],
];

export function SocialPublishingTab() {
  const [connections, setConnections] = useState({});
  const [form, setForm] = useState({
    platform: 'facebook',
    title: '',
    caption: '',
    link: '',
    recipient: '',
    privacy: 'SELF_ONLY',
  });
  const [file, setFile] = useState(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [progress, setProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSocialConnections()
      .then((data) => setConnections(data.platforms || {}))
      .catch(() => setConnections({}));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setPublishing(true);
    setMessage('');
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
      if (form.platform === 'tiktok' && file && data.result?.data?.upload_url) {
        const upload = await fetch(data.result.data.upload_url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'video/mp4',
            'Content-Range': `bytes 0-${file.size - 1}/${file.size}`,
          },
          body: file,
        });
        if (!upload.ok) throw new Error('O TikTok recusou o envio do vídeo.');
      }
      setMessage('Conteúdo enviado. A rede ainda pode processar ou moderar a publicação.');
    } catch (error) {
      setMessage(error?.message || 'Não foi possível publicar.');
    } finally {
      setPublishing(false);
    }
  }

  const needsImage = ['instagram', 'pinterest'].includes(form.platform);
  return (
    <Card
      title="Publicar nas redes"
      subtitle="A publicação só acontece após clicar em Publicar; tokens ficam no servidor."
    >
      <form onSubmit={submit} className="grid max-w-2xl gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
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
                onChange={(event) =>
                  setForm((current) => ({ ...current, platform: event.target.value }))
                }
              />
              <span className="font-semibold">{label}</span>
              <span
                className={`ml-auto text-xs ${connections[value] ? 'text-emerald-700' : 'text-amber-700'}`}
              >
                {connections[value] ? 'Conectado' : 'Configuração pendente'}
              </span>
            </label>
          ))}
        </div>

        {form.platform === 'pinterest' ? (
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            maxLength={100}
            placeholder="Título do Pin"
            className="rounded-lg border border-slate-200 px-3 py-2"
          />
        ) : null}
        <textarea
          value={form.caption}
          onChange={(event) => setForm((current) => ({ ...current, caption: event.target.value }))}
          maxLength={2200}
          rows={5}
          required
          placeholder={
            form.platform === 'whatsapp' ? 'Mensagem ao cliente' : 'Legenda da publicação'
          }
          className="rounded-lg border border-slate-200 px-3 py-2"
        />
        {form.platform === 'whatsapp' ? (
          <input
            value={form.recipient}
            onChange={(event) =>
              setForm((current) => ({ ...current, recipient: event.target.value }))
            }
            placeholder="Telefone com DDI, por exemplo 5511999999999"
            required
            className="rounded-lg border border-slate-200 px-3 py-2"
          />
        ) : null}
        {!['whatsapp', 'tiktok'].includes(form.platform) ? (
          <input
            type="url"
            value={form.link}
            onChange={(event) => setForm((current) => ({ ...current, link: event.target.value }))}
            placeholder="Link da página ou produto (opcional)"
            className="rounded-lg border border-slate-200 px-3 py-2"
          />
        ) : null}
        {!['whatsapp'].includes(form.platform) ? (
          <label className="rounded-lg border border-dashed border-slate-300 p-4 text-sm">
            <span className="block font-semibold">
              {form.platform === 'tiktok' ? 'Vídeo' : 'Imagem ou vídeo'}
            </span>
            <input
              type="file"
              accept={
                form.platform === 'tiktok' ? 'video/mp4,video/webm,video/quicktime' : 'image/*'
              }
              required={needsImage || form.platform === 'tiktok'}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="mt-2 block w-full"
            />
            {progress ? <span className="mt-1 block text-xs">Upload: {progress}%</span> : null}
          </label>
        ) : null}
        {form.platform === 'tiktok' ? (
          <select
            value={form.privacy}
            onChange={(event) =>
              setForm((current) => ({ ...current, privacy: event.target.value }))
            }
            className="rounded-lg border border-slate-200 px-3 py-2"
          >
            <option value="SELF_ONLY">Somente eu</option>
            <option value="FOLLOWER_OF_CREATOR">Seguidores</option>
            <option value="MUTUAL_FOLLOW_FRIENDS">Amigos</option>
            <option value="PUBLIC_TO_EVERYONE">Público</option>
          </select>
        ) : null}
        <div>
          <Button type="submit" disabled={publishing || !connections[form.platform]}>
            {publishing ? 'Publicando…' : 'Publicar agora'}
          </Button>
        </div>
        {message ? (
          <p role="status" className="text-sm text-slate-700">
            {message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

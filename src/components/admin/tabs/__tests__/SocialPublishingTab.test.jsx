import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SocialPublishingTab } from '../SocialPublishingTab';
import {
  fetchSocialConnections,
  publishSocialContent,
  uploadProductAsset,
} from '../../../../services/admin-panel';
import { NETWORK_ERROR_MESSAGE } from '../../utils/errors';

vi.mock('../../../../services/admin-panel', () => ({
  fetchSocialConnections: vi.fn(),
  publishSocialContent: vi.fn(),
  uploadProductAsset: vi.fn(),
  uploadTikTokVideo: vi.fn(),
}));

const ALL_CONNECTED = {
  platforms: { facebook: true, instagram: true, pinterest: true, tiktok: true, whatsapp: true },
};

describe('<SocialPublishingTab />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSocialConnections.mockResolvedValue(ALL_CONNECTED);
    publishSocialContent.mockResolvedValue({ success: true, result: {} });
  });

  it('erro ao carregar as conexões vira alerta com "Tentar de novo"', async () => {
    fetchSocialConnections
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ALL_CONNECTED);

    render(<SocialPublishingTab />);

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    expect(screen.queryByRole('button', { name: 'Publicar agora' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByRole('button', { name: 'Publicar agora' })).toBeEnabled();
    expect(fetchSocialConnections).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('publicar chama o serviço com o formulário e limpa os campos', async () => {
    render(<SocialPublishingTab />);
    const botao = await screen.findByRole('button', { name: 'Publicar agora' });
    await waitFor(() => expect(botao).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Legenda da publicação'), {
      target: { value: 'Novidade na loja!' },
    });
    fireEvent.change(screen.getByLabelText('Link da página ou produto (opcional)'), {
      target: { value: 'https://loja.test/produtos' },
    });
    fireEvent.click(botao);

    await waitFor(() => expect(publishSocialContent).toHaveBeenCalledTimes(1));
    expect(publishSocialContent).toHaveBeenCalledWith({
      platform: 'facebook',
      title: '',
      caption: 'Novidade na loja!',
      link: 'https://loja.test/produtos',
      recipient: '',
      privacy: 'SELF_ONLY',
      mediaUrl: '',
      videoSize: undefined,
    });
    expect(uploadProductAsset).not.toHaveBeenCalled();

    expect(await screen.findByRole('status')).toHaveTextContent('Conteúdo enviado');
    expect(screen.getByLabelText('Legenda da publicação')).toHaveValue('');
    expect(screen.getByLabelText('Link da página ou produto (opcional)')).toHaveValue('');
  });

  it('falha ao publicar aparece como alerta, em português', async () => {
    publishSocialContent.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<SocialPublishingTab />);
    const botao = await screen.findByRole('button', { name: 'Publicar agora' });
    await waitFor(() => expect(botao).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Legenda da publicação'), {
      target: { value: 'Texto' },
    });
    fireEvent.click(botao);

    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK_ERROR_MESSAGE);
    // O que foi digitado fica para a nova tentativa.
    expect(screen.getByLabelText('Legenda da publicação')).toHaveValue('Texto');
  });

  it('trocar de rede limpa a mídia escolhida', async () => {
    render(<SocialPublishingTab />);
    await screen.findByRole('button', { name: 'Publicar agora' });

    fireEvent.click(screen.getByRole('radio', { name: /Instagram/ }));
    const arquivo = new File(['img'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Imagem ou vídeo'), { target: { files: [arquivo] } });
    expect(screen.getByLabelText('Imagem ou vídeo').files).toHaveLength(1);

    fireEvent.click(screen.getByRole('radio', { name: /Pinterest/ }));

    expect(screen.getByLabelText('Imagem ou vídeo').files).toHaveLength(0);
    expect(screen.getByLabelText('Título do Pin')).toBeInTheDocument();
  });

  it('todo campo visível tem rótulo próprio', async () => {
    render(<SocialPublishingTab />);
    await screen.findByRole('button', { name: 'Publicar agora' });

    fireEvent.click(screen.getByRole('radio', { name: /WhatsApp/ }));
    expect(screen.getByLabelText('Mensagem ao cliente')).toBeInTheDocument();
    expect(screen.getByLabelText('Telefone do cliente')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /TikTok/ }));
    expect(screen.getByLabelText('Vídeo')).toBeInTheDocument();
    expect(screen.getByLabelText('Privacidade no TikTok')).toBeInTheDocument();
  });
});

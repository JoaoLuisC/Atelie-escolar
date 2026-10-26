import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToast } from '../../../hooks/useToast';
import { fetchAdminSetting, saveAdminSetting } from '../../../services/admin-panel';
import { friendlyAdminError } from '../utils/errors';

const MAX_TEXT = 4000;

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200';

/**
 * Descrição comum a TODOS os produtos (chave `productDefaults`). Aparece na
 * página de cada produto, logo abaixo da descrição própria dele. Vazio = o
 * bloco não aparece. Busca e salva sozinho, como a aba de cupons.
 */
export function ProductDefaultsCard() {
  const { pushToast } = useToast();
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminSetting('productDefaults')
      .then((data) => {
        if (cancelled) return;
        const value = data?.value || {};
        setForm({
          sharedDescriptionTitle: value.sharedDescriptionTitle || '',
          sharedDescription: value.sharedDescription || '',
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(friendlyAdminError(error, 'Erro ao carregar a descrição padrão.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    try {
      setSaving(true);
      await saveAdminSetting({ key: 'productDefaults', value: form });
      pushToast(
        form.sharedDescription.trim()
          ? 'Descrição padrão salva. Ela aparece nos produtos em até 1 minuto.'
          : 'Descrição padrão removida dos produtos.',
        'success',
      );
    } catch (error) {
      pushToast(friendlyAdminError(error, 'Erro ao salvar a descrição padrão.'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Descrição padrão de todos os produtos"
      subtitle="Aparece na página de cada produto, logo abaixo da descrição dele. Deixe vazio para não mostrar."
      className="mb-4"
    >
      {loadError ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      ) : !form ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : (
        <div className="space-y-3">
          <label
            htmlFor="shared-description-title"
            className="block text-sm font-medium text-slate-700"
          >
            Título (opcional)
            <input
              id="shared-description-title"
              className={inputClass}
              value={form.sharedDescriptionTitle}
              maxLength={160}
              placeholder="Ex.: Sobre os materiais da professora"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sharedDescriptionTitle: event.target.value }))
              }
            />
          </label>
          <label htmlFor="shared-description" className="block text-sm font-medium text-slate-700">
            Texto
            <textarea
              id="shared-description"
              className={inputClass}
              rows={6}
              value={form.sharedDescription}
              maxLength={MAX_TEXT}
              placeholder="Ex.: Todos os materiais são entregues em PDF de alta resolução…"
              onChange={(event) =>
                setForm((prev) => ({ ...prev, sharedDescription: event.target.value }))
              }
            />
            <span className="mt-1 block text-xs text-slate-500">
              As quebras de linha aparecem como você digitar. {form.sharedDescription.length}/
              {MAX_TEXT}
            </span>
          </label>
          <div className="flex justify-end">
            <Button icon="check2" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar descrição padrão'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

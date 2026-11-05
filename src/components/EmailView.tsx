import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  addEmail,
  fetchEmails,
  removeEmail,
  saveEmailDefaults,
  setDefaultEmail,
  updateEmail,
  type EmailDefaults,
  type EmailPadrao,
} from '@/lib/emails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Mail, Pencil, Plus, Star, Trash2, Loader2, FileText } from 'lucide-react';

/**
 * Tela E-mail: cadastro dos destinatários padrão das rebaixas e do
 * assunto/mensagem padrão do envio.
 *
 * Leitura: admin e encarregado. Cadastro/edição/exclusão: só admin.
 */
const EmailView = () => {
  const { userRole } = useAuth();
  const canManage = userRole === 'admin';

  const [emails, setEmails] = useState<EmailPadrao[]>([]);
  const [defaults, setDefaults] = useState<EmailDefaults>({ assunto: '', mensagem: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formulário de cadastro/edição
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EmailPadrao | null>(null);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [padrao, setPadrao] = useState(false);

  // Formulário do assunto/mensagem padrão
  const [showDefaults, setShowDefaults] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');

  const [removing, setRemoving] = useState<EmailPadrao | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEmails();
      setEmails(data.emails);
      setDefaults(data.defaults);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar os e-mails padrão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setNome('');
    setEmail('');
    setPadrao(emails.length === 0);
    setShowForm(true);
  };

  const openEdit = (item: EmailPadrao) => {
    setEditing(item);
    setNome(item.nome);
    setEmail(item.email);
    setPadrao(item.padrao);
    setShowForm(true);
  };

  const save = async () => {
    if (saving) return;
    if (!nome.trim()) {
      toast.error('Informe a identificação');
      return;
    }
    if (!email.trim()) {
      toast.error('Informe o e-mail');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateEmail(editing.id, { nome: nome.trim(), email: email.trim(), padrao });
        toast.success('E-mail atualizado!');
      } else {
        await addEmail({ nome: nome.trim(), email: email.trim(), padrao });
        toast.success('E-mail cadastrado!');
      }
      setShowForm(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o e-mail');
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (item: EmailPadrao) => {
    try {
      await setDefaultEmail(item.id);
      toast.success(`“${item.nome}” agora é o e-mail padrão`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao definir o e-mail padrão');
    }
  };

  const remove = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    try {
      await removeEmail(target.id);
      toast.success('E-mail removido');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover o e-mail');
    }
  };

  const openDefaults = () => {
    setAssunto(defaults.assunto);
    setMensagem(defaults.mensagem);
    setShowDefaults(true);
  };

  const saveDefaults = async () => {
    if (saving) return;
    if (!assunto.trim() || !mensagem.trim()) {
      toast.error('Informe o assunto e a mensagem');
      return;
    }
    setSaving(true);
    try {
      await saveEmailDefaults({ assunto: assunto.trim(), mensagem: mensagem.trim() });
      toast.success('Padrão de e-mail atualizado!');
      setShowDefaults(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o padrão de e-mail');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] px-3 py-6 sm:min-h-[calc(100vh-4rem)] sm:px-4 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
              <Mail className="h-5 w-5 text-sky-200 sm:h-6 sm:w-6" />
              E-mail
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/15">
                {emails.length} {emails.length === 1 ? 'cadastro' : 'cadastros'}
              </span>
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Cadastre os e-mails que recebem as rebaixas e use-os com um clique ao enviar.
            </p>
          </div>

          {canManage && (
            <Button
              size="sm"
              className="h-9 gap-2 bg-white text-sky-700 shadow-sm hover:bg-sky-50"
              onClick={openNew}
            >
              <Plus className="h-4 w-4" />
              Adicionar e-mail
            </Button>
          )}
        </div>

        {/* E-mails padrão */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">E-mails padrão</h3>
              <p className="text-xs text-slate-500">
                Aparecem como atalho no diálogo “Enviar rebaixa por e-mail”.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando os e-mails padrão...
            </div>
          ) : emails.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">Nenhum e-mail cadastrado</p>
              <p className="mt-1 text-xs text-slate-500">
                {canManage
                  ? 'Cadastre um e-mail para usá-lo como atalho no envio das rebaixas.'
                  : 'O administrador ainda não cadastrou nenhum e-mail padrão.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {emails.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.padrao && (
                        <Star className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-amber-500" aria-hidden="true" />
                      )}
                      {item.nome}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-500">{item.email}</p>
                  </div>

                  {item.padrao ? (
                    <span className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                      <Star className="h-3 w-3" />
                      Padrão
                    </span>
                  ) : (
                    canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs text-slate-500 hover:text-sky-700"
                        onClick={() => void makeDefault(item)}
                        title="Usar como e-mail padrão"
                      >
                        <Star className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Usar como padrão</span>
                      </Button>
                    )
                  )}

                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                        onClick={() => openEdit(item)}
                        aria-label={`Editar ${item.nome}`}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setRemoving(item)}
                        aria-label={`Remover ${item.nome}`}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Assunto e mensagem padrão */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileText className="h-4 w-4 text-slate-500" />
                Assunto e mensagem padrão
              </h3>
              <p className="text-xs text-slate-500">
                Texto usado por padrão no envio — editável na hora do envio.
              </p>
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={openDefaults}
              >
                Editar padrão
              </Button>
            )}
          </div>
          <div className="space-y-3 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assunto</p>
              <p className="mt-0.5 text-sm text-slate-800">{defaults.assunto || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mensagem</p>
              <p className="mt-0.5 text-sm text-slate-800">{defaults.mensagem || '—'}</p>
            </div>
            <p className="text-xs text-slate-500">
              Variáveis disponíveis: <code className="rounded bg-slate-100 px-1">{'{{data}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1">{'{{quantidade}}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1">{'{{produtos}}'}</code>
            </p>
          </div>
        </section>

        {!canManage && (
          <p className="mt-4 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs text-white/80">
            Você pode consultar os e-mails padrão. O cadastro e a edição são do administrador.
          </p>
        )}
      </div>

      {/* ── Diálogo: cadastro / edição ─────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!saving) setShowForm(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <Mail className="h-5 w-5" />
              </span>
              {editing ? 'Editar e-mail padrão' : 'Novo e-mail padrão'}
            </DialogTitle>
            <DialogDescription>
              Ele passa a aparecer como atalho no envio da rebaixa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label htmlFor="email-nome" className="text-sm font-medium">Identificação</label>
              <Input
                id="email-nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Comercial — Filial SP"
                className="mt-1"
                maxLength={60}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Nome que aparece na lista de atalhos (até 60 caracteres).
              </p>
            </div>
            <div>
              <label htmlFor="email-endereco" className="text-sm font-medium">E-mail</label>
              <Input
                id="email-endereco"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="comercial.sp@empresa.com.br"
                className="mt-1"
                inputMode="email"
                autoComplete="off"
                maxLength={160}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Um e-mail por cadastro. Vários destinatários? Use vírgula no envio.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-sky-600"
                checked={padrao}
                onChange={(event) => setPadrao(event.target.checked)}
                disabled={saving}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Usar como e-mail padrão das rebaixas
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  O padrão entra preenchido no campo “Para” e como fallback do servidor.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar e-mail
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: assunto e mensagem padrão ─────────────────────── */}
      <Dialog open={showDefaults} onOpenChange={(open) => { if (!saving) setShowDefaults(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <FileText className="h-5 w-5" />
              </span>
              Padrão de assunto e mensagem
            </DialogTitle>
            <DialogDescription>
              Texto inicial do envio das rebaixas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label htmlFor="email-assunto" className="text-sm font-medium">Assunto</label>
              <Input
                id="email-assunto"
                value={assunto}
                onChange={(event) => setAssunto(event.target.value)}
                className="mt-1"
                maxLength={200}
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="email-mensagem" className="text-sm font-medium">Mensagem</label>
              <textarea
                id="email-mensagem"
                value={mensagem}
                onChange={(event) => setMensagem(event.target.value)}
                rows={4}
                maxLength={2000}
                disabled={saving}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Variáveis: <code>{'{{data}}'}</code>, <code>{'{{quantidade}}'}</code>,{' '}
                <code>{'{{produtos}}'}</code>
              </p>
            </div>
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDefaults(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveDefaults()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar padrão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de remoção ──────────────────────────────────── */}
      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover e-mail?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro “{removing?.nome}” sairá da lista de atalhos do envio das rebaixas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void remove()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmailView;

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  addEmail,
  addEmailPessoal,
  fetchContasDeEnvio,
  fetchEmails,
  fetchMinhaConta,
  removeEmail,
  removeEmailPessoal,
  removerContaDeUsuario,
  saveEmailDefaults,
  salvarContaDeUsuario,
  salvarMinhaConta,
  setDefaultEmail,
  setDefaultEmailPessoal,
  updateEmail,
  updateEmailPessoal,
  type EmailDefaults,
  type EmailEnvioConta,
  type EmailEnvioContaAdmin,
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
import { Mail, Pencil, Plus, Star, Trash2, Loader2, FileText, KeyRound, Send, UserCog, Shield, User, Lock } from 'lucide-react';

/**
 * Tela E-mail: cadastro dos destinatários padrão das rebaixas, do
 * assunto/mensagem padrão e da **conta de envio** de cada usuário.
 *
 * DESTINATÁRIOS:
 * - GLOBAIS (tipo='global'): gerencia, carlos, horacio — visíveis para
 *   todos os encarregados da loja. Gerenciados SÓ pelo admin (Shield).
 * - PESSOAIS (tipo='pessoal'): cada encarregado gerencia os seus
 *   (ex.: daniele, valeria, cassio para Isaias). Visíveis só para o dono (User).
 *
 * CONTA DE ENVIO: cada um cadastra a sua caixa (e-mail + senha do servidor
 * padrão); o admin vê e edita todas.
 */
const EmailView = () => {
  const { userRole, user } = useAuth();
  const canManageGlobal = userRole === 'admin';
  const isEncarregado = userRole === 'encarregado';
  const currentUser = user?.username ?? '';

  // Separa contatos globais e pessoais
  const [emails, setEmails] = useState<EmailPadrao[]>([]);
  const globals = emails.filter((e) => e.tipo === 'global');
  const pessoais = emails.filter((e) => e.tipo === 'pessoal' && e.usuario === currentUser);

  const [defaults, setDefaults] = useState<EmailDefaults>({ assunto: '', mensagem: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formulário de cadastro/edição GLOBAL (admin)
  const [showGlobalForm, setShowGlobalForm] = useState(false);
  const [editingGlobal, setEditingGlobal] = useState<EmailPadrao | null>(null);
  const [globalNome, setGlobalNome] = useState('');
  const [globalEmail, setGlobalEmail] = useState('');
  const [globalPadrao, setGlobalPadrao] = useState(false);

  // Formulário de cadastro/edição PESSOAL (encarregado)
  const [showPessoalForm, setShowPessoalForm] = useState(false);
  const [editingPessoal, setEditingPessoal] = useState<EmailPadrao | null>(null);
  const [pessoalNome, setPessoalNome] = useState('');
  const [pessoalEmail, setPessoalEmail] = useState('');
  const [pessoalPadrao, setPessoalPadrao] = useState(false);

  // Formulário do assunto/mensagem padrão (admin)
  const [showDefaults, setShowDefaults] = useState(false);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');

  const [removing, setRemoving] = useState<EmailPadrao | null>(null);

  // Conta de envio do usuário logado
  const [conta, setConta] = useState<EmailEnvioConta | null>(null);
  const [servidor, setServidor] = useState({ host: 'mail.comper.com.br', porta: 465, secure: true });
  const [contaEmail, setContaEmail] = useState('');
  const [contaSenha, setContaSenha] = useState('');
  const [contaRemetente, setContaRemetente] = useState('');
  const [contaAtiva, setContaAtiva] = useState(true);
  const [salvandoConta, setSalvandoConta] = useState(false);

  // Contas de envio da loja (admin)
  const [contas, setContas] = useState<EmailEnvioContaAdmin[]>([]);
  const [editandoConta, setEditandoConta] = useState<EmailEnvioContaAdmin | null>(null);
  const [contaAdminEmail, setContaAdminEmail] = useState('');
  const [contaAdminSenha, setContaAdminSenha] = useState('');
  const [contaAdminAtiva, setContaAdminAtiva] = useState(true);
  const [removendoConta, setRemovendoConta] = useState<EmailEnvioContaAdmin | null>(null);

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

  /** Conta de envio do usuário logado. */
  const loadConta = useCallback(async () => {
    try {
      const data = await fetchMinhaConta();
      setConta(data.conta);
      setServidor(data.servidor);
      setContaEmail(data.conta.email);
      setContaRemetente(data.conta.remetente ?? '');
      setContaAtiva(data.conta.ativo);
    } catch {
      /* a conta é acessória: a tela continua com a lista de destinatários */
    }
  }, []);

  /** Contas de envio da loja (admin). */
  const loadContas = useCallback(async () => {
    if (!canManageGlobal) return;
    try {
      setContas(await fetchContasDeEnvio());
    } catch {
      /* a lista de contas é acessória */
    }
  }, [canManageGlobal]);

  useEffect(() => {
    void load();
    void loadConta();
    void loadContas();
  }, [load, loadConta, loadContas]);

  /* ──────────────────────── GLOBAL (admin) ──────────────────────── */

  const openNewGlobal = () => {
    setEditingGlobal(null);
    setGlobalNome('');
    setGlobalEmail('');
    setGlobalPadrao(globals.length === 0);
    setShowGlobalForm(true);
  };

  const openEditGlobal = (item: EmailPadrao) => {
    setEditingGlobal(item);
    setGlobalNome(item.nome);
    setGlobalEmail(item.email);
    setGlobalPadrao(item.padrao);
    setShowGlobalForm(true);
  };

  const saveGlobal = async () => {
    if (saving) return;
    if (!globalNome.trim()) {
      toast.error('Informe a identificação');
      return;
    }
    if (!globalEmail.trim()) {
      toast.error('Informe o e-mail');
      return;
    }
    setSaving(true);
    try {
      if (editingGlobal) {
        await updateEmail(editingGlobal.id, { nome: globalNome.trim(), email: globalEmail.trim(), padrao: globalPadrao });
        toast.success('E-mail global atualizado!');
      } else {
        await addEmail({ nome: globalNome.trim(), email: globalEmail.trim(), padrao: globalPadrao });
        toast.success('E-mail global cadastrado!');
      }
      setShowGlobalForm(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o e-mail global');
    } finally {
      setSaving(false);
    }
  };

  const makeDefaultGlobal = async (item: EmailPadrao) => {
    try {
      await setDefaultEmail(item.id);
      toast.success(`“${item.nome}” agora é o e-mail padrão global`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao definir o e-mail padrão global');
    }
  };

  const removeGlobal = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    try {
      await removeEmail(target.id);
      toast.success('E-mail global removido');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover o e-mail global');
    }
  };

  /* ──────────────────────── PESSOAL (encarregado) ──────────────────────── */

  const openNewPessoal = () => {
    setEditingPessoal(null);
    setPessoalNome('');
    setPessoalEmail('');
    setPessoalPadrao(pessoais.length === 0);
    setShowPessoalForm(true);
  };

  const openEditPessoal = (item: EmailPadrao) => {
    setEditingPessoal(item);
    setPessoalNome(item.nome);
    setPessoalEmail(item.email);
    setPessoalPadrao(item.padrao);
    setShowPessoalForm(true);
  };

  const savePessoal = async () => {
    if (saving) return;
    if (!pessoalNome.trim()) {
      toast.error('Informe a identificação');
      return;
    }
    if (!pessoalEmail.trim()) {
      toast.error('Informe o e-mail');
      return;
    }
    setSaving(true);
    try {
      if (editingPessoal) {
        await updateEmailPessoal(editingPessoal.id, { nome: pessoalNome.trim(), email: pessoalEmail.trim(), padrao: pessoalPadrao });
        toast.success('Seu contato pessoal atualizado!');
      } else {
        await addEmailPessoal({ nome: pessoalNome.trim(), email: pessoalEmail.trim(), padrao: pessoalPadrao });
        toast.success('Seu contato pessoal cadastrado!');
      }
      setShowPessoalForm(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar o contato pessoal');
    } finally {
      setSaving(false);
    }
  };

  const makeDefaultPessoal = async (item: EmailPadrao) => {
    try {
      await setDefaultEmailPessoal(item.id);
      toast.success(`“${item.nome}” agora é seu e-mail padrão`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao definir seu e-mail padrão');
    }
  };

  const removePessoal = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    try {
      await removeEmailPessoal(target.id);
      toast.success('Seu contato pessoal removido');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover seu contato pessoal');
    }
  };

  /* ──────────────────────── ASSUNTO/MENSAGEM (admin) ──────────────────────── */

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

  /* ──────────────────────── CONTA DE ENVIO ──────────────────────── */

  const saveConta = async () => {
    if (salvandoConta) return;
    if (!contaEmail.trim()) {
      toast.error('Informe o seu e-mail');
      return;
    }
    if (!conta?.temSenha && !contaSenha.trim()) {
      toast.error('Informe a senha da sua caixa de e-mail');
      return;
    }
    setSalvandoConta(true);
    try {
      await salvarMinhaConta({
        email: contaEmail.trim(),
        senha: contaSenha.trim() || undefined,
        remetente: contaRemetente.trim(),
        ativo: contaAtiva,
      });
      toast.success('Conta de e-mail salva!');
      setContaSenha('');
      await loadConta();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar a conta de e-mail');
    } finally {
      setSalvandoConta(false);
    }
  };

  const openEditConta = (item: EmailEnvioContaAdmin) => {
    setEditandoConta(item);
    setContaAdminEmail(item.email);
    setContaAdminSenha('');
    setContaAdminAtiva(item.ativo);
  };

  const saveContaAdmin = async () => {
    if (!editandoConta || salvandoConta) return;
    if (!contaAdminEmail.trim()) {
      toast.error('Informe o e-mail');
      return;
    }
    setSalvandoConta(true);
    try {
      await salvarContaDeUsuario(editandoConta.usuario, {
        email: contaAdminEmail.trim(),
        senha: contaAdminSenha.trim() || undefined,
        ativo: contaAdminAtiva,
      });
      toast.success('Conta de e-mail atualizada!');
      setEditandoConta(null);
      setContaAdminSenha('');
      await loadContas();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar a conta de e-mail');
    } finally {
      setSalvandoConta(false);
    }
  };

  const removeConta = async () => {
    if (!removendoConta) return;
    const alvo = removendoConta.usuario;
    setRemovendoConta(null);
    try {
      await removerContaDeUsuario(alvo);
      toast.success('Conta de e-mail removida');
      await loadContas();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover a conta de e-mail');
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
              Gerencie contatos globais da loja e seus contatos pessoais. Use como atalhos no envio da rebaixa.
            </p>
          </div>

          {canManageGlobal && (
            <Button
              size="sm"
              className="h-9 gap-2 bg-white text-sky-700 shadow-sm hover:bg-sky-50"
              onClick={openNewGlobal}
            >
              <Plus className="h-4 w-4" />
              Novo global
            </Button>
          )}
          {(isEncarregado || canManageGlobal) && (
            <Button
              size="sm"
              className="h-9 gap-2 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50"
              onClick={openNewPessoal}
            >
              <Plus className="h-4 w-4" />
              Meu contato
            </Button>
          )}
        </div>

        {/* ── Contatos GLOBAIS (admin) ─────────────────────────────────── */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Contatos globais da loja</h3>
                <p className="text-xs text-slate-500">
                  Visíveis para todos os encarregados. Gerenciados pelo administrador.
                </p>
              </div>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {globals.length} {globals.length === 1 ? 'contato' : 'contatos'}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </div>
          ) : globals.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">Nenhum contato global</p>
              <p className="mt-1 text-xs text-slate-500">
                {canManageGlobal
                  ? 'Cadastre contatos globais (gerencia, carlos, horacio) para toda a loja.'
                  : 'O administrador ainda não cadastrou contatos globais.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {globals.map((item) => (
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
                    <span className="hidden shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 sm:inline-flex">
                      <Star className="h-3 w-3" />
                      Padrão global
                    </span>
                  ) : (
                    canManageGlobal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs text-slate-500 hover:text-amber-600"
                        onClick={() => void makeDefaultGlobal(item)}
                        title="Usar como padrão global"
                      >
                        <Star className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Padrão</span>
                      </Button>
                    )
                  )}

                  {canManageGlobal && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:bg-amber-50 hover:text-amber-600"
                        onClick={() => openEditGlobal(item)}
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

        {/* ── Contatos PESSOAIS (encarregado) ──────────────────────────── */}
        {(isEncarregado || canManageGlobal) && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Meus contatos pessoais</h3>
                  <p className="text-xs text-slate-500">
                    Só você vê e gerencia. Aparecem como atalhos no seu envio.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {pessoais.length} {pessoais.length === 1 ? 'contato' : 'contatos'}
              </span>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : pessoais.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">Nenhum contato pessoal</p>
                <p className="mt-1 text-xs text-slate-500">
                  Adicione seus contatos (daniele, valeria, cassio) para usar como atalhos.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pessoais.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.padrao && (
                          <Star className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-500" aria-hidden="true" />
                        )}
                        {item.nome}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-500">{item.email}</p>
                    </div>

                    {item.padrao ? (
                      <span className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                        <Star className="h-3 w-3" />
                        Meu padrão
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 gap-1 px-2 text-xs text-slate-500 hover:text-emerald-600"
                        onClick={() => void makeDefaultPessoal(item)}
                        title="Usar como meu padrão"
                      >
                        <Star className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Padrão</span>
                      </Button>
                    )}

                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                        onClick={() => openEditPessoal(item)}
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
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Conta de envio do usuário ────────────────────────────────── */}
        <section className="mt-4 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <KeyRound className="h-4 w-4 text-slate-500" />
                Minha conta de envio
              </h3>
              <p className="text-xs text-slate-500">
                A rebaixa que você enviar sai desta caixa ({servidor.host}:{servidor.porta}).
              </p>
            </div>
            {conta?.temSenha && (
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 sm:inline-flex">
                <Send className="h-3 w-3" />
                Conta configurada
              </span>
            )}
          </div>

          <div className="space-y-3 px-4 py-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="conta-email" className="text-sm font-medium">Seu e-mail</label>
                <Input
                  id="conta-email"
                  value={contaEmail}
                  onChange={(event) => setContaEmail(event.target.value)}
                  placeholder="seu@email.com"
                  className="mt-1"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={160}
                  disabled={salvandoConta}
                />
              </div>
              <div>
                <label htmlFor="conta-senha" className="text-sm font-medium">Senha do e-mail</label>
                <Input
                  id="conta-senha"
                  type="password"
                  value={contaSenha}
                  onChange={(event) => setContaSenha(event.target.value)}
                  placeholder={conta?.temSenha ? 'Deixe em branco para manter' : 'Senha da sua caixa'}
                  className="mt-1"
                  autoComplete="new-password"
                  maxLength={128}
                  disabled={salvandoConta}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="conta-remetente" className="text-sm font-medium">Remetente (opcional)</label>
                <Input
                  id="conta-remetente"
                  value={contaRemetente}
                  onChange={(event) => setContaRemetente(event.target.value)}
                  placeholder="Usa o seu e-mail quando vazio"
                  className="mt-1"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={160}
                  disabled={salvandoConta}
                />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-sky-600"
                    checked={contaAtiva}
                    onChange={(event) => setContaAtiva(event.target.checked)}
                    disabled={salvandoConta}
                  />
                  Conta ativa
                </label>
                <Button
                  size="sm"
                  className="h-9 gap-2"
                  onClick={() => void saveConta()}
                  disabled={salvandoConta || !contaEmail.trim()}
                >
                  {salvandoConta ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Salvar conta
                </Button>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              A senha fica guardada no servidor de forma criptografada e nunca é enviada de volta
              para o navegador. Sem conta cadastrada, o envio usa a conta padrão do servidor.
            </p>
          </div>
        </section>

        {/* ── Contas de envio da loja (admin) ───────────────────────────── */}
        {canManageGlobal && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-white/20 bg-white shadow-lg">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <UserCog className="h-4 w-4 text-slate-500" />
                  Contas de envio da loja
                </h3>
                <p className="text-xs text-slate-500">
                  Quem está com a conta configurada envia a rebaixa da própria caixa.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {contas.length} {contas.length === 1 ? 'conta' : 'contas'}
              </span>
            </div>

            {contas.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm font-medium text-slate-700">Nenhuma conta cadastrada</p>
                <p className="mt-1 text-xs text-slate-500">
                  Cada encarregado cadastra a própria caixa na seção “Minha conta de envio”.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {contas.map((item) => (
                  <li key={item.usuario} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.usuario}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{item.email}</p>
                    </div>
                    {!item.ativo && (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        Inativa
                      </span>
                    )}
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                        onClick={() => openEditConta(item)}
                        aria-label={`Editar conta de ${item.usuario}`}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setRemovendoConta(item)}
                        aria-label={`Remover conta de ${item.usuario}`}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Assunto e mensagem padrão (admin) ─────────────────────────── */}
        {canManageGlobal && (
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={openDefaults}
              >
                Editar padrão
              </Button>
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
        )}

        {!canManageGlobal && !isEncarregado && (
          <p className="mt-4 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-xs text-white/80">
            Você pode consultar os e-mails padrão e manter a sua própria conta de envio. O cadastro
            dos destinatários e do assunto padrão é do administrador.
          </p>
        )}
      </div>

      {/* ── Diálogo: cadastro/edição GLOBAL (admin) ─────────────────────── */}
      <Dialog open={showGlobalForm} onOpenChange={(open) => { if (!saving) setShowGlobalForm(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Shield className="h-5 w-5" />
              </span>
              {editingGlobal ? 'Editar contato global' : 'Novo contato global'}
            </DialogTitle>
            <DialogDescription>
              Visível para todos os encarregados da loja. Gerenciado pelo admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label htmlFor="global-nome" className="text-sm font-medium">Identificação</label>
              <Input
                id="global-nome"
                value={globalNome}
                onChange={(event) => setGlobalNome(event.target.value)}
                placeholder="Gerência — Matriz"
                className="mt-1"
                maxLength={60}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Nome que aparece na lista de atalhos (até 60 caracteres).
              </p>
            </div>
            <div>
              <label htmlFor="global-email" className="text-sm font-medium">E-mail</label>
              <Input
                id="global-email"
                value={globalEmail}
                onChange={(event) => setGlobalEmail(event.target.value)}
                placeholder="gerencia@empresa.com.br"
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
                className="mt-0.5 h-4 w-4 accent-amber-600"
                checked={globalPadrao}
                onChange={(event) => setGlobalPadrao(event.target.checked)}
                disabled={saving}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Usar como e-mail padrão global das rebaixas
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  O padrão entra preenchido no campo “Para” e como fallback do servidor.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowGlobalForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveGlobal()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar global
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: cadastro/edição PESSOAL (encarregado) ───────────────── */}
      <Dialog open={showPessoalForm} onOpenChange={(open) => { if (!saving) setShowPessoalForm(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <User className="h-5 w-5" />
              </span>
              {editingPessoal ? 'Editar meu contato' : 'Novo contato pessoal'}
            </DialogTitle>
            <DialogDescription>
              Só você vê e gerencia. Aparece como atalho no seu envio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label htmlFor="pessoal-nome" className="text-sm font-medium">Identificação</label>
              <Input
                id="pessoal-nome"
                value={pessoalNome}
                onChange={(event) => setPessoalNome(event.target.value)}
                placeholder="Daniele — Filial SP"
                className="mt-1"
                maxLength={60}
                disabled={saving}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Nome que aparece na lista de atalhos (até 60 caracteres).
              </p>
            </div>
            <div>
              <label htmlFor="pessoal-email" className="text-sm font-medium">E-mail</label>
              <Input
                id="pessoal-email"
                value={pessoalEmail}
                onChange={(event) => setPessoalEmail(event.target.value)}
                placeholder="daniele@empresa.com.br"
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
                className="mt-0.5 h-4 w-4 accent-emerald-600"
                checked={pessoalPadrao}
                onChange={(event) => setPessoalPadrao(event.target.checked)}
                disabled={saving}
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  Usar como meu e-mail padrão das rebaixas
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  O padrão entra preenchido no campo “Para” do seu envio.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPessoalForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void savePessoal()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar meu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: assunto e mensagem padrão (admin) ─────────────────── */}
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
            <AlertDialogTitle>Remover contato?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro “{removing?.nome}” sairá da lista de atalhos do envio das rebaixas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing?.tipo === 'pessoal') {
                  void removePessoal();
                } else {
                  void removeGlobal();
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Diálogo: conta de envio de outro usuário (admin) ──────── */}
      <Dialog open={Boolean(editandoConta)} onOpenChange={(open) => { if (!open) setEditandoConta(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                <UserCog className="h-5 w-5" />
              </span>
              Conta de envio de {editandoConta?.usuario}
            </DialogTitle>
            <DialogDescription>
              A senha fica criptografada no servidor. Deixe em branco para manter a atual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label htmlFor="conta-admin-email" className="text-sm font-medium">E-mail</label>
              <Input
                id="conta-admin-email"
                value={contaAdminEmail}
                onChange={(event) => setContaAdminEmail(event.target.value)}
                className="mt-1"
                inputMode="email"
                autoComplete="off"
                maxLength={160}
                disabled={salvandoConta}
              />
            </div>
            <div>
              <label htmlFor="conta-admin-senha" className="text-sm font-medium">Senha</label>
              <Input
                id="conta-admin-senha"
                type="password"
                value={contaAdminSenha}
                onChange={(event) => setContaAdminSenha(event.target.value)}
                placeholder="Deixe em branco para manter"
                className="mt-1"
                autoComplete="new-password"
                maxLength={128}
                disabled={salvandoConta}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-600"
                checked={contaAdminAtiva}
                onChange={(event) => setContaAdminAtiva(event.target.checked)}
                disabled={salvandoConta}
              />
              Conta ativa
            </label>
          </div>

          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setEditandoConta(null)} disabled={salvandoConta}>
              Cancelar
            </Button>
            <Button onClick={() => void saveContaAdmin()} disabled={salvandoConta}>
              {salvandoConta && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação: remover conta de envio ─────────────────────── */}
      <AlertDialog open={Boolean(removendoConta)} onOpenChange={(open) => { if (!open) setRemovendoConta(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta de e-mail?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta de “{removendoConta?.usuario}” será apagada. As rebaixas dele voltam a sair
              pela conta padrão do servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void removeConta()}
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
import { Fragment, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { invokeFunction } from '@/lib/api';
import { Users, Plus, Trash2, Loader2, Shield, User, UserCheck, Pencil, X, Check, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AppUser {
  id: string;
  username: string;
  role: string;
  /** Loja do usuário (multi-loja). */
  loja?: number;
  /** Encarregados vinculados (user/promotor/col_validade). */
  encarregados?: string[];
  created_at: string;
}

interface Loja {
  codigo: number;
  nome: string;
  ativo: boolean;
}

/** Encarregado (ou admin) disponível para receber um vínculo. */
interface EncarregadoOption {
  username: string;
  role: string;
  loja?: number;
}

const ROLE_OPTIONS = [
  { value: 'user', label: 'Usuário' },
  { value: 'promotor', label: 'Promotor' },
  { value: 'col_validade', label: 'Col. Validade' },
  { value: 'encarregado', label: 'Encarregado' },
  { value: 'admin', label: 'Admin' },
];

/** Perfis que precisam estar vinculados a um ou mais encarregados. */
const isSubordinate = (role: string) =>
  role === 'user' || role === 'promotor' || role === 'col_validade';

const getRoleLabel = (role: string) => ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;

const RoleIcon = ({ role }: { role: string }) => {
  if (role === 'admin') return <Shield className="h-3.5 w-3.5 text-accent" />;
  if (role === 'encarregado') return <UserCheck className="h-3.5 w-3.5 text-blue-600" />;
  if (role === 'promotor' || role === 'col_validade') return <UserCheck className="h-3.5 w-3.5 text-primary" />;
  return <User className="h-3.5 w-3.5 text-gray-500" />;
};

/**
 * Seletor múltiplo de encarregados.
 *
 * Um `user`, `promotor` ou `col_validade` pode estar ligado a mais de um
 * encarregado — todos veem as validades coletadas por ele.
 */
const EncarregadosPicker = ({
  options,
  selected,
  onChange,
  emptyLabel,
}: {
  options: EncarregadoOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel: string;
}) => (
  <div className="space-y-1.5">
    <p className="text-xs font-medium text-muted-foreground">Encarregado(s) responsável(is)</p>
    {options.length === 0 ? (
      <p className="text-xs text-muted-foreground">{emptyLabel}</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.username}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
          >
            <Checkbox
              checked={selected.includes(option.username)}
              onCheckedChange={() => onChange(
                selected.includes(option.username)
                  ? selected.filter((name) => name !== option.username)
                  : [...selected, option.username],
              )}
            />
            <span>{option.username}</span>
            {option.role === 'admin' && (
              <span className="text-[10px] uppercase text-muted-foreground">admin</span>
            )}
          </label>
        ))}
      </div>
    )}
  </div>
);

const UserManagementView = () => {
  const { getToken, loja: lojaAtual } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newEncarregados, setNewEncarregados] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editLoja, setEditLoja] = useState('');
  const [editEncarregados, setEditEncarregados] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [encarregados, setEncarregados] = useState<EncarregadoOption[]>([]);
  const [saving, setSaving] = useState(false);

  const invokeWithToken = (body: Record<string, unknown>) => {
    const token = getToken();
    return invokeFunction('manage-users', {
      body,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
  };

  const nomeLoja = (codigo?: number) => {
    if (!codigo) return '—';
    return lojas.find((l) => l.codigo === codigo)?.nome ?? `Loja ${codigo}`;
  };

  /** Loja em que o admin está agora (vem do token). */
  const nomeLojaAtual = nomeLoja(lojaAtual ?? undefined);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeWithToken({ action: 'list' });
      if (error || !data?.users) { toast.error('Erro ao carregar usuários'); return; }
      setUsers(data.users);
    } catch { toast.error('Erro ao carregar usuários'); }
    finally { setLoading(false); }
  };

  const fetchLojas = async () => {
    try {
      const { data } = await invokeWithToken({ action: 'list_lojas' });
      if (Array.isArray(data?.lojas)) {
        setLojas(data.lojas);
      }
    } catch { /* a lista de lojas é acessória */ }
  };

  /** Encarregados (e admins) da loja atual para os vínculos. */
  const fetchEncarregados = async () => {
    try {
      const { data } = await invokeWithToken({ action: 'list_encarregados' });
      if (Array.isArray(data?.encarregados)) setEncarregados(data.encarregados);
    } catch { /* a lista é acessória */ }
  };

  useEffect(() => {
    fetchUsers();
    fetchLojas();
    fetchEncarregados();
  }, []);

  const handleAdd = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await invokeWithToken({
        action: 'add',
        newUser: {
          username: newUsername.trim(),
          password: newPassword.trim(),
          role: newRole,
          // O acesso nasce na loja em que o admin está (a loja do token).
          loja: lojaAtual ?? undefined,
          // user/promotor/col_validade precisam de ao menos um encarregado.
          encarregados: isSubordinate(newRole) ? newEncarregados : [],
        },
      });
      if (error || data?.error) { toast.error(data?.error || 'Erro ao adicionar usuário'); return; }
      toast.success('Usuário adicionado com sucesso!');
      setNewUsername(''); setNewPassword(''); setNewRole('user'); setNewEncarregados([]);
      fetchUsers();
    } catch { toast.error('Erro ao adicionar usuário'); }
    finally { setAdding(false); }
  };

  const handleEdit = (u: AppUser) => {
    setEditingUser(u.username);
    setEditRole(u.role);
    setEditLoja(u.loja ? String(u.loja) : '');
    setEditEncarregados(u.encarregados ?? []);
    setEditPassword('');
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditRole('');
    setEditLoja('');
    setEditEncarregados([]);
    setEditPassword('');
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editRole) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { username: editingUser, role: editRole };
      if (editLoja) payload.loja = Number(editLoja);
      if (editPassword.trim()) payload.password = editPassword.trim();
      if (isSubordinate(editRole)) payload.encarregados = editEncarregados;
      const { data, error } = await invokeWithToken({ action: 'update', newUser: payload });
      if (error || data?.error) { toast.error(data?.error || 'Erro ao atualizar usuário'); return; }
      toast.success('Usuário atualizado!');
      handleCancelEdit();
      fetchUsers();
    } catch { toast.error('Erro ao atualizar usuário'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`Remover o usuário "${username}"?`)) return;
    try {
      const { data, error } = await invokeWithToken({ action: 'delete', newUser: { username } });
      if (error || data?.error) { toast.error(data?.error || 'Erro ao remover usuário'); return; }
      toast.success('Usuário removido');
      fetchUsers();
    } catch { toast.error('Erro ao remover usuário'); }
  };

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-4 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6">
        <h2 className="mb-1 text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Users className="h-6 w-6" /> Gerenciar Usuários
        </h2>
        <p className="text-sm text-white/80">
          Acessos de <span className="font-semibold">{nomeLojaAtual}</span> — para ver outra loja, troque de loja no menu do usuário.
        </p>
      </div>

      {/* Add user form */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 mb-6">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo Usuário
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Store className="h-3.5 w-3.5" /> {nomeLojaAtual}
          </span>
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Nome de usuário" disabled={adding} />
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Senha" disabled={adding} />
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={adding || !newUsername.trim() || !newPassword.trim()} className="gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </Button>
        </div>
        {isSubordinate(newRole) && (
          <div className="mt-3">
            <EncarregadosPicker
              options={encarregados}
              selected={newEncarregados}
              onChange={setNewEncarregados}
              emptyLabel="Nenhum encarregado cadastrado nesta loja."
            />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          O acesso é criado em <span className="font-medium text-foreground">{nomeLojaAtual}</span>.
        </p>
      </div>

      {/* Users list */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border border-border bg-white p-3">
                {editingUser === u.username ? (
                  <div className="space-y-2">
                    <p className="font-medium text-gray-900">{u.username}</p>
                    <Select value={editRole} onValueChange={setEditRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={editLoja} onValueChange={setEditLoja}>
                      <SelectTrigger aria-label="Loja"><SelectValue placeholder="Loja" /></SelectTrigger>
                      <SelectContent>
                        {lojas.map(l => <SelectItem key={l.codigo} value={String(l.codigo)}>{l.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isSubordinate(editRole) && (
                      <EncarregadosPicker
                        options={encarregados}
                        selected={editEncarregados}
                        onChange={setEditEncarregados}
                        emptyLabel="Nenhum encarregado cadastrado nesta loja."
                      />
                    )}
                    <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Nova senha (opcional)" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="gap-1">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900 flex items-center gap-1.5">
                        <RoleIcon role={u.role} /> {u.username}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {getRoleLabel(u.role)} · {nomeLoja(u.loja)} · {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </p>
                      {u.encarregados && u.encarregados.length > 0 && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          Encarregado(s): {u.encarregados.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(u.username)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block rounded-xl border border-border overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Encarregado(s)</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                      Nenhum acesso cadastrado em {nomeLojaAtual} ainda.
                    </TableCell>
                  </TableRow>
                ) : users.map((u) => (
                  <Fragment key={u.id}>
                  <TableRow>
                    <TableCell className="font-medium text-gray-900">{u.username}</TableCell>
                    <TableCell>
                      {editingUser === u.username ? (
                        <div className="flex items-center gap-2">
                          <Select value={editRole} onValueChange={setEditRole}>
                            <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Nova senha (opcional)" className="w-[150px] h-8" />
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <RoleIcon role={u.role} /> {getRoleLabel(u.role)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingUser === u.username && isSubordinate(editRole) ? (
                        <EncarregadosPicker
                          options={encarregados}
                          selected={editEncarregados}
                          onChange={setEditEncarregados}
                          emptyLabel="Nenhum encarregado nesta loja."
                        />
                      ) : (
                        <span className="text-sm text-gray-700">
                          {u.encarregados && u.encarregados.length > 0 ? u.encarregados.join(', ') : '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingUser === u.username ? (
                        <Select value={editLoja} onValueChange={setEditLoja}>
                          <SelectTrigger className="w-[130px] h-8" aria-label="Loja"><SelectValue placeholder="Loja" /></SelectTrigger>
                          <SelectContent>
                            {lojas.map(l => <SelectItem key={l.codigo} value={String(l.codigo)}>{l.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-gray-700">
                          <Store className="h-3.5 w-3.5" /> {nomeLoja(u.loja)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-700 text-sm">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      {editingUser === u.username ? (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={handleSaveEdit} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(u.username)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
};

export default UserManagementView;

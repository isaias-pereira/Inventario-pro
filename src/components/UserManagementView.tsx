import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Users, Plus, Trash2, Loader2, Shield, User, UserCheck, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  created_at: string;
}

const ROLE_OPTIONS = [
  { value: 'user', label: 'Usuário' },
  { value: 'promotor', label: 'Promotor' },
  { value: 'col_validade', label: 'Col. Validade' },
  { value: 'encarregado', label: 'Encarregado' },
  { value: 'enc_flv', label: 'Enc. FLV' },
  { value: 'admin', label: 'Admin' },
];

const getRoleLabel = (role: string) => ROLE_OPTIONS.find(r => r.value === role)?.label ?? role;

const RoleIcon = ({ role }: { role: string }) => {
  if (role === 'admin') return <Shield className="h-3.5 w-3.5 text-accent" />;
  if (role === 'encarregado' || role === 'enc_flv') return <UserCheck className="h-3.5 w-3.5 text-blue-600" />;
  if (role === 'promotor' || role === 'col_validade') return <UserCheck className="h-3.5 w-3.5 text-primary" />;
  return <User className="h-3.5 w-3.5 text-gray-500" />;
};

const UserManagementView = () => {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [adding, setAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const invokeWithToken = (body: Record<string, unknown>) => {
    const token = getToken();
    return supabase.functions.invoke('manage-users', {
      body,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeWithToken({ action: 'list' });
      if (error || !data?.users) { toast.error('Erro ao carregar usuários'); return; }
      setUsers(data.users);
    } catch { toast.error('Erro ao carregar usuários'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return;
    setAdding(true);
    try {
      const { data, error } = await invokeWithToken({
        action: 'add',
        newUser: { username: newUsername.trim(), password: newPassword.trim(), role: newRole },
      });
      if (error || data?.error) { toast.error(data?.error || 'Erro ao adicionar usuário'); return; }
      toast.success('Usuário adicionado com sucesso!');
      setNewUsername(''); setNewPassword(''); setNewRole('user');
      fetchUsers();
    } catch { toast.error('Erro ao adicionar usuário'); }
    finally { setAdding(false); }
  };

  const handleEdit = (u: AppUser) => {
    setEditingUser(u.username);
    setEditRole(u.role);
    setEditPassword('');
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditRole('');
    setEditPassword('');
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !editRole) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = { username: editingUser, role: editRole };
      if (editPassword.trim()) payload.password = editPassword.trim();
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
        <p className="text-sm text-white/80">Adicione, edite ou remova usuários do sistema</p>
      </div>

      {/* Add user form */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-6 mb-6">
        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo Usuário
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
                        {getRoleLabel(u.role)} · {new Date(u.created_at).toLocaleDateString('pt-BR')}
                      </p>
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
                  <TableHead>Criado em</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
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

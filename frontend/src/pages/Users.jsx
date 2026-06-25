import { KeyRound, Pencil, Save, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const emptyCreateForm = { name: '', email: '', password: 'Oration@2026!', role: 'admin', status: 'active' };
const emptyResetForm = { id: null, name: '', password: 'Oration@2026!' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyCreateForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'admin', status: 'active' });
  const [resetForm, setResetForm] = useState(emptyResetForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setUsers(await api('/users'));
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/users', { method: 'POST', body: form });
      setForm(emptyCreateForm);
      setCreateOpen(false);
      setNotice('User created');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function updateUser(id, patch) {
    setError('');
    setNotice('');
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: patch });
      setNotice('User updated');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(user) {
    setEditingId(user.id);
    setEditForm({ name: user.name, role: user.role, status: user.status });
    setError('');
    setNotice('');
  }

  async function saveEdit(userId) {
    await updateUser(userId, editForm);
    setEditingId(null);
  }

  async function resetPassword(event) {
    event.preventDefault();
    const userId = resetForm.id;
    const password = resetForm.password;
    setError('');
    setNotice('');
    try {
      await api(`/users/${userId}`, { method: 'PATCH', body: { password } });
      setResetForm(emptyResetForm);
      setNotice('Password reset');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete ${user.name}?`)) return;
    setError('');
    setNotice('');
    try {
      await api(`/users/${user.id}`, { method: 'DELETE' });
      setNotice('User deleted');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="User Management"
        kicker="admins and access"
        actions={(
          <button className="primary-btn" onClick={() => setCreateOpen(true)}>
            <UserPlus size={18} />
            Create User
          </button>
        )}
      />
      {notice ? <div className="toast-inline page-toast">{notice}</div> : null}
      {error ? <div className="alert page-toast">{error}</div> : null}
      <section className="user-management-stack">
        <section className="panel table-panel">
          <div className="table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const editing = editingId === user.id;
                  return (
                    <tr key={user.id}>
                      <td>
                        {editing ? (
                          <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        ) : user.name}
                      </td>
                      <td>{user.email}</td>
                      <td>
                        {editing ? (
                          <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                            <option value="super_admin">Super Admin</option>
                            <option value="admin">Admin</option>
                            <option value="user">User</option>
                          </select>
                        ) : user.role.replace('_', ' ')}
                      </td>
                      <td>
                        {editing ? (
                          <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        ) : user.status}
                      </td>
                      <td>
                        <div className="row-actions user-actions">
                          {editing ? (
                            <>
                              <button type="button" title="Save" aria-label={`Save ${user.name}`} onClick={() => saveEdit(user.id)}>
                                <Save size={16} />
                              </button>
                              <button type="button" title="Cancel" aria-label={`Cancel editing ${user.name}`} onClick={() => setEditingId(null)}>
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" title="Edit" aria-label={`Edit ${user.name}`} onClick={() => startEdit(user)}>
                                <Pencil size={16} />
                              </button>
                              <button type="button" title="Reset password" aria-label={`Reset password for ${user.name}`} onClick={() => setResetForm({ id: user.id, name: user.name, password: 'Oration@2026!' })}>
                                <KeyRound size={16} />
                              </button>
                              <button type="button" className="danger-btn" title="Delete" aria-label={`Delete ${user.name}`} onClick={() => deleteUser(user)}>
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {createOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-panel user-modal form-panel" onSubmit={createUser}>
            <div className="modal-header">
              <div>
                <span className="kicker">new access</span>
                <h2>Create User</h2>
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setCreateOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="primary-btn">
              <UserPlus size={18} />
              Create User
            </button>
          </form>
        </div>
      ) : null}

      {resetForm.id ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-panel user-modal form-panel" onSubmit={resetPassword}>
            <div className="modal-header">
              <div>
                <span className="kicker">credential reset</span>
                <h2>{resetForm.name}</h2>
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setResetForm(emptyResetForm)}>
                <X size={18} />
              </button>
            </div>
            <label>
              New Password
              <input value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} required />
            </label>
            <button className="primary-btn">
              <KeyRound size={18} />
              Reset Password
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}

import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: 'Password@123', role: 'admin', status: 'active' });

  async function load() {
    setUsers(await api('/users'));
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(event) {
    event.preventDefault();
    await api('/users', { method: 'POST', body: form });
    setForm({ name: '', email: '', password: 'Password@123', role: 'admin', status: 'active' });
    load();
  }

  async function updateUser(id, patch) {
    await api(`/users/${id}`, { method: 'PATCH', body: patch });
    load();
  }

  return (
    <>
      <PageHeader title="User Management" kicker="admins and access" />
      <section className="management-grid">
        <form className="panel form-panel" onSubmit={createUser}>
          <div className="panel-title">
            <UserPlus size={20} />
            Create User
          </div>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="admin">Admin</option>
            <option value="user">User</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <button className="primary-btn">Create</button>
        </form>
        <section className="panel table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <select value={user.role} onChange={(e) => updateUser(user.id, { role: e.target.value })}>
                        <option value="super_admin">Super Admin</option>
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                      </select>
                    </td>
                    <td>
                      <select value={user.status} onChange={(e) => updateUser(user.id, { status: e.target.value })}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}


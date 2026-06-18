import { CheckCircle2, CheckSquare, CircleDot, Plus, RotateCcw, Search, Sparkles, Upload, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { api } from '../lib/api.js';

const emptyForm = { employee_id: '', employee_name: '', email: '', status: 'active', already_spoken: false, coordinator_eligible: true };
const importFields = [
  ['employee_id', 'Employee ID'],
  ['employee_name', 'Employee Name'],
  ['email', 'Email'],
  ['status', 'Status'],
  ['already_spoken', 'Already Spoken'],
  ['coordinator_eligible', 'Coordinator Eligible']
];

const spokenFilters = [
  { label: 'All speakers', value: '', icon: CircleDot },
  { label: 'Ready to spin', value: 'false', icon: Sparkles },
  { label: 'Already spoken', value: 'true', icon: CheckCircle2 }
];

const statusFilters = [
  { label: 'All status', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ search: '', spoken: '', status: '' });
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [csvImport, setCsvImport] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const query = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))).toString();
    setEmployees(await api(`/employees${query ? `?${query}` : ''}`));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event) {
    event.preventDefault();
    const path = editingId ? `/employees/${editingId}` : '/employees';
    const method = editingId ? 'PATCH' : 'POST';
    await api(path, { method, body: form });
    setForm(emptyForm);
    setEditingId(null);
    setIsModalOpen(false);
    setMessage('Employee saved');
    load();
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setIsModalOpen(true);
  }

  function openEdit(employee) {
    setForm(employee);
    setEditingId(employee.id);
    setIsModalOpen(true);
  }

  async function handleCsvSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    const headers = rows[0] || [];
    const dataRows = rows.slice(1);
    const mapping = Object.fromEntries(
      importFields.map(([field, label]) => {
        const match = headers.find((header) => header.toLowerCase().replaceAll(' ', '_') === field || header.toLowerCase() === label.toLowerCase());
        return [field, match || ''];
      })
    );
    setCsvImport({ fileName: file.name, headers, rows: dataRows, mapping });
    event.target.value = '';
  }

  async function uploadMappedCsv(event) {
    event.preventDefault();
    if (!csvImport) return;
    const canonicalHeaders = importFields.map(([field]) => field);
    const lines = [
      canonicalHeaders.join(','),
      ...csvImport.rows.map((row) => {
        const record = Object.fromEntries(csvImport.headers.map((header, index) => [header, row[index]]));
        return canonicalHeaders.map((field) => csvEscape(record[csvImport.mapping[field]] || '')).join(',');
      })
    ];
    const file = new File([lines.join('\n')], `mapped-${csvImport.fileName}`, { type: 'text/csv' });
    const body = new FormData();
    body.append('file', file);
    const result = await api('/employees/bulk-import', { method: 'POST', body });
    setCsvImport(null);
    setMessage(`${result.imported.length} employees imported`);
    load();
  }

  async function applyBulkAction() {
    if (!bulkAction) return setMessage('Choose a bulk action');
    if (!selectedIds.length) return setMessage('Select at least one employee');
    if (bulkAction === 'delete' && !confirm(`Delete ${selectedIds.length} selected employees?`)) return;
    const result = await api('/employees/bulk-action', {
      method: 'POST',
      body: { employee_ids: selectedIds, action: bulkAction }
    });
    setSelectedIds([]);
    setBulkAction('');
    setMessage(`${result.count} employees updated`);
    load();
  }

  function toggleSelected(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible(checked) {
    setSelectedIds(checked ? employees.map((employee) => employee.id) : []);
  }

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function remove(id) {
    if (!confirm('Delete this employee?')) return;
    await api(`/employees/${id}`, { method: 'DELETE' });
    load();
  }

  async function resetSpoken() {
    if (!confirm('Reset spoken status for all active employees?')) return;
    await api('/employees/reset-spoken', { method: 'POST', body: { reason: 'Manual reset from UI' } });
    setMessage('Cycle reset');
    load();
  }

  const activeCount = employees.filter((employee) => employee.status === 'active').length;
  const spokenCount = employees.filter((employee) => employee.already_spoken).length;
  const readyCount = employees.filter((employee) => !employee.already_spoken && employee.status === 'active').length;

  return (
    <div className="employee-page">
      <PageHeader
        title="Employee Management"
        kicker="people and cycle controls"
        actions={
          <>
            <button className="primary-btn" onClick={openCreate}>
              <Plus size={16} />
              Add Employee
            </button>
            <label className="secondary-btn file-btn">
              <Upload size={16} />
              Import CSV
              <input type="file" accept=".csv" onChange={handleCsvSelected} />
            </label>
            <button className="secondary-btn" onClick={resetSpoken}>
              <RotateCcw size={16} />
              Reset Cycle
            </button>
          </>
        }
      />

      {message ? <div className="toast-inline page-toast">{message}</div> : null}

      <section className="employee-command-strip">
        <div className="employee-stat-chip">
          <span>Total crew</span>
          <strong>{employees.length}</strong>
        </div>
        <div className="employee-stat-chip cyan">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="employee-stat-chip green">
          <span>Ready</span>
          <strong>{readyCount}</strong>
        </div>
        <div className="employee-stat-chip pink">
          <span>Spoken</span>
          <strong>{spokenCount}</strong>
        </div>
        <div className="employee-stat-chip gold">
          <span>Selected</span>
          <strong>{selectedIds.length}</strong>
        </div>
      </section>

      <section className="panel table-panel employee-table-panel">
        <div className="employee-filter-panel">
          <div className="filter-search-pill">
            <Search size={16} />
            <input placeholder="Search employees" value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
          </div>
          <div className="filter-bubble-group" aria-label="Spoken filter">
            {spokenFilters.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value || 'all-spoken'}
                  className={`filter-bubble ${filters.spoken === option.value ? 'active' : ''}`}
                  onClick={() => setFilter('spoken', option.value)}
                >
                  <Icon size={15} />
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="filter-bubble-group" aria-label="Status filter">
            {statusFilters.map((option) => (
              <button
                key={option.value || 'all-status'}
                className={`filter-bubble ${filters.status === option.value ? 'active' : ''}`}
                onClick={() => setFilter('status', option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button className="secondary-btn filter-apply-btn" onClick={load}>Apply Filters</button>
        </div>

        <div className="employee-toolbar">
            <div className="bulk-actions">
              <CheckSquare size={16} />
              <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}>
                <option value="">Bulk action</option>
                <option value="activate">Activate</option>
                <option value="deactivate">Deactivate</option>
                <option value="mark_spoken">Mark spoken</option>
                <option value="mark_not_spoken">Mark not spoken</option>
                <option value="coordinator_yes">Coordinator eligible</option>
                <option value="coordinator_no">Coordinator not eligible</option>
                <option value="delete">Delete selected</option>
              </select>
              <button className="secondary-btn" onClick={applyBulkAction}>Apply</button>
              <span>{selectedIds.length} selected</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="employee-table">
              <thead>
                <tr>
                  <th>
                    <input
                      className="select-checkbox"
                      type="checkbox"
                      checked={employees.length > 0 && selectedIds.length === employees.length}
                      onChange={(e) => toggleAllVisible(e.target.checked)}
                    />
                  </th>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Spoken</th>
                  <th>Coordinator</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>
                      <input className="select-checkbox" type="checkbox" checked={selectedIds.includes(employee.id)} onChange={() => toggleSelected(employee.id)} />
                    </td>
                    <td>{employee.employee_id}</td>
                    <td><strong>{employee.employee_name}</strong></td>
                    <td>{employee.email}</td>
                    <td><span className={`mini-pill ${employee.status}`}>{employee.status}</span></td>
                    <td><span className={`mini-pill ${employee.already_spoken ? 'done' : 'ready'}`}>{employee.already_spoken ? 'Spoken' : 'Ready'}</span></td>
                    <td><span className={`mini-pill ${employee.coordinator_eligible ? 'yes' : 'no'}`}>{employee.coordinator_eligible ? 'Eligible' : 'Off'}</span></td>
                    <td className="row-actions">
                      <button onClick={() => openEdit(employee)}>Edit</button>
                      <button onClick={() => remove(employee.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-panel form-panel" onSubmit={save}>
            <div className="modal-header">
              <div className="panel-title">
                <UserPlus size={20} />
                {editingId ? 'Edit Employee' : 'Add Employee'}
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <input placeholder="Employee ID" value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} required />
            <input placeholder="Employee Name" value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} required />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <label className="check-row">
              <input type="checkbox" checked={form.already_spoken} onChange={(e) => setForm({ ...form, already_spoken: e.target.checked })} />
              Already spoken
            </label>
            <label className="check-row">
              <input type="checkbox" checked={form.coordinator_eligible} onChange={(e) => setForm({ ...form, coordinator_eligible: e.target.checked })} />
              Coordinator eligible
            </label>
            <button className="primary-btn">{editingId ? 'Update Employee' : 'Create Employee'}</button>
          </form>
        </div>
      ) : null}

      {csvImport ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-panel event-modal" onSubmit={uploadMappedCsv}>
            <div className="modal-header">
              <div className="panel-title">
                <Upload size={20} />
                Map CSV Fields
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setCsvImport(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-help">Map columns from {csvImport.fileName}. Preview rows detected: {csvImport.rows.length}</p>
            <div className="mapping-grid">
              {importFields.map(([field, label]) => (
                <label key={field}>
                  {label}
                  <select
                    value={csvImport.mapping[field] || ''}
                    onChange={(e) => setCsvImport({
                      ...csvImport,
                      mapping: { ...csvImport.mapping, [field]: e.target.value }
                    })}
                    required={['employee_id', 'employee_name', 'email'].includes(field)}
                  >
                    <option value="">Ignore / default</option>
                    {csvImport.headers.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="csv-preview">
              <strong>Preview</strong>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>{csvImport.headers.map((header) => <th key={header}>{header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csvImport.rows.slice(0, 3).map((row, index) => (
                      <tr key={index}>{csvImport.headers.map((header, cellIndex) => <td key={header}>{row[cellIndex]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <button className="primary-btn">Import Mapped CSV</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

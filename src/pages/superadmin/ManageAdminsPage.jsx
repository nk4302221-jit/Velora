import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Search,
  Pencil,
  Trash2,
  KeyRound,
  UserCheck,
  UserX,
  Copy,
  ShieldCheck,
} from 'lucide-react';

import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SuperAdminRoute } from '../../components/SuperAdminRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';
import { SUPER_ADMIN_NAV } from '../../config/portalNav';
import { roleLabel } from '../../utils/roles';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
};

const ManageAdmins = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', email: '', phone: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/super-admin/admins', {
        params: { limit: 100 },
      });

      if (res.data?.success) {
        setAdmins(res.data.admins || []);
      } else {
        setError(res.data?.message || 'Could not load administrators.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load administrators.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validate = () => {
    const errors = {};

    if (!form.fullName.trim()) errors.fullName = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      errors.email = 'Enter a valid email address.';
    if (form.password.length < 8)
      errors.password = 'Use at least 8 characters.';

    setFormErrors(errors);

    return Object.keys(errors).length === 0;
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);

    try {
      // Role is intentionally omitted: this endpoint only ever creates an Admin.
      const res = await api.post('/admin/users/admin', {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });

      showToast(res.data?.message || 'Administrator created', 'success');

      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not create the administrator',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (admin) => {
    const next = admin.status === 'active' ? 'inactive' : 'active';

    try {
      const res = await api.patch(`/super-admin/admins/${admin.id}/status`, {
        status: next,
      });

      showToast(res.data?.message || `Account ${next}`, 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not update the account',
        'error'
      );
    }
  };

  const handleRoleChange = async (admin, role) => {
    try {
      const res = await api.patch(`/admin/users/${admin.id}/role`, { role });

      showToast(res.data?.message || 'Role updated', 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not change the role',
        'error'
      );
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();

    setSavingEdit(true);

    try {
      const res = await api.patch(`/super-admin/admins/${editing.id}`, editForm);

      showToast(res.data?.message || 'Administrator updated', 'success');
      setEditing(null);
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not update the administrator',
        'error'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // The API sets a Super-Admin-chosen password (it must be at least 8 chars).
  // Prompting here keeps the plaintext out of component state and out of the
  // network log, and the backend records the reset in the audit trail.
  const handleResetPassword = async (admin) => {
    const newPassword = window.prompt(
      `Enter the new password for ${admin.email} (minimum 8 characters):`
    );

    if (newPassword === null) return;

    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters long', 'error');
      return;
    }

    try {
      const res = await api.post(
        `/super-admin/admins/${admin.id}/reset-password`,
        { newPassword }
      );

      showToast(
        res.data?.message || `Password reset for ${admin.email}`,
        'success'
      );
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not reset the password',
        'error'
      );
    }
  };

  const handleDelete = async (admin) => {
    if (
      !window.confirm(
        `Permanently delete ${admin.email}? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const res = await api.delete(`/super-admin/admins/${admin.id}`);

      showToast(res.data?.message || 'Administrator deleted', 'success');
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not delete the administrator',
        'error'
      );
    }
  };

  const term = search.trim().toLowerCase();
  const visible = term
    ? admins.filter(
        (a) =>
          a.full_name?.toLowerCase().includes(term) ||
          a.email?.toLowerCase().includes(term)
      )
    : admins;

  return (
    <>
      <PageHeader
        title="Manage Administrators"
        subtitle="Create, edit, activate, promote and remove privileged accounts."
        actions={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setForm(EMPTY_FORM);
              setFormErrors({});
              setShowCreate(true);
            }}
            data-testid="open-create-admin"
          >
            <UserPlus size={16} /> Add Administrator
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="search"
            className="form-control"
            style={{ paddingLeft: 38 }}
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search administrators"
          />
        </div>
      </div>

      {loading ? <LoadingState label="Loading administrators..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        visible.length === 0 ? (
          <EmptyState
            message="No administrators match your search."
            icon={ShieldCheck}
          />
        ) : (
          <div className="table-responsive">
            <table className="table" data-testid="admins-table">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((admin) => {
                  const isSelf = currentUser?.id === admin.id;

                  return (
                    <tr key={admin.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {admin.full_name}
                          {isSelf ? (
                            <span
                              className="badge badge-primary"
                              style={{ marginLeft: 8 }}
                            >
                              You
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {admin.email}
                        </div>
                      </td>

                      <td>
                        <select
                          className="form-control"
                          style={{ padding: '6px 10px', fontSize: 13 }}
                          value={admin.role}
                          disabled={isSelf}
                          onChange={(e) => handleRoleChange(admin, e.target.value)}
                          aria-label={`Role for ${admin.email}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      </td>

                      <td>
                        <StatusBadge status={admin.status} />
                      </td>

                      <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {admin.created_at
                          ? new Date(admin.created_at).toLocaleDateString()
                          : '-'}
                      </td>

                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: 6,
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditing(admin);
                              setEditForm({
                                fullName: admin.full_name || '',
                                email: admin.email || '',
                                phone: admin.phone || '',
                              });
                            }}
                            title="Edit details"
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleResetPassword(admin)}
                            title="Issue temporary password"
                          >
                            <KeyRound size={14} />
                          </button>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStatusToggle(admin)}
                            disabled={isSelf}
                            title={
                              admin.status === 'active'
                                ? 'Deactivate account'
                                : 'Activate account'
                            }
                          >
                            {admin.status === 'active' ? (
                              <UserX size={14} />
                            ) : (
                              <UserCheck size={14} />
                            )}
                          </button>

                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(admin)}
                            disabled={isSelf || admin.role === 'super_admin'}
                            title={
                              admin.role === 'super_admin'
                                ? 'Super Admins cannot be deleted'
                                : 'Delete administrator'
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* ---------- Create modal ---------- */}
      {showCreate ? (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-admin-title"
          >
            <div className="modal-header">
              <h3 id="create-admin-title">Add Administrator</h3>
            </div>

            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    marginBottom: 16,
                  }}
                >
                  New accounts are created with the <strong>Admin</strong> role.
                  You can promote one to Super Admin afterwards.
                </p>

                <div className="form-group">
                  <label className="form-label" htmlFor="admin-name">
                    Full Name
                  </label>
                  <input
                    id="admin-name"
                    className="form-control"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                  />
                  {formErrors.fullName ? (
                    <p className="form-error">{formErrors.fullName}</p>
                  ) : null}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="admin-email">
                    Email Address
                  </label>
                  <input
                    id="admin-email"
                    type="email"
                    className="form-control"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                  />
                  {formErrors.email ? (
                    <p className="form-error">{formErrors.email}</p>
                  ) : null}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="admin-phone">
                    Phone (optional)
                  </label>
                  <input
                    id="admin-phone"
                    className="form-control"
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="admin-password">
                    Temporary Password
                  </label>
                  <input
                    id="admin-password"
                    type="text"
                    className="form-control"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder="Minimum 8 characters"
                  />
                  {formErrors.password ? (
                    <p className="form-error">{formErrors.password}</p>
                  ) : null}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Creating...' : 'Create Administrator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ---------- Edit modal ---------- */}
      {editing ? (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-admin-title"
          >
            <div className="modal-header">
              <h3 id="edit-admin-title">Edit {editing.email}</h3>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-name">
                    Full Name
                  </label>
                  <input
                    id="edit-name"
                    className="form-control"
                    value={editForm.fullName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, fullName: e.target.value })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="edit-email">
                    Email Address
                  </label>
                  <input
                    id="edit-email"
                    type="email"
                    className="form-control"
                    value={editForm.email}
                    onChange={(e) =>
                      setEditForm({ ...editForm, email: e.target.value })
                    }
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="edit-phone">
                    Phone
                  </label>
                  <input
                    id="edit-phone"
                    className="form-control"
                    value={editForm.phone}
                    onChange={(e) =>
                      setEditForm({ ...editForm, phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEdit}
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
};

export const ManageAdminsPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <ManageAdmins />
    </PortalLayout>
  </SuperAdminRoute>
);

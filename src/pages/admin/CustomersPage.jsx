import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, ShieldCheck } from 'lucide-react';

import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PortalPage } from '../../components/PortalPage';
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusBadge,
} from '../../components/PortalPrimitives';
import { roleLabel, ROLE_SUPER_ADMIN, ROLE_CUSTOMER } from '../../utils/roles';

const ROLES = ['', 'customer', 'admin', 'super_admin'];

// updateUserStatus validates against exactly this set.
const STATUSES = ['active', 'inactive', 'blocked'];

const Customers = () => {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [role, setRole] = useState(ROLE_CUSTOMER);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/admin/users', {
        params: {
          page,
          limit: 20,
          search: search || undefined,
          role: role || undefined,
          status: status || undefined,
        },
      });

      if (res.data?.success) {
        // Users are a top-level array, not nested under data.
        setUsers(res.data.users || []);
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load users.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [page, search, role, status]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (target, nextStatus) => {
    if (nextStatus === target.status) return;

    setBusyId(target.id);

    try {
      const res = await api.patch(`/admin/users/${target.id}/status`, {
        status: nextStatus,
      });

      showToast(
        res.data?.message || `Status set to ${nextStatus}`,
        'success'
      );
      load();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not update the user status',
        'error'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Accounts, roles and access status. Role changes are Super Admin only."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
        }}
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            className="form-control"
            placeholder="Search by name, email or phone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search users"
          />
        </div>

        <select
          className="form-control"
          style={{ width: 160 }}
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by role"
        >
          {ROLES.map((value) => (
            <option key={value || 'all'} value={value}>
              {value ? roleLabel(value) : 'All roles'}
            </option>
          ))}
        </select>

        <select
          className="form-control"
          style={{ width: 150 }}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {value.charAt(0).toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>

        <button type="submit" className="btn btn-secondary btn-sm">
          <Search size={15} /> Search
        </button>
      </form>

      {loading ? <LoadingState label="Loading accounts..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        users.length === 0 ? (
          <EmptyState message="No accounts match these filters." icon={Users} />
        ) : (
          <>
            {pagination ? (
              <div className="stat-cards-grid">
                <StatCard
                  label="Accounts Shown"
                  value={pagination.total}
                  icon={Users}
                />
                <StatCard label="Page" value={pagination.page} />
                <StatCard
                  label="Total Pages"
                  value={pagination.totalPages}
                />
              </div>
            ) : null}

            <div className="table-responsive">
              <table className="table" data-testid="customers-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Role</th>
                    <th>Membership</th>
                    <th style={{ textAlign: 'right' }}>Orders</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th style={{ width: 160 }}>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((target) => {
                    const isSelf =
                      Number(target.id) === Number(currentUser?.id);
                    const isSuperAdmin =
                      target.role === ROLE_SUPER_ADMIN;

                    return (
                      <tr key={target.id}>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                            }}
                          >
                            {target.avatar_url ? (
                              <img
                                src={target.avatar_url}
                                alt=""
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <span
                                style={{
                                  width: 38,
                                  height: 38,
                                  borderRadius: '50%',
                                  background: 'var(--bg-light)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: 14,
                                }}
                              >
                                {(target.name || '?')
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            )}

                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {target.name}
                                {isSelf ? (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      marginLeft: 6,
                                      color: 'var(--text-muted)',
                                    }}
                                  >
                                    (you)
                                  </span>
                                ) : null}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {target.email}
                                {target.phone ? ` · ${target.phone}` : ''}
                              </div>
                              {!target.email_verified ? (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: '#b45309',
                                  }}
                                >
                                  Email not verified
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td>
                          <span
                            className={
                              isSuperAdmin
                                ? 'badge badge-primary'
                                : target.role === 'admin'
                                ? 'badge badge-warning'
                                : 'badge badge-neutral'
                            }
                            style={{ gap: 5 }}
                          >
                            {isSuperAdmin ? (
                              <ShieldCheck size={12} />
                            ) : null}
                            {roleLabel(target.role)}
                          </span>
                        </td>

                        <td style={{ fontSize: 13 }}>
                          {target.membership_plan ? (
                            <>
                              <div>{target.membership_plan}</div>
                              {target.membership_expiry ? (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  until{' '}
                                  {new Date(
                                    target.membership_expiry
                                  ).toLocaleDateString()}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>
                              None
                            </span>
                          )}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {Number(target.order_count || 0)}
                        </td>

                        <td>
                          <StatusBadge status={target.status} />
                        </td>

                        <td
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {target.created_at
                            ? new Date(target.created_at).toLocaleDateString()
                            : '-'}
                        </td>

                        <td>
                          {isSelf ? (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'var(--text-muted)',
                              }}
                            >
                              Current account
                            </span>
                          ) : isSuperAdmin ? (
                            <span
                              style={{
                                fontSize: 12,
                                color: 'var(--text-muted)',
                              }}
                            >
                              Manage in Super Admin
                            </span>
                          ) : (
                            <select
                              className="form-control"
                              value={target.status}
                              disabled={busyId === target.id}
                              onChange={(e) =>
                                changeStatus(target, e.target.value)
                              }
                              aria-label={`Status for ${target.email}`}
                            >
                              {STATUSES.map((value) => (
                                <option key={value} value={value}>
                                  {value.charAt(0).toUpperCase() +
                                    value.slice(1)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 16,
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Page {pagination.page} of {pagination.totalPages} ·{' '}
                  {pagination.total} accounts
                </span>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )
      ) : null}
    </>
  );
};

export const CustomersPage = () => (
  <PortalPage portal="admin">
    <Customers />
  </PortalPage>
);

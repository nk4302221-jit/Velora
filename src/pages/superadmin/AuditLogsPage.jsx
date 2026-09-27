import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, Search, ChevronLeft, ChevronRight } from 'lucide-react';

import api from '../../api/client';
import { SuperAdminRoute } from '../../components/SuperAdminRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
} from '../../components/PortalPrimitives';
import { SUPER_ADMIN_NAV } from '../../config/portalNav';
import { roleLabel } from '../../utils/roles';

const PAGE_SIZE = 25;

// Actions are grouped so a reviewer can scan for the sensitive ones quickly.
const actionTone = (action = '') => {
  const a = action.toLowerCase();

  if (a.includes('delete') || a.includes('reset') || a.includes('revoke'))
    return 'badge-danger';
  if (a.includes('create') || a.includes('login')) return 'badge-success';
  if (a.includes('update') || a.includes('status') || a.includes('role'))
    return 'badge-warning';
  if (a.includes('logout')) return 'badge-neutral';

  return 'badge-primary';
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actorEmail, setActorEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/super-admin/audit-logs', {
        params: {
          page,
          limit: PAGE_SIZE,
          ...(action ? { action } : {}),
          ...(actorEmail ? { actorEmail } : {}),
        },      });

      if (res.data?.success) {
        setLogs(res.data.logs || []);
        setPagination(res.data.pagination || null);
      } else {
        setError(res.data?.message || 'Could not load the audit trail.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the audit trail.');
    } finally {
      setLoading(false);
    }
  }, [page, action, actorEmail]);

  useEffect(() => {
    load();
  }, [load]);

  // A filter change should always land back on page 1.
  useEffect(() => {
    setPage(1);
  }, [action, actorEmail]);

  const renderDetails = (raw) => {
    if (!raw) return '-';

    try {
      const parsed = JSON.parse(raw);
      const text = JSON.stringify(parsed, null, 2);

      // Never surface anything that looks like a credential.
      if (/password_hash|"password"|key_secret/i.test(text)) {
        return '[redacted]';
      }

      return text;
    } catch {
      return String(raw);
    }
  };

  const totalPages = pagination?.totalPages || 1;

  return (
    <>
      <PageHeader
        title="Audit Logs"
        subtitle="Every privileged action is recorded with the actor, role, target and IP address."
      />

      <div
        className="card"
        style={{
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ flex: '1 1 220px' }}>
          <label className="form-label" htmlFor="audit-action">
            Filter by action
          </label>
          <input
            id="audit-action"
            className="form-control"
            placeholder="e.g. auth.login, admin.created"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>

        <div style={{ flex: '1 1 220px' }}>
          <label className="form-label" htmlFor="audit-actor">
            Filter by actor email
          </label>
          <div style={{ position: 'relative' }}>
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
              id="audit-actor"
              className="form-control"
              style={{ paddingLeft: 38 }}
              placeholder="admin@velora.com"
              value={actorEmail}
              onChange={(e) => setActorEmail(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setAction('');
            setActorEmail('');
          }}
        >
          Clear
        </button>
      </div>

      {loading ? <LoadingState label="Loading audit trail..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        logs.length === 0 ? (
          <EmptyState message="No audit entries match these filters." icon={ScrollText} />
        ) : (
          <>
            <div className="table-responsive">
              <table className="table" data-testid="audit-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                    <th>Details</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>

                      <td>
                        <span className={`badge ${actionTone(log.action)}`}>
                          {log.action}
                        </span>
                      </td>

                      <td>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                          {log.actor_email || 'system'}
                        </div>
                        {log.actor_role ? (
                          <span
                            className={`badge ${
                              log.actor_role === 'super_admin'
                                ? 'badge-danger'
                                : 'badge-primary'
                            }`}
                            style={{ marginTop: 4 }}
                          >
                            {roleLabel(log.actor_role)}
                          </span>
                        ) : null}
                      </td>

                      <td style={{ fontSize: 13 }}>
                        {log.entity_type ? (
                          <>
                            {log.entity_type}
                            {log.entity_id ? (
                              <span style={{ color: 'var(--text-muted)' }}>
                                {' '}
                                #{log.entity_id}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td
                        style={{
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: 'var(--text-muted)',
                          maxWidth: 260,
                          wordBreak: 'break-all',
                        }}
                      >
                        {renderDetails(log.details)}
                      </td>

                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {log.ip_address || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="pagination-wrap">
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Page {pagination?.page} of {totalPages} ·{' '}
                  {pagination?.total} entries
                </span>

                <div className="pagination-pages">
                  <button
                    type="button"
                    className="page-btn"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <button
                    type="button"
                    className={`page-btn ${page === 1 ? 'active' : ''}`}
                    onClick={() => setPage(1)}
                  >
                    1
                  </button>

                  <button
                    type="button"
                    className={`page-btn ${page === totalPages ? 'active' : ''}`}
                    onClick={() => setPage(totalPages)}
                  >
                    {totalPages}
                  </button>

                  <button
                    type="button"
                    className="page-btn"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
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

export const AuditLogsPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <AuditLogs />
    </PortalLayout>
  </SuperAdminRoute>
);

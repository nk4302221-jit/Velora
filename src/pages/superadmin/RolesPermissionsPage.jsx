import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Check, X } from 'lucide-react';

import api from '../../api/client';
import { SuperAdminRoute } from '../../components/SuperAdminRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  LoadingState,
  ErrorState,
} from '../../components/PortalPrimitives';
import { SUPER_ADMIN_NAV } from '../../config/portalNav';
import { roleLabel, ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CUSTOMER } from '../../utils/roles';

const ROLE_ORDER = [ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_CUSTOMER];

const ROLE_DESCRIPTIONS = {
  [ROLE_SUPER_ADMIN]:
    'Platform owner. Full control including staff accounts, roles, website settings, payment credentials and the audit trail.',
  [ROLE_ADMIN]:
    'Store operator. Manages the catalogue, inventory, orders, customers, promotions and reviews. Cannot touch staff accounts or platform settings.',
  [ROLE_CUSTOMER]:
    'Shopper. Can only see and act on their own orders, returns, payments and reviews. No administrative access whatsoever.',
};

const RolesPermissions = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/super-admin/roles');

      if (res.data?.success) {
        setData(res.data.data);
      } else {
        setError(res.data?.message || 'Could not load the permission matrix.');
      }
    } catch (err) {
      setError(
        err.response?.data?.message || 'Could not load the permission matrix.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const matrix = data?.matrix || {};
  const labels = data?.permissionLabels || {};
  const counts = data?.accountCounts || {};

  // Union of every permission across roles, in a stable order.
  const allPermissions = Array.from(
    new Set(ROLE_ORDER.flatMap((role) => matrix[role] || []))
  );

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="The permission matrix is defined on the server and enforced on every API call. This page is a read-only view of it."
      />

      {loading ? <LoadingState label="Loading permission matrix..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20,
              marginBottom: 28,
            }}
          >
            {ROLE_ORDER.map((role) => (
              <div key={role} className="card" style={{ padding: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  <span
                    className={`badge ${
                      role === ROLE_SUPER_ADMIN
                        ? 'badge-danger'
                        : role === ROLE_ADMIN
                          ? 'badge-primary'
                          : 'badge-neutral'
                    }`}
                  >
                    {roleLabel(role)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {(matrix[role] || []).length} permissions
                    {counts?.[role] !== undefined
                      ? ` · ${counts[role]} account${counts[role] === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                  }}
                >
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>
            ))}
          </div>

          <div className="table-responsive">
            <table className="table" data-testid="permission-matrix">
              <thead>
                <tr>
                  <th>Permission</th>
                  {ROLE_ORDER.map((role) => (
                    <th key={role} style={{ textAlign: 'center' }}>
                      {roleLabel(role)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allPermissions.map((permission) => (
                  <tr key={permission}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {labels[permission] || permission}
                      </div>
                      <code
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {permission}
                      </code>
                    </td>

                    {ROLE_ORDER.map((role) => {
                      const granted = (matrix[role] || []).includes(permission);

                      return (
                        <td key={role} style={{ textAlign: 'center' }}>
                          {granted ? (
                            <Check
                              size={18}
                              color="#059669"
                              aria-label="granted"
                            />
                          ) : (
                            <X
                              size={18}
                              color="#cbd5e1"
                              aria-label="not granted"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="card"
            style={{
              marginTop: 24,
              padding: 18,
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
            }}
          >
            <ShieldCheck size={20} color="var(--primary)" />
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              This table is informational. Every endpoint independently
              re-checks the caller's live database role and the specific
              capability, so editing a role in the database takes effect
              immediately and cannot be bypassed from the browser.
            </p>
          </div>
        </>
      ) : null}
    </>
  );
};

export const RolesPermissionsPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <RolesPermissions />
    </PortalLayout>
  </SuperAdminRoute>
);

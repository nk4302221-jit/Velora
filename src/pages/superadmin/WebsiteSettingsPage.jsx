import React, { useState, useEffect, useCallback } from 'react';
import { Save, Settings, RotateCcw } from 'lucide-react';

import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SuperAdminRoute } from '../../components/SuperAdminRoute';
import { PortalLayout } from '../../components/PortalLayout';
import {
  PageHeader,
  LoadingState,
  ErrorState,
} from '../../components/PortalPrimitives';
import { SUPER_ADMIN_NAV } from '../../config/portalNav';

// Declared explicitly rather than derived from the loaded object so the form
// always renders the same fields, in the same order, with the right control
// type for each one.
const FIELDS = [
  { key: 'site_name', label: 'Store Name', type: 'text', required: true },
  { key: 'site_tagline', label: 'Tagline', type: 'text' },
  { key: 'support_email', label: 'Support Email', type: 'email' },
  { key: 'support_phone', label: 'Support Phone', type: 'text' },
  { key: 'store_currency', label: 'Currency Code', type: 'text', hint: 'e.g. INR' },
  { key: 'store_enabled', label: 'Store Enabled', type: 'boolean' },
  { key: 'allow_registration', label: 'Allow New Registrations', type: 'boolean' },
  { key: 'maintenance_mode', label: 'Maintenance Mode', type: 'boolean', danger: true },
  { key: 'announcement_banner', label: 'Announcement Banner', type: 'textarea' },
];

const WebsiteSettings = () => {
  const { showToast } = useToast();

  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.get('/super-admin/settings');

      if (res.data?.success) {
        setSettings(res.data.data?.settings || {});
        setDirty(false);
      } else {
        setError(res.data?.message || 'Could not load website settings.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load website settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setValue = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Values arrive as strings, so booleans need an explicit interpretation.
  const asBool = (value) => value === true || value === 'true' || value === '1';

  const handleSave = async (e) => {
    e.preventDefault();

    setSaving(true);

    try {
      // The API stores everything as text, so booleans are sent as 'true'/'false'.
      const payload = Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [
          key,
          typeof value === 'boolean' ? String(value) : value,
        ])
      );

      const res = await api.put('/super-admin/settings', payload);

      showToast(res.data?.message || 'Settings saved', 'success');
      setDirty(false);
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Could not save the settings',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Website Settings"
        subtitle="Store identity, support contacts and platform switches. Every change is written to the audit trail."
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={load}
            disabled={loading}
          >
            <RotateCcw size={16} /> Reload
          </button>
        }
      />

      {loading ? <LoadingState label="Loading settings..." /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error ? (
        <form onSubmit={handleSave} className="card" style={{ padding: 24 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {FIELDS.map((field) => {
              const value = settings[field.key];

              if (field.type === 'boolean') {
                return (
                  <div
                    key={field.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: 14,
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      background: field.danger ? '#fff7ed' : 'var(--bg-surface)',
                    }}
                  >
                    <input
                      id={`setting-${field.key}`}
                      type="checkbox"
                      checked={asBool(value)}
                      onChange={(e) => setValue(field.key, e.target.checked)}
                      style={{ marginTop: 3, width: 16, height: 16 }}
                    />
                    <label
                      htmlFor={`setting-${field.key}`}
                      style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {field.label}
                      {field.danger ? (
                        <span
                          className="badge badge-warning"
                          style={{ marginLeft: 8 }}
                        >
                          Use carefully
                        </span>
                      ) : null}
                    </label>
                  </div>
                );
              }

              return (
                <div key={field.key} className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor={`setting-${field.key}`}>
                    {field.label}
                    {field.required ? (
                      <span style={{ color: 'var(--danger)' }}> *</span>
                    ) : null}
                  </label>

                  {field.type === 'textarea' ? (
                    <textarea
                      id={`setting-${field.key}`}
                      className="form-control"
                      rows={3}
                      value={value ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                    />
                  ) : (
                    <input
                      id={`setting-${field.key}`}
                      type={field.type}
                      className="form-control"
                      value={value ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      required={field.required}
                    />
                  )}

                  {field.hint ? (
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 4,
                      }}
                    >
                      {field.hint}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 24,
              paddingTop: 20,
              borderTop: '1px solid var(--border-color)',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !dirty}
              data-testid="save-settings"
            >
              <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
            </button>

            {dirty ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                You have unsaved changes.
              </span>
            ) : (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                All changes saved.
              </span>
            )}
          </div>
        </form>
      ) : null}
    </>
  );
};

export const WebsiteSettingsPage = () => (
  <SuperAdminRoute>
    <PortalLayout
      portalTitle="Super Admin"
      portalSubtitle="Platform owner console"
      accentColor="#7c2d12"
      homePath="/super-admin/dashboard"
      navItems={SUPER_ADMIN_NAV}
    >
      <WebsiteSettings />
    </PortalLayout>
  </SuperAdminRoute>
);

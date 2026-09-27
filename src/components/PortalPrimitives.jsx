import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';

/** Loading / error / empty states so every page handles them identically. */
export const LoadingState = ({ label = 'Loading...' }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: '48px 16px',
      color: 'var(--text-muted)',
    }}
    data-testid="loading-state"
  >
    <Loader2 size={20} className="spin" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div
    role="alert"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      padding: '40px 16px',
      textAlign: 'center',
    }}
    data-testid="error-state"
  >
    <AlertCircle size={30} color="#dc2626" />
    <p style={{ color: 'var(--text-muted)', maxWidth: 520 }}>{message}</p>
    {onRetry ? (
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        Try again
      </button>
    ) : null}
  </div>
);

export const EmptyState = ({ message, icon: Icon = Inbox }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
      padding: '40px 16px',
      textAlign: 'center',
      color: 'var(--text-muted)',
    }}
    data-testid="empty-state"
  >
    <Icon size={28} />
    <p>{message}</p>
  </div>
);

/** Page header used at the top of each portal section. */
export const PageHeader = ({ title, subtitle, actions }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      marginBottom: 24,
    }}
  >
    <div>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>{title}</h1>
      {subtitle ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{subtitle}</p>
      ) : null}
    </div>
    {actions ? <div style={{ display: 'flex', gap: 8 }}>{actions}</div> : null}
  </div>
);

/** One metric tile in a .stat-cards-grid. */
export const StatCard = ({ label, value, hint, icon: Icon }) => (
  <div className="stat-card">
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <div className="stat-card-label" style={{ marginBottom: 0 }}>
        {label}
      </div>
      {Icon ? <Icon size={18} color="var(--text-muted)" /> : null}
    </div>

    <div className="stat-card-value" style={{ marginTop: 8 }}>
      {value}
    </div>

    {hint ? (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {hint}
      </div>
    ) : null}
  </div>
);

/** Colour-coded badge for the statuses used across orders/returns/reviews. */
export const statusBadge = (status) => {
  const map = {
    active: 'badge-success',
    delivered: 'badge-success',
    approved: 'badge-success',
    completed: 'badge-success',
    paid: 'badge-success',
    refunded: 'badge-neutral',
    shipped: 'badge-primary',
    processing: 'badge-primary',
    confirmed: 'badge-primary',
    pending: 'badge-warning',
    inactive: 'badge-danger',
    suspended: 'badge-danger',
    blocked: 'badge-danger',
    rejected: 'badge-danger',
    failed: 'badge-danger',
    cancelled: 'badge-neutral',
    returned: 'badge-neutral',
  };

  return map[String(status || '').toLowerCase()] || 'badge-neutral';
};

export const StatusBadge = ({ status }) => (
  <span className={`badge ${statusBadge(status)}`}>
    {String(status || 'unknown').replace(/_/g, ' ')}
  </span>
);

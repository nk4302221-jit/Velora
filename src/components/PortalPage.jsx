import React from 'react';

import { AdminRoute } from './AdminRoute';
import { SuperAdminRoute } from './SuperAdminRoute';
import { CustomerRoute } from './CustomerRoute';
import { PortalLayout } from './PortalLayout';
import { SUPER_ADMIN_NAV, ADMIN_NAV, CUSTOMER_NAV } from '../config/portalNav';

/**
 * Single place that binds a page to its role guard + portal chrome.
 *
 * Pages import this instead of repeating <RoleRoute><PortalLayout ...> twelve
 * times, which also guarantees every portal page is wrapped in a guard - you
 * cannot forget the wrapper because the page does not choose it.
 *
 * The guard is still only the first layer: PortalLayout hides nav items the
 * role lacks, and the API re-checks every capability independently.
 */
const PORTALS = {
  super_admin: {
    Guard: SuperAdminRoute,
    navItems: SUPER_ADMIN_NAV,
    portalTitle: 'Super Admin',
    portalSubtitle: 'Full platform control',
    accentColor: '#7c3aed',
    homePath: '/super-admin/dashboard',
  },
  admin: {
    Guard: AdminRoute,
    navItems: ADMIN_NAV,
    portalTitle: 'Admin Portal',
    portalSubtitle: 'Store operations',
    accentColor: '#1e3a8a',
    homePath: '/admin/dashboard',
  },
  customer: {
    Guard: CustomerRoute,
    navItems: CUSTOMER_NAV,
    portalTitle: 'My Account',
    portalSubtitle: 'Orders, returns and reviews',
    accentColor: '#047857',
    homePath: '/customer/dashboard',
  },
};

export const PortalPage = ({ portal, children }) => {
  const config = PORTALS[portal];

  if (!config) {
    throw new Error(`Unknown portal "${portal}"`);
  }

  const { Guard } = config;

  return (
    <Guard>
      <PortalLayout
        portalTitle={config.portalTitle}
        portalSubtitle={config.portalSubtitle}
        accentColor={config.accentColor}
        homePath={config.homePath}
        navItems={config.navItems}
      >
        {children}
      </PortalLayout>
    </Guard>
  );
};

export default PortalPage;

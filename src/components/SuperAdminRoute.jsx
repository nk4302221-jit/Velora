import React from 'react';
import { RoleRoute } from './RoleRoute';
import { ROLE_SUPER_ADMIN } from '../utils/roles';

/**
 * Gate for the /super-admin console.
 *
 * Strictly `super_admin`. A plain `admin` is rejected here AND by
 * authorizeSuperAdmin on every /api/super-admin/* endpoint, so the URL is not
 * the only thing standing between an admin and super-admin capabilities.
 */
export const SuperAdminRoute = ({ children }) => (
  <RoleRoute
    allowedRoles={[ROLE_SUPER_ADMIN]}
    portalName="The Velora Super Admin Console"
  >
    {children}
  </RoleRoute>
);

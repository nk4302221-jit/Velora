import React from 'react';
import { RoleRoute } from './RoleRoute';
import { ROLE_ADMIN, ROLE_SUPER_ADMIN } from '../utils/roles';

/**
 * Gate for the /admin portal.
 *
 * `admin` and `super_admin` both reach it: a Super Admin can use every Admin
 * feature, and nothing here downgrades the role. Super Admin-only screens are
 * guarded separately by SuperAdminRoute.
 *
 * Backend equivalent: authenticate -> authorizeAdmin on /api/admin/*.
 */
export const AdminRoute = ({ children }) => (
  <RoleRoute
    allowedRoles={[ROLE_ADMIN, ROLE_SUPER_ADMIN]}
    portalName="The Velora Admin Portal"
  >
    {children}
  </RoleRoute>
);

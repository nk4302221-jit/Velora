import React from 'react';
import { RoleRoute } from './RoleRoute';
import { ROLE_CUSTOMER } from '../utils/roles';

/**
 * Gate for customer self-service screens.
 *
 * `customer` only. Staff accounts are bounced so an admin cannot act as a
 * shopper; the backend enforces the same rule with authorizeCustomer on
 * /api/customer/*.
 */
export const CustomerRoute = ({ children }) => (
  <RoleRoute
    allowedRoles={[ROLE_CUSTOMER]}
    portalName="Your customer account"
  >
    {children}
  </RoleRoute>
);

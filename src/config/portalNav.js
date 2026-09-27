import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Settings,
  ScrollText,
  BarChart3,
  CreditCard,
  Boxes,
  Ticket,
  Megaphone,
  Star,
  RotateCcw,
  ShoppingBag,
  UserCircle,
  Package,
  Heart,
  MapPin,
  Wallet,
  MessageSquare,
  KeyRound,
} from 'lucide-react';

import { PERMISSIONS } from '../utils/roles';

/**
 * Sidebar definitions for the three portals.
 *
 * Each entry may carry a `permission`; PortalLayout hides anything the signed-in
 * role does not hold. This keeps the UI honest without ever being the security
 * boundary - the API re-checks every capability and the route is wrapped in the
 * matching RoleRoute guard.
 */

export const SUPER_ADMIN_NAV = [
  { to: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/super-admin/admins', label: 'Manage Admins', icon: Users, permission: PERMISSIONS.MANAGE_ADMINS },
  { to: '/super-admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: PERMISSIONS.MANAGE_ROLES },
  { to: '/super-admin/settings', label: 'Website Settings', icon: Settings, permission: PERMISSIONS.MANAGE_WEBSITE_SETTINGS },
  { to: '/super-admin/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: PERMISSIONS.VIEW_AUDIT_LOGS },
  { to: '/super-admin/reports', label: 'Reports', icon: BarChart3, permission: PERMISSIONS.VIEW_REPORTS },
  { to: '/super-admin/payments', label: 'Payments', icon: CreditCard, permission: PERMISSIONS.MANAGE_PAYMENT_CREDENTIALS },

  // Store operations.
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, permission: PERMISSIONS.MANAGE_ORDERS },
  { to: '/admin/products', label: 'Products', icon: Boxes, permission: PERMISSIONS.MANAGE_PRODUCTS },
  { to: '/admin/categories', label: 'Categories', icon: Boxes, permission: PERMISSIONS.MANAGE_CATEGORIES },
  { to: '/admin/inventory', label: 'Inventory', icon: Package, permission: PERMISSIONS.MANAGE_INVENTORY },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket, permission: PERMISSIONS.MANAGE_COUPONS },
  { to: '/admin/offers', label: 'Offers', icon: Megaphone, permission: PERMISSIONS.MANAGE_OFFERS },
  { to: '/admin/reviews', label: 'Reviews', icon: Star, permission: PERMISSIONS.MANAGE_REVIEWS },
  { to: '/admin/returns', label: 'Returns & Refunds', icon: RotateCcw, permission: PERMISSIONS.MANAGE_ORDERS },
  { to: '/admin/customers', label: 'Customers', icon: Users, permission: PERMISSIONS.MANAGE_CUSTOMERS },
  { to: '/admin/dashboard', label: 'Admin Portal', icon: LayoutDashboard },
];

export const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, permission: PERMISSIONS.MANAGE_ORDERS },
  { to: '/admin/products', label: 'Products', icon: Boxes, permission: PERMISSIONS.MANAGE_PRODUCTS },
  { to: '/admin/categories', label: 'Categories', icon: Boxes, permission: PERMISSIONS.MANAGE_CATEGORIES },
  { to: '/admin/inventory', label: 'Inventory', icon: Package, permission: PERMISSIONS.MANAGE_INVENTORY },
  { to: '/admin/returns', label: 'Returns & Refunds', icon: RotateCcw, permission: PERMISSIONS.MANAGE_ORDERS },
  { to: '/admin/customers', label: 'Customers', icon: Users, permission: PERMISSIONS.MANAGE_CUSTOMERS },
  { to: '/admin/coupons', label: 'Coupons', icon: Ticket, permission: PERMISSIONS.MANAGE_COUPONS },
  { to: '/admin/offers', label: 'Offers', icon: Megaphone, permission: PERMISSIONS.MANAGE_OFFERS },
  { to: '/admin/reviews', label: 'Reviews', icon: Star, permission: PERMISSIONS.MANAGE_REVIEWS },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3, permission: PERMISSIONS.VIEW_REPORTS },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard, permission: PERMISSIONS.VIEW_PAYMENTS },
  // Super-Admin-only screens stay hidden unless the role holds the capability.
  { to: '/super-admin/admins', label: 'Manage Admins', icon: KeyRound, permission: PERMISSIONS.MANAGE_ADMINS },
  { to: '/super-admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: PERMISSIONS.MANAGE_ROLES },
  { to: '/super-admin/settings', label: 'Website Settings', icon: Settings, permission: PERMISSIONS.MANAGE_WEBSITE_SETTINGS },
  { to: '/super-admin/audit-logs', label: 'Audit Logs', icon: ScrollText, permission: PERMISSIONS.VIEW_AUDIT_LOGS },
];

export const CUSTOMER_NAV = [
  { to: '/customer/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customer/orders', label: 'My Orders', icon: ShoppingBag },
  { to: '/customer/returns', label: 'Returns & Refunds', icon: RotateCcw },
  { to: '/customer/payments', label: 'Payment History', icon: Wallet },
  { to: '/customer/reviews', label: 'My Reviews', icon: MessageSquare },
  { to: '/orders', label: 'Order History', icon: Package },
  { to: '/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/profile', label: 'My Account', icon: UserCircle },
  { to: '/profile/addresses', label: 'Addresses', icon: MapPin },
];

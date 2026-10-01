import React, { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  Navigate,
} from 'react-router-dom';

import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';

import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';

// EAGER: the storefront homepage is the first paint, so it stays in the
// initial bundle. Everything else below is deferred.
import { HomePage } from './pages/HomePage';

// =====================================================
// CODE SPLITTING
//
// Every page below the storefront homepage is loaded on demand
// with React.lazy, so a visitor landing on "/" downloads only the
// chrome + homepage instead of the entire customer, admin and
// super-admin application.
//
// Notes on correctness:
//  * `lazyNamed` adapts the NAMED exports used across this codebase
//    (`export const HomePage = ...`) into the `{ default }` shape
//    React.lazy requires. Nothing is renamed or removed.
//  * `HomePage` (plus Navbar / Footer / ProductCard and the auth,
//    cart and wishlist contexts) stays EAGER on purpose - it is the
//    above-the-fold render, so deferring it would only add a round
//    trip to the most important paint.
//  * Route paths, guards and components are byte-for-byte unchanged.
// =====================================================
const lazyNamed = (loader, exportName) =>
  lazy(() => loader().then((mod) => ({ default: mod[exportName] })));

// --- Storefront ---
const ProductsPage = lazyNamed(() => import('./pages/ProductsPage'), 'ProductsPage');
const ProductDetailsPage = lazyNamed(() => import('./pages/ProductDetailsPage'), 'ProductDetailsPage');
const CartPage = lazyNamed(() => import('./pages/CartPage'), 'CartPage');
const WishlistPage = lazyNamed(() => import('./pages/WishlistPage'), 'WishlistPage');
const MembershipPlansPage = lazyNamed(() => import('./pages/MembershipPlansPage'), 'MembershipPlansPage');
const CheckoutPage = lazyNamed(() => import('./pages/CheckoutPage'), 'CheckoutPage');
const OrderConfirmationPage = lazyNamed(() => import('./pages/OrderConfirmationPage'), 'OrderConfirmationPage');
const OrdersPage = lazyNamed(() => import('./pages/OrdersPage'), 'OrdersPage');
const OrderDetailsPage = lazyNamed(() => import('./pages/OrderDetailsPage'), 'OrderDetailsPage');
const ProfilePage = lazyNamed(() => import('./pages/ProfilePage'), 'ProfilePage');

// --- Auth ---
const LoginPage = lazyNamed(() => import('./pages/LoginPage'), 'LoginPage');
const OtpPinLoginPage = lazyNamed(() => import('./pages/OtpPinLoginPage'), 'OtpPinLoginPage');
const RegisterPage = lazyNamed(() => import('./pages/RegisterPage'), 'RegisterPage');
const VerifyEmailPage = lazyNamed(() => import('./pages/VerifyEmailPage'), 'VerifyEmailPage');
const ForgotPasswordPage = lazyNamed(() => import('./pages/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(() => import('./pages/ResetPasswordPage'), 'ResetPasswordPage');

// --- Super Admin portal ---
const SuperAdminDashboardPage = lazyNamed(() => import('./pages/SuperAdminDashboardPage'), 'SuperAdminDashboardPage');
const ManageAdminsPage = lazyNamed(() => import('./pages/superadmin/ManageAdminsPage'), 'ManageAdminsPage');
const RolesPermissionsPage = lazyNamed(() => import('./pages/superadmin/RolesPermissionsPage'), 'RolesPermissionsPage');
const AuditLogsPage = lazyNamed(() => import('./pages/superadmin/AuditLogsPage'), 'AuditLogsPage');
const WebsiteSettingsPage = lazyNamed(() => import('./pages/superadmin/WebsiteSettingsPage'), 'WebsiteSettingsPage');
const SuperAdminReportsPage = lazyNamed(() => import('./pages/admin/ReportsPage'), 'SuperAdminReportsPage');
const SuperAdminPaymentsPage = lazyNamed(() => import('./pages/admin/PaymentsPage'), 'SuperAdminPaymentsPage');

// --- Admin portal ---
// Aliased: the storefront already exports OrdersPage/ProductsPage/ReviewsPage
// with the same names, and both sets are mounted in this file.
const AdminPortalDashboardPage = lazyNamed(() => import('./pages/admin/AdminPortalDashboardPage'), 'AdminPortalDashboardPage');
const AdminDashboardPage = lazyNamed(() => import('./pages/AdminDashboardPage'), 'AdminDashboardPage');
const AdminOrdersPage = lazyNamed(() => import('./pages/admin/OrdersPage'), 'OrdersPage');
const AdminProductsPage = lazyNamed(() => import('./pages/admin/ProductsPage'), 'ProductsPage');
const CategoriesPage = lazyNamed(() => import('./pages/admin/CategoriesPage'), 'CategoriesPage');
const InventoryPage = lazyNamed(() => import('./pages/admin/InventoryPage'), 'InventoryPage');
const CouponsPage = lazyNamed(() => import('./pages/admin/CouponsPage'), 'CouponsPage');
const OffersPage = lazyNamed(() => import('./pages/admin/OffersPage'), 'OffersPage');
const AdminReviewsPage = lazyNamed(() => import('./pages/admin/ReviewsPage'), 'ReviewsPage');
const AdminReturnsPage = lazyNamed(() => import('./pages/admin/ReturnsPage'), 'ReturnsPage');
const CustomersPage = lazyNamed(() => import('./pages/admin/CustomersPage'), 'CustomersPage');
const ReportsPage = lazyNamed(() => import('./pages/admin/ReportsPage'), 'ReportsPage');
const PaymentsPage = lazyNamed(() => import('./pages/admin/PaymentsPage'), 'PaymentsPage');

// --- Customer portal ---
const CustomerDashboardPage = lazyNamed(() => import('./pages/customer/CustomerDashboardPage'), 'CustomerDashboardPage');
const MyOrdersPage = lazyNamed(() => import('./pages/customer/MyOrdersPage'), 'MyOrdersPage');
const MyReturnsPage = lazyNamed(() => import('./pages/customer/MyReturnsPage'), 'MyReturnsPage');
const PaymentHistoryPage = lazyNamed(() => import('./pages/customer/PaymentHistoryPage'), 'PaymentHistoryPage');
const MyReviewsPage = lazyNamed(() => import('./pages/customer/MyReviewsPage'), 'MyReviewsPage');

/**
 * Lightweight Suspense fallback.
 *
 * Deliberately reuses the existing `--text-muted` / `site-wrapper` styling so a
 * deferred chunk looks like the app's own "Verifying credentials..." wait state
 * instead of introducing a new spinner, a new colour or a new animation.
 */
const RouteFallback = () => (
  <div
    className="site-wrapper"
    role="status"
    aria-live="polite"
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '240px',
      fontSize: '14px',
      color: 'var(--text-muted)',
    }}
  >
    Loading...
  </div>
);

const NotFoundPage = () => (
  <div
    className="site-wrapper"
    style={{ margin: '80px auto', textAlign: 'center', maxWidth: '480px' }}
  >
    <div className="card" style={{ padding: '48px 32px' }}>
      <h1
        style={{ fontSize: '48px', color: 'var(--primary)', marginBottom: '12px' }}
      >
        404
      </h1>
      <h2 style={{ fontSize: '20px', marginBottom: '12px' }}>Page Not Found</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
        The link you followed may be broken or the page may have been removed.
      </p>
      <Link to="/" className="btn btn-primary">
        Return to Home
      </Link>
    </div>
  </div>
);

/**
 * Storefront chrome (navbar + footer).
 *
 * Portal routes deliberately render WITHOUT this - each portal page supplies
 * its own PortalLayout sidebar, so a signed-in admin does not also see the
 * customer storefront navigation.
 *
 * The Suspense boundary lives INSIDE the chrome on purpose: when a route's
 * chunk is still downloading, only the page area shows the fallback and the
 * navbar/footer stay on screen, so a client-side navigation never flashes an
 * empty page.
 */
const SiteLayout = ({ children }) => (
  <div
    style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
  >
    <Navbar />

    <main style={{ flex: 1 }}>
      <Suspense fallback={<RouteFallback />}>{children}</Suspense>
    </main>

    <Footer />
  </div>
);

/**
 * The storefront homepage stays reachable for everyone, including signed-in
 * staff and customers - role-based landing happens after login/registration,
 * not on "/". PortalLayout exposes an explicit "Back to storefront" link, and
 * Navbar keeps the shop link, so nobody is trapped in their portal.
 */
const AppRoutes = () => (
  <Routes>
    {/* ============ Public storefront ============ */}
    <Route
      path="/"
      element={
        <SiteLayout>
          <HomePage />
        </SiteLayout>
      }
    />
    <Route
      path="/products"
      element={
        <SiteLayout>
          <ProductsPage />
        </SiteLayout>
      }
    />
    <Route
      path="/products/:id"
      element={
        <SiteLayout>
          <ProductDetailsPage />
        </SiteLayout>
      }
    />
    <Route
      path="/cart"
      element={
        <SiteLayout>
          <CartPage />
        </SiteLayout>
      }
    />
    <Route
      path="/wishlist"
      element={
        <SiteLayout>
          <WishlistPage />
        </SiteLayout>
      }
    />
    <Route
      path="/plans"
      element={
        <SiteLayout>
          <MembershipPlansPage />
        </SiteLayout>
      }
    />

    {/* ============ Auth ============ */}
    <Route
      path="/login"
      element={
        <SiteLayout>
          <LoginPage />
        </SiteLayout>
      }
    />
    <Route
      path="/register"
      element={
        <SiteLayout>
          <RegisterPage />
        </SiteLayout>
      }
    />
    <Route
      path="/verify-email"
      element={
        <SiteLayout>
          <VerifyEmailPage />
        </SiteLayout>
      }
    />
    <Route
      path="/forgot-password"
      element={
        <SiteLayout>
          <ForgotPasswordPage />
        </SiteLayout>
      }
    />
    <Route
      path="/reset-password"
      element={
        <SiteLayout>
          <ResetPasswordPage />
        </SiteLayout>
      }
    />
    {/* Optional OTP / PIN sign-in. A separate page, so LoginPage and its
        password form are completely untouched. */}
    <Route
      path="/login-otp"
      element={
        <SiteLayout>
          <OtpPinLoginPage />
        </SiteLayout>
      }
    />

    {/* ============ Customer storefront (shopper, not portal) ============ */}
    <Route
      path="/checkout"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <CheckoutPage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />
    <Route
      path="/orders/confirmed/:id"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <OrderConfirmationPage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />
    <Route
      path="/orders"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <OrdersPage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />
    <Route
      path="/orders/:id"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <OrderDetailsPage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />
    <Route
      path="/profile"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />
    <Route
      path="/profile/addresses"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />
    <Route
      path="/profile/security"
      element={
        <SiteLayout>
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        </SiteLayout>
      }
    />

    {/* ============ Super Admin portal (no storefront chrome) ============ */}
    <Route path="/super-admin/dashboard" element={<SuperAdminDashboardPage />} />
    <Route path="/super-admin/admins" element={<ManageAdminsPage />} />
    <Route path="/super-admin/roles" element={<RolesPermissionsPage />} />
    <Route path="/super-admin/settings" element={<WebsiteSettingsPage />} />
    <Route path="/super-admin/audit-logs" element={<AuditLogsPage />} />
    <Route path="/super-admin/reports" element={<SuperAdminReportsPage />} />
    <Route path="/super-admin/payments" element={<SuperAdminPaymentsPage />} />

    {/* ============ Admin portal ============ */}
    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
    <Route path="/admin/dashboard" element={<AdminPortalDashboardPage />} />
    <Route path="/admin/orders" element={<AdminOrdersPage />} />
    <Route path="/admin/products" element={<AdminProductsPage />} />
    <Route path="/admin/categories" element={<CategoriesPage />} />
    <Route path="/admin/inventory" element={<InventoryPage />} />
    <Route path="/admin/coupons" element={<CouponsPage />} />
    <Route path="/admin/offers" element={<OffersPage />} />
    <Route path="/admin/reviews" element={<AdminReviewsPage />} />
    <Route path="/admin/returns" element={<AdminReturnsPage />} />
    <Route path="/admin/customers" element={<CustomersPage />} />
    <Route path="/admin/reports" element={<ReportsPage />} />
    <Route path="/admin/payments" element={<PaymentsPage />} />
    {/* Full legacy tabbed console, kept intact for existing users. */}
    <Route
      path="/admin/console"
      element={
        <AdminRoute>
          <AdminDashboardPage />
        </AdminRoute>
      }
    />

    {/* ============ Customer portal ============ */}
    <Route path="/customer/dashboard" element={<CustomerDashboardPage />} />
    <Route path="/customer/orders" element={<MyOrdersPage />} />
    <Route path="/customer/returns" element={<MyReturnsPage />} />
    <Route path="/customer/payments" element={<PaymentHistoryPage />} />
    <Route path="/customer/reviews" element={<MyReviewsPage />} />

    {/* ============ 404 ============ */}
    <Route
      path="*"
      element={
        <SiteLayout>
          <NotFoundPage />
        </SiteLayout>
      }
    />
  </Routes>
);

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <WishlistProvider>
              {/* Portal (admin / super-admin / customer) routes have no
                  storefront chrome of their own, so their fallback is handled
                  here. Storefront routes are already covered by the Suspense
                  boundary inside SiteLayout, which React reaches first. */}
              <Suspense fallback={<RouteFallback />}>
                <AppRoutes />
              </Suspense>
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

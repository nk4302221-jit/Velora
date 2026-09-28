import React from 'react';
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

import { HomePage } from './pages/HomePage';
import { ProductsPage } from './pages/ProductsPage';
import   ProductDetailsPage  from './pages/ProductDetailsPage';
import { CartPage } from './pages/CartPage';
import { WishlistPage } from './pages/WishlistPage';
import { MembershipPlansPage } from './pages/MembershipPlansPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailsPage } from './pages/OrderDetailsPage';
import { ProfilePage } from './pages/ProfilePage';
import { LoginPage } from './pages/LoginPage';
import { OtpPinLoginPage } from './pages/OtpPinLoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

// --- Super Admin portal ---
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboardPage';
import { ManageAdminsPage } from './pages/superadmin/ManageAdminsPage';
import { RolesPermissionsPage } from './pages/superadmin/RolesPermissionsPage';
import { AuditLogsPage } from './pages/superadmin/AuditLogsPage';
import { WebsiteSettingsPage } from './pages/superadmin/WebsiteSettingsPage';
import { SuperAdminReportsPage } from './pages/admin/ReportsPage';
import { SuperAdminPaymentsPage } from './pages/admin/PaymentsPage';

// --- Admin portal ---
// Aliased: the storefront already exports OrdersPage/ProductsPage/ReviewsPage
// with the same names, and both sets are mounted in this file.
import { AdminPortalDashboardPage } from './pages/admin/AdminPortalDashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { OrdersPage as AdminOrdersPage } from './pages/admin/OrdersPage';
import { ProductsPage as AdminProductsPage } from './pages/admin/ProductsPage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { InventoryPage } from './pages/admin/InventoryPage';
import { CouponsPage } from './pages/admin/CouponsPage';
import { OffersPage } from './pages/admin/OffersPage';
import { ReviewsPage as AdminReviewsPage } from './pages/admin/ReviewsPage';
import { ReturnsPage as AdminReturnsPage } from './pages/admin/ReturnsPage';
import { CustomersPage } from './pages/admin/CustomersPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { PaymentsPage } from './pages/admin/PaymentsPage';

// --- Customer portal ---
import { CustomerDashboardPage } from './pages/customer/CustomerDashboardPage';
import { MyOrdersPage } from './pages/customer/MyOrdersPage';
import { MyReturnsPage } from './pages/customer/MyReturnsPage';
import { PaymentHistoryPage } from './pages/customer/PaymentHistoryPage';
import { MyReviewsPage } from './pages/customer/MyReviewsPage';

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
 */
const SiteLayout = ({ children }) => (
  <div
    style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
  >
    <Navbar />

    <main style={{ flex: 1 }}>{children}</main>

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
              <AppRoutes />
            </WishlistProvider>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import passport from 'passport';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import cartRoutes from './routes/cartRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import addressRoutes from './routes/addressRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import planRoutes from './routes/planRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import managementRoutes from './routes/managementRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import { configureGoogleOAuth } from './config/passport.js';
import { createCheckoutSessionHandler } from './controllers/orderController.js';
import { authenticate } from './middleware/authMiddleware.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport (Google OAuth2) initialization — mounted exactly once.
app.use(passport.initialize());
configureGoogleOAuth();

// Serve uploaded files statically
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Velora E-Commerce API is running healthy', timestamp: new Date().toISOString() });
});

// Mount REST API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/payment', paymentRoutes);

// Stripe checkout convenience endpoint
app.post('/api/payment/create-checkout-session', authenticate, createCheckoutSessionHandler);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global API Error]:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

export default app;

import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ShieldCheck, Truck, RotateCcw, CreditCard } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export const Footer = () => {
  return (
    <footer className="footer" id="site-footer">
      <div className="site-wrapper">
        {/* Service Highlights */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '24px',
            paddingBottom: '40px',
            borderBottom: '1px solid #1e293b',
            marginBottom: '40px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '12px', background: '#1e293b', borderRadius: '10px', color: '#60a5fa' }}>
              <Truck size={24} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>Free Express Shipping</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>On orders over $100 & VIP members</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '12px', background: '#1e293b', borderRadius: '10px', color: '#34d399' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>Stripe Sandbox Secure</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>End-to-end encrypted checkout</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '12px', background: '#1e293b', borderRadius: '10px', color: '#fbbf24' }}>
              <RotateCcw size={24} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>30-Day Money Back</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Hassle-free return policy</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ padding: '12px', background: '#1e293b', borderRadius: '10px', color: '#c084fc' }}>
              <CreditCard size={24} />
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px' }}>Tiered VIP Savings</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Up to 12% off with VIP Plans</div>
            </div>
          </div>
        </div>

        {/* Footer Links Grid */}
        <div className="footer-grid">
          <div>
            <div style={{ marginBottom: '16px' }}>
              <BrandLogo size={34} textColor="#ffffff" />
            </div>
            <p style={{ fontSize: '14px', lineHeight: 1.6, maxWidth: '320px', color: '#94a3b8' }}>
              Next-generation e-commerce ecosystem powered by secure Stripe payments, decentralized cloud storage, relational SQL architecture, and dynamic member passes.
            </p>
          </div>

          <div>
            <h4 className="footer-col-title">Shop & Browse</h4>
            <ul className="footer-links">
              <li><Link to="/products">All Products</Link></li>
              <li><Link to="/products?category=Electronics">Electronics & Tech</Link></li>
              <li><Link to="/products?category=Audio">High-Fidelity Audio</Link></li>
              <li><Link to="/products?category=Wearables">Smart Wearables</Link></li>
              <li><Link to="/plans">Membership Passes</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="footer-col-title">Account & Orders</h4>
            <ul className="footer-links">
              <li><Link to="/profile">My Profile</Link></li>
              <li><Link to="/orders">Order Tracking</Link></li>
              <li><Link to="/wishlist">Saved Wishlist</Link></li>
              <li><Link to="/cart">Shopping Cart</Link></li>
              <li><Link to="/profile/addresses">Delivery Addresses</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="footer-col-title">Security & Tech</h4>
            <ul className="footer-links">
              <li><span style={{ color: '#cbd5e1' }}>Stripe Test Sandbox Mode</span></li>
              <li><span style={{ color: '#cbd5e1' }}>JWT Auth with Bcrypt Hashing</span></li>
              <li><span style={{ color: '#cbd5e1' }}>Storj Decentralized Cloud Storage</span></li>
              <li><span style={{ color: '#cbd5e1' }}>Node-Cron Auto Expiry Jobs</span></li>
              <li><Link to="/admin" style={{ color: '#60a5fa' }}>Admin Portal Login</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} Velora Inc. All rights reserved.</div>
          <div style={{ display: 'flex', gap: '20px' }}>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
            <span>Security Statement</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  User,
  Mail,
  Phone,
  Camera,
  Lock,
  MapPin,
  Crown,
  Trash2,
  Plus,
  CheckCircle2,
  UploadCloud,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { GoogleMapsPicker } from '../components/GoogleMapsPicker';

export const ProfilePage = () => {
  const { user, membership, updateUser } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(() =>
    location.pathname === '/profile/addresses'
      ? 'addresses'
      : location.pathname === '/profile/security'
        ? 'security'
        : 'details'
  );

  useEffect(() => {
    if (location.pathname === '/profile/addresses') {
      setActiveTab('addresses');
    } else if (location.pathname === '/profile/security') {
      setActiveTab('security');
    } else {
      setActiveTab('details');
    }
  }, [location.pathname]);

  // Profile details state
  const [fullName, setFullName] = useState(user?.name || user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Profile image upload state (Storj Cloud Storage)
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || user?.profile_image || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  // Addresses state
  const [addresses, setAddresses] = useState([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [newAddress, setNewAddress] = useState({
    fullName: user?.name || user?.full_name || '',
    phone: user?.phone || '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    isDefault: false,
    latitude: 28.6139,
    longitude: 77.209,
  });

  useEffect(() => {
    if (user) {
      setFullName(user.name || user.full_name || '');
      setPhone(user.phone || '');
      setAvatarPreview(user.avatar_url || user.profile_image || '');
    }
  }, [user]);

  // Load addresses
  useEffect(() => {
    api.get('/addresses')
      .then((res) => {
        if (res.data.success) {
          setAddresses(res.data.data.addresses);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    try {
      const res = await api.put('/profile', { name: fullName, phone });
      if (res.data.success) {
        updateUser(res.data.data.user);
        showToast('Profile information updated successfully!', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update profile', 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size must be less than 5MB', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);

    setIsUploadingAvatar(true);
    try {
      const res = await api.post('/profile/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.success) {
        setAvatarPreview(res.data.data.avatarUrl);
        updateUser({ ...user, avatar_url: res.data.data.avatarUrl });
        showToast('Profile photo uploaded to Storj Cloud Storage!', 'success');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to upload photo', 'error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const res = await api.put('/profile/password', { currentPassword, newPassword });
      if (res.data.success) {
        showToast('Password changed successfully!', 'success');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to change password', 'error');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleCreateAddress = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/addresses', newAddress);
      if (res.data.success) {
        showToast('Address added successfully!', 'success');
        setAddresses([res.data.data.address, ...addresses]);
        setShowAddressModal(false);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add address', 'error');
    }
  };

  const handleDeleteAddress = async (addressId) => {
    try {
      const res = await api.delete(`/addresses/${addressId}`);
      if (res.data.success) {
        setAddresses(addresses.filter((a) => a.id !== addressId));
        showToast('Address deleted', 'success');
      }
    } catch (err) {
      showToast('Failed to delete address', 'error');
    }
  };

  const handleSetDefaultAddress = async (addressId) => {
    try {
      const res = await api.patch(`/addresses/${addressId}/default`);
      if (res.data.success) {
        setAddresses(
          addresses.map((a) => ({
            ...a,
            is_default: a.id === addressId,
          }))
        );
        showToast('Default delivery address updated', 'success');
      }
    } catch (err) {
      showToast('Failed to set default address', 'error');
    }
  };

  // Address auto-filled from "Use Current Location" / map click. Empty parts are
  // left untouched so a partial geocoding result never wipes typed input.
  const handleAddressDetected = (address) => {
    setNewAddress((prev) => ({
      ...prev,
      addressLine1: address.addressLine1 || prev.addressLine1,
      addressLine2: address.addressLine2 || prev.addressLine2,
      city: address.city || prev.city,
      state: address.state || prev.state,
      postalCode: address.postalCode || prev.postalCode,
      country: address.country || prev.country,
    }));
  };

  return (
    <div className="site-wrapper" style={{ margin: '36px auto 80px' }} id="profile-page-container">
      <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>My Account</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
        Manage your credentials, decentralized  profile avatar, addresses, and VIP membership
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', marginBottom: '32px' }}>
        <button
          onClick={() => setActiveTab('details')}
          style={{
            padding: '12px 20px',
            fontWeight: 700,
            fontSize: '14px',
            borderBottom: activeTab === 'details' ? '2px solid var(--primary)' : 'none',
            color: activeTab === 'details' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          id="tab-profile-details"
        >
          <User size={16} /> Personal Details
        </button>

        <button
          onClick={() => setActiveTab('addresses')}
          style={{
            padding: '12px 20px',
            fontWeight: 700,
            fontSize: '14px',
            borderBottom: activeTab === 'addresses' ? '2px solid var(--primary)' : 'none',
            color: activeTab === 'addresses' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          id="tab-profile-addresses"
        >
          <MapPin size={16} /> Delivery Addresses ({addresses.length})
        </button>

        <button
          onClick={() => setActiveTab('security')}
          style={{
            padding: '12px 20px',
            fontWeight: 700,
            fontSize: '14px',
            borderBottom: activeTab === 'security' ? '2px solid var(--primary)' : 'none',
            color: activeTab === 'security' ? 'var(--primary)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          id="tab-profile-security"
        >
          <Lock size={16} /> Security & Password
        </button>
      </div>

      {/* Tab 1: Personal Details & Storj Avatar */}
      {activeTab === 'details' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '36px', alignItems: 'flex-start' }}>
          {/* Details Form */}
          <div className="card" style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Personal Profile</h2>
            <form onSubmit={handleUpdateProfile}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  id="profile-name-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address (Read-Only)</label>
                <input
                  type="email"
                  className="form-control"
                  disabled
                  value={user?.email || ''}
                  style={{ background: 'var(--bg-surface)' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+91 "
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  id="profile-phone-input"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isUpdatingProfile}
                id="update-profile-btn"
              >
                {isUpdatingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>

          {/* Storj Avatar & Membership Widget */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Storj Avatar Upload Box */}
            <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '16px' }}> Avatar</h3>

              <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto 16px' }}>
                <img
                  src={avatarPreview || ''}
                  alt="Profile"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border-color)' }}
                  id="profile-avatar-img"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    background: 'var(--primary)',
                    color: '#ffffff',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-md)',
                  }}
                  title="Upload profile picture to Storj Cloud"
                  id="upload-avatar-trigger-btn"
                >
                  <Camera size={16} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarFileSelect}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
              </div>

              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {isUploadingAvatar ? 'Uploading to Storj...' : 'Supports JPG, PNG, WebP (Max 5MB)'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <UploadCloud size={14} /> 
              </div>
            </div>

            {/* Membership Status Widget */}
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <Crown size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '16px' }}>Membership Status</h3>
              </div>

              {membership?.active ? (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>
                    {membership.plan_name} (Active)
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Expires at: {membership.expiry_time ? new Date(membership.expiry_time).toLocaleString() : 'Active'}
                  </div>
                  <div className="badge badge-success">Discount Active</div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    You currently have no active VIP membership pass.
                  </p>
                  <a href="/plans" className="btn btn-secondary btn-sm" id="view-plans-profile-btn">
                    View Membership Plans
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Addresses */}
      {activeTab === 'addresses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px' }}>Saved Delivery Locations</h2>
            <button
              onClick={() => setShowAddressModal(!showAddressModal)}
              className="btn btn-primary btn-sm"
              id="add-address-modal-btn"
            >
              <Plus size={16} /> Add New Address
            </button>
          </div>

          {/* New Address Form Modal/Section */}
          {showAddressModal && (
            <div className="card" style={{ padding: '24px', marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>New Address Location</h3>
              <form onSubmit={handleCreateAddress}>
                <GoogleMapsPicker
                  onLocationSelect={(loc) => {
                    setNewAddress((prev) => ({
                      ...prev,
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                    }));
                  }}
                  onAddressDetected={handleAddressDetected}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Full Name</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={newAddress.fullName}
                      onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone Number</label>
                    <input
                      type="tel"
                      className="form-control"
                      required
                      value={newAddress.phone}
                      onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Street Address</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={newAddress.addressLine1}
                    onChange={(e) => setNewAddress({ ...newAddress, addressLine1: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={newAddress.city}
                      onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">State</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={newAddress.state}
                      onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Postal / PIN Code</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={newAddress.postalCode}
                      onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button type="submit" className="btn btn-primary btn-sm">Save Address</button>
                  <button type="button" onClick={() => setShowAddressModal(false)} className="btn btn-secondary btn-sm">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Addresses Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            {addresses.map((addr) => (
              <div key={addr.id} className="card" style={{ padding: '20px' }} id={`profile-addr-${addr.id}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{addr.full_name}</div>
                  {addr.is_default && (
                    <span className="badge badge-primary">Default</span>
                  )}
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                  {addr.address_line1}, {addr.address_line2 ? addr.address_line2 + ', ' : ''}
                  {addr.city}, {addr.state} {addr.postal_code}, {addr.country}
                  {addr.phone && <div style={{ marginTop: '4px' }}>Phone: {addr.phone}</div>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  {!addr.is_default && (
                    <button
                      onClick={() => handleSetDefaultAddress(addr.id)}
                      style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteAddress(addr.id)}
                    style={{ fontSize: '12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Security & Password */}
      {activeTab === 'security' && (
        <div style={{ maxWidth: '520px' }}>
          <div className="card" style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>Change Account Password</h2>
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  id="current-password-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  id="new-password-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  id="confirm-password-input"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isUpdatingPassword}
                id="save-password-btn"
              >
                {isUpdatingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
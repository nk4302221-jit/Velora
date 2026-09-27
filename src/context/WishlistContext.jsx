import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useCart } from './CartContext';
import { useToast } from './ToastContext';

const WishlistContext = createContext(undefined);

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  const { refreshCart } = useCart();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);

  const refreshWishlist = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }

    try {
      const res = await api.get('/wishlist');
      if (res.data.success) {
        setItems(res.data.data.items || []);
      }
    } catch (err) {
      console.error('Failed to load wishlist:', err);
    }
  }, [user]);

  useEffect(() => {
    refreshWishlist();
  }, [refreshWishlist]);

  const isInWishlist = (productId) => {
    return items.some((item) => item.product_id === productId);
  };

  const addToWishlist = async (productId) => {
    if (!user) {
      showToast('Please sign in to save items to your wishlist', 'info');
      return false;
    }

    try {
      const res = await api.post('/wishlist', { productId });
      if (res.data.success) {
        showToast('Saved to your wishlist', 'success');
        await refreshWishlist();
        return true;
      }
      return false;
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save to wishlist', 'error');
      return false;
    }
  };

  const removeFromWishlist = async (productId) => {
    try {
      const res = await api.delete(`/wishlist/${productId}`);
      if (res.data.success) {
        showToast('Removed from wishlist', 'info');
        await refreshWishlist();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const toggleWishlist = async (productId) => {
    if (isInWishlist(productId)) {
      await removeFromWishlist(productId);
    } else {
      await addToWishlist(productId);
    }
  };

  const moveToCart = async (productId) => {
    try {
      const res = await api.post(`/wishlist/${productId}/move-to-cart`);
      if (res.data.success) {
        showToast('Moved item to shopping cart', 'success');
        await refreshWishlist();
        await refreshCart();
        return true;
      }
      showToast(res.data.message || 'Could not move to cart', 'error');
      return false;
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to move to cart', 'error');
      return false;
    }
  };

  return (
    <WishlistContext.Provider
      value={{
        items,
        wishlistCount: items.length,
        isInWishlist,
        toggleWishlist,
        addToWishlist,
        removeFromWishlist,
        moveToCart,
        refreshWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used within a WishlistProvider');
  }
  return context;
}
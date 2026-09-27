import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const CartContext = createContext(undefined);

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({
    subtotal: 0,
    discount: 0,
    membershipDiscount: 0,
    shipping: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    if (!user) {
      setItems([]);
      setTotals({ subtotal: 0, discount: 0, membershipDiscount: 0, shipping: 0, total: 0 });
      return;
    }

    try {
      setLoading(true);
      const res = await api.get('/cart');
      if (res.data.success) {
        setItems(res.data.data.items || []);
        setTotals(res.data.data.totals || {
          subtotal: 0,
          discount: 0,
          membershipDiscount: 0,
          shipping: 0,
          total: 0,
        });
      }
    } catch (err) {
      console.error('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = async (productId, quantity = 1) => {
    if (!user) {
      showToast('Please sign in to add products to your cart', 'info');
      return false;
    }

    try {
      const res = await api.post('/cart', { productId, quantity });
      if (res.data.success) {
        showToast('Item added to cart', 'success');
        await refreshCart();
        return true;
      }
      showToast(res.data.message || 'Could not add to cart', 'error');
      return false;
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add item to cart', 'error');
      return false;
    }
  };

  const updateQuantity = async (itemId, quantity) => {
    try {
      const res = await api.put(`/cart/${itemId}`, { quantity });
      if (res.data.success) {
        await refreshCart();
        return true;
      }
      showToast(res.data.message || 'Could not update quantity', 'error');
      return false;
    } catch (err) {
      showToast(err.response?.data?.message || 'Quantity update failed', 'error');
      return false;
    }
  };

  const removeFromCart = async (itemId) => {
    try {
      const res = await api.delete(`/cart/${itemId}`);
      if (res.data.success) {
        showToast('Item removed from cart', 'info');
        await refreshCart();
        return true;
      }
      return false;
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to remove item', 'error');
      return false;
    }
  };

  const clearCart = async () => {
    try {
      const res = await api.delete('/cart');
      if (res.data.success) {
        setItems([]);
        setTotals({ subtotal: 0, discount: 0, membershipDiscount: 0, shipping: 0, total: 0 });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        totals,
        cartCount,
        loading,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
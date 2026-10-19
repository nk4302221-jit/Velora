import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Shirt,
  Smartphone,
  Laptop,
  Sparkles,
  Plug,
  Baby,
  Utensils,
  Car,
  Dumbbell,
  Sofa,
  BookOpen,
  Bike,
} from 'lucide-react';

const CATEGORIES = [
  { name: 'Fashion', icon: Shirt, color: 'fashion' },
  { name: 'Mobiles', icon: Smartphone, color: 'mobiles' },
  { name: 'Electronics', icon: Laptop, color: 'electronics' },
  { name: 'Beauty', icon: Sparkles, color: 'beauty' },
  { name: 'Appliances', icon: Plug, color: 'appliances' },
  { name: 'Toys & Baby', icon: Baby, color: 'toys' },
  { name: 'Food & Health', icon: Utensils, color: 'food' },
  { name: 'Auto Accessories', icon: Car, color: 'auto' },
  { name: 'Sports & Fitness', icon: Dumbbell, color: 'sports' },
  { name: 'Furniture', icon: Sofa, color: 'furniture' },
  { name: 'Books', icon: BookOpen, color: 'books' },
  { name: 'Two Wheelers', icon: Bike, color: 'two-wheelers' },
];

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const CategoryNav = () => {
  const slotRef = useRef(null);
  const navRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const slot = slotRef.current;
    const nav = navRef.current;
    if (!slot || !nav) return undefined;

    const navbar = document.querySelector('.navbar');
    const hero = document.getElementById('hero-banner');
    let frame = 0;

    const apply = () => {
      frame = 0;
      const navbarBottom = navbar ? navbar.getBoundingClientRect().bottom : 0;
      const top = Math.max(0, Math.round(navbarBottom));
      nav.style.setProperty('--category-nav-top', `${top}px`);

      const navHeight = Math.round(nav.getBoundingClientRect().height);
      slot.style.height = `${navHeight}px`;
      const slotRect = slot.getBoundingClientRect();
      nav.style.setProperty('--category-nav-left', `${slotRect.left}px`);
      nav.style.setProperty('--category-nav-width', `${slotRect.width}px`);

      const stuck = slotRect.top <= top + 0.5;
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 0;
      const past = !hero || heroBottom <= top + 4;
      nav.classList.toggle('is-stuck', stuck);
      nav.classList.toggle('is-compact', past);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer) {
      observer.observe(nav);
      if (navbar) observer.observe(navbar);
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (observer) observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="category-nav-slot" ref={slotRef}>
      <nav className="category-nav" id="home-category-nav" aria-label="Product categories" ref={navRef}>
        <div className="category-nav-track">
          {CATEGORIES.map(({ name, icon: Icon, color }) => {
            return (
              <Link
                key={name}
                to={`/products?category=${encodeURIComponent(name)}`}
                className={`category-nav-item category-nav-item--${color}`}
                id={`category-nav-${slugify(name)}`}
              >
                <span className={`category-nav-icon category-nav-icon--${color}`} aria-hidden="true">
                  <Icon size={22} strokeWidth={2.2} />
                </span>
                <span className="category-nav-label">{name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default CategoryNav;

import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Shirt,
  Smartphone,
  Laptop,
  Sparkles,
  House,
  Plug,
  Baby,
  Utensils,
  Car,
  Dumbbell,
  Sofa,
  BookOpen,
  Bike,
} from 'lucide-react';

// The category strip mirrors the storefront's top departments. Each entry
// routes into the existing catalog listing, so a click reuses the same
// /products?category= filter the rest of the app already understands.
const CATEGORIES = [
  { name: 'Fashion', icon: Shirt },
  { name: 'Mobiles', icon: Smartphone },
  { name: 'Electronics', icon: Laptop },
  { name: 'Beauty', icon: Sparkles },
  { name: 'Home', icon: House },
  { name: 'Appliances', icon: Plug },
  { name: 'Toys & Baby', icon: Baby },
  { name: 'Food & Health', icon: Utensils },
  { name: 'Auto Accessories', icon: Car },
  { name: 'Sports & Fitness', icon: Dumbbell },
  { name: 'Furniture', icon: Sofa },
  { name: 'Books', icon: BookOpen },
  { name: 'Two Wheelers', icon: Bike },
];

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Homepage category navigation.
 *
 * Sits in normal flow directly below the hero. Once the hero has scrolled
 * past, the bar pins just under the navbar and collapses to names only.
 *
 * The app's `#root { overflow-x: hidden }` turns #root into a scroll
 * container, which breaks `position: sticky` for every descendant (the
 * navbar included). To avoid touching that global rule, the bar pins with
 * `position: fixed` instead: a wrapper ("slot") reserves the bar's height
 * in flow so nothing else shifts, and the bar's left/width are copied from
 * the slot so it stays aligned with the hero column.
 */
export const CategoryNav = () => {
  const slotRef = useRef(null);
  const navRef = useRef(null);

  useEffect(() => {
    const slot = slotRef.current;
    const nav = navRef.current;
    if (!slot || !nav) return undefined;

    const navbar = document.querySelector('.navbar');
    const hero = document.getElementById('hero-banner');

    let frame = 0;

    const apply = () => {
      frame = 0;

      // Pin line = just under the navbar's real (responsive) height.
      const navbarBottom = navbar ? navbar.getBoundingClientRect().bottom : 0;
      const top = Math.max(0, Math.round(navbarBottom));
      nav.style.setProperty('--category-nav-top', `${top}px`);

      // Reserve the bar's height in flow so the switch to fixed — and the
      // icon collapse transition — never shifts the page.
      const navHeight = Math.round(nav.getBoundingClientRect().height);
      slot.style.height = `${navHeight}px`;

      // Mirror the slot's column so the fixed bar lines up with the hero.
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

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(schedule)
        : null;
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
      <nav
        className="category-nav"
        id="home-category-nav"
        aria-label="Product categories"
        ref={navRef}
      >
        <div className="category-nav-track">
          {CATEGORIES.map(({ name, icon: Icon }) => (
            <Link
              key={name}
              to={`/products?category=${encodeURIComponent(name)}`}
              className="category-nav-item"
              id={`category-nav-${slugify(name)}`}
            >
              <span className="category-nav-icon" aria-hidden="true">
                <Icon size={22} />
              </span>
              <span className="category-nav-label">{name}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default CategoryNav;

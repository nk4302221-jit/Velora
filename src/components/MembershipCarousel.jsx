import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Check, Zap, ArrowRight } from 'lucide-react';
import api from '../api/client';
import { formatINR } from '../utils/currency';

// The VIP pass engine rotates one card forward every second, forever.
// Autoplay is a single interval owned by this component so a re-render
// never leaves a stray timer behind, and there is no way to pause it.
const AUTOPLAY_INTERVAL_MS = 1000;

// Map a plan to its visual finish. Gold (12h) gets gold accents, Silver
// (6h) a silver finish, and the free 1h trial a clean light card. Falls
// back to price/duration so the look survives a rename in the database.
const themeForPlan = (plan) => {
  const slug = String(plan?.slug || '').toLowerCase();
  const hours = Number(plan?.duration_hours || 0);
  const price = Number(plan?.price || 0);

  if (slug === 'gold' || hours >= 12) return 'gold';
  if (slug === 'free' || price === 0) return 'free';
  if (slug === 'silver' || hours >= 6) return 'silver';
  return 'silver';
};

// Shortest signed distance between a card's index and the active index on
// a ring, so the carousel can loop forever without ever hitting an end.
const offsetFor = (index, active, count) => {
  if (count <= 1) return 0;

  let offset = index - active;
  const half = count / 2;

  if (offset > half) offset -= count;
  else if (offset < -half) offset += count;

  return offset;
};

const positionClassFor = (offset) => {
  if (offset === 0) return 'is-center';
  if (offset === 1) return 'is-right';
  if (offset === -1) return 'is-left';
  if (offset >= 2) return 'is-far-right';
  return 'is-far-left';
};

const hoursLabel = (plan) => {
  const hours = Number(plan?.duration_hours || 0);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
};

export const MembershipCarousel = () => {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // `prev` lets a card that wraps from one wing of the coverflow to the
  // other snap instantly (transition:none) instead of sliding across the
  // face of the centre card, which would look like a glitch.
  const [position, setPosition] = useState({ active: 0, prev: 0 });

  useEffect(() => {
    let cancelled = false;

    async function fetchPlans() {
      try {
        const res = await api.get('/plans');
        if (cancelled) return;

        const list = res?.data?.data?.plans;
        setPlans(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('Failed to load membership passes:', err);
        if (!cancelled) setPlans([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPlans();

    return () => {
      cancelled = true;
    };
  }, []);

  const count = plans.length;
  const activeIndex = position.active;
  const prevActive = position.prev;

  // One timer for the whole carousel lifetime. It is torn down and rebuilt
  // only when the number of plans changes, so two intervals can never race
  // against the same state. Hover/focus never stops it — by design.
  useEffect(() => {
    if (count <= 1) return undefined;

    const timer = setInterval(() => {
      setPosition((p) => ({ prev: p.active, active: (p.active + 1) % count }));
    }, AUTOPLAY_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [count]);

  if (loading) {
    return <div className="vip-3d-status">Loading membership passes...</div>;
  }

  if (count === 0) {
    return <div className="vip-3d-status">Membership passes are temporarily unavailable.</div>;
  }

  return (
    <div
      className="vip-3d-stage"
      role="group"
      aria-roledescription="carousel"
      aria-label="Timed VIP membership passes"
    >
      {plans.map((plan, index) => {
        const offset = offsetFor(index, activeIndex, count);
        const previousOffset = offsetFor(index, prevActive, count);
        const isCenter = offset === 0;
        const wrapped = count > 2 && Math.abs(offset - previousOffset) > 1;
        const benefits = Array.isArray(plan.benefits) ? plan.benefits : [];
        const isFeatured = Number(plan.duration_hours) >= 12;

        return (
          <div
            key={plan.id}
            className={`vip-3d-card vip-theme-${themeForPlan(plan)} ${positionClassFor(offset)}`}
            style={wrapped ? { transition: 'none' } : undefined}
            aria-hidden={!isCenter}
          >
            {isFeatured && <span className="vip-card-ribbon">Best Value</span>}

            <div className="vip-card-top">
              <h3 className="vip-card-name">{plan.name}</h3>
              <span className="vip-card-duration">
                <Clock size={14} /> Active for {hoursLabel(plan)}
              </span>
            </div>

            <div className="vip-card-price">
              <span className="vip-card-price-value">{formatINR(plan.price)}</span>
              <span className="vip-card-price-unit">/ {plan.duration_hours}h access</span>
            </div>

            <ul className="vip-card-benefits">
              {benefits.slice(0, 3).map((benefit, i) => (
                <li key={i}>
                  <Check size={14} />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            <Link to="/plans" className="vip-card-cta" tabIndex={isCenter ? 0 : -1}>
              {Number(plan.price) === 0 ? (
                <>
                  <Zap size={16} /> Start Free Trial
                </>
              ) : (
                <>
                  Get This Pass <ArrowRight size={16} />
                </>
              )}
            </Link>
          </div>
        );
      })}

      <div className="vip-3d-dots" aria-hidden="true">
        {plans.map((plan, index) => (
          <span
            key={plan.id}
            className={`vip-3d-dot${index === activeIndex ? ' is-active' : ''}`}
          />
        ))}
      </div>
    </div>
  );
};

export default MembershipCarousel;

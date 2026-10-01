import React from 'react';
import veloraLogo from '../assets/images/velora_logo_1790098679633.jpg';

export const BrandLogo = ({
  size = 38,
  showText = true,
  textColor,
  className = '',
}) => {
  return (
    <div
      className={`brand-logo-container ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        textDecoration: 'none',
      }}
    >
      <div
        className="brand-logo-gem"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          borderRadius: size > 40 ? '12px' : '9px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0c29 0%, #1a103c 50%, #0d1b2a 100%)',
          boxShadow: '0 2px 10px rgba(139, 92, 246, 0.3), inset 0 0 0 1px rgba(168, 85, 247, 0.4)',
          position: 'relative',
        }}
      >
        <img
          src={veloraLogo}
          alt="Velora Logo"
          referrerPolicy="no-referrer"
          width={size}
          height={size}
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>

      {showText && (
        <span
          className="brand-logo-text"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: size > 40 ? '24px' : '22px',
            fontWeight: 800,
            letterSpacing: '-0.5px',
            color: textColor || 'var(--text-main)',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
          }}
        >
          Velora
        </span>
      )}
    </div>
  );
};
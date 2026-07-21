import React, { useState } from 'react';

interface BumuLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
}

export const BumuLogo: React.FC<BumuLogoProps> = ({ size = 'md', className = '' }) => {
  const [logoSrc, setLogoSrc] = useState<'/logo_v5.png' | null>('/logo_v5.png');

  const dimensions = {
    xs: 'w-5 h-5',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
    '2xl': 'w-32 h-32',
    '3xl': 'w-48 h-48'
  };

  const selectedSize = dimensions[size] || dimensions.md;

  // If we haven't exhausted our external image sources, try loading them.
  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt="BumuBumu"
        referrerPolicy="no-referrer"
        className={`${selectedSize} shrink-0 object-contain select-none ${className}`}
        onError={() => {
          // If logo_v5.png fails, fallback to inline SVG
          setLogoSrc(null);
        }}
      />
    );
  }

  // Fallback beautiful inline SVG logo if external image fails
  return (
    <svg 
      viewBox="0 0 512 512" 
      className={`${selectedSize} shrink-0 select-none ${className}`}
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Background gradient: Sleek Magenta & Purple & Pink */}
        <linearGradient id="bumuBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E1306C" />
          <stop offset="50%" stopColor="#C13584" />
          <stop offset="100%" stopColor="#833AB4" />
        </linearGradient>
        
        {/* Border gradient for perfect contrast */}
        <linearGradient id="bumuBorderGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FD1D1D" />
          <stop offset="100%" stopColor="#F77737" />
        </linearGradient>
      </defs>

      {/* Main Base Card (Rounded Rectangle) */}
      <rect 
        x="24" 
        y="24" 
        width="384" 
        height="464" 
        rx="80" 
        fill="url(#bumuBgGrad)" 
        stroke="url(#bumuBorderGrad)" 
        strokeWidth="12" 
      />

      {/* White bold 'Bu' text */}
      <text 
        x="64" 
        y="210" 
        fill="#FFFFFF" 
        fontSize="160" 
        fontWeight="800" 
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        letterSpacing="-6"
      >
        Bu
      </text>

      {/* White bold 'mu' text */}
      <text 
        x="64" 
        y="380" 
        fill="#FFFFFF" 
        fontSize="160" 
        fontWeight="800" 
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        letterSpacing="-8"
      >
        mu
      </text>

      {/* Big stylized '?' on the right */}
      <text 
        x="294" 
        y="360" 
        fill="#C13584" 
        stroke="#FFFFFF" 
        strokeWidth="20"
        strokeLinejoin="round"
        fontSize="340" 
        fontWeight="900" 
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      >
        ?
      </text>
    </svg>
  );
};


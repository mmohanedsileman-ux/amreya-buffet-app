import React from 'react';

interface AmreyahBuffetLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'custom';
  className?: string;
  customSizeClass?: string;
  showText?: boolean;
}

export const AmreyahBuffetLogo: React.FC<AmreyahBuffetLogoProps> = ({
  size = 'md',
  className = '',
  customSizeClass = '',
}) => {
  const sizeMap: Record<string, string> = {
    xs: 'w-7 h-7',
    sm: 'w-9 h-9',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
    '2xl': 'w-32 h-32',
    custom: customSizeClass || 'w-12 h-12',
  };

  const currentSizeClass = sizeMap[size] || sizeMap.md;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 rounded-full bg-white shadow-sm overflow-hidden select-none ${currentSizeClass} ${className}`}>
      <img
        src="/amreyah-buffet-logo.svg"
        alt="شعار بوفية العامرية - Amreyah Buffet"
        className="w-full h-full object-contain pointer-events-none"
        loading="eager"
      />
    </div>
  );
};

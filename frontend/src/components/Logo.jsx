import { Aperture } from 'lucide-react';

export const Logo = ({ size = 'default' }) => {
  const iconSize = size === 'small' ? 18 : 22;
  const textClass = size === 'small'
    ? 'text-base font-bold tracking-[-0.04em]'
    : 'text-xl font-bold tracking-[-0.04em]';

  return (
    <div className="flex items-center gap-2 text-[#1D1D1F]" data-testid="app-logo">
      <Aperture
        className="text-[#1D1D1F]"
        size={iconSize}
        strokeWidth={1.5}
      />
      <span className={`font-['Manrope'] ${textClass}`}>
        Context Lens
      </span>
    </div>
  );
};

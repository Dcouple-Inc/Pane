import { cn } from '../../utils/cn';

interface KbdProps {
  children: React.ReactNode;
  /** xs = compact (palette footer), sm = default (tooltips/inline), md = larger (help dialog) */
  size?: 'xs' | 'sm' | 'md';
  /** muted adds text-text-tertiary color */
  variant?: 'default' | 'muted';
  className?: string;
}

const sizeStyles = {
  xs: 'px-1 py-0.5',
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
} as const;

export function Kbd({ children, size = 'sm', variant = 'default', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'font-mono bg-surface-tertiary rounded',
        sizeStyles[size],
        variant === 'muted' && 'text-text-tertiary',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

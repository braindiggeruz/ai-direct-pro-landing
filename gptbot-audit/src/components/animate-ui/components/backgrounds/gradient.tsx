import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

// CSS-only replacement for the previous motion/react implementation.
// Same visual: a 400% background panning 0% -> 100% -> 0% over 15s.
// Dropping motion here removes the whole framer/motion runtime from the
// landing bundle (it was only imported by this file and the FAQ accordion).
type GradientBackgroundProps = ComponentProps<'div'>;

function GradientBackground({ className, ...props }: GradientBackgroundProps) {
  return (
    <div
      data-slot="gradient-background"
      className={cn(
        'size-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 bg-[length:400%_400%] animate-gradient-pan motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { GradientBackground, type GradientBackgroundProps };

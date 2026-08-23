import { useState } from 'react';

type PremiumImageProps = {
  name: string;
  alt: string;
  sizes: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  fetchPriority?: 'high' | 'low' | 'auto';
};

const WIDTHS = [480, 800, 1280, 1536] as const;

export default function PremiumImage({
  name,
  alt,
  sizes,
  className = '',
  loading = 'lazy',
  fetchPriority = 'auto',
}: PremiumImageProps) {
  const [failed, setFailed] = useState(false);
  const base = `/assets/landing/premium/${name}`;

  if (failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`premium-image-fallback ${className}`}
      >
        <span aria-hidden="true" className="premium-image-fallback__mark">GPTBot</span>
      </div>
    );
  }

  const srcSet = (extension: 'avif' | 'webp') =>
    WIDTHS.map((width) => `${base}-${width}.${extension} ${width}w`).join(', ');

  return (
    <picture>
      <source type="image/avif" srcSet={srcSet('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet('webp')} sizes={sizes} />
      <img
        src={`${base}-800.webp`}
        srcSet={srcSet('webp')}
        sizes={sizes}
        alt={alt}
        className={className}
        width={1536}
        height={960}
        loading={loading}
        decoding={loading === 'eager' ? 'sync' : 'async'}
        fetchPriority={fetchPriority}
        onError={() => setFailed(true)}
      />
    </picture>
  );
}

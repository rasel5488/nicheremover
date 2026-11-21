interface IconProps {
  className?: string;
}

/**
 * Custom geometric brand mark for Niche Remover — layered cutout frame with clean silhouette.
 */
export function NicheLogoIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="13"
        height="13"
        rx="3.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="3 2"
        opacity="0.72"
      />
      <rect x="11" y="11" width="14" height="14" rx="3.5" fill="currentColor" />
      <circle cx="18" cy="15.6" r="2.1" fill="#050907" />
      <path
        d="M14.2 22C14.7 19.8 16.1 18.8 18 18.8C19.9 18.8 21.3 19.8 21.8 22"
        stroke="#050907"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Studio viewfinder / cutout frame icon (clean photography SVG, zero AI clichés).
 */
export function CutoutFrameIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <circle cx="12" cy="9.5" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7.5 17.5c.7-2.4 2.3-3.6 4.5-3.6s3.8 1.2 4.5 3.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Clean half-tone contrast dial icon for Studio Retouch / Photo Enhance.
 */
export function StudioToneIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 3.5A8.5 8.5 0 0 1 12 20.5V3.5Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Clean layered edge-smooth icon for Anti-Halo (De-fringe).
 */
export function EdgeFeatherIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect
        x="4"
        y="4"
        width="12"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
        opacity="0.55"
      />
      <rect
        x="8"
        y="8"
        width="12"
        height="12"
        rx="3"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/**
 * Clean precision brush/pen-nib stroke icon for touch-up highlights.
 */
export function PrecisionLayerIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3.5L20.5 8.2L12 12.9L3.5 8.2L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.2L12 16.9L20.5 12.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 16.2L12 20.9L20.5 16.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
    </svg>
  );
}

/**
 * Clean drop-zone photo frame with upward upload arrow SVG.
 */
export function PhotoUploadIcon({ className = 'h-7 w-7' }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect
        x="3.5"
        y="5.5"
        width="25"
        height="21"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 20V11.5M16 11.5L12 15.5M16 11.5L20 15.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 22.5H21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

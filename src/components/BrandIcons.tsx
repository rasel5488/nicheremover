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

/**
 * Official Facebook brand SVG icon.
 */
export function FacebookIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12Z" />
    </svg>
  );
}

/**
 * Official WhatsApp brand SVG icon.
 */
export function WhatsAppIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2Zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.188 8.188 0 0 1-1.26-4.38c.01-4.54 3.7-8.24 8.25-8.24Zm-3.53 3.6c-.18 0-.47.07-.71.33-.25.27-.94.92-.94 2.24 0 1.32.97 2.6 1.1 2.78.14.18 1.87 2.98 4.62 4.06 2.28.9 2.75.72 3.24.67.5-.04 1.6-.65 1.82-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.32-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.14-.18.27-.7.88-.85 1.06-.16.18-.32.2-.59.07-.27-.14-1.14-.42-2.17-1.34-.8-.72-1.34-1.6-1.5-1.87-.16-.27-.02-.42.12-.55.12-.12.27-.32.41-.48.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.47-.07-.14-.6-1.47-.83-2.01-.21-.5-.43-.43-.61-.44-.16-.01-.34-.01-.52-.01Z" />
    </svg>
  );
}

/**
 * Official Telegram brand SVG icon.
 */
export function TelegramIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38Z" />
    </svg>
  );
}

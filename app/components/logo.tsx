interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className = "text-primary" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Concentric circles representing time/cycles */}
      <circle
        cx="20"
        cy="20"
        r="16"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        className="opacity-30"
      />
      <circle
        cx="20"
        cy="20"
        r="12"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        className="opacity-50"
      />
      <circle
        cx="20"
        cy="20"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        className="opacity-70"
      />
      <circle cx="20" cy="20" r="4" fill="currentColor" />

      {/* Growth indicator */}
      <path d="M20 12L22 8L18 8Z" fill="currentColor" className="opacity-80" />
    </svg>
  );
}

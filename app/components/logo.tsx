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
      {/* Clean geometric shapes */}
      <circle
        cx="20"
        cy="20"
        r="15"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
      <circle
        cx="20"
        cy="20"
        r="8"
        fill="currentColor"
        className="opacity-80"
      />
      <circle cx="20" cy="20" r="3" fill="currentColor" />
    </svg>
  );
}

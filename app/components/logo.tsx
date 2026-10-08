import logoUrl from "~/assets/logo.svg";

interface LogoProps {
  className?: string;
}

export function Logo({ className = "size-16" }: LogoProps) {
  return (
    <img
      src={logoUrl}
      alt="African Union"
      className={`${className} rounded-lg object-contain brightness-0 invert`}
    />
  );
}

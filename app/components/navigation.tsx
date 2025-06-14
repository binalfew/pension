import { Form, Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Separator } from "./ui/separator";

export default function Navigation({
  user,
}: {
  user: {
    id: string;
    email: string;
    username: string;
    name?: string;
    imageUrl?: string;
  };
}) {
  const formAction = "/auth/microsoft";

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full mx-auto px-0">
        <div className="flex h-12 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="relative">
              {/* Logo SVG */}
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-primary transition-all duration-300 hover:scale-105"
              >
                {/* Shield shape with gradient */}
                <defs>
                  <linearGradient
                    id="shieldGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop
                      offset="0%"
                      stopColor="currentColor"
                      stopOpacity="0.15"
                    />
                    <stop
                      offset="100%"
                      stopColor="currentColor"
                      stopOpacity="0.05"
                    />
                  </linearGradient>
                </defs>

                {/* Shield base */}
                <path
                  d="M20 4L8 8V16C8 24.5 13.5 31.5 20 36C26.5 31.5 32 24.5 32 16V8L20 4Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="url(#shieldGradient)"
                  className="transition-all duration-300"
                />

                {/* Modern 'P' design */}
                <path
                  d="M16 14V26M16 14H22C24.2 14 26 15.8 26 18C26 20.2 24.2 22 22 22H16"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-300"
                />

                {/* Decorative elements */}
                <circle
                  cx="20"
                  cy="18"
                  r="1"
                  fill="currentColor"
                  className="opacity-50 animate-pulse"
                />
                <path
                  d="M20 24L20 28"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="opacity-50"
                />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-tight">Pension</span>
            </div>
          </Link>
          <div className="flex items-center">
            {user ? (
              <Form action="/logout" method="POST">
                <div className="flex h-5 items-center space-x-4 text-sm">
                  <div>Welcome, {user.name}</div>
                  <Separator orientation="vertical" />
                  <Button
                    variant="link"
                    type="submit"
                    className="cursor-pointer text-muted-foreground"
                  >
                    Logout
                  </Button>
                </div>
              </Form>
            ) : (
              <Form action={formAction} method="POST">
                <Button
                  type="submit"
                  variant="link"
                  className="cursor-pointer text-muted-foreground"
                >
                  Login
                </Button>
              </Form>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

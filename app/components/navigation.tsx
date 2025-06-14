import { Form, Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Separator } from "./ui/separator";

export default function Navigation({
  user,
}: {
  user?: {
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
              {/* Dot Pattern Logo with Arrow */}
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-primary"
              >
                {/* Row 1 */}
                <circle
                  cx="6"
                  cy="12"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="18"
                  cy="12"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="24"
                  cy="12"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle cx="30" cy="12" r="2" fill="currentColor" />

                {/* Row 2 */}
                <circle
                  cx="6"
                  cy="17"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="12"
                  cy="17"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle cx="18" cy="17" r="2" fill="currentColor" />
                <circle cx="24" cy="17" r="2" fill="currentColor" />
                <circle cx="30" cy="17" r="2" fill="currentColor" />
                <circle cx="36" cy="17" r="2" fill="currentColor" />

                {/* Row 3 (center - longest) */}
                <circle
                  cx="6"
                  cy="22"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="12"
                  cy="22"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle cx="18" cy="22" r="2" fill="currentColor" />
                <circle cx="24" cy="22" r="2" fill="currentColor" />
                <circle cx="30" cy="22" r="2" fill="currentColor" />
                <circle cx="36" cy="22" r="2" fill="currentColor" />

                {/* Row 4 */}
                <circle
                  cx="6"
                  cy="27"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="12"
                  cy="27"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle cx="18" cy="27" r="2" fill="currentColor" />
                <circle cx="24" cy="27" r="2" fill="currentColor" />
                <circle cx="30" cy="27" r="2" fill="currentColor" />

                {/* Row 5 */}
                <circle
                  cx="6"
                  cy="32"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="12"
                  cy="32"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="18"
                  cy="32"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle
                  cx="24"
                  cy="32"
                  r="2"
                  fill="currentColor"
                  className="opacity-30"
                />
                <circle cx="30" cy="32" r="2" fill="currentColor" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-tight">
                AU Pension Statement
              </span>
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

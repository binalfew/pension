import { Form, Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Logo } from "./logo";
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
    <nav className="border-b bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
      <div className="w-full mx-auto px-0">
        <div className="flex h-12 items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="relative">
              {/* Dot Pattern Logo with Arrow */}
              <Logo />
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

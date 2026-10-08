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
    Role?: "Admin" | "Pensioner";
  };
}) {
  const formAction = "/auth/microsoft";

  return (
    <nav className="border-b bg-primary text-primary-foreground">
      <div className="w-full mx-auto px-0">
        <div className="flex h-12 items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 self-stretch px-3 transition-colors hover:bg-primary-foreground/10"
          >
            <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              <Logo />
            </span>
            <span className="text-sm font-medium leading-none">
              AU Pension
            </span>
          </Link>
          <div className="flex items-center pr-4">
            {user ? (
              <Form action="/logout" method="POST">
                <div className="flex h-5 items-center space-x-4 text-sm">
                  {user.Role === "Admin" && (
                    <>
                      <Link
                        to="/contributions-upload"
                        className="text-primary-foreground/70 hover:text-primary-foreground"
                      >
                        Upload contributions
                      </Link>
                      <Separator orientation="vertical" className="bg-primary-foreground/30" />
                      <Link
                        to="/data-quality"
                        className="text-primary-foreground/70 hover:text-primary-foreground"
                      >
                        Data quality
                      </Link>
                      <Separator orientation="vertical" className="bg-primary-foreground/30" />
                    </>
                  )}
                  <div>Welcome, {user.name}</div>
                  <Separator orientation="vertical" className="bg-primary-foreground/30" />
                  <Button
                    variant="link"
                    type="submit"
                    className="cursor-pointer text-primary-foreground/70 hover:text-primary-foreground"
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
                  className="cursor-pointer text-primary-foreground/70 hover:text-primary-foreground"
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

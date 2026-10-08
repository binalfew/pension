import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Form, Link, NavLink, useLocation } from "react-router";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { Logo } from "./logo";
import { Separator } from "./ui/separator";

const navItems = [
  { to: "/", label: "Statement" },
  { to: "/contributions-upload", label: "Upload" },
  { to: "/data-quality", label: "Quality" },
  { to: "/sign-in-check", label: "Sign-in check" },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "font-medium text-primary-foreground"
    : "text-primary-foreground/70 hover:text-primary-foreground";

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
  const isAdmin = user?.Role === "Admin";
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the phone menu after moving to another page
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <nav className="border-b bg-primary text-primary-foreground">
      <div className="w-full mx-auto px-0">
        <div className="flex h-12 items-center justify-between">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2 self-stretch px-3 transition-colors hover:bg-primary-foreground/10"
          >
            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:size-16">
              <Logo className="size-10 sm:size-16" />
            </span>
            <span className="text-sm font-medium leading-none">
              AU Pension
            </span>
          </Link>
          <div className="flex min-w-0 items-center pr-4">
            {user ? (
              <>
                <Form
                  action="/logout"
                  method="POST"
                  className="hidden min-w-0 sm:block"
                >
                  <div className="flex h-5 items-center space-x-4 text-sm">
                    {isAdmin && (
                      <>
                        {navItems.map((item) => (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            end
                            className={navLinkClass}
                          >
                            {item.label}
                          </NavLink>
                        ))}
                        <Separator
                          orientation="vertical"
                          className="bg-primary-foreground/30"
                        />
                      </>
                    )}
                    <div className="hidden max-w-64 truncate lg:block">
                      Welcome, {user.name}
                    </div>
                    <Separator
                      orientation="vertical"
                      className="hidden bg-primary-foreground/30 lg:block"
                    />
                    <Button
                      variant="link"
                      type="submit"
                      className="cursor-pointer text-primary-foreground/70 hover:text-primary-foreground"
                    >
                      Logout
                    </Button>
                  </div>
                </Form>
                <button
                  type="button"
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-menu"
                  onClick={() => setMenuOpen((open) => !open)}
                  className="-mr-2 flex size-9 cursor-pointer items-center justify-center rounded-md text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground sm:hidden"
                >
                  {menuOpen ? (
                    <X className="size-5" />
                  ) : (
                    <Menu className="size-5" />
                  )}
                </button>
              </>
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

        {user && menuOpen && (
          <div
            id="mobile-menu"
            className="space-y-1 border-t border-primary-foreground/20 px-3 py-3 text-sm sm:hidden"
          >
            <p className="truncate px-2 pb-2 text-primary-foreground/70">
              Signed in as {user.name}
            </p>
            {isAdmin &&
              navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={(state) =>
                    cn(
                      "block rounded-md px-2 py-2 hover:bg-primary-foreground/10",
                      navLinkClass(state),
                      state.isActive && "bg-primary-foreground/10"
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            <Form action="/logout" method="POST">
              <button
                type="submit"
                className="block w-full cursor-pointer rounded-md px-2 py-2 text-left text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                Logout
              </button>
            </Form>
          </div>
        )}
      </div>
    </nav>
  );
}

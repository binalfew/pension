import type { Route } from "./+types/index";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Pension Management System" },
    {
      name: "description",
      content:
        "Manage your pension plans, track contributions, and plan for your retirement",
    },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to Your Pension Portal
        </h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="p-6 border rounded-lg space-y-2">
          <h3 className="text-lg font-semibold">Pension Overview</h3>
          <p className="text-muted-foreground">
            View your current pension balance, contribution history, and
            projected retirement income.
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-2">
          <h3 className="text-lg font-semibold">Secure Access</h3>
          <p className="text-muted-foreground">
            Access your pension information securely with multi-factor
            authentication and encrypted data.
          </p>
        </div>

        <div className="p-6 border rounded-lg space-y-2">
          <h3 className="text-lg font-semibold">Contribution Management</h3>
          <p className="text-muted-foreground">
            Easily manage your pension contributions and set up automatic
            payments.
          </p>
        </div>
      </div>
    </div>
  );
}

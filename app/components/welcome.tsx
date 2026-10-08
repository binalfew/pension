import {
  Download,
  FileText,
  LineChart,
  LogIn,
  SearchCheck,
  TrendingUp,
} from "lucide-react";
import { Form } from "react-router";
import logoUrl from "~/assets/logo.svg";
import { Button } from "~/components/ui/button";

// What a signed-in staff member finds on their statement page
const FEATURES = [
  {
    icon: FileText,
    title: "Your statement",
    body: "Balances for each account and every contribution, interest credit and adjustment, year by year.",
  },
  {
    icon: LineChart,
    title: "Balance over time",
    body: "See how your pension has grown since you joined, split into contributions and interest.",
  },
  {
    icon: SearchCheck,
    title: "Missing contributions",
    body: "Months with no contributions, or without the employer share, are flagged so you can report them.",
  },
  {
    icon: TrendingUp,
    title: "Projected balance",
    body: "Estimate what your balance could be at retirement based on your contributions so far.",
  },
];

export default function Welcome({
  supportEmail,
}: {
  supportEmail?: string | null;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-10 py-4 md:py-8">
      <section className="grid items-stretch gap-8 lg:grid-cols-2">
        <div className="flex flex-col justify-center space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <p className="text-sm font-medium tracking-widest text-primary uppercase">
            African Union staff pension
          </p>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Your pension, clear and up to date.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            View your pension statement, follow how your balance has grown and
            check that every contribution has been recorded.
          </p>
          <Form action="/auth/microsoft" method="POST" className="space-y-3">
            <Button type="submit" size="lg" className="gap-2">
              <LogIn className="size-4" />
              Sign in with your AU account
            </Button>
            <p className="text-sm text-muted-foreground">
              Use the Microsoft account you sign in to AU email with.
            </p>
          </Form>
        </div>

        <div className="relative hidden min-h-80 overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground shadow-lg sm:block animate-in fade-in duration-700">
          {/* Dotted grid backdrop */}
          <div className="absolute inset-0 opacity-[0.08]">
            <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern
                  id="welcome-grid"
                  width="28"
                  height="28"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="1" cy="1" r="1" fill="currentColor" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#welcome-grid)" />
            </svg>
          </div>

          {/* Decorative rings */}
          <div className="absolute -bottom-28 -left-28 size-80 rounded-full border border-primary-foreground/10" />
          <div className="absolute -top-20 -right-20 size-64 rounded-full border border-primary-foreground/10" />

          <div className="relative flex h-full flex-col items-center justify-center gap-6 p-10 text-center">
            <img
              src={logoUrl}
              alt="African Union"
              className="w-64 max-w-full object-contain brightness-0 invert"
            />
            <div className="h-px w-16 bg-primary-foreground/30" />
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              {[
                { icon: FileText, label: "Statement" },
                { icon: LineChart, label: "History" },
                { icon: Download, label: "PDF download" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-1.5"
                >
                  <Icon className="size-3.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="space-y-3 rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" />
            </div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>

      {supportEmail && (
        <p className="text-center text-sm text-muted-foreground">
          Questions about your pension record? Contact the Pension Office at{" "}
          <a
            href={`mailto:${supportEmail}`}
            className="font-medium text-primary hover:underline"
          >
            {supportEmail}
          </a>
          .
        </p>
      )}
    </div>
  );
}

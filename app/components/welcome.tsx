import {
  FileText,
  LineChart,
  LogIn,
  SearchCheck,
  TrendingUp,
} from "lucide-react";
import { Form } from "react-router";
import logoUrl from "~/assets/logo.svg";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

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


// The AU logo filled with the theme's primary colour (the SVG itself is white)
function GreenLogo({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="African Union"
      className={cn("bg-primary", className)}
      style={{
        maskImage: `url(${logoUrl})`,
        WebkitMaskImage: `url(${logoUrl})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

function SignIn({ className }: { className?: string }) {
  return (
    <Form action="/auth/microsoft" method="POST" className={cn("space-y-3", className)}>
      <Button type="submit" size="lg" className="gap-2">
        <LogIn className="size-4" />
        Sign in with your AU account
      </Button>
      <p className="text-sm text-muted-foreground">
        Use the Microsoft account you sign in to AU email with.
      </p>
    </Form>
  );
}

function FeatureCards({ className }: { className?: string }) {
  return (
    <section className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <div key={title} className="space-y-3 rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-5" />
          </div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      ))}
    </section>
  );
}

function Support({ supportEmail }: { supportEmail?: string | null }) {
  if (!supportEmail) return null;
  return (
    <p className="text-center text-sm text-muted-foreground">
      Questions about your pension record? Contact the Pension Office at{" "}
      <a href={`mailto:${supportEmail}`} className="font-medium text-primary hover:underline">
        {supportEmail}
      </a>
      .
    </p>
  );
}

export default function Welcome({
  supportEmail,
}: {
  supportEmail?: string | null;
}) {
  return (
    <div className="-m-4 md:-m-6">
      <section className="border-b bg-secondary/60">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:px-6 md:py-20 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-6">
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
            <SignIn />
          </div>
          <GreenLogo className="hidden aspect-square w-full max-w-sm justify-self-center lg:block" />
        </div>
      </section>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 md:px-6">
        <FeatureCards />
        <Support supportEmail={supportEmail} />
      </div>
    </div>
  );
}

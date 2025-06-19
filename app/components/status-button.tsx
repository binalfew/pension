import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useSpinDelay } from "spin-delay";
import { Button, type ButtonVariant } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

export const StatusButton = ({
  message,
  status,
  className,
  children,
  spinDelay,
  ...props
}: React.ComponentProps<"button"> &
  ButtonVariant & {
    status: "pending" | "success" | "error" | "idle";
    message?: string | null;
    spinDelay?: Parameters<typeof useSpinDelay>[1];
  }) => {
  const delayedPending = useSpinDelay(status === "pending", {
    delay: 400,
    minDuration: 300,
    ...spinDelay,
  });
  const companion = {
    pending: delayedPending ? (
      <div
        role="status"
        className="inline-flex size-6 items-center justify-center"
      >
        <Loader2 className="animate-spin" />
      </div>
    ) : null,
    success: (
      <div
        role="status"
        className="inline-flex size-6 items-center justify-center"
      >
        <CheckCircle2 className="text-green-500" />
      </div>
    ),
    error: (
      <div
        role="status"
        className="bg-destructive inline-flex size-6 items-center justify-center rounded-full"
      >
        <XCircle className="text-destructive-foreground" />
      </div>
    ),
    idle: null,
  }[status];

  return (
    <Button className={cn("flex justify-center gap-4", className)} {...props}>
      <div>{children}</div>
      {message ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>{companion}</TooltipTrigger>
            <TooltipContent>{message}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        companion
      )}
    </Button>
  );
};
StatusButton.displayName = "Button";

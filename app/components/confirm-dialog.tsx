import { useId, useRef } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// Asks before a change that's hard to undo. Built on the browser's <dialog>,
// which keeps focus inside it and closes on Escape. `trigger` gets a
// function that opens it; `confirm` is the action, usually a form whose
// submit button closes the dialog through `close`. `onOpen` runs each time
// it opens, e.g. to load what it shows
export function ConfirmDialog({
  trigger,
  title,
  children,
  confirm,
  onOpen,
  className,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  children: React.ReactNode;
  confirm: (close: () => void) => React.ReactNode;
  onOpen?: () => void;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const open = () => {
    onOpen?.();
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  return (
    <>
      {trigger(open)}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        // A click on the backdrop lands on the dialog itself
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            close();
          }
        }}
        className={cn(
          // Reset what it inherits when placed inside a table cell
          "m-auto w-[calc(100%-2rem)] max-w-md whitespace-normal rounded-xl border bg-background p-0 text-left font-normal text-foreground shadow-lg backdrop:bg-black/50",
          className
        )}
      >
        <div className="space-y-4 p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div className="text-sm text-muted-foreground">{children}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            {confirm(close)}
          </div>
        </div>
      </dialog>
    </>
  );
}

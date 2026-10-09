import { useState } from "react";
import { useNavigation } from "react-router";
import { useSpinDelay } from "spin-delay";
import { cn } from "~/lib/utils";

// A bar across the top of the window while the next page loads or a form
// submits, so a slow page doesn't look like the click did nothing. Quick
// loads don't show it. It creeps towards the end while waiting, then fills
// and fades out once done
export function NavigationProgress() {
  const navigation = useNavigation();
  const busy = useSpinDelay(navigation.state !== "idle", {
    delay: 200,
    minDuration: 300,
  });
  // Set while the bar is showing or fading out after a load. Updated during
  // render, as React suggests for state that follows other values
  const [visible, setVisible] = useState(false);
  if (busy && !visible) {
    setVisible(true);
  }
  if (!visible) {
    return null;
  }

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy={busy}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px]"
    >
      <div
        // A new element for each stage, so its animation starts afresh
        key={busy ? "loading" : "done"}
        className={cn(
          // Gold, to stand out on the green navigation bar it sits on
          "relative h-full bg-amber-400",
          busy ? "animate-progress-trickle" : "animate-progress-done"
        )}
        onAnimationEnd={busy ? undefined : () => setVisible(false)}
      >
        {/* The glow at the leading edge */}
        <div className="absolute right-0 h-full w-24 translate-y-[-3px] rotate-3 shadow-[0_0_10px_var(--color-amber-400),0_0_5px_var(--color-amber-400)]" />
      </div>
    </div>
  );
}

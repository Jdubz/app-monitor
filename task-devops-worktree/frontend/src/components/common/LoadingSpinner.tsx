import { CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  message?: string;
  fullScreen?: boolean;
}

const spinnerCircleSizes: Record<NonNullable<LoadingSpinnerProps["size"]>, string> = {
  small: "h-6 w-6 border-2",
  medium: "h-10 w-10 border-[3px]",
  large: "h-14 w-14 border-4",
};

export function LoadingSpinner({
  size = "medium",
  message,
  fullScreen = false,
}: LoadingSpinnerProps) {
  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <span
        className={cn(
          "inline-block rounded-full border border-border/50 border-t-primary/90 animate-spin",
          spinnerCircleSizes[size],
        )}
        aria-hidden="true"
      />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
}

interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function LoadingSkeleton({
  width = "100%",
  height = "20px",
  borderRadius = "8px",
  className,
}: LoadingSkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
    borderRadius,
  };

  return (
    <div
      style={style}
      className={cn("animate-pulse rounded-md bg-muted/40", className)}
    />
  );
}

export function LoadingCard() {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur">
      <LoadingSkeleton height="24px" width="60%" />
      <LoadingSkeleton height="16px" width="80%" />
      <LoadingSkeleton height="16px" width="70%" />
      <div className="flex gap-3">
        <LoadingSkeleton height="32px" width="96px" />
        <LoadingSkeleton height="32px" width="96px" />
      </div>
    </div>
  );
}

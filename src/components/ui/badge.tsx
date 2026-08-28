import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-2 border px-6 py-2 text-9.5 font-semibold uppercase tracking-caps whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border2 bg-panel2 text-dim",
        good: "border-transparent bg-goodbg text-good",
        warn: "border-transparent bg-warnbg text-warn",
        bad: "border-transparent bg-badbg text-bad",
        cross: "border-transparent bg-crossbg text-cross",
        accent: "border-transparent bg-soft text-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

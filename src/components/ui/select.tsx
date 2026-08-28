import * as React from "react";
import { cn } from "@/lib/utils";

/** Native <select>, styled to the ASTU dense scale. A Radix combobox is not worth the
 *  dependency weight for this app's plain option lists. */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-24 w-full rounded-2 border border-border2 bg-panel px-9 text-11.5 text-text outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export { Select };

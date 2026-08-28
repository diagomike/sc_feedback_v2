import * as React from "react";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-10.5 font-semibold uppercase tracking-label text-faint", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };

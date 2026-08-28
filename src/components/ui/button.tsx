import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn-style Button, retuned to the ASTU dense scale: 22-25px control heights,
 * 11.5px text, 2px radius, no shadows — see globals.css's token mapping comment.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-6 whitespace-nowrap rounded-2 text-11.5 font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 shadow-none",
  {
    variants: {
      variant: {
        default: "bg-accent text-white hover:bg-accent2",
        secondary: "bg-panel2 text-text border border-border2 hover:bg-panel3",
        outline: "border border-border2 bg-transparent text-text hover:bg-panel3",
        ghost: "bg-transparent text-dim hover:bg-panel3 hover:text-text",
        destructive: "bg-bad text-white hover:opacity-90",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-24 px-12",
        sm: "h-22 px-9 text-10.5",
        lg: "h-28 px-16",
        icon: "h-24 w-24",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "btn-shine relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-[1px] active:shadow-none",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-[#38bdf8] via-[#2563eb] to-[#7c3aed] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_14px_-2px_rgba(56,189,248,0.55)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_26px_-4px_rgba(37,99,235,0.6)] hover:-translate-y-0.5 dark:from-[#38bdf8] dark:via-[#3b82f6] dark:to-[#8b5cf6] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_-2px_rgba(56,189,248,0.55)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_30px_-4px_rgba(139,92,246,0.7)]",
        selected:
          "bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_-2px_rgba(168,85,247,0.55),0_0_0_1px_rgba(255,255,255,0.2)_inset] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_10px_28px_-4px_rgba(217,70,239,0.7)] hover:-translate-y-0.5 dark:from-violet-400 dark:via-purple-400 dark:to-fuchsia-400 dark:text-purple-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_18px_-2px_rgba(217,70,239,0.6)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_30px_-4px_rgba(217,70,239,0.8)]",
        destructive:
          "bg-gradient-to-br from-[#f87171] to-[#dc2626] text-destructive-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_14px_-2px_rgba(239,68,68,0.5)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_26px_-4px_rgba(239,68,68,0.65)] hover:-translate-y-0.5 dark:from-[#f87171] dark:to-[#b91c1c] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_16px_-2px_rgba(239,68,68,0.55)] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_10px_30px_-4px_rgba(239,68,68,0.7)]",
        outline:
          "border border-border bg-background/60 backdrop-blur-sm text-foreground hover:border-violet-500/40 hover:bg-violet-50 hover:text-violet-700 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-6px_rgba(139,92,246,0.35)] dark:border-white/15 dark:bg-white/5 dark:text-foreground dark:hover:border-violet-400/50 dark:hover:bg-violet-500/10 dark:hover:text-violet-300 dark:hover:shadow-[0_6px_16px_-6px_rgba(168,85,247,0.5)]",
        secondary:
          "bg-indigo-50/80 text-indigo-800 border border-indigo-100 shadow-[0_4px_12px_-4px_rgba(79,70,229,0.35)] hover:bg-indigo-100 hover:-translate-y-0.5 dark:bg-white/5 dark:text-blue-200 dark:border-white/10 dark:shadow-none dark:hover:bg-white/10 dark:hover:border-white/20",
        ghost: "text-foreground hover:bg-slate-100 hover:text-foreground dark:text-foreground dark:hover:bg-white/5",
        link: "text-blue-700 underline-offset-4 hover:underline dark:text-blue-400",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

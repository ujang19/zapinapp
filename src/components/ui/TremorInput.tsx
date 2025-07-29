import * as React from "react"
import { cn, focusInput } from "@/lib/utils"

export interface TremorInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

const TremorInput = React.forwardRef<HTMLInputElement, TremorInputProps>(
  ({ className, type, error, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        disabled={disabled || undefined}
        className={cn(
          // Base styling matching the clean Tremor example
          "relative block w-full appearance-none rounded-md border px-2.5 py-2 shadow-xs outline-hidden transition sm:text-sm",
          // Border and background colors
          "border-gray-300 dark:border-gray-800 text-gray-900 dark:text-gray-50 placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-950",
          // Disabled states
          "disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:border-gray-700 dark:disabled:bg-gray-800 dark:disabled:text-gray-500",
          // File input styling
          "file:-my-2 file:-ml-2.5 file:cursor-pointer file:rounded-l-[5px] file:rounded-r-none file:border-0 file:px-3 file:py-2 file:outline-hidden",
          "focus:outline-hidden disabled:pointer-events-none file:disabled:pointer-events-none file:border-solid file:border-gray-300 file:bg-gray-50 file:text-gray-500 file:hover:bg-gray-100",
          "dark:file:border-gray-800 dark:file:bg-gray-950 dark:file:hover:bg-gray-900/20 dark:file:disabled:border-gray-700",
          "file:[border-inline-end-width:1px] file:[margin-inline-end:0.75rem] file:disabled:bg-gray-100 file:disabled:text-gray-500 dark:file:disabled:bg-gray-800",
          // Focus states
          "focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-700/30 focus:border-blue-500 dark:focus:border-blue-700",
          // Search input specific
          "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
          // Error states
          error && "border-red-500 dark:border-red-700 focus:ring-red-200 dark:focus:ring-red-700/30 focus:border-red-500 dark:focus:border-red-700",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
TremorInput.displayName = "TremorInput"

export { TremorInput }
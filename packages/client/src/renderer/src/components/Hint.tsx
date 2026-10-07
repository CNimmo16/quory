import { type ReactElement, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function Hint({
  children,
  content,
  disabled = false,
  side = "top",
}: {
  children: ReactElement<{ disabled?: boolean }>;
  content: ReactNode;
  disabled?: boolean;
  side?: "top" | "right" | "bottom" | "left";
}) {
  if (disabled) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children.props.disabled ? (
          <span className="inline-flex" tabIndex={0}>
            {children}
          </span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

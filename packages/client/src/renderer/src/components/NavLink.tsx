import * as React from "react";
import { createLink, type LinkComponent } from "@tanstack/react-router";
import { cn } from "../lib/utils";

export const navigationItemClassName =
  "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground";

const NavigationAnchor = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a">
>(function NavigationAnchor({ className, ...props }, ref) {
  return (
    <a
      ref={ref}
      className={cn(navigationItemClassName, className)}
      {...props}
    />
  );
});

const CreatedLink = createLink(NavigationAnchor);
const NavLink: LinkComponent<typeof NavigationAnchor> = (props) => (
  <CreatedLink preload="intent" {...props} />
);
export default NavLink;

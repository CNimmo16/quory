import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'
import { NavLink as MantineNavLink, NavLinkProps } from '@mantine/core'

type MantineNavLinkProps = Omit<NavLinkProps, 'href'>

const MantineLinkComponent = React.forwardRef<HTMLAnchorElement, MantineNavLinkProps>(
  function Link(props, ref) {
    return <MantineNavLink ref={ref} {...props} />
  }
)

const CreatedLinkComponent = createLink(MantineLinkComponent)

const NavLink: LinkComponent<typeof MantineLinkComponent> = (props) => {
  return <CreatedLinkComponent preload="intent" {...props} />
}
export default NavLink

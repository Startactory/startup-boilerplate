'use client';

import { Building2, Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { AuthenticatedUser } from '@/application/me/get-current-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './language-switcher';
import { UserMenu } from './user-menu';

const MAIN_ITEMS = [
  {
    href: '/dashboard',
    labelKey: 'dashboard',
    icon: Home,
    exact: true,
  },
] as const;

const SECONDARY_ITEMS = [
  {
    href: '/dashboard/organization',
    labelKey: 'organization',
    icon: Building2,
    exact: false,
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({
  user,
  logo,
}: {
  user: AuthenticatedUser;
  logo: React.ReactNode;
}): React.ReactElement {
  const t = useTranslations('Nav');
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="p-1 pt-3">
        <div className="flex justify-center">{logo}</div>
      </SidebarHeader>
      <SidebarContent className="pt-6">
        <SidebarMenu className="items-center">
          {MAIN_ITEMS.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            const active = isActive(pathname, item.href, item.exact);
            return (
              <SidebarMenuItem key={item.href} className="pb-0.5">
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={active}
                  tooltip={label}
                >
                  <Icon className={cn(active && 'text-sidebar-primary')} />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-1 pb-3">
        <SidebarMenu className="items-center">
          {SECONDARY_ITEMS.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            const active = isActive(pathname, item.href, item.exact);
            return (
              <SidebarMenuItem key={item.href} className="pb-0.5">
                <SidebarMenuButton
                  render={<Link href={item.href} />}
                  isActive={active}
                  tooltip={label}
                >
                  <Icon className={cn(active && 'text-sidebar-primary')} />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
        <div className="flex flex-col items-center gap-1.5">
          <LanguageSwitcher />
          <UserMenu
            firstName={user.firstName}
            lastName={user.lastName}
            email={user.email}
            image={user.image}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

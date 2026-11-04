import { UserButton } from '@clerk/react';
import {
  ArchiveIcon,
  BoxIcon,
  Building2Icon,
  ChevronsUpDownIcon,
  CircleCheckIcon,
  FileTextIcon,
  FlagIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PaperclipIcon,
  ScrollTextIcon,
  SirenIcon,
  TriangleAlertIcon,
  UsersIcon,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Logo, Mark } from '@/components/logo';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { roleLabels, useAppData } from '@/lib/members';

const navGroups = [
  {
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboardIcon },
      { to: '/tasks', label: 'Tasks', icon: CircleCheckIcon },
    ],
  },
  {
    label: 'ISMS',
    items: [
      { to: '/soa', label: 'Statement of Applicability', icon: ListChecksIcon },
      { to: '/risks', label: 'Risks', icon: TriangleAlertIcon },
      { to: '/assets', label: 'Assets', icon: BoxIcon },
      { to: '/suppliers', label: 'Suppliers', icon: Building2Icon },
      { to: '/evidence', label: 'Evidence', icon: PaperclipIcon },
      { to: '/incidents', label: 'Incidents', icon: SirenIcon },
      { to: '/nonconformities', label: 'Nonconformities', icon: FlagIcon },
      { to: '/documents', label: 'Documents', icon: FileTextIcon },
    ],
  },
  {
    label: 'Certification',
    items: [
      { to: '/audit-file', label: 'Audit file', icon: ArchiveIcon },
      { to: '/audit-trail', label: 'Audit trail', icon: ScrollTextIcon },
    ],
  },
  {
    label: 'Organization',
    items: [{ to: '/members', label: 'Members and settings', icon: UsersIcon }],
  },
];

function AppSidebar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const { me } = useAppData();

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="gap-3 px-0.5 pt-2 pb-0">
        <Link to="/" aria-label="Isolator overview" className="px-2 py-1 text-foreground">
          <Logo className="h-5.5 w-auto" />
        </Link>
        <Link
          to="/organizations"
          aria-label={`${me.organizationName}, switch Organization`}
          className="flex items-center gap-2 rounded-md border bg-surface px-2 py-1.5 font-medium text-foreground shadow-xs hover:border-border-strong"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-[0.3125rem] bg-foreground text-[0.6875rem] leading-none font-semibold text-surface">
            {me.organizationName[0]}
          </span>
          <span className="min-w-0 flex-1 truncate">{me.organizationName}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label ?? 'main'} className="px-0.5 py-1">
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu className="gap-px">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)}
                  >
                    <NavLink
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setOpenMobile(false)}
                    >
                      <item.icon strokeWidth={1.75} />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2 px-2.5 pb-3">
        <div className="flex items-center gap-2 border-t pt-3 text-foreground">
          <UserButton />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{me.name}</span>
            <span className="truncate text-xs text-muted-foreground">{roleLabels[me.role]}</span>
          </span>
        </div>
        <label className="sr-only" htmlFor="language">
          Language
        </label>
        <NativeSelect id="language" className="h-8 bg-transparent shadow-none">
          <option>English</option>
          <option>Deutsch</option>
          <option>Français</option>
        </NativeSelect>
      </SidebarFooter>
    </Sidebar>
  );
}

export function Layout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-2 md:hidden">
          <SidebarTrigger />
          <Mark className="size-5" />
        </header>
        <div className="flex flex-1 flex-col gap-6 px-4 py-5 md:px-9 md:pt-7 md:pb-9">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

import { NavLink, Outlet } from 'react-router';
import { Logo } from '../components/logo';

const nav = [
  { to: '/', label: 'Overview' },
  { to: '/controls', label: 'Controls' },
];

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r bg-surface p-4">
        <Logo className="mb-8 ml-3 mt-1 h-6 w-auto" />
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-selected font-medium text-selected-foreground' : 'text-muted-foreground hover:bg-surface-sunken hover:text-foreground'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

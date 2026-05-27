import type { ReactNode } from 'react';
import { TabLayout, type TabId } from './TabLayout';

type Tab = {
  id: TabId;
  label: string;
  stub?: boolean;
};

type Breadcrumb = {
  id: TabId;
  label: string;
};

type Props = {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
  breadcrumbs: Breadcrumb[];
  username: string | null;
  roleLabel?: string | null;
  onLogout: () => void;
  children: ReactNode;
};

export function AppShell({
  tabs,
  activeTab,
  onTabChange,
  breadcrumbs,
  username,
  roleLabel,
  onLogout,
  children,
}: Props) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar__brand">
          <span className="app-sidebar__title">MIS</span>
          <span className="app-sidebar__subtitle">
            Медицинская информационная система
          </span>
        </div>
        <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
      </aside>

      <div className="app-body">
        <header className="app-topbar">
          <nav className="app-breadcrumbs" aria-label="Навигация">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={crumb.id} className="app-breadcrumbs__item">
                  <button
                    type="button"
                    className="app-breadcrumbs__link"
                    onClick={() => onTabChange(crumb.id)}
                    disabled={isLast}
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {crumb.label}
                  </button>
                  {!isLast && <span className="app-breadcrumbs__separator">/</span>}
                </span>
              );
            })}
          </nav>
          <div className="app-topbar__actions">
            {username && (
              <span className="app-topbar__user">
                {username}
                {roleLabel ? ` · ${roleLabel}` : ''}
              </span>
            )}
            <button
              type="button"
              className="app-topbar__logout"
              onClick={onLogout}
              title="Выйти"
              aria-label="Выйти"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}

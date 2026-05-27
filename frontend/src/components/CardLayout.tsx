import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export type CardTab = {
  id: string;
  label: string;
};

type Props = {
  title: string;
  sidebar: ReactNode;
  tabs: CardTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  panels: Record<string, ReactNode>;
  footer?: ReactNode;
  alerts?: ReactNode;
  busy?: boolean;
  busyLabel?: string;
};

export function CardLayout({
  title,
  sidebar,
  tabs,
  activeTab,
  onTabChange,
  panels,
  footer,
  alerts,
  busy = false,
  busyLabel = 'Сохраняем...',
}: Props) {
  const tablistRef = useRef<HTMLDivElement>(null);

  function focusTab(tabId: string) {
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`#card-tab-${tabId}`)
      ?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabId: string) {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (currentIndex === -1) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onTabChange(nextTab.id);
    focusTab(nextTab.id);
  }

  return (
    <div className={`card-page${busy ? ' card-page--busy' : ''}`}>
      <aside className="card-sidebar">
        <h2 className="card-sidebar__title">{title}</h2>
        <div className="card-sidebar__content">{sidebar}</div>
      </aside>

      <div className="card-main">
        <div
          ref={tablistRef}
          className="card-tabs"
          role="tablist"
          aria-label={title}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`card-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`card-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={
                activeTab === tab.id ? 'card-tab card-tab--active' : 'card-tab'
              }
              disabled={busy}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {alerts && <div className="card-alerts">{alerts}</div>}

        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`card-panel-${tab.id}`}
            aria-labelledby={`card-tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            className="card-content"
          >
            {panels[tab.id]}
          </div>
        ))}

        {footer && <div className="card-footer">{footer}</div>}
      </div>

      {busy && (
        <div className="card-busy-overlay" role="status" aria-live="polite" aria-label={busyLabel}>
          <div className="card-busy-overlay__box">
            <div className="card-busy-overlay__spinner" aria-hidden="true" />
            <span>{busyLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

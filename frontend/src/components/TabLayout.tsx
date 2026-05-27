export type TabId = 'patients' | 'appointments' | 'visit' | 'documents' | 'reports';

type Tab = {
  id: TabId;
  label: string;
  stub?: boolean;
};

type Props = {
  tabs: Tab[];
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
};

export function TabLayout({ tabs, activeTab, onTabChange }: Props) {
  return (
    <nav className="sidebar-nav" aria-label="Разделы приложения">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={
            activeTab === tab.id
              ? 'sidebar-nav__item sidebar-nav__item--active'
              : 'sidebar-nav__item'
          }
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
          {tab.stub && <span className="sidebar-nav__stub-badge">скоро</span>}
        </button>
      ))}
    </nav>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { type TabId } from './components/TabLayout';
import type { VisitNavigationTarget } from './navigation/visitNavigation';
import type { DocumentNavigationTarget } from './navigation/documentNavigation';
import { AppointmentsTab } from './pages/AppointmentsTab';
import { DocumentsTab } from './pages/DocumentsTab';
import { PatientsTab } from './pages/PatientsTab';
import { VisitTab } from './pages/VisitTab';
import { StubTab } from './pages/StubTab';
import './App.css';

const ALL_TABS: { id: TabId; label: string; stub?: boolean; doctorOnly?: boolean }[] = [
  { id: 'patients', label: 'Пациенты' },
  { id: 'appointments', label: 'Приёмы' },
  { id: 'visit', label: 'Приём', doctorOnly: true },
  { id: 'documents', label: 'Документы' },
  { id: 'reports', label: 'Отчёты', stub: true },
];
const MAX_BREADCRUMB_ITEMS = 5;

export default function App() {
  const { username, logout, isDoctor, isRegistrar, misRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('patients');
  const [tabTrail, setTabTrail] = useState<TabId[]>(['patients']);
  const [visitNavigation, setVisitNavigation] = useState<VisitNavigationTarget | null>(null);
  const [visitNavigationSeq, setVisitNavigationSeq] = useState(0);
  const [documentNavigation, setDocumentNavigation] = useState<DocumentNavigationTarget | null>(null);
  const [documentNavigationSeq, setDocumentNavigationSeq] = useState(0);

  const tabs = useMemo(
    () => ALL_TABS.filter((tab) => !tab.doctorOnly || isDoctor),
    [isDoctor],
  );

  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);

  useEffect(() => {
    if (!tabIds.includes(activeTab)) {
      setActiveTab(tabIds[0] ?? 'patients');
    }
  }, [activeTab, tabIds]);

  useEffect(() => {
    setTabTrail((previous) => {
      if (previous[previous.length - 1] === activeTab) {
        return previous;
      }
      const deduped = previous.filter((tabId) => tabId !== activeTab);
      const next = [...deduped, activeTab];
      if (next.length <= MAX_BREADCRUMB_ITEMS) {
        return next;
      }
      return next.slice(next.length - MAX_BREADCRUMB_ITEMS);
    });
  }, [activeTab]);

  const breadcrumbs = useMemo(() => {
    const labels = new Map(tabs.map((tab) => [tab.id, tab.label]));
    return tabTrail
      .filter((tabId) => labels.has(tabId))
      .map((tabId) => ({ id: tabId, label: labels.get(tabId) ?? tabId }));
  }, [tabTrail, tabs]);

  function openVisitFromRegistry(target: VisitNavigationTarget) {
    if (!isDoctor) {
      return;
    }
    setVisitNavigation(target);
    setVisitNavigationSeq((seq) => seq + 1);
    setActiveTab('visit');
  }

  function openDocumentsFromVisit(target: DocumentNavigationTarget) {
    setDocumentNavigation(target);
    setDocumentNavigationSeq((seq) => seq + 1);
    setActiveTab('documents');
  }

  function renderTab(tabId: TabId) {
    switch (tabId) {
      case 'patients':
        return <PatientsTab isActive={activeTab === 'patients'} />;
      case 'appointments':
        return (
          <AppointmentsTab
            onOpenVisit={openVisitFromRegistry}
            canOpenVisit={isDoctor}
          />
        );
      case 'visit':
        return (
          <VisitTab
            navigationTarget={visitNavigation}
            navigationSeq={visitNavigationSeq}
            onOpenDocuments={openDocumentsFromVisit}
          />
        );
      case 'documents':
        return (
          <DocumentsTab
            navigationTarget={documentNavigation}
            navigationSeq={documentNavigationSeq}
          />
        );
      default:
        return <StubTab />;
    }
  }

  const roleLabel = isRegistrar ? 'Регистратура' : isDoctor ? 'Врач' : misRole;

  return (
    <AppShell
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      breadcrumbs={breadcrumbs}
      username={username}
      roleLabel={roleLabel}
      onLogout={logout}
    >
      {tabIds.map((tabId) => (
        <div key={tabId} hidden={activeTab !== tabId}>
          {renderTab(tabId)}
        </div>
      ))}
    </AppShell>
  );
}

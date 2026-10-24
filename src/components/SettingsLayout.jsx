import MainLayout from '../layouts/mainLayout';
import OfficeTools from './OfficeTools';
import './settingsLayout.css';

export default function SettingsLayout({ children, search }) {
  return <MainLayout><div className="settings-page">
    <header className="settings-topbar">
      <div className="settings-topbar-context"><span className="settings-topbar-label">Settings</span>{search}</div>
      <div className="settings-topbar-tools"><OfficeTools /></div>
    </header>
    {children}
  </div></MainLayout>;
}

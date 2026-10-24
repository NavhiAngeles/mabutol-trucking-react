import OfficeTools from './OfficeTools';
import './reportControls.css';

export default function ReportTopbar({ children }) {
  return <header className="reports-topbar">
    <div className="reports-topbar-context">{children}</div>
    <div className="reports-topbar-tools"><OfficeTools /></div>
  </header>;
}

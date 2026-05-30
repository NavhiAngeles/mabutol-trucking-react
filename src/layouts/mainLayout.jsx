import Sidebar from "../components/Sidebar/sidebar";

export default function MainLayout({ children }) {
  return (
    <div className="dashboard">
      <Sidebar />

      <main className="main">
        {children}
      </main>
    </div>
  );
}
import { Navigate, Route, Routes } from "react-router";
import AppShell from "./layout/AppShell";
import About from "./pages/About";
import Alerts from "./pages/Alerts";
import DataHealth from "./pages/DataHealth";
import FieldData from "./pages/FieldData";
import Import from "./pages/Import";
import Modules from "./pages/Modules";
import Overview from "./pages/Overview";
import Reports from "./pages/Reports";
import SelfTest from "./pages/SelfTest";
import Snapshot from "./pages/Snapshot";
import Temps from "./pages/Temps";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Overview />} />
        <Route path="import" element={<Import />} />
        <Route path="data-health" element={<DataHealth />} />
        <Route path="temps" element={<Temps />} />
        <Route path="modules" element={<Modules />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="field-data" element={<FieldData />} />
        <Route path="self-test" element={<SelfTest />} />
        <Route path="snapshot" element={<Snapshot />} />
        <Route path="reports" element={<Reports />} />
        <Route path="about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

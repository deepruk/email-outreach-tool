import { Navigate, Route, Routes } from "react-router-dom";
import CsvCampaignWizard from "@/pages/CsvCampaignWizard";
import { RequireAuth } from "@/components/rohly/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/rohly/Dashboard";
import Campaigns from "@/pages/rohly/Campaigns";
import Leads from "@/pages/rohly/Leads";
import UnifiedInbox from "@/pages/rohly/UnifiedInbox";
import Inboxes from "@/pages/rohly/Inboxes";
import Warmup from "@/pages/rohly/Warmup";
import Analytics from "@/pages/rohly/Analytics";
import Imports from "@/pages/rohly/Imports";
import SettingsPage from "@/pages/rohly/Settings";
import CampaignDetail from "@/pages/rohly/CampaignDetail";
import CampaignSource from "@/pages/rohly/CampaignSource";
import TemplateBuilder from "@/pages/rohly/TemplateBuilder";
import Billing from "@/pages/rohly/Billing";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/new" element={<CampaignSource />} />
        <Route path="/campaigns/new/csv" element={<CsvCampaignWizard />} />
        <Route path="/campaigns/new/template" element={<TemplateBuilder />} />
        <Route path="/campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/inbox" element={<UnifiedInbox />} />
        <Route path="/inboxes" element={<Inboxes />} />
        <Route path="/warm-up" element={<Warmup />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/imports" element={<Imports />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/billing" element={<Billing />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

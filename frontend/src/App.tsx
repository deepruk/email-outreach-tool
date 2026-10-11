import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/rohly/AppShell";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Signup from "@/pages/Signup";
import VerifyEmail from "@/pages/VerifyEmail";
import Dashboard from "@/pages/rohly/Dashboard";
import Campaigns from "@/pages/rohly/Campaigns";
import Leads from "@/pages/rohly/Leads";
import UnifiedInbox from "@/pages/rohly/UnifiedInbox";
import Inboxes from "@/pages/rohly/Inboxes";
import Analytics from "@/pages/rohly/Analytics";
import SettingsPage from "@/pages/rohly/Settings";
import CampaignDetail from "@/pages/rohly/CampaignDetail";
import TemplateBuilder from "@/pages/rohly/TemplateBuilder";
import TemplateBuilderSafe from "@/pages/rohly/TemplateBuilderSafe";
import Billing from "@/pages/rohly/Billing";
import CampaignEditor from "@/pages/rohly/CampaignEditor";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<Dashboard />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/new" element={<TemplateBuilder />} />
        <Route path="/campaigns/new/template" element={<TemplateBuilder />} />
        <Route path="/campaigns/:campaignId" element={<CampaignDetail />} />
        <Route path="/campaigns/:campaignId/edit" element={<CampaignEditor />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/inbox" element={<UnifiedInbox />} />
        <Route path="/inboxes" element={<Inboxes />} />
        <Route path="/warm-up" element={<Navigate to="/inboxes#inbox-health" replace />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/imports" element={<Navigate to="/campaigns/new" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/billing" element={<Billing />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

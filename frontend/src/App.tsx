import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import CsvCampaignWizard from "@/pages/CsvCampaignWizard";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/campaigns/new" element={<CsvCampaignWizard />} />
    </Routes>
  );
}

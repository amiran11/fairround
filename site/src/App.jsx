import { Navigate, Route, Routes } from "react-router-dom";
import { LangProvider } from "./i18n.jsx";
import { SessionProvider } from "./session.jsx";
import Layout from "./components/Layout.jsx";
import Register from "./pages/Register.jsx";
import Company from "./pages/Company.jsx";
import Citizen from "./pages/Citizen.jsx";
import Market from "./pages/Market.jsx";
import Rules from "./pages/Rules.jsx";
import WhitePaper from "./pages/WhitePaper.jsx";
import NotFound from "./pages/NotFound.jsx";
import Portfolio from "./pages/Portfolio.jsx";

export default function App() {
  return (
    <LangProvider>
      <SessionProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Register />} />
            <Route path="company/:id" element={<Company />} />
            <Route path="citizen" element={<Citizen />} />
            <Route path="market" element={<Market />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="portfolio/:address" element={<Portfolio />} />
            <Route path="rules" element={<Rules />} />
            <Route path="whitepaper" element={<WhitePaper />} />
            {/* The old live screen's address. */}
            <Route path="live" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </SessionProvider>
    </LangProvider>
  );
}

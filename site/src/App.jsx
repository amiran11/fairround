import { Navigate, Route, Routes } from "react-router-dom";
import { LangProvider } from "./i18n.jsx";
import { SessionProvider } from "./session.jsx";
import Layout from "./components/Layout.jsx";
import Register from "./pages/Register.jsx";
import Company from "./pages/Company.jsx";
import Citizen from "./pages/Citizen.jsx";
import Market from "./pages/Market.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Rules from "./pages/Rules.jsx";
import WhitePaper from "./pages/WhitePaper.jsx";
import NotFound from "./pages/NotFound.jsx";
import V8Frame from "./v8/Frame.jsx";
import V8Register from "./v8/Register.jsx";
import V8Company from "./v8/Company.jsx";
import V8Market from "./v8/Market.jsx";
import V8Portfolio from "./v8/Portfolio.jsx";
import V8Rules from "./v8/Rules.jsx";

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
            {/* Version 8 keeps running; its screens live here. */}
            <Route path="v8" element={<V8Frame />}>
              <Route index element={<V8Register />} />
              <Route path="company/:id" element={<V8Company />} />
              <Route path="market" element={<V8Market />} />
              <Route path="portfolio" element={<V8Portfolio />} />
              <Route path="portfolio/:address" element={<V8Portfolio />} />
              <Route path="rules" element={<V8Rules />} />
            </Route>
            {/* The old live screen's address. */}
            <Route path="live" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </SessionProvider>
    </LangProvider>
  );
}

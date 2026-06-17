/**
 * Main App component with routing and providers.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import { AppShell } from "./components/layout/AppShell";
import DashboardPage from "./pages/DashboardPage";
import ExtractionPage from "./pages/ExtractionPage";
import ProductsPage from "./pages/ProductsPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import DuplicatesPage from "./pages/DuplicatesPage";
import OdooProductsPage from "./pages/OdooProductsPage";
import OdooComparatorPage from "./pages/OdooComparatorPage";
import WebScraperPage from "./pages/WebScraperPage";

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/extract" element={<ExtractionPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/duplicates" element={<DuplicatesPage />} />
            <Route path="/odoo" element={<OdooProductsPage />} />
            <Route path="/odoo/products/:id" element={<OdooComparatorPage />} />
            <Route path="/scraper" element={<WebScraperPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>

        {/* Toast Notifications */}
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

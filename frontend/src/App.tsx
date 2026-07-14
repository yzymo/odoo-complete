/**
 * Main App component with routing and providers.
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import { AppShell } from "./components/layout/AppShell";
import { Spinner } from "./components/ui";

// Chargement à la demande : une route = un chunk (code-splitting).
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ExtractionPage = lazy(() => import("./pages/ExtractionPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const DuplicatesPage = lazy(() => import("./pages/DuplicatesPage"));
const OdooProductsPage = lazy(() => import("./pages/OdooProductsPage"));
const OdooComparatorPage = lazy(() => import("./pages/OdooComparatorPage"));
const WebScraperPage = lazy(() => import("./pages/WebScraperPage"));

/** Écran de transition affiché pendant le chargement d'une page. */
function RouteFallback() {
  return (
    <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-24 sm:px-6">
      <Spinner label="Chargement de la page…" />
    </div>
  );
}

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
          <Suspense fallback={<RouteFallback />}>
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
          </Suspense>
        </AppShell>

        {/* Toast Notifications */}
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

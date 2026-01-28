/**
 * Main App component with routing and providers.
 */

import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Package, Upload, Home } from 'lucide-react';

import ExtractionPage from './pages/ExtractionPage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';

// Create QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation */}
          <nav className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-2">
                  <Package className="h-8 w-8 text-blue-600" />
                  <h1 className="text-xl font-bold text-gray-900">
                    Product Catalog Extraction
                  </h1>
                </div>

                <div className="flex gap-4">
                  <NavLink to="/" icon={<Home />} label="Home" />
                  <NavLink to="/extract" icon={<Upload />} label="Extract" />
                  <NavLink to="/products" icon={<Package />} label="Products" />
                </div>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="py-6">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/extract" element={<ExtractionPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Footer */}
          <footer className="bg-white border-t border-gray-200 mt-12">
            <div className="max-w-7xl mx-auto px-6 py-4 text-center text-sm text-gray-600">
              <p>
                Product Catalog Extraction API v1.0.0 (MVP - Phase 1)
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Powered by FastAPI + React + OpenAI
              </p>
            </div>
          </footer>
        </div>

        {/* Toast Notifications */}
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function NavLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
    >
      <span className="h-5 w-5">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

function HomePage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Product Catalog Extraction
        </h1>
        <p className="text-xl text-gray-600">
          Extract product information from PDF documents using AI
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <FeatureCard
          icon={<Upload className="h-12 w-12 text-blue-600" />}
          title="Extract from PDF"
          description="Upload PDF files to automatically extract product information using OpenAI GPT"
          linkTo="/extract"
          linkText="Start Extraction"
        />

        <FeatureCard
          icon={<Package className="h-12 w-12 text-green-600" />}
          title="Manage Products"
          description="Browse, search, and validate extracted products before exporting to Odoo"
          linkTo="/products"
          linkText="View Products"
        />
      </div>

      <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">
          MVP Phase 1 Features
        </h2>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>✅ PDF text extraction</li>
          <li>✅ AI-powered product structuring with OpenAI GPT-3.5</li>
          <li>✅ MongoDB Atlas storage</li>
          <li>✅ Product search and filtering</li>
          <li>✅ Product validation workflow</li>
        </ul>
        <p className="mt-3 text-sm text-blue-700">
          Coming in Phase 2: OCR for scanned PDFs, DOCX/Image/Video support,
          background processing, deduplication, full directory processing
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  linkTo,
  linkText,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  linkTo: string;
  linkText: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
      <div className="mb-4">{icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{description}</p>
      <Link
        to={linkTo}
        className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        {linkText}
      </Link>
    </div>
  );
}

export default App;

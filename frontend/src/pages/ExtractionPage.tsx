/**
 * Extraction page for uploading PDF files or processing entire directories.
 * Supports long Windows paths and recursive directory scanning.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productApi } from '../api/products';
import { Upload, FileText, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExtractionPage() {
  const [mode, setMode] = useState<'file' | 'directory'>('directory');
  const [file, setFile] = useState<File | null>(null);
  const [directoryPath, setDirectoryPath] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Only PDF files are supported');
        return;
      }
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const extractionResult = await productApi.extractFromFile(file);
      setResult(extractionResult);
      toast.success(
        `Successfully extracted ${extractionResult.products_extracted} products!`
      );
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || err.message || 'Extraction failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectoryExtraction = async () => {
    if (!directoryPath.trim()) {
      toast.error('Please enter a directory path');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const extractionResult = await productApi.extractFromDirectory({
        source_directory: directoryPath,
        recursive: recursive,
      });
      setResult(extractionResult);
      toast.success(
        `Successfully extracted ${extractionResult.summary?.total_products_extracted || 0} products from ${extractionResult.summary?.processed_successfully || 0} files!`
      );
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.detail || err.message || 'Directory extraction failed';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Extract Products from PDF
        </h1>
        <p className="text-gray-600">
          Upload a PDF file or point to a directory containing PDF files.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMode('directory');
              setResult(null);
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors ${
              mode === 'directory'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FolderOpen className="h-5 w-5" />
            Extract from Directory
          </button>
          <button
            onClick={() => {
              setMode('file');
              setResult(null);
              setError(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md font-medium transition-colors ${
              mode === 'file'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Upload className="h-5 w-5" />
            Upload Single File
          </button>
        </div>
      </div>

      {/* Directory Mode */}
      {mode === 'directory' && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Directory Path
            </label>
            <input
              type="text"
              value={directoryPath}
              onChange={(e) => setDirectoryPath(e.target.value)}
              placeholder="C:\Users\user\Documents\product_pdfs"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter the full path to the directory containing PDF files. Supports long Windows paths.
            </p>
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Scan subdirectories recursively
              </span>
            </label>
          </div>

          <button
            onClick={handleDirectoryExtraction}
            disabled={!directoryPath.trim() || isProcessing}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Processing Directory...' : 'Extract from Directory'}
          </button>
        </div>
      )}

      {/* File Upload Mode */}
      {mode === 'file' && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />

            <label className="cursor-pointer">
              <span className="mt-2 block text-sm font-medium text-gray-900">
                {file ? file.name : 'Select a PDF file'}
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <span className="mt-2 block text-xs text-gray-500">
                Click to browse
              </span>
            </label>

            {file && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
                <FileText className="h-5 w-5" />
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
          </div>

          <button
            onClick={handleFileUpload}
            disabled={!file || isProcessing}
            className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Extract Products'}
          </button>
        </div>
      )}

      {/* Processing Status */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <div>
              <p className="font-medium text-blue-900">Processing...</p>
              <p className="text-sm text-blue-700">
                {mode === 'directory'
                  ? 'Scanning directory, extracting text, analyzing with GPT, and storing products. This may take several minutes for large directories.'
                  : 'Extracting text, analyzing with GPT, and storing products. This may take a minute.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Extraction Failed</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Result */}
      {result && !isProcessing && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Extraction Complete!</p>
              {mode === 'directory' && result.summary ? (
                <div className="text-sm text-green-700 mt-1">
                  <p>
                    Processed {result.summary.processed_successfully} of {result.summary.total_files} files
                  </p>
                  <p>
                    Extracted {result.summary.total_products_extracted} products total
                  </p>
                  {result.summary.failed > 0 && (
                    <p className="text-yellow-700">
                      ⚠️ {result.summary.failed} files failed
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-green-700">
                  {result.products_extracted} products extracted from {result.filename}
                </p>
              )}
            </div>
          </div>

          {/* Failed Files (if any) */}
          {result.failed_files && result.failed_files.length > 0 && (
            <div className="mt-4 mb-4">
              <h3 className="font-medium text-gray-900 mb-2">Failed Files:</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {result.failed_files.map((item: any, idx: number) => (
                  <div key={idx} className="bg-white border border-yellow-200 rounded p-2 text-xs">
                    <p className="font-medium text-gray-900">{item.file}</p>
                    <p className="text-gray-600">{item.error}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product List (Directory Mode) */}
          {result.products_by_file && Object.keys(result.products_by_file).length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium text-gray-900 mb-2">Extracted Products by File:</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {Object.entries(result.products_by_file).map(([filename, data]: [string, any]) => (
                  <div key={filename} className="bg-white border border-gray-200 rounded p-3">
                    <p className="font-medium text-gray-900 mb-1">{filename}</p>
                    <p className="text-xs text-gray-600 mb-2">{data.count} products</p>
                    {data.products.map((product: any) => (
                      <div
                        key={product.id}
                        className="text-sm text-blue-600 hover:underline cursor-pointer"
                        onClick={() => navigate(`/products/${product.id}`)}
                      >
                        {product.name || 'Unnamed'} {product.default_code && `(${product.default_code})`}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product List (Single File Mode) */}
          {result.products && result.products.length > 0 && !result.products_by_file && (
            <div className="mt-4">
              <h3 className="font-medium text-gray-900 mb-2">Extracted Products:</h3>
              <div className="space-y-2">
                {result.products.map((product: any) => (
                  <div
                    key={product.id}
                    className="bg-white border border-gray-200 rounded p-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <p className="font-medium text-gray-900">
                      {product.name || 'Unnamed Product'}
                    </p>
                    {product.default_code && (
                      <p className="text-sm text-gray-600">Code: {product.default_code}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/products')}
            className="mt-4 w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
          >
            View All Products
          </button>
        </div>
      )}
    </div>
  );
}

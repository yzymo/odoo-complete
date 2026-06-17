/**
 * Extraction page — upload PDFs or point to a server directory.
 * Directory extractions run in the background; the page polls MongoDB
 * for per-file progress so the user can track every step in real time.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  FolderOpen,
  FolderSearch,
  Clock,
  Loader2,
  XCircle,
  Files,
  PackageCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { productApi } from '../api/products';
import type { ExtractionFileStatus, ExtractionJob } from '../types/product';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';

// ── Phase metadata ─────────────────────────────────────────────────────────────

const PHASE_META: Record<string, { label: string; spin: boolean }> = {
  pending:     { label: 'En attente…',                   spin: false },
  processing:  { label: 'Extraction en cours…',          spin: true  },
  associating: { label: 'Association des images…',       spin: true  },
  done:        { label: 'Extraction terminée',           spin: false },
  failed:      { label: 'Échec de l\'extraction',        spin: false },
};

// ── File status row ────────────────────────────────────────────────────────────

const FILE_STATUS_CLS: Record<ExtractionFileStatus['status'], string> = {
  pending:    'bg-ivoire text-gris-400 border-gris-0',
  processing: 'bg-info-fond text-info border-info/20',
  done:       'bg-succes-fond text-succes border-succes/20',
  cached:     'bg-bleu-nuit/10 text-bleu-nuit border-bleu-nuit/20',
  skipped:    'bg-alerte-fond text-alerte border-alerte/20',
  failed:     'bg-erreur-fond text-erreur border-erreur/20',
};

const FILE_STATUS_LABEL: Record<ExtractionFileStatus['status'], string> = {
  pending:    'En attente',
  processing: 'Traitement',
  done:       'Terminé',
  cached:     'Depuis cache',
  skipped:    'Ignoré',
  failed:     'Erreur',
};

function FileStatusIcon({ status }: { readonly status: ExtractionFileStatus['status'] }) {
  if (status === 'done')       return <CheckCircle className="h-4 w-4 text-succes shrink-0" />;
  if (status === 'cached')     return <PackageCheck className="h-4 w-4 text-bleu-nuit shrink-0" />;
  if (status === 'failed')     return <XCircle     className="h-4 w-4 text-erreur shrink-0" />;
  if (status === 'skipped')    return <AlertCircle className="h-4 w-4 text-alerte shrink-0" />;
  if (status === 'processing') return <Loader2     className="h-4 w-4 text-bleu-petrole animate-spin shrink-0" />;
  return <Clock className="h-4 w-4 text-gris-400 shrink-0" />;
}

function FileStatusRow({ item, index }: { readonly item: ExtractionFileStatus; readonly index: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-ivoire transition-colors">
      <span className="shrink-0 w-6 h-6 rounded-full bg-ivoire text-gris-1 text-xs font-medium flex items-center justify-center">
        {index + 1}
      </span>
      <FileStatusIcon status={item.status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-bleu-nuit truncate">{item.filename}</p>
        {item.error && <p className="text-xs text-erreur mt-0.5 truncate">{item.error}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.product_count > 0 && (
          <span className="text-xs font-medium text-gris-1 bg-ivoire px-2 py-0.5 rounded-full">
            {item.product_count} produit{item.product_count > 1 ? 's' : ''}
          </span>
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${FILE_STATUS_CLS[item.status]}`}>
          {FILE_STATUS_LABEL[item.status]}
        </span>
      </div>
    </div>
  );
}

// ── Progress panel ─────────────────────────────────────────────────────────────

function ExtractionProgressPanel({ jobData }: { readonly jobData: ExtractionJob | undefined }) {
  if (!jobData) {
    return (
      <Card className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 text-bleu-petrole animate-spin" aria-label="Chargement…" role="status" />
      </Card>
    );
  }

  const phase     = jobData.phase ?? 'pending';
  const meta      = PHASE_META[phase] ?? PHASE_META.processing;
  const total     = jobData.total_files;
  const processed = jobData.processed_files;
  const failed    = jobData.failed_files_count;
  const cached    = jobData.cached_files_count;
  const pct       = total > 0 ? Math.round((processed / total) * 100) : 0;
  const statuses  = jobData.file_statuses ?? [];

  return (
    <Card className="overflow-hidden">
      {/* Phase header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-info-fond border-b border-info/20">
        <Loader2 className={`h-5 w-5 text-bleu-petrole shrink-0 ${meta.spin ? 'animate-spin' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-bleu-nuit text-sm">{meta.label}</p>
          {jobData.phase_detail && (
            <p className="text-xs text-info truncate mt-0.5">{jobData.phase_detail}</p>
          )}
        </div>
        {total > 0 && (
          <div className="flex items-center gap-3 shrink-0 text-sm">
            {processed > 0 && <span className="text-succes font-medium">{processed} ✓</span>}
            {cached  > 0 && <span className="text-bleu-nuit font-medium">{cached} ⚡</span>}
            {failed  > 0 && <span className="text-erreur font-medium">{failed} ✗</span>}
            <span className="text-info bg-info-fond px-3 py-1 rounded-full font-medium">
              {processed} / {total}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="h-1.5 bg-ivoire">
          <div
            className="h-full bg-bleu-petrole transition-all duration-700 ease-out rounded-r-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* File list */}
      {statuses.length > 0 ? (
        <div className="divide-y divide-gris-0 max-h-[55vh] overflow-y-auto">
          {statuses.map((item, i) => (
            <FileStatusRow key={item.filename} item={item} index={i} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gris-400">
          <Loader2 className="h-4 w-4 animate-spin text-bleu-petrole" />
          Initialisation de l'extraction…
        </div>
      )}

      {/* Live total */}
      {jobData.total_products > 0 && (
        <div className="px-5 py-2.5 bg-succes-fond border-t border-succes/20 text-xs text-succes font-medium">
          {jobData.total_products} produit{jobData.total_products > 1 ? 's' : ''} extrait{jobData.total_products > 1 ? 's' : ''} jusqu'à présent
        </div>
      )}
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

type DirectorySubMode = 'path' | 'browse';

export default function ExtractionPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'file' | 'directory'>('directory');
  const [dirSubMode, setDirSubMode] = useState<DirectorySubMode>('path');

  // Single-file state
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const singleFileRef = useRef<HTMLInputElement>(null);

  // Directory path state
  const [directoryPath, setDirectoryPath] = useState('');
  const [recursive, setRecursive] = useState(true);

  // Multi-file browse state (replaces directory browse)
  const [browseFiles, setBrowseFiles] = useState<File[]>([]);
  const browseFilesRef = useRef<HTMLInputElement>(null);

  // Job polling state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<ExtractionJob | null>(null);

  // ── Single-file extraction ──────────────────────────────────────────────────

  const { mutate: extractFile, isPending: isExtractingFile, error: fileError } = useMutation({
    mutationFn: () => productApi.extractFromFile(singleFile!),
    onSuccess: data => {
      toast.success(`${data.products_extracted} produit(s) extrait(s) !`);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? err.message ?? 'Erreur d\'extraction');
    },
  });

  // ── Directory (path mode) extraction ───────────────────────────────────────

  const { mutate: extractDirectory, isPending: isStartingDir } = useMutation({
    mutationFn: () => productApi.extractFromDirectory({ source_directory: directoryPath, recursive }),
    onSuccess: data => {
      setJobId(data.job_id);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? err.message ?? 'Erreur');
    },
  });

  // ── Multi-file upload extraction ────────────────────────────────────────────

  const { mutate: uploadAndExtract, isPending: isStartingUpload } = useMutation({
    mutationFn: () => productApi.uploadFiles(browseFiles),
    onSuccess: data => {
      setJobId(data.job_id);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail ?? err.message ?? 'Erreur lors de l\'importation');
    },
  });

  // ── Job polling ─────────────────────────────────────────────────────────────

  const { data: polledJob } = useQuery({
    queryKey: ['extraction-job', jobId],
    queryFn: () => productApi.getExtractionJob(jobId!),
    enabled: !!jobId,
    refetchInterval: q => {
      const s = q.state.data?.status;
      return s === 'done' || s === 'failed' ? false : 2000;
    },
  });

  useEffect(() => {
    if (!polledJob) return;
    if (polledJob.status === 'done' || polledJob.status === 'failed') {
      setJobResult(polledJob);
      setJobId(null);
      if (polledJob.status === 'done') {
        toast.success(`${polledJob.summary?.total_products_extracted ?? 0} produit(s) extrait(s) !`);
      } else {
        toast.error(`Extraction échouée : ${polledJob.error ?? 'Erreur inconnue'}`);
      }
    }
  }, [polledJob]);

  const isPolling = !!jobId;
  const isProcessing = isExtractingFile || isStartingDir || isStartingUpload || isPolling;

  const resetState = () => {
    setJobId(null);
    setJobResult(null);
    setSingleFile(null);
    setBrowseFiles([]);
  };

  const switchMode = (m: 'file' | 'directory') => {
    setMode(m);
    resetState();
  };

  // ── File handlers ───────────────────────────────────────────────────────────

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Seuls les fichiers PDF sont supportés');
      return;
    }
    setSingleFile(f);
    setJobResult(null);
  };

  const handleBrowseFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []).filter(f =>
      f.name.toLowerCase().endsWith('.pdf')
    );
    if (picked.length === 0) {
      toast.error('Aucun fichier PDF sélectionné');
      return;
    }
    setBrowseFiles(picked);
    setJobResult(null);
    toast.success(`${picked.length} fichier(s) PDF sélectionné(s)`);
  };

  const removeBrowseFile = (name: string) =>
    setBrowseFiles(prev => prev.filter(f => f.name !== name));

  // ── Submit handlers ─────────────────────────────────────────────────────────

  const handleSubmit = () => {
    resetState();
    if (mode === 'file') {
      if (!singleFile) { toast.error('Sélectionnez un fichier'); return; }
      extractFile();
    } else if (dirSubMode === 'path') {
      if (!directoryPath.trim()) { toast.error('Saisissez un chemin de répertoire'); return; }
      extractDirectory();
    } else {
      if (browseFiles.length === 0) { toast.error('Sélectionnez des fichiers PDF'); return; }
      uploadAndExtract();
    }
  };

  const canSubmit =
    !isProcessing && (
      (mode === 'file' && !!singleFile) ||
      (mode === 'directory' && dirSubMode === 'path' && !!directoryPath.trim()) ||
      (mode === 'directory' && dirSubMode === 'browse' && browseFiles.length > 0)
    );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Extraire des produits depuis PDF"
        subtitle="Importez un fichier PDF ou pointez vers un répertoire contenant des catalogues PDF."
        className="mb-0"
      />

      {/* Mode selector */}
      <Card className="p-4">
        <div className="flex gap-2">
          {(['directory', 'file'] as const).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-button font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole ${
                mode === m ? 'bg-bleu-nuit text-blanc' : 'bg-ivoire text-gris-1 hover:bg-gris-0'
              }`}
            >
              {m === 'directory' ? <FolderOpen className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
              {m === 'directory' ? 'Extraire depuis un répertoire' : 'Importer un fichier'}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Directory mode ───────────────────────────────────────────────────── */}
      {mode === 'directory' && (
        <Card className="overflow-hidden">
          {/* Sub-mode tabs */}
          <div className="flex border-b border-gris-0">
            {([
              { key: 'path',   label: 'Chemin serveur',     icon: <FolderSearch className="h-4 w-4" /> },
              { key: 'browse', label: 'Parcourir fichiers',  icon: <Files        className="h-4 w-4" /> },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => { setDirSubMode(tab.key); resetState(); }}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole ${
                  dirSubMode === tab.key
                    ? 'border-bleu-nuit text-bleu-nuit'
                    : 'border-transparent text-gris-1 hover:text-bleu-nuit'
                }`}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {dirSubMode === 'path' ? (
              <>
                <div>
                  <label htmlFor="dir-path" className="block text-sm font-medium text-gris-1 mb-1">
                    Chemin du répertoire
                  </label>
                  <input
                    id="dir-path"
                    type="text"
                    value={directoryPath}
                    onChange={e => setDirectoryPath(e.target.value)}
                    placeholder="C:\Users\user\Documents\product_pdfs"
                    className="w-full px-4 py-2 border border-gris-0 rounded-button focus:ring-2 focus:ring-bleu-petrole focus:border-transparent text-sm"
                  />
                  <p className="mt-1 text-xs text-gris-400">
                    Chemin complet vers le répertoire contenant les fichiers PDF (chemin serveur).
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={recursive}
                    onChange={e => setRecursive(e.target.checked)}
                    className="w-4 h-4 accent-bleu-nuit rounded"
                  />
                  <span className="text-sm text-gris-1">Scanner les sous-répertoires récursivement</span>
                </label>
              </>
            ) : (
              <>
                {/* Hidden multi-file input */}
                <input
                  ref={browseFilesRef}
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleBrowseFilesChange}
                  className="hidden"
                />

                {browseFiles.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => browseFilesRef.current?.click()}
                    className="w-full border-2 border-dashed border-gris-0 rounded-card p-10 flex flex-col items-center gap-3 hover:border-bleu-petrole hover:bg-ivoire transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole"
                  >
                    <Files className="h-12 w-12 text-gris-400 group-hover:text-bleu-petrole" />
                    <p className="text-sm font-medium text-gris-1 group-hover:text-bleu-nuit">
                      Cliquez pour parcourir et sélectionner des fichiers PDF
                    </p>
                    <p className="text-xs text-gris-400">Sélection multiple supportée</p>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gris-1">
                        {browseFiles.length} fichier(s) sélectionné(s)
                      </p>
                      <button
                        type="button"
                        onClick={() => browseFilesRef.current?.click()}
                        className="text-xs text-bleu-petrole hover:underline"
                      >
                        Modifier la sélection
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-gris-0 rounded-card divide-y divide-gris-0">
                      {browseFiles.map(f => (
                        <div key={f.name} className="flex items-center gap-3 px-3 py-2">
                          <FileText className="h-4 w-4 text-gris-400 shrink-0" />
                          <span className="text-sm text-gris-1 flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-gris-400 shrink-0">
                            {(f.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                          <button
                            type="button"
                            onClick={() => removeBrowseFile(f.name)}
                            aria-label={`Retirer ${f.name}`}
                            className="text-gris-400 hover:text-erreur shrink-0"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                'Traitement en cours…'
              ) : (
                <><FolderOpen className="h-4 w-4" /> Lancer l'extraction</>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Single-file mode ─────────────────────────────────────────────────── */}
      {mode === 'file' && (
        <Card className="p-6 space-y-4">
          {/* Hidden file input */}
          <input
            ref={singleFileRef}
            type="file"
            accept=".pdf"
            onChange={handleSingleFileChange}
            className="hidden"
          />

          {/* Drop zone / file display — use button so it's keyboard-accessible */}
          <button
            type="button"
            className={`w-full border-2 border-dashed rounded-card p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bleu-petrole ${
              singleFile
                ? 'border-bleu-petrole bg-ivoire'
                : 'border-gris-0 hover:border-bleu-petrole hover:bg-ivoire'
            }`}
            onClick={() => singleFileRef.current?.click()}
          >
            {singleFile ? (
              <>
                <FileText className="h-12 w-12 text-bleu-petrole" />
                <p className="font-medium text-bleu-nuit text-sm">{singleFile.name}</p>
                <p className="text-xs text-bleu-petrole">{(singleFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </>
            ) : (
              <>
                <Upload className="h-12 w-12 text-gris-400" />
                <p className="text-sm font-medium text-gris-1">Glissez un PDF ici ou cliquez pour parcourir</p>
                <p className="text-xs text-gris-400">Fichiers PDF uniquement</p>
              </>
            )}
          </button>

          {/* Explicit browse button */}
          <Button
            variant="secondary"
            type="button"
            onClick={() => singleFileRef.current?.click()}
            className="w-full"
          >
            <FileText className="h-4 w-4" />
            {singleFile ? 'Changer de fichier' : 'Parcourir les fichiers'}
          </Button>

          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={isExtractingFile}
            className="w-full"
          >
            {isExtractingFile ? (
              'Extraction en cours…'
            ) : (
              <><Upload className="h-4 w-4" /> Extraire les produits</>
            )}
          </Button>
        </Card>
      )}

      {/* ── Live progress panel (while job is running) ────────────────────────── */}
      {isPolling && (
        <ExtractionProgressPanel jobData={polledJob} />
      )}

      {/* ── Error (single file) ──────────────────────────────────────────────── */}
      {fileError && !isProcessing && (
        <div className="bg-erreur-fond border border-erreur/30 rounded-card p-4 flex gap-3" role="alert">
          <AlertCircle className="h-5 w-5 text-erreur shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-bleu-nuit text-sm">Extraction échouée</p>
            <p className="text-sm text-erreur mt-0.5">
              {(fileError as unknown as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fileError.message}
            </p>
          </div>
        </div>
      )}

      {/* ── Results (single file) ────────────────────────────────────────────── */}
      {!isProcessing && mode === 'file' && !isExtractingFile && (
        <SingleFileResultPanel />
      )}

      {/* ── Results (job) ────────────────────────────────────────────────────── */}
      {jobResult && !isPolling && (
        <JobResultPanel job={jobResult} navigate={navigate} />
      )}
    </div>
  );
}

// ── Result panels ──────────────────────────────────────────────────────────────

function SingleFileResultPanel() {
  return null; // single-file results are shown via toast; products viewable in /products
}

function JobResultPanel({
  job,
  navigate,
}: {
  readonly job: ExtractionJob;
  readonly navigate: (path: string) => void;
}) {
  const s = job.summary;
  const isSuccess = job.status === 'done';

  return (
    <div className={`rounded-card border p-6 ${isSuccess ? 'bg-succes-fond border-succes/30' : 'bg-erreur-fond border-erreur/30'}`}>
      <div className="flex items-start gap-3 mb-4">
        {isSuccess
          ? <CheckCircle className="h-6 w-6 text-succes shrink-0" />
          : <XCircle     className="h-6 w-6 text-erreur shrink-0" />}
        <div>
          <p className={`font-semibold ${isSuccess ? 'text-succes' : 'text-erreur'}`}>
            {isSuccess ? 'Extraction terminée !' : 'Extraction échouée'}
          </p>
          {isSuccess && s && (
            <div className="text-sm text-succes mt-1 space-y-0.5">
              <p>{s.total_products_extracted} produit(s) extrait(s) au total</p>
              <p>
                {s.processed_successfully} traité(s)
                {s.cached > 0 && `, ${s.cached} depuis cache`}
                {s.failed > 0 && `, ${s.failed} échec(s)`}
              </p>
              {(s.images_processed ?? 0) > 0 && (
                <p>{s.images_associated} image(s) associée(s)</p>
              )}
            </div>
          )}
          {!isSuccess && <p className="text-sm text-erreur mt-1">{job.error}</p>}
        </div>
      </div>

      {/* Per-file summary */}
      {job.file_statuses && job.file_statuses.length > 0 && (
        <div className="mb-4 max-h-56 overflow-y-auto border border-gris-0 rounded-card bg-blanc divide-y divide-gris-0">
          {job.file_statuses.map((f, i) => (
            <FileStatusRow key={f.filename} item={f} index={i} />
          ))}
        </div>
      )}

      <Button
        variant="primary"
        size="sm"
        onClick={() => navigate('/products')}
        className="w-full"
      >
        Voir tous les produits
      </Button>
    </div>
  );
}

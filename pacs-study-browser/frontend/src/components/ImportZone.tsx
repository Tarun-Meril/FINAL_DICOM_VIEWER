import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, FileDigit, BarChart3, Database } from 'lucide-react';

interface ImportZoneProps {
  onUpload: (files: File[]) => Promise<{ success: boolean; importedCount: number; report?: any; errors?: string[]; duplicates?: string[] }>;
}

export const ImportZone: React.FC<ImportZoneProps> = ({ onUpload }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ 
    success: boolean; 
    count: number; 
    errors?: string[]; 
    duplicates?: string[]; 
  } | null>(null);
  const [activeReport, setActiveReport] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const uploadInBatches = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) {
      alert('No files found to upload.');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);
    setUploadProgress(0);
    setActiveReport(null);

    const batchSize = 10;
    let success = true;
    let importedCount = 0;
    const allErrors: string[] = [];
    const allDuplicates: string[] = [];
    const aggregatedReport = {
      totalDiscovered: filesToUpload.length,
      validDicomCount: 0,
      invalidCount: 0,
      missingMetadataCount: 0,
      duplicateUidCount: 0,
      studyCount: 0,
      seriesCount: 0,
      instanceCount: 0
    };

    try {
      for (let i = 0; i < filesToUpload.length; i += batchSize) {
        const batch = filesToUpload.slice(i, i + batchSize);
        setUploadProgress(Math.round((i / filesToUpload.length) * 100));

        const result = await onUpload(batch);
        
        if (result.success) {
          importedCount += result.importedCount;
          if (result.report) {
            aggregatedReport.validDicomCount += result.report.validDicomCount;
            aggregatedReport.invalidCount += result.report.invalidCount;
            aggregatedReport.missingMetadataCount += result.report.missingMetadataCount;
            aggregatedReport.duplicateUidCount += result.report.duplicateUidCount;
            aggregatedReport.studyCount = result.report.studyCount;
            aggregatedReport.seriesCount = result.report.seriesCount;
            aggregatedReport.instanceCount = result.report.instanceCount;
          }
          if (result.errors) {
            allErrors.push(...result.errors);
          }
          if (result.duplicates) {
            allDuplicates.push(...result.duplicates);
          }
        } else {
          success = false;
          allErrors.push(`Batch starting at index ${i} failed.`);
        }
      }

      setUploadProgress(100);
      setUploadResult({
        success: success && allErrors.length === 0,
        count: importedCount,
        errors: allErrors,
        duplicates: allDuplicates
      });
      setActiveReport(aggregatedReport);

    } catch (err: any) {
      setUploadResult({
        success: false,
        count: importedCount,
        errors: [err.message || 'An error occurred during upload. Please check connection.']
      });
    } finally {
      setIsUploading(false);
    }
  };

  const processFiles = async (files: FileList) => {
    // Keep files that have size > 132
    const allFiles = Array.from(files).filter(f => f.size > 132);
    await uploadInBatches(allFiles);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.items) {
      setIsUploading(true);
      const fileEntries: File[] = [];

      const traverseEntry = async (entry: any) => {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => entry.file(resolve));
          fileEntries.push(file);
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const readEntries = async (): Promise<any[]> => {
            return new Promise((resolve) => reader.readEntries(resolve));
          };
          let entries = await readEntries();
          while (entries.length > 0) {
            for (const subEntry of entries) {
              await traverseEntry(subEntry);
            }
            entries = await readEntries();
          }
        }
      };

      const promises = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            promises.push(traverseEntry(entry));
          }
        }
      }
      
      await Promise.all(promises);
      await uploadInBatches(fileEntries);
    } else if (e.dataTransfer.files) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const triggerFileSelect = (folderMode: boolean) => {
    if (fileInputRef.current) {
      if (folderMode) {
        fileInputRef.current.setAttribute('webkitdirectory', '');
        fileInputRef.current.setAttribute('directory', '');
      } else {
        fileInputRef.current.removeAttribute('webkitdirectory');
        fileInputRef.current.removeAttribute('directory');
      }
      fileInputRef.current.click();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* 1. Drag & Drop Zone Area */}
      <div
        className={`dropzone ${isDragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        style={{ cursor: isUploading ? 'not-allowed' : 'pointer' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        
        <UploadCloud size={48} className="dropzone-icon" />
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>
            {isUploading ? `Uploading & Indexing DICOM Stack... (${uploadProgress}%)` : 'Drag & Drop DICOM Files or Folders'}
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            or click below to browse from your computer
          </p>
        </div>

        {isUploading && (
          <div style={{ width: '80%', maxWidth: '400px', height: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden', marginTop: '12px' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'var(--color-accent)', transition: 'width 0.2s ease' }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }} onClick={(e) => e.stopPropagation()}>
          <button 
            type="button" 
            className="pacs-btn pacs-btn-sky" 
            disabled={isUploading}
            onClick={() => triggerFileSelect(false)}
          >
            Browse Files
          </button>
          <button 
            type="button" 
            className="pacs-btn pacs-btn-outline" 
            disabled={isUploading}
            onClick={() => triggerFileSelect(true)}
          >
            Browse Folder
          </button>
        </div>
      </div>

      {/* 2. Analytical Statistics Audit Report & Error Logger (Phase 1) */}
      {activeReport && (
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '3px solid var(--color-accent)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart3 size={16} style={{ color: 'var(--color-accent)' }} />
            DICOM Import Analysis Report
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
            
            {/* Discovered */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Discovered</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>{activeReport.totalDiscovered}</div>
            </div>

            {/* Valid DICOM */}
            <div style={{ background: 'rgba(16, 185, 129, 0.03)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-success)', textTransform: 'uppercase', fontWeight: 600 }}>Valid DICOM</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>{activeReport.validDicomCount}</div>
            </div>

            {/* Invalid Files */}
            <div style={{ background: activeReport.invalidCount > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '4px', border: activeReport.invalidCount > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '10px', color: activeReport.invalidCount > 0 ? 'var(--color-error)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Invalid</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: activeReport.invalidCount > 0 ? 'var(--color-error)' : 'var(--text-primary)', marginTop: '4px' }}>{activeReport.invalidCount}</div>
            </div>

            {/* Duplicate SOP UID */}
            <div style={{ background: activeReport.duplicateUidCount > 0 ? 'rgba(245, 158, 11, 0.05)' : 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '4px', border: activeReport.duplicateUidCount > 0 ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '10px', color: activeReport.duplicateUidCount > 0 ? 'var(--color-warning)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Duplicates</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: activeReport.duplicateUidCount > 0 ? 'var(--color-warning)' : 'var(--text-primary)', marginTop: '4px' }}>{activeReport.duplicateUidCount}</div>
            </div>

            {/* Missing Metadata */}
            <div style={{ background: activeReport.missingMetadataCount > 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.02)', padding: '10px', borderRadius: '4px', border: activeReport.missingMetadataCount > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '10px', color: activeReport.missingMetadataCount > 0 ? 'var(--color-error)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Missing Tag</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: activeReport.missingMetadataCount > 0 ? 'var(--color-error)' : 'var(--text-primary)', marginTop: '4px' }}>{activeReport.missingMetadataCount}</div>
            </div>

          </div>

          {/* DB totals info */}
          <div style={{ display: 'flex', gap: '20px', fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', padding: '8px 12px', borderRadius: '4px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Database size={12} /> Database Totals:
            </span>
            <span><strong>{activeReport.studyCount}</strong> Studies</span>
            <span>•</span>
            <span><strong>{activeReport.seriesCount}</strong> Series</span>
            <span>•</span>
            <span><strong>{activeReport.instanceCount}</strong> Instances (Slices)</span>
          </div>
        </div>
      )}

      {/* 3. Upload response outcomes */}
      {uploadResult && (
        <div className="glass-card" style={{
          borderColor: uploadResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          background: uploadResult.success ? 'rgba(16, 185, 129, 0.02)' : 'rgba(239, 68, 68, 0.02)'
        }}>
          {uploadResult.success ? (
            <div style={{ display: 'flex', gap: '12px' }}>
              <CheckCircle2 size={24} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              <div>
                <h4 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Import Completed Successfully</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Successfully imported <strong>{uploadResult.count}</strong> valid DICOM slices into the PACS archive.
                  {uploadResult.duplicates && uploadResult.duplicates.length > 0 && (
                    <span> (skipped <strong>{uploadResult.duplicates.length}</strong> duplicate files)</span>
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px' }}>
              <AlertCircle size={24} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
              <div>
                <h4 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Import Completed with Warnings/Errors</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Imported <strong>{uploadResult.count}</strong> files, but some files were skipped or failed. See error log below.
                </p>
              </div>
            </div>
          )}

          {uploadResult.errors && uploadResult.errors.length > 0 && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
              <h5 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Failure & Error Log:
              </h5>
              <div style={{ maxHeight: '160px', overflowY: 'auto', paddingRight: '8px' }}>
                <ul style={{ listStyleType: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {uploadResult.errors.slice(0, 100).map((err, idx) => (
                    <li key={idx} style={{ fontSize: '12px', color: 'rgba(239, 68, 68, 0.85)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <FileDigit size={12} style={{ flexShrink: 0 }} />
                      {err}
                    </li>
                  ))}
                  {uploadResult.errors.length > 100 && (
                    <li style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                      ... and {uploadResult.errors.length - 100} more logs.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {uploadResult.duplicates && uploadResult.duplicates.length > 0 && (
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
              <h5 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Skipped Duplicates Log:
              </h5>
              <div style={{ maxHeight: '160px', overflowY: 'auto', paddingRight: '8px' }}>
                <ul style={{ listStyleType: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {uploadResult.duplicates.slice(0, 100).map((err, idx) => (
                    <li key={idx} style={{ fontSize: '12px', color: 'rgba(245, 158, 11, 0.85)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <FileDigit size={12} style={{ flexShrink: 0 }} />
                      {err}
                    </li>
                  ))}
                  {uploadResult.duplicates.length > 100 && (
                    <li style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                      ... and {uploadResult.duplicates.length - 100} more duplicates.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default ImportZone;

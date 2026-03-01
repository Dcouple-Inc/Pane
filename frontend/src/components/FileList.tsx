import React, { memo } from 'react';
import { FileText, FileCode, FileImage, File, Trash2, ExternalLink } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { cn } from '../utils/cn';

interface FileInfo {
  path: string;
  type: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  isBinary?: boolean;
}

interface FileListProps {
  files: FileInfo[];
  onFileClick: (filePath: string, index: number) => void;
  onFileDelete?: (filePath: string) => void;
  onOpenInEditor?: (filePath: string) => void;
  selectedFile?: string;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconClass = "w-4 h-4 text-text-tertiary";
  
  if (!ext) return <File className={iconClass} />;
  
  // Code files
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'go', 'rs', 'php', 'rb', 'swift'].includes(ext)) {
    return <FileCode className={iconClass} />;
  }
  
  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return <FileImage className={iconClass} />;
  }
  
  // Text/doc files
  if (['txt', 'md', 'mdx', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini'].includes(ext)) {
    return <FileText className={iconClass} />;
  }
  
  return <File className={iconClass} />;
};

const getTypeColor = (type: FileInfo['type']) => {
  switch (type) {
    case 'added':
      return 'text-status-success';
    case 'deleted':
      return 'text-status-error';
    case 'modified':
      return 'text-interactive';
    case 'renamed':
      return 'text-interactive';
    default:
      return 'text-text-tertiary';
  }
};

const getTypeLabel = (type: FileInfo['type']) => {
  switch (type) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'modified':
      return 'M';
    case 'renamed':
      return 'R';
    default:
      return '?';
  }
};

export const FileList: React.FC<FileListProps> = memo(({ files, onFileClick, onFileDelete, onOpenInEditor, selectedFile }) => {
  if (files.length === 0) {
    return (
      <div className="p-4 text-center text-text-tertiary text-sm">
        No files changed
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-border-secondary bg-bg-secondary">
        <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
          Files <span className="text-text-muted">{files.length}</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {files.map((file, index) => (
          <div
            key={`${file.path}-${index}`}
            className={cn(
              'w-full px-3 py-1 hover:bg-bg-hover transition-colors flex items-center justify-between group',
              selectedFile === file.path && 'bg-bg-accent'
            )}
          >
            <button
              onClick={() => onFileClick(file.path, index)}
              className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
            >
              <span className={`font-mono text-[10px] font-bold ${getTypeColor(file.type)} flex-shrink-0`}>
                {getTypeLabel(file.type)}
              </span>
              {getFileIcon(file.path)}
              <span className="text-xs text-text-primary truncate" title={file.path}>
                {file.path}
              </span>
            </button>

            <div className="flex items-center gap-1.5 ml-1.5 flex-shrink-0">
              {file.additions > 0 && (
                <span className="text-[10px] text-status-success font-semibold">
                  +{file.additions}
                </span>
              )}
              {file.deletions > 0 && (
                <span className="text-[10px] text-status-error font-semibold">
                  -{file.deletions}
                </span>
              )}
              {onOpenInEditor && file.type !== 'deleted' && (
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenInEditor(file.path);
                  }}
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity !p-0.5"
                  aria-label="Open in Editor"
                  title="Open in Editor"
                  icon={<ExternalLink className="w-3 h-3" />}
                />
              )}
              {onFileDelete && (
                <IconButton
                  onClick={(e) => {
                    e.stopPropagation();
                    if (file.type !== 'deleted' && window.confirm(`Are you sure you want to delete ${file.path}?`)) {
                      onFileDelete(file.path);
                    }
                  }}
                  disabled={file.type === 'deleted'}
                  variant={file.type === 'deleted' ? 'ghost' : 'danger'}
                  size="sm"
                  className={cn(
                    'opacity-0 group-hover:opacity-100 transition-opacity !p-0.5',
                    file.type === 'deleted' && 'cursor-not-allowed !text-text-disabled'
                  )}
                  aria-label={file.type === 'deleted' ? 'File already deleted' : 'Delete file'}
                  title={file.type === 'deleted' ? 'File already deleted' : 'Delete file'}
                  icon={<Trash2 className="w-3 h-3" />}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

FileList.displayName = 'FileList';
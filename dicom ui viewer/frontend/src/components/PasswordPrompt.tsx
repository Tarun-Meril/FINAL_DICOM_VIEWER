import React, { useState, useEffect, useRef } from 'react';
import { Key, ShieldAlert, X } from 'lucide-react';

interface PasswordPromptProps {
  onConfirm: (password: string) => void;
  onCancel: () => void;
  errorMsg?: string;
}

export default function PasswordPrompt({ onConfirm, onCancel, errorMsg }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) return;
    onConfirm(password);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 bg-black/85 z-[1000] flex items-center justify-center p-4 backdrop-blur-xs select-none">
      <form 
        onSubmit={handleSubmit}
        className="bg-[#1C1F26] border border-[#353C48] rounded-[6px] shadow-2xl max-w-sm w-full flex flex-col font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#17191E] border-b border-[#353C48]">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Key className="w-4 h-4 text-[#3B82F6]" />
            Password Protected
          </h3>
          <button 
            type="button"
            onClick={onCancel} 
            title="Cancel"
            className="text-[#8B949E] hover:text-white transition-colors cursor-pointer outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          <p className="text-[12px] text-[#C9D1D9] leading-relaxed">
            This shared study is secured. Please enter the password provided by the study owner to gain view access.
          </p>

          {errorMsg && (
            <div className="bg-[#3D1418] border border-[#6E1E24] rounded-[4px] p-2 flex gap-2 items-center text-[11px] text-[#FCA5A5]">
              <ShieldAlert className="w-4 h-4 shrink-0 text-[#EF4444]" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <input
              ref={inputRef}
              type="password"
              placeholder="Enter security password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-[#252B34] border border-[#353C48] rounded-[4px] text-[12px] text-white p-2.5 outline-none focus:border-[#3B82F6] transition-subtle"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 bg-[#17191E] border-t border-[#353C48] text-[12px] font-semibold">
          <button
            type="submit"
            disabled={!password.trim()}
            className="px-4 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:bg-[#3b82f6]/40 disabled:pointer-events-none text-white rounded cursor-pointer transition-subtle outline-none"
          >
            Authenticate
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 bg-[#252B34] border border-[#353C48] hover:bg-[#2C333E] text-[#C9D1D9] hover:text-white rounded cursor-pointer transition-subtle outline-none"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

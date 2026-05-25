import React from 'react';
import { X, CheckCircle2 } from 'lucide-react';

export default function SettingsModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1e2130] border border-slate-700 rounded-xl w-[440px] shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-800">
          <div className="font-semibold text-slate-100 text-base">Settings</div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 p-1 rounded hover:bg-slate-800 transition"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 bg-emerald-900/30 border border-emerald-700/40 rounded-lg px-4 py-3">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-300 leading-relaxed">
              Authentication and environment connections are managed by
              <span className="font-semibold text-emerald-300"> Power Platform ToolBox</span>.
              No additional credentials are needed here.
            </div>
          </div>

          <div className="text-[11px] text-slate-500 leading-relaxed">
            To switch environments, use the connection manager in the PPTB sidebar.
            CrossMigrate will automatically use the active connection.
          </div>
        </div>

        <div className="flex justify-end px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

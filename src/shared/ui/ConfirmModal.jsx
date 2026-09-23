

export function ConfirmModal({ title, message, detail, onConfirm, onCancel, confirmLabel = 'ยืนยัน', danger = false }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-6 py-4 border-b ${danger ? 'bg-rose-50 border-rose-100' : 'bg-amber-50 border-amber-100'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{danger ? '🗑️' : '⚠️'}</span>
            <h3 className={`font-bold text-base ${danger ? 'text-rose-800' : 'text-amber-800'}`}>{title}</h3>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-slate-700 text-sm leading-relaxed">{message}</p>
          {detail && <p className="text-xs text-slate-500 mt-2 leading-relaxed">{detail}</p>}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium transition">
            ยกเลิก
          </button>
          <button onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

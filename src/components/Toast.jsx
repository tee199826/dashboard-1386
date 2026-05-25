import { useEffect } from 'react'
import { Check, XCircle, X } from 'lucide-react'

function SuccessModal({ message, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs text-center overflow-hidden">
        {/* Icon */}
        <div className="flex flex-col items-center px-8 pt-10 pb-6">
          <div className="w-28 h-28 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Check size={44} strokeWidth={3.5} className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">สำเร็จ!</h2>
          <p className="text-slate-500 text-sm leading-relaxed">{message}</p>
        </div>
        {/* Button */}
        <div className="px-8 pb-8">
          <button
            onClick={onClose}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-semibold rounded-xl text-base transition-all">
            ตกลง
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorToast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl max-w-sm bg-rose-600 text-white">
      <XCircle size={20} className="flex-shrink-0 mt-0.5" />
      <span className="flex-1 text-sm font-medium leading-relaxed">{message}</span>
      <button onClick={onClose} className="flex-shrink-0 p-1 hover:bg-white/20 rounded-lg transition">
        <X size={16} />
      </button>
    </div>
  )
}

export default function Toast({ message, type = 'success', onClose }) {
  if (type === 'success') return <SuccessModal message={message} onClose={onClose} />
  return <ErrorToast message={message} onClose={onClose} />
}

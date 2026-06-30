// Pill dropdown filter — ใช้ร่วมกันทุก section ของหน้า /bkn
// variant: 'white' (เส้นขอบ) · 'blue' / 'pink' / 'violet' (สีทึบ)
const VARIANTS = {
  white: { box: 'bg-white border-slate-200 text-slate-700', sub: 'text-slate-400', sel: 'text-slate-700' },
  blue:  { box: 'bg-blue-600 border-blue-600 text-white',     sub: 'text-white/70', sel: 'text-white' },
  pink:  { box: 'bg-pink-500 border-pink-500 text-white',     sub: 'text-white/70', sel: 'text-white' },
  violet:{ box: 'bg-violet-600 border-violet-600 text-white', sub: 'text-white/70', sel: 'text-white' },
}

export default function FilterPill({ icon, label, value, onChange, options, variant = 'white', disabled = false, title }) {
  const v = VARIANTS[variant] || VARIANTS.white
  return (
    <div title={title}
      className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 shadow-sm ${v.box} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
      {icon}
      {label && <span className={`text-xs ${v.sub}`}>{label}</span>}
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className={`text-xs font-semibold bg-transparent outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${v.sel}`}>
        {options.map(([val, l]) => (
          <option key={val} value={val} className="text-slate-700">{l}</option>
        ))}
      </select>
    </div>
  )
}

export default function StatCard({ title, value, sub, accent = false }) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${accent ? 'border-blue-200' : 'border-gray-200'}`}>
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${accent ? 'text-blue-600' : 'text-gray-800'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

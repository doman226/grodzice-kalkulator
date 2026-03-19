export default function SalePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Kalkulator Sprzedaży</h2>
      <p className="text-gray-500 text-sm max-w-sm">
        Moduł sprzedaży grodzic stalowych jest w przygotowaniu.
        Baza danych i cennik zostały skonfigurowane — wkrótce pojawi się pełny interfejs.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-4 py-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-green-700 text-xs font-medium">Baza danych gotowa – etap 2.1 ✓</span>
      </div>
    </div>
  );
}

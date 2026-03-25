import { useState, useRef, useEffect } from 'react';
import type { Client } from '../types/index';

interface Props {
  clients: Client[];
  value: string;           // clientId
  onChange: (id: string) => void;
  required?: boolean;
}

export default function ClientSearchInput({ clients, value, onChange, required }: Props) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const containerRef          = useRef<HTMLDivElement>(null);

  // Wyświetlana nazwa dla aktualnie wybranego klienta
  const selectedClient = clients.find(c => c.id === value);
  const displayName = selectedClient
    ? `${selectedClient.name} (${selectedClient.country === 'PL' ? selectedClient.nip : selectedClient.vat_number})`
    : '';

  // Filtrowanie listy po query
  const filtered = query.trim().length === 0
    ? clients
    : clients.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.nip ?? '').includes(query) ||
        (c.vat_number ?? '').includes(query)
      );

  // Zamknij dropdown przy kliknięciu poza
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(client: Client) {
    onChange(client.id);
    setQuery('');
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    onChange(''); // wyczyść zaznaczenie przy wpisywaniu
    setOpen(true);
  }

  function handleFocus() {
    setOpen(true);
  }

  const inputValue = open ? query : displayName;

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        required={required}
        placeholder="— wpisz nazwę lub NIP klienta —"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">Brak wyników</div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => handleSelect(c)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${c.id === value ? 'bg-blue-100 font-medium' : ''}`}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-gray-400 ml-2 text-xs">
                  {c.country === 'PL' ? c.nip : c.vat_number} · {c.country}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

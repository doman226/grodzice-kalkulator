import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Brak zmiennych środowiskowych Supabase.\n' +
    'Utwórz plik .env.local z VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface NipData {
  name: string;
  nip: string;
  regon: string | null;
  krs: string | null;
  address: string;
  postal_code: string;
  city: string;
}

/** Centralna funkcja pobierania danych firmy po NIP (GUS/MF).
 *  Jeden punkt dostępu – klucz Supabase czytany tylko tutaj. */
export async function fetchNipData(nip: string): Promise<NipData> {
  const res = await fetch(`${supabaseUrl}/functions/v1/nip-lookup`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nip }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? 'Nie znaleziono firmy.');
  return data as NipData;
}

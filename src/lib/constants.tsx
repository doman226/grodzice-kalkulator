/**
 * constants.tsx — centralne stałe współdzielone w całej aplikacji.
 *
 * SALES_REPS: dodawanie/usuwanie handlowca wymaga edycji tylko tutaj.
 * CountryOptions: lista krajów europejskich w jednym miejscu.
 */

// ─── Handlowcy ────────────────────────────────────────────────────────────────

export const SALES_REPS: { name: string; phone: string }[] = [
  { name: 'Szymon Sobczak',    phone: '579 376 107' },
  { name: 'Mateusz Cieślicki', phone: '579 141 243' },
  { name: 'Marzena Sobczak',   phone: '579 241 508' },
  { name: 'Piotr Domański',    phone: '729 393 743' },
];

// ─── Lista krajów (JSX) ───────────────────────────────────────────────────────

/**
 * Gotowe opcje do umieszczenia wewnątrz <select> dla pola "kraj".
 * Polska na górze, poniżej separator i kraje europejskie alfabetycznie,
 * na końcu opcja "Inne".
 */
export function CountryOptions() {
  return (
    <>
      <option value="PL">🇵🇱 Polska (PL)</option>
      <optgroup label="─────────────────">
        <option value="AL">🇦🇱 Albania (AL)</option>
        <option value="AD">🇦🇩 Andorra (AD)</option>
        <option value="AT">🇦🇹 Austria (AT)</option>
        <option value="BY">🇧🇾 Białoruś (BY)</option>
        <option value="BE">🇧🇪 Belgia (BE)</option>
        <option value="BA">🇧🇦 Bośnia i Herceg. (BA)</option>
        <option value="BG">🇧🇬 Bułgaria (BG)</option>
        <option value="ME">🇲🇪 Czarnogóra (ME)</option>
        <option value="CZ">🇨🇿 Czechy (CZ)</option>
        <option value="DK">🇩🇰 Dania (DK)</option>
        <option value="EE">🇪🇪 Estonia (EE)</option>
        <option value="FI">🇫🇮 Finlandia (FI)</option>
        <option value="FR">🇫🇷 Francja (FR)</option>
        <option value="GR">🇬🇷 Grecja (GR)</option>
        <option value="ES">🇪🇸 Hiszpania (ES)</option>
        <option value="NL">🇳🇱 Holandia (NL)</option>
        <option value="IE">🇮🇪 Irlandia (IE)</option>
        <option value="IS">🇮🇸 Islandia (IS)</option>
        <option value="XK">🇽🇰 Kosowo (XK)</option>
        <option value="LI">🇱🇮 Liechtenstein (LI)</option>
        <option value="LT">🇱🇹 Litwa (LT)</option>
        <option value="LU">🇱🇺 Luksemburg (LU)</option>
        <option value="LV">🇱🇻 Łotwa (LV)</option>
        <option value="MK">🇲🇰 Macedonia Płn. (MK)</option>
        <option value="MT">🇲🇹 Malta (MT)</option>
        <option value="MD">🇲🇩 Mołdawia (MD)</option>
        <option value="MC">🇲🇨 Monako (MC)</option>
        <option value="DE">🇩🇪 Niemcy (DE)</option>
        <option value="NO">🇳🇴 Norwegia (NO)</option>
        <option value="PT">🇵🇹 Portugalia (PT)</option>
        <option value="RU">🇷🇺 Rosja (RU)</option>
        <option value="RO">🇷🇴 Rumunia (RO)</option>
        <option value="SM">🇸🇲 San Marino (SM)</option>
        <option value="RS">🇷🇸 Serbia (RS)</option>
        <option value="SK">🇸🇰 Słowacja (SK)</option>
        <option value="SI">🇸🇮 Słowenia (SI)</option>
        <option value="CH">🇨🇭 Szwajcaria (CH)</option>
        <option value="SE">🇸🇪 Szwecja (SE)</option>
        <option value="UA">🇺🇦 Ukraina (UA)</option>
        <option value="HU">🇭🇺 Węgry (HU)</option>
        <option value="GB">🇬🇧 Wielka Brytania (GB)</option>
        <option value="IT">🇮🇹 Włochy (IT)</option>
        <option value="HR">🇭🇷 Chorwacja (HR)</option>
        <option value="CY">🇨🇾 Cypr (CY)</option>
      </optgroup>
      <option value="OTHER">Inne (spoza Europy)</option>
    </>
  );
}

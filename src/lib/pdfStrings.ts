// ─── PDF Translations ────────────────────────────────────────────────────────
// Terminology source: Intra B.V. Catalogue 2025 (EN) + EN 10248 / ArcelorMittal

export type PdfLang = 'pl' | 'en';

// ─── Tłumaczenie lokalizacji magazynu (delivery_from / transport_from) ─────────
// Wartość jest free-textem z bazy (domyślnie PL, np. "Magazyn Intra B.V.").
// Etykieta w PDF jest tłumaczona, ale sama wartość była renderowana surowo —
// stąd polskie "Magazyn" wyciekało do angielskiego PDF (linia "Pick-up from:").
// Adresy (np. "Cieśle 42, 56400, PL") przechodzą bez zmian — tłumaczone są tylko
// znane polskie etykiety oraz samodzielne słowo "Magazyn".
const WAREHOUSE_LOCATION_EN: Record<string, string> = {
  'Magazyn Intra B.V.': 'Intra B.V. warehouse',
};

export function translateWarehouseLocation(
  value: string | null | undefined,
  lang: PdfLang,
): string {
  if (!value) return '';
  if (lang !== 'en') return value;
  const exact = WAREHOUSE_LOCATION_EN[value.trim()];
  if (exact) return exact;
  // Fallback: zamień samodzielne polskie słowo "Magazyn" na "Warehouse"
  return value.replace(/\bMagazyn\b/g, 'Warehouse');
}

export interface PdfStrings {
  // Document
  docTitle:        (offerNo: string) => string;
  docLanguage:     string;
  offerTitle:      string;

  // Meta block
  date:            string;
  offerNumber:     string;
  salesRep:        string;
  phone:           string;
  exchangeRate:    string;
  customerLabel:   string;
  taskLabel:   string;
  vatLabel:        (country: string) => string;

  // Greeting & intro
  greeting:        string;
  intro:           string;

  // Items table headers
  thProfile:       string;
  thSteelGrade:    string;
  thQty:           string;
  thLength:        string;
  thKgPerM:        string;
  thMass:          string;
  thPricePerT:     string;
  thWallArea:      string;   // Pow. ścianki [m²]
  thPricePerM2:    string;   // Cena [X/m²]
  thLockMassT:     string;   // Masa [t] – kolumna zamków

  // Table body units / labels
  unitPairs:       string;
  unitPcs:         string;
  totalRow:        string;

  // Price box
  priceLabel:      string;
  netSuffix:       string;
  pricePerTon:     (unit: string) => string;
  pricePerM2:      (unit: string) => string;

  // Transport section
  sectionTransport:   string;
  labelDelivery:      string;
  labelRoute:         string;
  labelTrucks:        string;
  labelCostPerTruck:  string;
  labelTotalDelivery: string;
  labelSettlement:    string;

  valueDapIncluded:   string;
  valueDapExtra:      string;
  valueFca:           string;
  valueRecharge:      string;

  // Conditions
  sectionDeliveryTime:   string;
  sectionDeliveryTerms:  string;
  sectionTechnical:      string;
  sectionCommercial:     string;
  sectionValidity:       string;

  // Technical conditions lines
  techStandard:     string;
  techGrade:        string;
  techTolerance:    string;
  techCert:         string;
  techWeighing:     string;
  techCurrencyEUR:  string;
  techCurrencyPLN:  (rate: number) => string;

  // Delivery timeline
  deliveryFromMill:   (weeks: string, deliveryWeeks?: string) => string;
  deliveryFromStock:  (time?: string) => string;

  // Delivery terms
  deliveryFca:      (location: string) => string;
  deliveryDap:      (address: string) => string;
  deliveryDapExtra: (address: string) => string;

  // Payment text
  paymentPrepaid: string;
  paymentCredit:  (days: number) => string;

  // Validity text
  validityLine1:  (label: string) => string;
  validityLine2:  string;
  validityLabel:  (days: number) => string;

  // Locks table
  lockSectionTitle: string;
  thLock:           string;
  thLockQtySzt:     string;
  thMb:             string;
  thPricePerMb:     string;
  thValueEUR:       string;
  lockTotalRow:     string;
  lockMassRow:      string;

  // Notes
  notesLabel: string;
}

// ─── POLISH ───────────────────────────────────────────────────────────────────

const pl: PdfStrings = {
  docTitle:     offerNo => `Oferta ${offerNo}`,
  docLanguage:  'pl',
  offerTitle:   'OFERTA SPRZEDAŻY',

  date:         'Data:',
  offerNumber:  'Numer oferty:',
  salesRep:     'Opiekun handlowy:',
  phone:        'Telefon:',
  exchangeRate: 'Kurs EUR/PLN:',
  customerLabel:'Dane klienta:',
  taskLabel:'Zadanie:',
  vatLabel:     country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dzień dobry,',
  intro:    'W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności, oferujemy sprzedaż grodzic stalowych na poniższych warunkach:',

  thProfile:    'Profil',
  thSteelGrade: 'Gatunek stali',
  thQty:        'Ilość',
  thLength:     'Dług. [m]',
  thKgPerM:     'kg/m',
  thMass:       'Masa [t]',
  thPricePerT:  'Cena [EUR/t]',
  thWallArea:   'Pow. [m²]',
  thPricePerM2: 'Cena/m²',
  thLockMassT:  'Masa [t]',

  unitPairs: 'par',
  unitPcs:   'szt.',
  totalRow:  'Łącznie',

  priceLabel:  'Cena sprzedaży',
  netSuffix:   'netto',
  pricePerTon: unit => `Cena sprzedaży za tonę: {value} ${unit}`,
  pricePerM2:  unit => `Cena sprzedaży za m²: {value} ${unit}`,

  sectionTransport:   'Transport:',
  labelDelivery:      'Dostawa:',
  labelRoute:         'Trasa:',
  labelTrucks:        'Liczba aut:',
  labelCostPerTruck:  'Koszt / auto:',
  labelTotalDelivery: 'Łączny koszt dostawy:',
  labelSettlement:    'Rozliczenie:',

  valueDapIncluded: 'DAP – w cenie / Intra B.V.',
  valueDapExtra:    'DAP / Intra B.V.',
  valueFca:         'FCA – odbiór własny',
  valueRecharge:    'Refaktura kosztów dostawy na klienta',

  sectionDeliveryTime:  'Termin dostawy:',
  sectionDeliveryTerms: 'Warunki dostawy:',
  sectionTechnical:     'Warunki techniczne:',
  sectionCommercial:    'Warunki handlowe:',
  sectionValidity:      'Ważność oferty:',

  techStandard:    '- dostawa wg. EN10248-1/2.',
  techGrade:       '- gatunek stali zgodny z ofertą.',
  techTolerance:   '- tolerancja długości +-200mm.',
  techCert:        '- certyfikat 3.1/EN10204.',
  techWeighing:    '- fakturowanie wg. wagi teoretycznej.',
  techCurrencyEUR: '- ceny podane w EUR netto.',
  techCurrencyPLN: _rate => `- oferta kalkulowana po kursie €/zł z dnia przesłania oferty.`,

  deliveryFromMill: (weeks, deliveryWeeks) =>
    `produkcja w planowanej kampanii w tyg. ${weeks}`
    + (deliveryWeeks ? ` – dostawy wstępnie możliwe od ${deliveryWeeks} tygodnia` : '')
    + ' – do potwierdzenia po zakończonej produkcji.',
  deliveryFromStock: time =>
    `z magazynu${time ? `, ${time}` : ''}.`,

  deliveryFca:      location => `odbiór własny wg. FCA (${location}).`,
  deliveryDap:      address  => `dostawa w cenie wg. DAP (${address}).`,
  deliveryDapExtra: address  => `dostawa wg. DAP (${address}), transport refakturowany na klienta.`,

  paymentPrepaid: 'przedpłata 100%.',
  paymentCredit:  days =>
    `${days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`,

  validityLine1:  label => `- Oferta ważna ${label} od daty wysłania i wymaga finalnego potwierdzenia.`,
  validityLine2:  '- Oferta nie rezerwuje dostępności magazynowych oraz możliwości produkcyjnych.',
  validityLabel:  days  => days === 1 ? '24h' : `${days} dni`,

  lockSectionTitle: 'Zamki',
  thLock:           'Zamek',
  thLockQtySzt:     'Szt.',
  thMb:             'mb łącznie',
  thPricePerMb:     'Cena EUR/mb',
  thValueEUR:       'Wartość [EUR]',
  lockTotalRow:     'Łącznie',
  lockMassRow:      'Masa zamków',

  notesLabel: 'Uwagi',
};

// ─── ENGLISH ──────────────────────────────────────────────────────────────────
// Terms from Intra B.V. Catalogue 2025 EN:
//   sheet piles / hot rolled sheet piles / pile profile / steel grade
//   pairs / pcs / wall area / theoretical weight
//   EN 10248-1/2 / Mill Certificate 3.1 / EN 10204
//   DAP (Delivered at Place) / FCA (Free Carrier)

const en: PdfStrings = {
  docTitle:     offerNo => `Quotation ${offerNo}`,
  docLanguage:  'en',
  offerTitle:   'SALES QUOTATION',

  date:         'Date:',
  offerNumber:  'Quotation No.:',
  salesRep:     'Account Manager:',
  phone:        'Phone:',
  exchangeRate: 'EUR/PLN rate:',
  customerLabel:'Customer:',
  taskLabel:'Project:',
  vatLabel:     _country => 'VAT No.:',

  greeting: 'Dear Sir or Madam,',
  intro:    'With reference to your enquiry and our General Terms and Conditions of Sale and Payment, we are pleased to offer hot rolled steel sheet piles on the following terms:',

  thProfile:    'Profile',
  thSteelGrade: 'Steel grade',
  thQty:        'Qty',
  thLength:     'Length [m]',
  thKgPerM:     'kg/m',
  thMass:       'Mass [t]',
  thPricePerT:  'Price [EUR/t]',
  thWallArea:   'Wall area [m²]',
  thPricePerM2: 'Price/m²',
  thLockMassT:  'Mass [t]',

  unitPairs: 'pairs',
  unitPcs:   'pcs.',
  totalRow:  'Total',

  priceLabel:  'SALES PRICE',
  netSuffix:   'net',
  pricePerTon: unit => `Unit price per ton: {value} ${unit}`,
  pricePerM2:  unit => `Unit price per m²: {value} ${unit}`,

  sectionTransport:   'Transport:',
  labelDelivery:      'Delivery:',
  labelRoute:         'Route:',
  labelTrucks:        'No. of trucks:',
  labelCostPerTruck:  'Cost / truck:',
  labelTotalDelivery: 'Total delivery cost:',
  labelSettlement:    'Settlement:',

  valueDapIncluded: 'DAP – included in price / Intra B.V.',
  valueDapExtra:    'DAP / Intra B.V.',
  valueFca:         'FCA – ex works, customer\'s collection',
  valueRecharge:    'Delivery costs recharged to customer',

  sectionDeliveryTime:  'Delivery time:',
  sectionDeliveryTerms: 'Delivery terms:',
  sectionTechnical:     'Technical terms:',
  sectionCommercial:    'Commercial terms:',
  sectionValidity:      'Validity of offer:',

  techStandard:    '- supply in accordance with EN 10248-1/2.',
  techGrade:       '- steel grade as stated in this quotation.',
  techTolerance:   '- length tolerance ±200 mm.',
  techCert:        '- mill certificate 3.1 / EN 10204.',
  techWeighing:    '- invoicing based on theoretical weight.',
  techCurrencyEUR: '- prices quoted in EUR net.',
  techCurrencyPLN: _rate => `- quotation calculated at the EUR/PLN exchange rate on the date of issue.`,

  deliveryFromMill: (weeks, deliveryWeeks) =>
    `production in planned rolling campaign in week ${weeks}`
    + (deliveryWeeks ? ` – deliveries preliminarily possible from week ${deliveryWeeks}` : '')
    + ' – subject to confirmation after completion of rolling.',
  deliveryFromStock: time =>
    `ex stock${time ? `, ${time}` : ''}.`,

  deliveryFca:      location => `customer\'s own collection, FCA (${location}).`,
  deliveryDap:      address  => `delivery included, DAP (${address}).`,
  deliveryDapExtra: address  => `delivery DAP (${address}), freight re-invoiced to customer.`,

  paymentPrepaid: '100% prepayment.',
  paymentCredit:  days =>
    `${days} days from invoice date, subject to obtaining security for the order value (Credit limit, bank guarantee, payment guarantee from a public investor, or other security accepted by Intra B.V.).`,

  validityLine1:  label => `- This quotation is valid for ${label} from the date of issue and requires final confirmation.`,
  validityLine2:  '- This quotation does not reserve stock availability or production capacity.',
  validityLabel:  days  => days === 1 ? '24 hours' : `${days} days`,

  lockSectionTitle: 'Interlocks',
  thLock:           'Interlock',
  thLockQtySzt:     'Pcs.',
  thMb:             'Total [lm]',
  thPricePerMb:     'Price [EUR/lm]',
  thValueEUR:       'Value [EUR]',
  lockTotalRow:     'Total interlocks',
  lockMassRow:      'Interlock mass',

  notesLabel: 'Notes',
};

// ─── Export (Sales) ───────────────────────────────────────────────────────────

export const PDF_STRINGS: Record<PdfLang, PdfStrings> = { pl, en };

// ══════════════════════════════════════════════════════════════════════════════
// RENTAL PDF STRINGS
// ══════════════════════════════════════════════════════════════════════════════

export interface RentalPdfStrings {
  docTitle:      (offerNo: string) => string;
  docLanguage:   string;
  offerTitle:    string;

  // Meta
  date:          string;
  offerNumber:   string;
  salesRep:      string;
  phone:         string;
  customerLabel: string;
  taskLabel: string;
  vatLabel:      (country: string) => string;

  // Greeting & intro
  greeting: string;
  intro:    string;

  // Table headers (multi-item)
  thProfile:    string;
  thSteelGrade: string;
  thQty:        string;
  thLength:     string;
  thKgPerM:     string;
  thMass:       string;
  thWallArea:   string;   // Pow. ścianki [m²]
  thCostPerM2:  string;   // Koszt/m²
  thCostPerT:   string;   // Koszt/t
  totalRow:     string;
  unitPcs:      string;
  rentalPeriodRow: string;

  // Fallback single-item table
  thParam:           string;
  thValue:           string;
  legacyProfile:     string;
  legacyQty:         string;
  legacyLengthOne:   string;
  legacyTotalLength: string;
  legacyTotalMass:   string;
  legacyWallArea:    string;
  legacyPeriod:      string;

  // Price box
  rentalCostLabel:   string;
  netSuffix:         string;
  costPerM2Label:    string;
  costPerTonLabel:   string;
  exchangeRateLabel: string;

  // Weekly rate box
  weeklyRateTitle:  string;
  weeklyRateSuffix: string;
  weeklyRateNote:   string;

  // Transport
  sectionTransport:    string;
  labelDelivery:       string;
  labelRoute:          string;
  labelTrucks:         string;
  labelCostPerTruck:   string;
  labelTotalTransport: string;
  labelSettlement:     string;
  labelPickupFrom:     string;
  valueDapIncluded:    string;
  valueDapExtra:       string;
  valueFca:            string;
  valueRecharge:       string;

  // Rental conditions
  sectionRentalTerms: string;
  rentalTerm1:        string;
  rentalTerm1Fca:     string;
  rentalTerm2:        string;
  rentalTerm3:        string;
  para1:              string;
  para2:              (val: number | string, unit: string) => string;
  para3:              string;
  para4:              string;

  // Damage schedule
  sectionDamages: string;
  damage1: (val: number | string, unit: string) => string;
  damage2: (val: number | string, unit: string) => string;
  damage3: (val: number | string, unit: string) => string;
  damage4: (val: number | string, unit: string) => string;
  damage5: (val: number | string, unit: string) => string;
  damage6: (val: number | string, unit: string) => string;

  // Delivery time
  sectionDelivery:     string;
  deliveryPlaceholder: string;

  // Technical
  sectionTechnical: string;
  techStandard:     string;
  techGrade:        string;
  techTolerance:    string;
  techWeighing:     string;

  // Payment
  sectionPayment:  string;
  paymentPrepaid:  string;
  paymentCredit:   (days: number) => string;

  // Validity
  sectionValidity:    string;
  validityLine:       (label: string) => string;
  validityLabel:      (days: number) => string;
  validityDisclaimer: string;

  // Notes
  notesLabel: string;
}

// ─── RENTAL POLISH ────────────────────────────────────────────────────────────

const rental_pl: RentalPdfStrings = {
  docTitle:      offerNo => `Oferta ${offerNo}`,
  docLanguage:   'pl',
  offerTitle:    'OFERTA WYNAJMU',

  date:          'Data:',
  offerNumber:   'Numer oferty:',
  salesRep:      'Opiekun handlowy:',
  phone:         'Telefon:',
  customerLabel: 'Dane klienta:',
  taskLabel: 'Zadanie:',
  vatLabel:      country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dzień dobry,',
  intro:    'W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności oferujemy usługę dzierżawy grodzic stalowych:',

  thProfile:       'Profil',
  thSteelGrade:    'Gatunek stali',
  thQty:           'Ilość',
  thLength:        'Dług. [m]',
  thKgPerM:        'kg/m',
  thMass:          'Masa [t]',
  thWallArea:      'Pow. [m²]',
  thCostPerM2:     'Koszt/m²',
  thCostPerT:      'Koszt/t',
  totalRow:        'Łącznie',
  unitPcs:         'szt.',
  rentalPeriodRow: 'Podstawowy okres dzierżawy',

  thParam:           'Parametr',
  thValue:           'Wartość',
  legacyProfile:     'Profil grodzicy',
  legacyQty:         'Ilość',
  legacyLengthOne:   'Długość jednej grodzicy',
  legacyTotalLength: 'Łączna długość',
  legacyTotalMass:   'Masa całkowita',
  legacyWallArea:    'Powierzchnia ścianki',
  legacyPeriod:      'Podstawowy okres dzierżawy',

  rentalCostLabel:   'Koszt dzierżawy',
  netSuffix:         'netto',
  costPerM2Label:    'Koszt za m²:',
  costPerTonLabel:   'Koszt za tonę:',
  exchangeRateLabel: 'Kurs EUR/PLN:',

  weeklyRateTitle:  'KAŻDY KOLEJNY TYDZIEŃ DZIERŻAWY',
  weeklyRateSuffix: '/tona netto',
  weeklyRateNote:   'po upływie podstawowego okresu dzierżawy',

  sectionTransport:    'Transport:',
  labelDelivery:       'Dostawa:',
  labelRoute:          'Trasa:',
  labelTrucks:         'Liczba aut:',
  labelCostPerTruck:   'Koszt / auto:',
  labelTotalTransport: 'Łączny koszt transportu:',
  labelSettlement:     'Rozliczenie:',
  labelPickupFrom:     'Odbiór z:',
  valueDapIncluded:    'DAP – w cenie / Intra B.V.',
  valueDapExtra:       'DAP / Intra B.V.',
  valueFca:            'FCA – odbiór własny',
  valueRecharge:       'Refaktura kosztów transportu na klienta',

  sectionRentalTerms: 'Warunki dzierżawy:',
  rentalTerm1: '1) Oferowana cena jest ceną z transportami po stronie Intra: magazyn - budowa. Zwrot do magazynu Intra BV (Cieśle 42 k. Wrocławia) jest obowiązkiem i kosztem Klienta.',
  rentalTerm1Fca: '1) Transport grodzic po stronie Klienta (FCA – odbiór własny). Zwrot do magazynu Intra BV (Cieśle 42 k. Wrocławia) jest obowiązkiem i kosztem Klienta.',
  rentalTerm2: '2) Na budowie grodzice muszą zostać rozładowane i załadowane na koszt Klienta.',
  rentalTerm3: '3) Podane ceny są cenami netto.',

  para1: 'Pragniemy zaznaczyć, że są to grodzice wypożyczone i w każdym przypadku należy je zwrócić. Zwracamy uwagę, że zwrotowi mogą podlegać wyłącznie materiały dostarczone przez Intra.',
  para2: (val, unit) => `Dostawa i zwrot grodzic muszą nastąpić wg. EN10248-1/2. Za straty materialne, także spowodowane cięciami uszkodzonych części grodzic, obciążymy Państwa dodatkową kwotą w wysokości ${val},- ${unit}/tona grodzic.`,
  para3: 'Grodzice po zwrocie muszą nadawać się do ponownego użycia – bez konieczności ponownej obróbki, czyszczenia oraz napraw. Grodzice nie mogą posiadać uszkodzeń, zabrudzeń, przylegającej ziemi i innych niedoskonałości ponad normatywne zużycie.',
  para4: 'W przeciwnym razie obciążymy Państwa następującymi kosztami:',

  sectionDamages: 'Cennik:',
  damage1: (val, unit) => `- Zagubienie / całkowita strata uszkodzonych grodzic = +${val},- ${unit} / tona;`,
  damage2: (val, unit) => `- Sortowanie oraz czyszczenie grodzic = +${val},- ${unit} / tona;`,
  damage3: (val, unit) => `- Szlifowanie pozostałości przyspawanych kształtowników = +${val},- ${unit}/mb;`,
  damage4: (val, unit) => `- Spawanie (zamykanie) otworów pod kotwy = +${val},- ${unit} / szt.;`,
  damage5: (val, unit) => `- Głowica tnąca - w celu np. ucięcia uszkodzenia = +${val},- ${unit} / za cięcie;`,
  damage6: (val, unit) => `- Naprawa / prostowanie zamków = +${val},- ${unit} / mb;`,

  sectionDelivery:     'Termin dostawy:',
  deliveryPlaceholder: '- ............',

  sectionTechnical: 'Warunki techniczne:',
  techStandard:     '- dostawa wg. EN10248-1/2.',
  techGrade:        '- gatunek stali zgodny z ofertą.',
  techTolerance:    '- tolerancja długości +-200mm.',
  techWeighing:     '- fakturowanie wg. wagi teoretycznej.',

  sectionPayment:  'Warunki płatności:',
  paymentPrepaid:  '- Przedpłata – płatność wymagana przed realizacją zlecenia.',
  paymentCredit:   days => `- ${days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`,

  sectionValidity:    'Ważność oferty:',
  validityLine:       label => `- ${label} od daty przesłania oferty.`,
  validityLabel:      days  => days === 1 ? '24 godziny' : `${days} dni`,
  validityDisclaimer: 'Oferta nie rezerwuje dostępności z magazynu oraz możliwości produkcyjnych i wymaga finalnego potwierdzenia.',

  notesLabel: 'Uwagi',
};

// ─── RENTAL ENGLISH ───────────────────────────────────────────────────────────

const rental_en: RentalPdfStrings = {
  docTitle:      offerNo => `Rental Offer ${offerNo}`,
  docLanguage:   'en',
  offerTitle:    'RENTAL OFFER',

  date:          'Date:',
  offerNumber:   'Offer No.:',
  salesRep:      'Account Manager:',
  phone:         'Phone:',
  customerLabel: 'Customer:',
  taskLabel: 'Project:',
  vatLabel:      country => country === 'PL' ? 'Tax No.:' : 'VAT No.:',

  greeting: 'Dear Sir or Madam,',
  intro:    'With reference to your enquiry and our General Terms and Conditions of Rental and Payment, we are pleased to offer hot rolled steel sheet piles for hire on the following terms:',

  thProfile:       'Profile',
  thSteelGrade:    'Steel grade',
  thQty:           'Qty',
  thLength:        'Length [m]',
  thKgPerM:        'kg/m',
  thMass:          'Mass [t]',
  thWallArea:      'Wall area [m²]',
  thCostPerM2:     'Cost/m²',
  thCostPerT:      'Cost/t',
  totalRow:        'Total',
  unitPcs:         'pcs.',
  rentalPeriodRow: 'Basic rental period',

  thParam:           'Parameter',
  thValue:           'Value',
  legacyProfile:     'Sheet pile profile',
  legacyQty:         'Quantity',
  legacyLengthOne:   'Length of one sheet pile',
  legacyTotalLength: 'Total length',
  legacyTotalMass:   'Total mass',
  legacyWallArea:    'Wall area',
  legacyPeriod:      'Basic rental period',

  rentalCostLabel:   'Rental cost',
  netSuffix:         'net',
  costPerM2Label:    'Cost per m²:',
  costPerTonLabel:   'Cost per ton:',
  exchangeRateLabel: 'EUR/PLN rate:',

  weeklyRateTitle:  'EACH ADDITIONAL WEEK OF RENTAL',
  weeklyRateSuffix: '/ton net',
  weeklyRateNote:   'after the basic rental period',

  sectionTransport:    'Transport:',
  labelDelivery:       'Delivery:',
  labelRoute:          'Route:',
  labelTrucks:         'No. of trucks:',
  labelCostPerTruck:   'Cost / truck:',
  labelTotalTransport: 'Total transport cost:',
  labelSettlement:     'Settlement:',
  labelPickupFrom:     'Collection from:',
  valueDapIncluded:    'DAP – included in price / Intra B.V.',
  valueDapExtra:       'DAP / Intra B.V.',
  valueFca:            "FCA – ex works, customer's collection",
  valueRecharge:       'Transport costs recharged to customer',

  sectionRentalTerms: 'Rental terms:',
  rentalTerm1: '1) The quoted price includes delivery by Intra from warehouse to site. Return to Intra B.V. warehouse (Cieśle 42, near Wrocław) is the Customer\'s responsibility and cost.',
  rentalTerm1Fca: '1) Transport of sheet piles is arranged by the Customer (FCA – ex works, customer\'s collection). Return to Intra B.V. warehouse (Cieśle 42, near Wrocław) is the Customer\'s responsibility and cost.',
  rentalTerm2: '2) At the construction site, sheet piles must be unloaded and loaded at the Customer\'s expense.',
  rentalTerm3: '3) All prices quoted are net prices.',

  para1: 'Please note that these are rented sheet piles and must be returned in all cases. Only materials supplied by Intra B.V. are eligible for return.',
  para2: (val, unit) => `Delivery and return of sheet piles must comply with EN 10248-1/2. For material losses, including those caused by cutting of damaged sections, an additional charge of ${val},- ${unit}/ton will apply.`,
  para3: 'Sheet piles must be returned in a reusable condition – without the need for re-processing, cleaning or repairs. Sheet piles must not show damage, contamination, adhering soil or other defects beyond normal wear.',
  para4: 'Otherwise the following charges will apply:',

  sectionDamages: 'Schedule of charges:',
  damage1: (val, unit) => `- Loss / total damage of sheet piles = +${val},- ${unit} / ton;`,
  damage2: (val, unit) => `- Sorting and cleaning of sheet piles = +${val},- ${unit} / ton;`,
  damage3: (val, unit) => `- Grinding of welded-on sections = +${val},- ${unit}/lm;`,
  damage4: (val, unit) => `- Welding (sealing) of anchor holes = +${val},- ${unit} / pc.;`,
  damage5: (val, unit) => `- Cutting head – e.g. to remove damage = +${val},- ${unit} / cut;`,
  damage6: (val, unit) => `- Repair / straightening of interlocks = +${val},- ${unit} / lm;`,

  sectionDelivery:     'Delivery time:',
  deliveryPlaceholder: '- ............',

  sectionTechnical: 'Technical terms:',
  techStandard:     '- supply in accordance with EN 10248-1/2.',
  techGrade:        '- steel grade as stated in this offer.',
  techTolerance:    '- length tolerance ±200 mm.',
  techWeighing:     '- invoicing based on theoretical weight.',

  sectionPayment:  'Payment terms:',
  paymentPrepaid:  '- Prepayment – payment required prior to execution of the order.',
  paymentCredit:   days => `- ${days} days from invoice date, subject to obtaining security for the order value (Credit limit, bank guarantee, payment guarantee from a public investor, or other security accepted by Intra B.V.).`,

  sectionValidity:    'Validity of offer:',
  validityLine:       label => `- ${label} from the date of issue.`,
  validityLabel:      days  => days === 1 ? '24 hours' : `${days} days`,
  validityDisclaimer: 'This offer does not reserve stock availability or production capacity and requires final confirmation.',

  notesLabel: 'Notes',
};

// ─── Export (Rental) ──────────────────────────────────────────────────────────

export const RENTAL_PDF_STRINGS: Record<PdfLang, RentalPdfStrings> = {
  pl: rental_pl,
  en: rental_en,
};

// ══════════════════════════════════════════════════════════════════════════════
// ROAD PLATE RENTAL PDF STRINGS
// Osobny zestaw od grodzic — bez "grodzice", bez normy EN 10248.
// Tabela: materiał, gatunek, grubość, wymiar, ilość, kg/m², masa, pow., cena, suma
// ══════════════════════════════════════════════════════════════════════════════

export interface RoadPlateRentalPdfStrings {
  docTitle:      (offerNo: string) => string;
  docLanguage:   string;
  offerTitle:    string;

  // Meta
  date:          string;
  offerNumber:   string;
  salesRep:      string;
  phone:         string;
  customerLabel: string;
  taskLabel: string;
  vatLabel:      (country: string) => string;

  // Greeting & intro
  greeting: string;
  intro:    string;

  // Table headers (10 kolumn)
  thMaterial:    string;   // Materiał
  thSteelGrade:  string;
  thThickness:   string;   // Grubość [mm]
  thDimensions:  string;   // Wymiar [m] (szer × dł)
  thQty:         string;
  thKgPerM2:     string;   // kg/m²
  thMass:        string;
  thArea:        string;   // Pow. [m²]
  thPrice:       string;   // Cena [<curr>/t]
  thSubtotal:    string;   // Suma [<curr>]
  totalRow:      string;
  unitPcs:       string;
  rentalPeriodRow: string;

  // Price box
  rentalCostLabel:   string;
  netSuffix:         string;
  costPerM2Label:    string;
  costPerTonLabel:   string;
  exchangeRateLabel: string;

  // Weekly rate box
  weeklyRateTitle:  string;
  weeklyRateSuffix: string;
  weeklyRateNote:   string;

  // Transport
  sectionTransport:    string;
  labelDelivery:       string;
  labelRoute:          string;
  labelTrucks:         string;
  labelCostPerTruck:   string;
  labelTotalTransport: string;
  labelSettlement:     string;
  labelPickupFrom:     string;
  valueDapIncluded:    string;
  valueDapExtra:       string;
  valueFca:            string;
  valueRecharge:       string;

  // Rental conditions
  sectionRentalTerms: string;
  rentalTerm1:        string;
  rentalTerm1Fca:     string;
  rentalTerm2:        string;
  rentalTerm3:        string;
  para1:              string;
  para2:              (val: number | string, unit: string) => string;
  para3:              string;
  para4:              string;

  // Damage schedule (6 pól: rp_loss, rp_service_hour, rp_sorting, rp_m12_welding, rp_cutting_head, rp_lifting_hole)
  sectionDamages: string;
  damageLoss:        (val: number | string, unit: string) => string;
  damageServiceHour: (val: number | string, unit: string) => string;
  damageSorting:     (val: number | string, unit: string) => string;
  damageM12Welding:  (val: number | string, unit: string) => string;
  damageCuttingHead: (val: number | string, unit: string) => string;
  damageLiftingHole: (val: number | string, unit: string) => string;

  // Delivery time
  sectionDelivery:     string;
  deliveryPlaceholder: string;

  // Technical (BEZ EN 10248 — tylko tolerancje + wagowanie)
  sectionTechnical:     string;
  techGrade:            string;
  techToleranceWidth:   string;
  techToleranceLength:  string;
  techWeighing:         string;

  // Payment
  sectionPayment:  string;
  paymentPrepaid:  string;
  paymentCredit:   (days: number) => string;

  // Validity
  sectionValidity:    string;
  validityLine:       (label: string) => string;
  validityLabel:      (days: number) => string;
  validityDisclaimer: string;

  // Notes
  notesLabel: string;
}

// ─── ROAD PLATE POLISH ────────────────────────────────────────────────────────

const roadPlate_pl: RoadPlateRentalPdfStrings = {
  docTitle:      offerNo => `Oferta ${offerNo}`,
  docLanguage:   'pl',
  offerTitle:    'OFERTA WYNAJMU',

  date:          'Data:',
  offerNumber:   'Numer oferty:',
  salesRep:      'Opiekun handlowy:',
  phone:         'Telefon:',
  customerLabel: 'Dane klienta:',
  taskLabel: 'Zadanie:',
  vatLabel:      country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dzień dobry,',
  intro:    'W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności oferujemy usługę wynajmu płyt drogowych:',

  thMaterial:    'Materiał',
  thSteelGrade:  'Gat. stali',
  thThickness:   'Grub. [mm]',
  thDimensions:  'Wymiar [m]',
  thQty:         'Ilość',
  thKgPerM2:     'kg/m²',
  thMass:        'Masa [t]',
  thArea:        'Pow. [m²]',
  thPrice:       'Cena',
  thSubtotal:    'Suma',
  totalRow:      'Łącznie',
  unitPcs:       'szt.',
  rentalPeriodRow: 'Podstawowy okres wynajmu',

  rentalCostLabel:   'Koszt wynajmu',
  netSuffix:         'netto',
  costPerM2Label:    'Koszt za m²:',
  costPerTonLabel:   'Koszt za tonę:',
  exchangeRateLabel: 'Kurs EUR/PLN:',

  weeklyRateTitle:  'KAŻDY KOLEJNY TYDZIEŃ WYNAJMU',
  weeklyRateSuffix: '/tona netto',
  weeklyRateNote:   'po upływie podstawowego okresu wynajmu',

  sectionTransport:    'Transport:',
  labelDelivery:       'Dostawa:',
  labelRoute:          'Trasa:',
  labelTrucks:         'Liczba aut:',
  labelCostPerTruck:   'Koszt / auto:',
  labelTotalTransport: 'Łączny koszt transportu:',
  labelSettlement:     'Rozliczenie:',
  labelPickupFrom:     'Odbiór z:',
  valueDapIncluded:    'DAP – w cenie / Intra B.V.',
  valueDapExtra:       'DAP / Intra B.V.',
  valueFca:            'FCA – odbiór własny',
  valueRecharge:       'Refaktura kosztów transportu na klienta',

  sectionRentalTerms: 'Warunki wynajmu:',
  rentalTerm1: '1) Oferowana cena jest ceną z transportami po stronie Intra: magazyn - budowa. Zwrot do magazynu Intra BV (Cieśle 42 k. Wrocławia) jest obowiązkiem i kosztem Klienta.',
  rentalTerm1Fca: '1) Transport płyt po stronie Klienta (FCA – odbiór własny). Zwrot do magazynu Intra BV (Cieśle 42 k. Wrocławia) jest obowiązkiem i kosztem Klienta.',
  rentalTerm2: '2) Na budowie płyty muszą zostać rozładowane i załadowane na koszt Klienta.',
  rentalTerm3: '3) Podane ceny są cenami netto.',

  para1: 'Pragniemy zaznaczyć, że są to płyty drogowe wypożyczone i w każdym przypadku należy je zwrócić. Zwracamy uwagę, że zwrotowi mogą podlegać wyłącznie materiały dostarczone przez Intra.',
  para2: (val, unit) => `Płyty muszą zostać zwrócone w stanie kompletnym i czystym. Za straty materialne, także spowodowane cięciami uszkodzonych części, obciążymy Państwa dodatkową kwotą w wysokości ${val},- ${unit}/tona.`,
  para3: 'Płyty po zwrocie muszą nadawać się do ponownego użycia – bez konieczności obróbki, czyszczenia oraz napraw. Płyty nie mogą posiadać uszkodzeń, zabrudzeń, przylegającej ziemi i innych niedoskonałości ponad normatywne zużycie.',
  para4: 'W przeciwnym razie obciążymy Państwa następującymi kosztami:',

  sectionDamages: 'Cennik:',
  damageLoss:        (val, unit) => `- Strata całkowita / brakujący materiał = +${val},- ${unit} / tona;`,
  damageServiceHour: (val, unit) => `- Roboczogodzina serwisowa (np. prostowanie blach) = +${val},- ${unit} / godz.;`,
  damageSorting:     (val, unit) => `- Sortowanie i czyszczenie = +${val},- ${unit} / tona;`,
  damageM12Welding:  (val, unit) => `- Spawanie otworów M12 = +${val},- ${unit} / szt.;`,
  damageCuttingHead: (val, unit) => `- Głowica tnąca = +${val},- ${unit} / cięcie;`,
  damageLiftingHole: (val, unit) => `- Nowy otwór do podnoszenia = +${val},- ${unit} / szt.;`,

  sectionDelivery:     'Termin dostawy:',
  deliveryPlaceholder: '- ............',

  sectionTechnical:    'Warunki techniczne:',
  techGrade:           '- gatunek stali zgodny z ofertą.',
  techToleranceWidth:  '- tolerancja szerokości −0/+100 mm (mill edges).',
  techToleranceLength: '- tolerancja długości −0/+200 mm (mill edges).',
  techWeighing:        '- fakturowanie wg wagi rzeczywistej.',

  sectionPayment:  'Warunki płatności:',
  paymentPrepaid:  '- Przedpłata – płatność wymagana przed realizacją zlecenia.',
  paymentCredit:   days => `- ${days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`,

  sectionValidity:    'Ważność oferty:',
  validityLine:       label => `- ${label} od daty przesłania oferty.`,
  validityLabel:      days  => days === 1 ? '24 godziny' : `${days} dni`,
  validityDisclaimer: 'Oferta nie rezerwuje dostępności z magazynu i wymaga finalnego potwierdzenia.',

  notesLabel: 'Uwagi',
};

// ─── ROAD PLATE ENGLISH ───────────────────────────────────────────────────────

const roadPlate_en: RoadPlateRentalPdfStrings = {
  docTitle:      offerNo => `Rental Offer ${offerNo}`,
  docLanguage:   'en',
  offerTitle:    'RENTAL OFFER',

  date:          'Date:',
  offerNumber:   'Offer No.:',
  salesRep:      'Account Manager:',
  phone:         'Phone:',
  customerLabel: 'Customer:',
  taskLabel: 'Project:',
  vatLabel:      country => country === 'PL' ? 'Tax No.:' : 'VAT No.:',

  greeting: 'Dear Sir or Madam,',
  intro:    'With reference to your enquiry and our General Terms and Conditions of Rental and Payment, we are pleased to offer steel road plates for hire on the following terms:',

  thMaterial:    'Material',
  thSteelGrade:  'Steel grade',
  thThickness:   'Thick. [mm]',
  thDimensions:  'Size [m]',
  thQty:         'Qty',
  thKgPerM2:     'kg/m²',
  thMass:        'Mass [t]',
  thArea:        'Area [m²]',
  thPrice:       'Price',
  thSubtotal:    'Total',
  totalRow:      'Total',
  unitPcs:       'pcs.',
  rentalPeriodRow: 'Basic rental period',

  rentalCostLabel:   'Rental cost',
  netSuffix:         'net',
  costPerM2Label:    'Cost per m²:',
  costPerTonLabel:   'Cost per ton:',
  exchangeRateLabel: 'EUR/PLN rate:',

  weeklyRateTitle:  'EACH ADDITIONAL WEEK OF RENTAL',
  weeklyRateSuffix: '/ton net',
  weeklyRateNote:   'after the basic rental period',

  sectionTransport:    'Transport:',
  labelDelivery:       'Delivery:',
  labelRoute:          'Route:',
  labelTrucks:         'No. of trucks:',
  labelCostPerTruck:   'Cost / truck:',
  labelTotalTransport: 'Total transport cost:',
  labelSettlement:     'Settlement:',
  labelPickupFrom:     'Collection from:',
  valueDapIncluded:    'DAP – included in price / Intra B.V.',
  valueDapExtra:       'DAP / Intra B.V.',
  valueFca:            "FCA – ex works, customer's collection",
  valueRecharge:       'Transport costs recharged to customer',

  sectionRentalTerms: 'Rental terms:',
  rentalTerm1: "1) The quoted price includes delivery by Intra from warehouse to site. Return to Intra B.V. warehouse (Cieśle 42, near Wrocław) is the Customer's responsibility and cost.",
  rentalTerm1Fca: "1) Transport of road plates is arranged by the Customer (FCA – ex works, customer's collection). Return to Intra B.V. warehouse (Cieśle 42, near Wrocław) is the Customer's responsibility and cost.",
  rentalTerm2: "2) At the construction site, road plates must be unloaded and loaded at the Customer's expense.",
  rentalTerm3: '3) All prices quoted are net prices.',

  para1: 'Please note that these are rented road plates and must be returned in all cases. Only materials supplied by Intra B.V. are eligible for return.',
  para2: (val, unit) => `Plates must be returned complete and clean. For material losses, including those caused by cutting of damaged sections, an additional charge of ${val},- ${unit}/ton will apply.`,
  para3: 'Plates must be returned in a reusable condition – without the need for processing, cleaning or repairs. Plates must not show damage, contamination, adhering soil or other defects beyond normal wear.',
  para4: 'Otherwise the following charges will apply:',

  sectionDamages: 'Schedule of charges:',
  damageLoss:        (val, unit) => `- Total loss / missing material = +${val},- ${unit} / ton;`,
  damageServiceHour: (val, unit) => `- Service hour (e.g. plate straightening) = +${val},- ${unit} / hour;`,
  damageSorting:     (val, unit) => `- Sorting and cleaning = +${val},- ${unit} / ton;`,
  damageM12Welding:  (val, unit) => `- Welding of M12 holes = +${val},- ${unit} / pc.;`,
  damageCuttingHead: (val, unit) => `- Cutting head = +${val},- ${unit} / cut;`,
  damageLiftingHole: (val, unit) => `- New lifting hole = +${val},- ${unit} / pc.;`,

  sectionDelivery:     'Delivery time:',
  deliveryPlaceholder: '- ............',

  sectionTechnical:    'Technical terms:',
  techGrade:           '- steel grade as stated in this offer.',
  techToleranceWidth:  '- width tolerance −0/+100 mm (mill edges).',
  techToleranceLength: '- length tolerance −0/+200 mm (mill edges).',
  techWeighing:        '- invoicing based on actual weight.',

  sectionPayment:  'Payment terms:',
  paymentPrepaid:  '- Prepayment – payment required prior to execution of the order.',
  paymentCredit:   days => `- ${days} days from invoice date, subject to obtaining security for the order value (Credit limit, bank guarantee, payment guarantee from a public investor, or other security accepted by Intra B.V.).`,

  sectionValidity:    'Validity of offer:',
  validityLine:       label => `- ${label} from the date of issue.`,
  validityLabel:      days  => days === 1 ? '24 hours' : `${days} days`,
  validityDisclaimer: 'This offer does not reserve stock availability and requires final confirmation.',

  notesLabel: 'Notes',
};

// ─── Export (Road Plate Rental) ───────────────────────────────────────────────

export const ROAD_PLATE_RENTAL_PDF_STRINGS: Record<PdfLang, RoadPlateRentalPdfStrings> = {
  pl: roadPlate_pl,
  en: roadPlate_en,
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PDF: Pipe Sale (sprzedaż rur stalowych) ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

export interface PipeSalePdfStrings {
  // Document
  docTitle:        (offerNo: string) => string;
  docLanguage:     string;
  offerTitle:      string;

  // Meta block
  date:            string;
  offerNumber:     string;
  salesRep:        string;
  phone:           string;
  exchangeRate:    string;
  customerLabel:   string;
  taskLabel:   string;
  vatLabel:        (country: string) => string;

  // Greeting & intro
  greeting:        string;
  intro:           string;

  // Items table — 9 kolumn (Specyfikacja, Norma, Gatunek, Ilość, L, kg/m, Masa, Cena/t, Wartość)
  thSpec:          string;   // Specyfikacja (Ø×t + typ produktu)
  thNorm:          string;   // Norma
  thSteelGrade:    string;   // Gatunek
  thQty:           string;   // Ilość [szt.]
  thLengthM:       string;   // L = [m]
  thKgPerM:        string;   // kg/m
  thMass:          string;   // Masa [t]
  thPricePerT:     string;   // Cena [waluta/t]
  thValue:         string;   // Wartość

  // Table body
  unitPcs:         string;
  totalRow:        string;

  // Price box (suma końcowa)
  priceLabel:                 string;   // "Łączna kwota dla klienta"
  priceBreakdownPipes:        (val: string) => string;   // "rury 30 200,00 EUR"
  priceBreakdownTransport:    (val: string) => string;   // "transport 1 200,00 EUR"
  priceBreakdownRecharge:     string;                    // "+ transport refaktura"
  netSuffix:                  string;                    // "netto" / "net"

  // Transport section
  sectionTransport:   string;
  labelDelivery:      string;
  labelRoute:         string;
  labelTrucks:        string;
  labelCostPerTruck:  string;
  labelTotalDelivery: string;
  labelSettlement:    string;
  labelPickupFrom:    string;
  valueDapIncluded:   string;
  valueDapExtra:      string;
  valueFca:           string;
  valueRecharge:      string;

  // Sekcje
  sectionDeliveryTime:   string;
  sectionDeliveryTerms:  string;
  sectionTechnical:      string;
  sectionCommercial:     string;
  sectionValidity:       string;

  // Termin dostawy
  deliveryFromMill:   (weeks: string, deliveryWeeks?: string) => string;
  deliveryFromStock:  (time?: string) => string;

  // Warunki dostawy (Incoterms)
  deliveryFca:      (location: string) => string;
  deliveryDap:      (address: string) => string;
  deliveryDapExtra: (address: string) => string;

  // Warunki techniczne (DYNAMICZNE dla rur)
  techNormSingle:     (norm: string, description: string) => string;
  techNormMultiple:   (normsList: string) => string;     // "EN10219-1/2, EN10217-2 (wg specyfikacji w tabeli)"
  techNormNoCert:     string;                            // gdy wszystkie pozycje bez atestu
  techTolerance:      string;                            // STATIC: "Tolerancje wymiarowe: zgodnie z oferowaną normą produkcyjną"
  techConditionSingle: (condition: string) => string;
  techConditionMixed: string;                            // mieszane stany — wg tabeli
  techGrades:         (gradesList: string) => string;    // "S235JRH, S275JR"
  techSurfaceSingle:  (surface: string) => string;
  techSurfaceMixed:   string;                            // mieszane powierzchnie — wg tabeli

  // Płatność
  paymentPrepaid: string;
  paymentCredit:  (days: number) => string;

  // Ważność
  validityLine1:  (label: string) => string;
  validityLine2:  string;
  validityLabel:  (days: number) => string;

  // Notes
  notesLabel: string;
}

// ─── POLISH ───────────────────────────────────────────────────────────────────

const pipeSale_pl: PipeSalePdfStrings = {
  docTitle:     offerNo => `Oferta sprzedaży rur ${offerNo}`,
  docLanguage:  'pl',
  offerTitle:   'OFERTA SPRZEDAŻY',

  date:         'Data:',
  offerNumber:  'Numer oferty:',
  salesRep:     'Opiekun handlowy:',
  phone:        'Telefon:',
  exchangeRate: 'Kurs:',
  customerLabel:'Klient:',
  taskLabel:'Zadanie:',
  vatLabel:     country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dzień dobry,',
  intro:    'W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności, oferujemy sprzedaż rur stalowych na poniższych warunkach:',

  thSpec:       'Specyfikacja',
  thNorm:       'Norma',
  thSteelGrade: 'Gatunek',
  thQty:        'Ilość [szt.]',
  thLengthM:    'L = [m]',
  thKgPerM:     'kg/m',
  thMass:       'Masa [t]',
  thPricePerT:  'Cena [waluta/t]',
  thValue:      'Wartość',

  unitPcs:      'szt.',
  totalRow:     'RAZEM',

  priceLabel:               'Cena sprzedaży',
  priceBreakdownPipes:      val => `rury ${val}`,
  priceBreakdownTransport:  val => `transport ${val}`,   // unused — DAP w cenie ukrywa koszt transportu przed klientem
  priceBreakdownRecharge:   '+ transport refakturowany osobno',
  netSuffix:                'netto',

  sectionTransport:   'Transport',
  labelDelivery:      'Dostawa:',
  labelRoute:         'Trasa:',
  labelTrucks:        'Liczba aut:',
  labelCostPerTruck:  'Koszt / auto:',
  labelTotalDelivery: 'Razem transport:',
  labelSettlement:    'Rozliczenie:',
  labelPickupFrom:    'Odbiór z:',
  valueDapIncluded:   'DAP – transport w cenie',
  valueDapExtra:      'DAP – transport refakturowany',
  valueFca:           'FCA – odbiór własny',
  valueRecharge:      '⚠ Refakturowany na klienta',

  sectionDeliveryTime:   'Termin dostawy',
  sectionDeliveryTerms:  'Warunki dostawy (Incoterms 2020)',
  sectionTechnical:      'Warunki techniczne',
  sectionCommercial:     'Warunki handlowe:',
  sectionValidity:       'Ważność oferty:',

  deliveryFromMill: (weeks, deliveryWeeks) =>
    deliveryWeeks
      ? `Produkcja w tygodniach ${weeks}, dostawa w tygodniach ${deliveryWeeks} (czas produkcyjny huty).`
      : `Produkcja w tygodniach ${weeks} (czas produkcyjny huty).`,
  deliveryFromStock: time =>
    time ? `Dostawa z magazynu w czasie: ${time}.` : 'Dostawa z magazynu — termin do uzgodnienia.',

  deliveryFca:      location => `Dostawa zgodnie z FCA. Odbiór własny z: ${location}.`,
  deliveryDap:      address  => `Dostawa zgodnie z DAP do: ${address}.`,
  deliveryDapExtra: address  => `Dostawa zgodnie z DAP do: ${address}. Koszt transportu refakturowany na klienta.`,

  techNormSingle:     (norm, description) => `Norma produkcyjna: ${norm} — ${description}.`,
  techNormMultiple:   normsList => `Normy produkcyjne: ${normsList} (wg specyfikacji w tabeli).`,
  techNormNoCert:     'Norma produkcyjna: nie dotyczy (materiały oferowane bez atestu).',
  techTolerance:      'Tolerancje wymiarowe: zgodnie z oferowaną normą produkcyjną.',
  techConditionSingle: condition => `Stan materiału: ${condition}.`,
  techConditionMixed: 'Stan materiału: wg specyfikacji w tabeli (część pozycji bez atestu — patrz kolumna "Specyfikacja").',
  techGrades:         gradesList => `Gatunek stali: ${gradesList}.`,
  techSurfaceSingle:  surface => `Powierzchnia: ${surface}.`,
  techSurfaceMixed:   'Powierzchnia: wg specyfikacji w tabeli.',

  paymentPrepaid: 'przedpłata 100%.',
  paymentCredit:  days =>
    `${days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`,

  validityLine1:  label => `- Oferta ważna ${label} od daty wysłania i wymaga finalnego potwierdzenia.`,
  validityLine2:  '- Oferta nie rezerwuje dostępności magazynowych oraz możliwości produkcyjnych.',
  validityLabel:  days  => days === 1 ? '24h' : `${days} dni`,

  notesLabel: 'Uwagi',
};

// ─── ENGLISH (robocze tłumaczenia — do zrewidowania) ──────────────────────────

const pipeSale_en: PipeSalePdfStrings = {
  docTitle:     offerNo => `Pipe sales offer ${offerNo}`,
  docLanguage:  'en',
  offerTitle:   'SALES OFFER',

  date:         'Date:',
  offerNumber:  'Offer number:',
  salesRep:     'Sales contact:',
  phone:        'Phone:',
  exchangeRate: 'Exchange rate:',
  customerLabel:'Customer:',
  taskLabel:'Project:',
  vatLabel:     country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dear Sir or Madam,',
  intro:    'With reference to your enquiry and our General Terms and Conditions of Sale and Payment, we are pleased to offer steel pipes on the following terms:',

  thSpec:       'Specification',
  thNorm:       'Standard',
  thSteelGrade: 'Steel grade',
  thQty:        'Qty [pcs]',
  thLengthM:    'L = [m]',
  thKgPerM:     'kg/m',
  thMass:       'Mass [t]',
  thPricePerT:  'Price [currency/t]',
  thValue:      'Value',

  unitPcs:      'pcs',
  totalRow:     'TOTAL',

  priceLabel:               'Sale price',
  priceBreakdownPipes:      val => `pipes ${val}`,
  priceBreakdownTransport:  val => `transport ${val}`,   // unused — DAP included hides transport cost from customer
  priceBreakdownRecharge:   '+ transport recharged separately',
  netSuffix:                'net',

  sectionTransport:   'Transport',
  labelDelivery:      'Delivery:',
  labelRoute:         'Route:',
  labelTrucks:        'Number of trucks:',
  labelCostPerTruck:  'Cost / truck:',
  labelTotalDelivery: 'Total transport:',
  labelSettlement:    'Settlement:',
  labelPickupFrom:    'Pick-up from:',
  valueDapIncluded:   'DAP – delivery included in price',
  valueDapExtra:      'DAP – transport recharged',
  valueFca:           'FCA – customer collection',
  valueRecharge:      '⚠ Recharged to customer',

  sectionDeliveryTime:   'Delivery time',
  sectionDeliveryTerms:  'Delivery terms (Incoterms 2020)',
  sectionTechnical:      'Technical conditions',
  sectionCommercial:     'Commercial terms:',
  sectionValidity:       'Validity of offer:',

  deliveryFromMill: (weeks, deliveryWeeks) =>
    deliveryWeeks
      ? `Production in weeks ${weeks}, delivery in weeks ${deliveryWeeks} (mill production time).`
      : `Production in weeks ${weeks} (mill production time).`,
  deliveryFromStock: time =>
    time ? `Delivery from stock within: ${time}.` : 'Delivery from stock — date to be agreed.',

  deliveryFca:      location => `Delivery according to FCA. Collection from: ${location}.`,
  deliveryDap:      address  => `Delivery according to DAP to: ${address}.`,
  deliveryDapExtra: address  => `Delivery according to DAP to: ${address}. Transport cost recharged to customer.`,

  techNormSingle:     (norm, description) => `Production standard: ${norm} — ${description}.`,
  techNormMultiple:   normsList => `Production standards: ${normsList} (according to specification in the table).`,
  techNormNoCert:     'Production standard: not applicable (materials offered without certificate).',
  techTolerance:      'Dimensional tolerances: in accordance with the offered production standard.',
  techConditionSingle: condition => `Material condition: ${condition}.`,
  techConditionMixed: 'Material condition: according to specification in the table (some items without certificate — see "Specification" column).',
  techGrades:         gradesList => `Steel grade: ${gradesList}.`,
  techSurfaceSingle:  surface => `Surface: ${surface}.`,
  techSurfaceMixed:   'Surface: according to specification in the table.',

  paymentPrepaid: '100% prepayment.',
  paymentCredit:  days =>
    `${days} days from invoice date, subject to obtaining security for the order value (Credit limit, bank guarantee, payment guarantee from a public investor, or other security accepted by Intra B.V.).`,

  validityLine1:  label => `- This quotation is valid for ${label} from the date of issue and requires final confirmation.`,
  validityLine2:  '- This quotation does not reserve stock availability or production capacity.',
  validityLabel:  days  => days === 1 ? '24 hours' : `${days} days`,

  notesLabel: 'Notes',
};

// ─── Export (Pipe Sale) ───────────────────────────────────────────────────────

export const PIPE_SALE_PDF_STRINGS: Record<PdfLang, PipeSalePdfStrings> = {
  pl: pipeSale_pl,
  en: pipeSale_en,
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── PDF: Road Plate Sale (sprzedaż płyt drogowych) ────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
//
// Różnice względem PipeSalePdfStrings:
//   - Bez `thNorm`, `thLengthM`, `thKgPerM` (płyty nie mają norm dynamicznych)
//   - Bez `techCondition*`, `techSurface*`, `techNormMultiple/NoCert`
//     (płyty mają zawsze stałe warunki techniczne dla stali konstrukcyjnej)
//   - Dodane: `thProfile`, `thDimensions` (W×L), `thThickness`, `thArea`
//   - `priceBreakdownPlates` zamiast `priceBreakdownPipes` (etykieta sumy)
// ═══════════════════════════════════════════════════════════════════════════════

export interface RoadPlateSalePdfStrings {
  // Document
  docTitle:        (offerNo: string) => string;
  docLanguage:     string;
  offerTitle:      string;

  // Meta block
  date:            string;
  offerNumber:     string;
  salesRep:        string;
  phone:           string;
  exchangeRate:    string;
  customerLabel:   string;
  taskLabel:   string;
  vatLabel:        (country: string) => string;

  // Greeting & intro
  greeting:        string;
  intro:           string;

  // Items table — 9 kolumn (Profil, Gatunek, Wymiary W×L, Grub., Ilość, Pow., Masa, Cena/t, Wartość)
  thProfile:       string;
  thSteelGrade:    string;
  thDimensions:    string;   // "Wymiary [W×L m]"
  thThickness:     string;   // "Grub. [mm]"
  thQty:           string;   // "Ilość [szt.]"
  thArea:          string;   // "Pow. [m²]"
  thMass:          string;
  thPricePerT:     string;
  thValue:         string;

  // Table body
  unitPcs:         string;
  unitArea:        string;   // "m²"
  totalRow:        string;

  // Price box
  priceLabel:                 string;
  priceBreakdownPlates:       (val: string) => string;
  priceBreakdownTransport:    (val: string) => string;
  priceBreakdownRecharge:     string;
  netSuffix:                  string;

  // Transport
  sectionTransport:   string;
  labelDelivery:      string;
  labelRoute:         string;
  labelTrucks:        string;
  labelCostPerTruck:  string;
  labelTotalDelivery: string;
  labelSettlement:    string;
  labelPickupFrom:    string;
  valueDapIncluded:   string;
  valueDapExtra:      string;
  valueFca:           string;
  valueRecharge:      string;

  // Sekcje
  sectionDeliveryTime:   string;
  sectionDeliveryTerms:  string;
  sectionTechnical:      string;
  sectionCommercial:     string;
  sectionValidity:       string;

  // Termin dostawy
  deliveryFromMill:   (weeks: string, deliveryWeeks?: string) => string;
  deliveryFromStock:  (time?: string) => string;

  // Warunki dostawy (Incoterms)
  deliveryFca:      (location: string) => string;
  deliveryDap:      (address: string) => string;
  deliveryDapExtra: (address: string) => string;

  // Warunki techniczne — 4 linie statyczne, identyczne z PDF wynajmu płyt
  // (decyzja biznesowa: spójność warunków między ofertą wynajmu a sprzedaży).
  techGrade:           string;   // "- gatunek stali zgodny z ofertą."
  techToleranceWidth:  string;   // "- tolerancja szerokości −0/+100 mm (mill edges)."
  techToleranceLength: string;   // "- tolerancja długości −0/+200 mm (mill edges)."
  techWeighing:        string;   // "- fakturowanie wg wagi rzeczywistej."

  // Płatność
  paymentPrepaid: string;
  paymentCredit:  (days: number) => string;

  // Ważność
  validityLine1:  (label: string) => string;
  validityLine2:  string;
  validityLabel:  (days: number) => string;

  // Notes
  notesLabel: string;
}

// ─── POLISH ───────────────────────────────────────────────────────────────────

const roadPlateSale_pl: RoadPlateSalePdfStrings = {
  docTitle:     offerNo => `Oferta sprzedaży płyt drogowych ${offerNo}`,
  docLanguage:  'pl',
  offerTitle:   'OFERTA SPRZEDAŻY',

  date:         'Data:',
  offerNumber:  'Numer oferty:',
  salesRep:     'Opiekun handlowy:',
  phone:        'Telefon:',
  exchangeRate: 'Kurs:',
  customerLabel:'Klient:',
  taskLabel:'Zadanie:',
  vatLabel:     country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dzień dobry,',
  intro:    'W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności, oferujemy sprzedaż płyt drogowych na poniższych warunkach:',

  thProfile:    'Profil',
  thSteelGrade: 'Gatunek',
  thDimensions: 'Wymiary [W×L m]',
  thThickness:  'Grub. [mm]',
  thQty:        'Ilość [szt.]',
  thArea:       'Pow. [m²]',
  thMass:       'Masa [t]',
  thPricePerT:  'Cena [waluta/t]',
  thValue:      'Wartość',

  unitPcs:      'szt.',
  unitArea:     'm²',
  totalRow:     'RAZEM',

  priceLabel:               'Cena sprzedaży',
  priceBreakdownPlates:     val => `płyty ${val}`,
  priceBreakdownTransport:  val => `transport ${val}`,    // unused — DAP w cenie ukrywa transport
  priceBreakdownRecharge:   '+ transport refakturowany osobno',
  netSuffix:                'netto',

  sectionTransport:   'Transport',
  labelDelivery:      'Dostawa:',
  labelRoute:         'Trasa:',
  labelTrucks:        'Liczba aut:',
  labelCostPerTruck:  'Koszt / auto:',
  labelTotalDelivery: 'Razem transport:',
  labelSettlement:    'Rozliczenie:',
  labelPickupFrom:    'Odbiór z:',
  valueDapIncluded:   'DAP – transport w cenie',
  valueDapExtra:      'DAP – transport refakturowany',
  valueFca:           'FCA – odbiór własny',
  valueRecharge:      '⚠ Refakturowany na klienta',

  sectionDeliveryTime:   'Termin dostawy',
  sectionDeliveryTerms:  'Warunki dostawy (Incoterms 2020)',
  sectionTechnical:      'Warunki techniczne',
  sectionCommercial:     'Warunki handlowe:',
  sectionValidity:       'Ważność oferty:',

  deliveryFromMill: (weeks, deliveryWeeks) =>
    deliveryWeeks
      ? `Produkcja w tygodniach ${weeks}, dostawa w tygodniach ${deliveryWeeks} (czas produkcyjny huty).`
      : `Produkcja w tygodniach ${weeks} (czas produkcyjny huty).`,
  deliveryFromStock: time =>
    time ? `Dostawa z magazynu w czasie: ${time}.` : 'Dostawa z magazynu — termin do uzgodnienia.',

  deliveryFca:      location => `Dostawa zgodnie z FCA. Odbiór własny z: ${location}.`,
  deliveryDap:      address  => `Dostawa zgodnie z DAP do: ${address}.`,
  deliveryDapExtra: address  => `Dostawa zgodnie z DAP do: ${address}. Koszt transportu refakturowany na klienta.`,

  techGrade:           'gatunek stali zgodny z ofertą.',
  techToleranceWidth:  'tolerancja szerokości −0/+100 mm (mill edges).',
  techToleranceLength: 'tolerancja długości −0/+200 mm (mill edges).',
  techWeighing:        'fakturowanie wg wagi rzeczywistej.',

  paymentPrepaid: 'przedpłata 100%.',
  paymentCredit:  days =>
    `${days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`,

  validityLine1:  label => `- Oferta ważna ${label} od daty wysłania i wymaga finalnego potwierdzenia.`,
  validityLine2:  '- Oferta nie rezerwuje dostępności magazynowych oraz możliwości produkcyjnych.',
  validityLabel:  days  => days === 1 ? '24h' : `${days} dni`,

  notesLabel: 'Uwagi',
};

// ─── ENGLISH ──────────────────────────────────────────────────────────────────

const roadPlateSale_en: RoadPlateSalePdfStrings = {
  docTitle:     offerNo => `Road plate sales offer ${offerNo}`,
  docLanguage:  'en',
  offerTitle:   'SALES OFFER',

  date:         'Date:',
  offerNumber:  'Offer number:',
  salesRep:     'Sales contact:',
  phone:        'Phone:',
  exchangeRate: 'Exchange rate:',
  customerLabel:'Customer:',
  taskLabel:'Project:',
  vatLabel:     country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dear Sir or Madam,',
  intro:    'With reference to your enquiry and our General Terms and Conditions of Sale and Payment, we are pleased to offer road plates on the following terms:',

  thProfile:    'Profile',
  thSteelGrade: 'Steel grade',
  thDimensions: 'Dimensions [W×L m]',
  thThickness:  'Thick. [mm]',
  thQty:        'Qty [pcs]',
  thArea:       'Area [m²]',
  thMass:       'Mass [t]',
  thPricePerT:  'Price [currency/t]',
  thValue:      'Value',

  unitPcs:      'pcs',
  unitArea:     'm²',
  totalRow:     'TOTAL',

  priceLabel:               'Sale price',
  priceBreakdownPlates:     val => `plates ${val}`,
  priceBreakdownTransport:  val => `transport ${val}`,
  priceBreakdownRecharge:   '+ transport recharged separately',
  netSuffix:                'net',

  sectionTransport:   'Transport',
  labelDelivery:      'Delivery:',
  labelRoute:         'Route:',
  labelTrucks:        'Number of trucks:',
  labelCostPerTruck:  'Cost / truck:',
  labelTotalDelivery: 'Total transport:',
  labelSettlement:    'Settlement:',
  labelPickupFrom:    'Pick-up from:',
  valueDapIncluded:   'DAP – delivery included in price',
  valueDapExtra:      'DAP – transport recharged',
  valueFca:           'FCA – customer collection',
  valueRecharge:      '⚠ Recharged to customer',

  sectionDeliveryTime:   'Delivery time',
  sectionDeliveryTerms:  'Delivery terms (Incoterms 2020)',
  sectionTechnical:      'Technical conditions',
  sectionCommercial:     'Commercial terms:',
  sectionValidity:       'Validity of offer:',

  deliveryFromMill: (weeks, deliveryWeeks) =>
    deliveryWeeks
      ? `Production in weeks ${weeks}, delivery in weeks ${deliveryWeeks} (mill production time).`
      : `Production in weeks ${weeks} (mill production time).`,
  deliveryFromStock: time =>
    time ? `Delivery from stock within: ${time}.` : 'Delivery from stock — date to be agreed.',

  deliveryFca:      location => `Delivery according to FCA. Collection from: ${location}.`,
  deliveryDap:      address  => `Delivery according to DAP to: ${address}.`,
  deliveryDapExtra: address  => `Delivery according to DAP to: ${address}. Transport cost recharged to customer.`,

  techGrade:           'steel grade as stated in this offer.',
  techToleranceWidth:  'width tolerance −0/+100 mm (mill edges).',
  techToleranceLength: 'length tolerance −0/+200 mm (mill edges).',
  techWeighing:        'invoicing based on actual weight.',

  paymentPrepaid: '100% prepayment.',
  paymentCredit:  days =>
    `${days} days from invoice date, subject to obtaining security for the order value (Credit limit, bank guarantee, payment guarantee from a public investor, or other security accepted by Intra B.V.).`,

  validityLine1:  label => `- This quotation is valid for ${label} from the date of issue and requires final confirmation.`,
  validityLine2:  '- This quotation does not reserve stock availability or production capacity.',
  validityLabel:  days  => days === 1 ? '24 hours' : `${days} days`,

  notesLabel: 'Notes',
};

// ─── Export (Road Plate Sale) ─────────────────────────────────────────────────

export const ROAD_PLATE_SALE_PDF_STRINGS: Record<PdfLang, RoadPlateSalePdfStrings> = {
  pl: roadPlateSale_pl,
  en: roadPlateSale_en,
};

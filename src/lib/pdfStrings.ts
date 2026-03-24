// ─── PDF Translations ────────────────────────────────────────────────────────
// Terminology source: Intra B.V. Catalogue 2025 (EN) + EN 10248 / ArcelorMittal

export type PdfLang = 'pl' | 'en';

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
  deliveryFca:   (location: string) => string;
  deliveryDap:   (address: string) => string;

  // Payment text
  paymentPrepaid: string;
  paymentCredit:  (days: number) => string;

  // Validity text
  validityLine1:  (label: string) => string;
  validityLine2:  string;
  validityLabel:  (days: number) => string;

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
  vatLabel:     country => country === 'PL' ? 'NIP:' : 'VAT:',

  greeting: 'Dzień dobry,',
  intro:    'W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności, oferujemy sprzedaż grodzic stalowych na poniższych warunkach:',

  thProfile:    'Profil',
  thSteelGrade: 'Gatunek stali',
  thQty:        'Ilość',
  thLength:     'Dług. [m]',
  thKgPerM:     'kg/m',
  thMass:       'Masa [t]',

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

  deliveryFca: location => `odbiór własny wg. FCA (${location}).`,
  deliveryDap: address  => `dostawa w cenie wg. DAP (${address}).`,

  paymentPrepaid: 'przedpłata 100%.',
  paymentCredit:  days =>
    `${days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`,

  validityLine1:  label => `- Oferta ważna ${label} od daty wysłania i wymaga finalnego potwierdzenia.`,
  validityLine2:  '- Oferta nie rezerwuje dostępności magazynowych oraz możliwości produkcyjnych.',
  validityLabel:  days  => days === 1 ? '24h' : `${days} dni`,

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
  vatLabel:     _country => 'VAT No.:',

  greeting: 'Dear Sir or Madam,',
  intro:    'With reference to your enquiry and our General Terms and Conditions of Sale and Payment, we are pleased to offer hot rolled steel sheet piles on the following terms:',

  thProfile:    'Profile',
  thSteelGrade: 'Steel grade',
  thQty:        'Qty',
  thLength:     'Length [m]',
  thKgPerM:     'kg/m',
  thMass:       'Mass [t]',

  unitPairs: 'pairs',
  unitPcs:   'pcs.',
  totalRow:  'Total',

  priceLabel:  'SALES PRICE',
  netSuffix:   'net',
  pricePerTon: unit => `Unit price per tonne: {value} ${unit}`,
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

  deliveryFca: location => `customer\'s own collection, FCA (${location}).`,
  deliveryDap: address  => `delivery included, DAP (${address}).`,

  paymentPrepaid: '100% prepayment.',
  paymentCredit:  days =>
    `${days} days from invoice date, subject to obtaining security for the order value (Credit limit, bank guarantee, payment guarantee from a public investor, or other security accepted by Intra B.V.).`,

  validityLine1:  label => `- This quotation is valid for ${label} from the date of issue and requires final confirmation.`,
  validityLine2:  '- This quotation does not reserve stock availability or production capacity.',
  validityLabel:  days  => days === 1 ? '24 hours' : `${days} days`,

  notesLabel: 'Notes',
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const PDF_STRINGS: Record<PdfLang, PdfStrings> = { pl, en };

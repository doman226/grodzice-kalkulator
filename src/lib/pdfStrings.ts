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

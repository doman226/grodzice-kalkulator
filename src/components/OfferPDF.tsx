import { Document, Page, View, Text, Image, StyleSheet, Font, Link } from '@react-pdf/renderer';
import type { Offer } from '../types';
import { formatPLN, formatEUR, formatRound, formatNumber } from '../lib/calculations';
import { RENTAL_PDF_STRINGS } from '../lib/pdfStrings';
import type { PdfLang } from '../lib/pdfStrings';

const SALES_REPS: Record<string, string> = {
  'Szymon Sobczak': '579 376 107',
  'Mateusz Cieślicki': '579 141 243',
  'Marzena Sobczak': '579 241 508',
  'Piotr Domański': '729 393 743',
};

const SIGNATURES: Record<string, string> = {
  'Szymon Sobczak':    `${window.location.origin}/signatures/Sobczak.png`,
  'Mateusz Cieślicki': `${window.location.origin}/signatures/${encodeURIComponent('Cieślicki.png')}`,
  'Marzena Sobczak':   `${window.location.origin}/signatures/M.Sobczak.png`,
};

// Rejestracja fontów obsługujących polskie znaki (ą ę ó ś ź ż ć ń ł)
// Fonty lokalne w /public/fonts/ – brak zależności od sieci
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: `${window.location.origin}/fonts/Roboto-Regular.ttf`,
      fontWeight: 400,
    },
    {
      src: `${window.location.origin}/fonts/Roboto-Bold.ttf`,
      fontWeight: 700,
    },
  ],
});

// Wyłącz hyphenation
Font.registerHyphenationCallback(word => [word]);

interface Props {
  offer: Offer;
  lang?: PdfLang;
}

const C = {
  navy: '#1E3A5F',
  navyLight: '#2D5080',
  blue100: '#DBEAFE',
  blue200: '#BFDBFE',
  blueText: '#1D4ED8',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray700: '#374151',
  gray800: '#1F2937',
  white: '#FFFFFF',
  orange: '#D97706',
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 9,
    color: C.gray800,
    paddingTop: 108,
    paddingBottom: 145,
    paddingHorizontal: 42,
    backgroundColor: C.white,
  },
  headerImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
  },
  footerImg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
  },

  // Title
  title: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Roboto',
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 14,
    color: C.navy,
  },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  metaLeft: {
    flex: 1,
  },
  metaRight: {
    width: '42%',
    alignItems: 'flex-end',
  },
  metaLine: {
    marginBottom: 2,
    fontSize: 9,
  },
  metaBold: {
    fontFamily: 'Roboto',
    fontWeight: 700,
  },

  // Separator
  sep: {
    borderBottom: `1 solid ${C.gray200}`,
    marginBottom: 10,
    marginTop: 4,
  },

  // Greeting
  greeting: {
    marginBottom: 5,
    fontSize: 9,
  },
  intro: {
    marginBottom: 10,
    lineHeight: 1.5,
    fontSize: 9,
    color: C.gray700,
  },
  introLink: { color: '#1D4ED8', textDecoration: 'underline' },

  // Signature block
  signatureBlock: { marginTop: 28 },
  signatureImg:   { width: 160, height: 80, objectFit: 'contain' },

  // Table
  table: {
    marginBottom: 10,
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: C.navy,
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderBottom: `1 solid ${C.gray200}`,
  },
  tableBodyRowAlt: {
    flexDirection: 'row',
    borderBottom: `1 solid ${C.gray200}`,
    backgroundColor: C.gray50,
  },
  thCell: {
    padding: 5,
    color: C.white,
    fontFamily: 'Roboto',
    fontWeight: 700,
    fontSize: 8,
  },
  tdLabel: {
    padding: 4,
    color: C.gray500,
    fontSize: 8,
    flex: 1,
  },
  tdValue: {
    padding: 4,
    fontFamily: 'Roboto',
    fontWeight: 700,
    color: C.gray800,
    fontSize: 8,
    width: '45%',
  },

  // Price box
  priceBox: {
    backgroundColor: C.navy,
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 7,
    color: C.blue200,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: 700,
    color: C.white,
  },
  priceSuffix: {
    fontSize: 10,
    fontFamily: 'Roboto',
    color: C.blue200,
  },
  priceRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
    paddingTop: 5,
    borderTop: `1 solid ${C.navyLight}`,
    fontSize: 7,
    color: C.blue200,
  },

  // Transport section
  sectionTitle: {
    fontFamily: 'Roboto',
    fontWeight: 700,
    fontSize: 9,
    color: C.navy,
    marginTop: 10,
    marginBottom: 5,
  },
  transportBox: {
    backgroundColor: C.gray50,
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  transportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    fontSize: 8,
  },
  transportLabel: {
    color: C.gray500,
  },
  transportValue: {
    fontFamily: 'Roboto',
    fontWeight: 700,
    color: C.gray800,
  },

  // Total row
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    borderTop: `2 solid ${C.navy}`,
    borderBottom: `1 solid ${C.gray200}`,
    marginBottom: 12,
  },
  totalLabel: {
    fontFamily: 'Roboto',
    fontWeight: 700,
    fontSize: 10,
    color: C.navy,
  },
  totalValue: {
    fontFamily: 'Roboto',
    fontWeight: 700,
    fontSize: 11,
    color: C.navy,
  },

  // Conditions
  conditionsBox: {
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    backgroundColor: C.gray50,
  },
  conditionItem: {
    marginBottom: 4,
    lineHeight: 1.5,
    fontSize: 8,
    color: C.gray700,
  },
  paragraph: {
    marginBottom: 5,
    lineHeight: 1.5,
    fontSize: 8,
    color: C.gray700,
  },

  // Cennik
  cennikBox: {
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  cennikItem: {
    marginBottom: 3,
    fontSize: 8,
    color: C.gray700,
  },

  // Validity / notes
  validityText: {
    marginTop: 6,
    fontSize: 8,
    fontFamily: 'Roboto',
    fontWeight: 700,
    color: C.navy,
  },
  notesBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: C.blue100,
    borderRadius: 4,
    border: `1 solid ${C.blue200}`,
  },
  notesLabel: {
    fontSize: 7,
    fontFamily: 'Roboto',
    fontWeight: 700,
    color: C.blueText,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  notesText: {
    fontSize: 8,
    color: C.gray700,
    lineHeight: 1.5,
  },
});

function Row({ label, value, alt }: { label: string; value: string; alt: boolean }) {
  return (
    <View style={alt ? s.tableBodyRowAlt : s.tableBodyRow}>
      <Text style={s.tdLabel}>{label}</Text>
      <Text style={s.tdValue}>{value}</Text>
    </View>
  );
}

export default function OfferPDF({ offer, lang = 'pl' }: Props) {
  const t = RENTAL_PDF_STRINGS[lang];

  const dateLocale = lang === 'en' ? 'en-GB' : 'pl-PL';
  const dateStr = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'long' }).format(new Date(offer.created_at));

  // Waluta oferty
  const isEUR  = (offer.currency ?? 'PLN') === 'EUR';
  const exRate = offer.exchange_rate ?? 4.25;
  const fmtVal   = (pln: number) => isEUR ? formatEUR(pln / exRate)   : formatPLN(pln);
  // Dla wskaźników pochodnych (koszt/t, koszt/m²) używamy Math.round,
  // żeby uniknąć Math.ceil(120.0000001) = 121 (błąd float przy round-trip PLN↔EUR)
  const fmtRatio  = (pln: number) => isEUR ? formatRound(pln / exRate) : formatRound(pln);
  // 2 miejsca po przecinku – dla ceny/m² gdzie wartości są niecałkowite (np. 53,97 PLN/m²)
  const fmtRatio2 = (pln: number) => {
    const val = isEUR ? pln / exRate : pln;
    return new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };
  const currCode   = isEUR ? 'EUR' : 'PLN';
  const currSuffix = `${currCode} ${t.netSuffix}`;

  // backward compat: 'intra' (stare) = dap_included
  const tPaidByRaw = offer.transport_paid_by as string | undefined;
  const tPaidBy = tPaidByRaw === 'intra' ? 'dap_included'
                : tPaidByRaw === 'klient' ? 'dap_extra'
                : offer.transport_paid_by;
  const totalWithTransport =
    offer.transport_cost_per_truck != null && offer.transport_cost_per_truck > 0
      ? offer.rental_cost_pln + (tPaidBy === 'dap_included' ? (offer.transport_cost_total ?? 0) : 0)
      : offer.rental_cost_pln;

  // Okres dzierżawy – lokalizowany
  function formatPeriod(weeks: number): string {
    const n = weeks / 4;
    if (lang === 'en') {
      return n === 1 ? '1 month' : n % 1 === 0 ? `${n} months` : `${weeks} weeks`;
    }
    if (n === 1) return '1 miesiąc';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} miesiące`;
    return `${n} miesięcy`;
  }
  const rentalPeriodLabel = offer.display_unit === 'months'
    ? formatPeriod(offer.rental_weeks)
    : lang === 'en'
      ? `${offer.rental_weeks} weeks`
      : `${offer.rental_weeks} tygodni`;

  // Jednostka waluty w cenniku szkód
  const dmgUnit = isEUR ? 'EUR' : (lang === 'en' ? 'PLN' : 'zł');

  const headerUrl = `${window.location.origin}/header-logo.png`;
  const footerUrl = `${window.location.origin}/footer-logo.png`;

  return (
    <Document title={t.docTitle(offer.offer_number)} author="Intra B.V." language={t.docLanguage}>
      <Page size="A4" style={s.page}>
        {/* ── HEADER IMAGE ── */}
        <Image fixed style={s.headerImg} src={headerUrl} />

        {/* ── FOOTER IMAGE ── */}
        <Image fixed style={s.footerImg} src={footerUrl} />

        {/* ── TYTUŁ ── */}
        <Text style={s.title}>{t.offerTitle}</Text>

        {/* ── META + KLIENT ── */}
        <View style={s.metaRow}>
          <View style={s.metaLeft}>
            <Text style={s.metaLine}>
              <Text style={s.metaBold}>{t.date} </Text>
              {dateStr}
            </Text>
            <Text style={s.metaLine}>
              <Text style={s.metaBold}>{t.offerNumber} </Text>
              {offer.offer_number}
            </Text>
            <Text style={s.metaLine}>
              <Text style={s.metaBold}>{t.salesRep} </Text>
              {offer.prepared_by ?? 'Intra B.V.'}
            </Text>
            {offer.prepared_by && SALES_REPS[offer.prepared_by] && (
              <Text style={s.metaLine}>
                <Text style={s.metaBold}>{t.phone} </Text>
                {SALES_REPS[offer.prepared_by]}
              </Text>
            )}
          </View>
          <View style={s.metaRight}>
            <Text style={[s.metaBold, { fontSize: 9, marginBottom: 3, color: C.navy }]}>{t.customerLabel}</Text>
            {offer.client ? (
              <>
                <Text style={[s.metaLine, { fontFamily: 'Roboto', fontWeight: 700, textAlign: 'right' }]}>{offer.client.name}</Text>
                <Text style={[s.metaLine, { textAlign: 'right', color: C.gray500 }]}>
                  {t.vatLabel(offer.client.country)} {offer.client.country === 'PL' ? offer.client.nip : offer.client.vat_number}
                  {' · '}{offer.client.country}
                </Text>
                {offer.client.address && (
                  <Text style={[s.metaLine, { textAlign: 'right', color: C.gray500 }]}>{offer.client.address}</Text>
                )}
                {offer.client.city && (
                  <Text style={[s.metaLine, { textAlign: 'right', color: C.gray500 }]}>{offer.client.postal_code} {offer.client.city}</Text>
                )}
                {offer.client.email && (
                  <Text style={[s.metaLine, { textAlign: 'right', color: C.gray500 }]}>{offer.client.email}</Text>
                )}
              </>
            ) : (
              <Text style={[s.metaLine, { color: C.gray400, textAlign: 'right' }]}>—</Text>
            )}
          </View>
        </View>

        <View style={s.sep} />

        {/* ── POWITANIE ── */}
        <Text style={s.greeting}>{t.greeting}</Text>
        {(() => {
          const OWH_URL = 'https://www.intrabv.com/wp-content/uploads/2026/01/IntraBV-Algemene-Voorwaarden-PL-2026.pdf';
          const linkText = lang === 'pl' ? 'Ogólnych Warunków Sprzedaży i Płatności' : 'General Terms and Conditions of Rental and Payment';
          const [before, after] = t.intro.split(linkText);
          return (
            <Text style={s.intro}>
              {before}
              <Link src={OWH_URL} style={s.introLink}>{linkText}</Link>
              {after}
            </Text>
          );
        })()}

        {/* ── TABELA POZYCJI ── */}
        {offer.items && offer.items.length > 0 ? (
          // Wielopozycyjna tabela (nowe oferty) – 9 kolumn z Pow.[m²], Koszt/m² i Koszt/t
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 2.0 }]}>{t.thProfile}</Text>
              <Text style={[s.thCell, { flex: 1.3 }]}>{t.thSteelGrade}</Text>
              <Text style={[s.thCell, { flex: 1.2, textAlign: 'center' }]}>{t.thQty}</Text>
              <Text style={[s.thCell, { flex: 1.2, textAlign: 'right' }]}>{t.thLength}</Text>
              <Text style={[s.thCell, { flex: 0.9, textAlign: 'right' }]}>{t.thKgPerM}</Text>
              <Text style={[s.thCell, { flex: 1.2, textAlign: 'right' }]}>{t.thMass}</Text>
              <Text style={[s.thCell, { flex: 1.2, textAlign: 'right' }]}>{t.thWallArea}</Text>
              <Text style={[s.thCell, { flex: 1.1, textAlign: 'right' }]}>{t.thCostPerM2}</Text>
              <Text style={[s.thCell, { flex: 0.9, textAlign: 'right' }]}>{t.thCostPerT}</Text>
            </View>
            {(() => {
              const costPerTonPLN = offer.mass_t > 0 ? totalWithTransport / offer.mass_t : 0;
              return [...offer.items].sort((a, b) => a.sort_order - b.sort_order).map((item, idx) => {
                const wallArea    = item.wall_area_m2 ?? 0;
                const costPerM2   = wallArea > 0 ? costPerTonPLN * (item.mass_t / wallArea) : 0;
                return (
                  <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                    <Text style={[s.tdLabel, { flex: 2.0, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{item.profile_name} ({item.profile_type})</Text>
                    <Text style={[s.tdLabel, { flex: 1.3, color: C.gray700 }]}>{item.steel_grade ?? '—'}</Text>
                    <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'center' }]}>{item.quantity} {t.unitPcs}</Text>
                    <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right' }]}>{item.length_m != null ? `${item.length_m} m` : '–'}</Text>
                    <Text style={[s.tdLabel, { flex: 0.9, textAlign: 'right' }]}>{formatNumber(item.total_length_m > 0 ? item.mass_t * 1000 / item.total_length_m : 0, 1)}</Text>
                    <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(item.mass_t, 3)} t</Text>
                    <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', color: C.gray700 }]}>{wallArea > 0 ? `${formatNumber(wallArea, 1)} m²` : '—'}</Text>
                    <Text style={[s.tdLabel, { flex: 1.1, textAlign: 'right', color: C.gray700 }]}>{costPerM2 > 0 ? `${fmtRatio2(costPerM2)} ${currCode}/m²` : '—'}</Text>
                    <Text style={[s.tdLabel, { flex: 0.9, textAlign: 'right', color: C.gray700 }]}>{costPerTonPLN > 0 ? `${fmtRatio2(costPerTonPLN)} ${currCode}/t` : '—'}</Text>
                  </View>
                );
              });
            })()}
            {/* Podsumowanie */}
            <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
              <Text style={[s.tdLabel, { flex: 2.0, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.totalRow}</Text>
              <Text style={[s.tdLabel, { flex: 1.3 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]}></Text>
              <Text style={[s.tdLabel, { flex: 0.9 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{formatNumber(offer.mass_t, 3)} t</Text>
              <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{offer.wall_area_m2 > 0 ? `${formatNumber(offer.wall_area_m2, 1)} m²` : ''}</Text>
              <Text style={[s.tdLabel, { flex: 1.1 }]}></Text>
              <Text style={[s.tdLabel, { flex: 0.9 }]}></Text>
            </View>
            {/* Okres */}
            <View style={[s.tableBodyRow, { borderBottom: 0 }]}>
              <Text style={[s.tdLabel, { flex: 2.0, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{t.rentalPeriodRow}</Text>
              <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'center', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{rentalPeriodLabel}</Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]}></Text>
              <Text style={[s.tdLabel, { flex: 0.9 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.1 }]}></Text>
              <Text style={[s.tdLabel, { flex: 0.9 }]}></Text>
            </View>
          </View>
        ) : (
          // Fallback – stare oferty (jeden profil)
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 1 }]}>{t.thParam}</Text>
              <Text style={[s.thCell, { width: '45%' }]}>{t.thValue}</Text>
            </View>
            <Row label={t.legacyProfile} value={`${offer.profile_name} (${offer.profile_type})`} alt={false} />
            <Row label={t.legacyQty} value={`${offer.quantity} ${t.unitPcs}`} alt={true} />
            <Row label={t.legacyLengthOne} value={offer.length_m != null ? `${offer.length_m} m` : '–'} alt={false} />
            <Row label={t.legacyTotalLength} value={`${formatNumber(offer.total_length_m, 1)} m`} alt={true} />
            <Row label={t.legacyTotalMass} value={`${formatNumber(offer.mass_t, 3)} t`} alt={false} />
            <Row label={t.legacyWallArea} value={`${formatNumber(offer.wall_area_m2, 2)} m²`} alt={true} />
            <Row label={t.legacyPeriod} value={rentalPeriodLabel} alt={false} />
          </View>
        )}

        {/* ── CENA DZIERŻAWY ── */}
        <View style={s.priceBox}>
          <Text style={s.priceLabel}>{t.rentalCostLabel}</Text>
          <Text style={s.priceValue}>
            {fmtVal(totalWithTransport)}
            <Text style={s.priceSuffix}> {currSuffix}</Text>
          </Text>
          <View style={s.priceRow}>
            <Text>{t.costPerTonLabel} {fmtRatio(offer.mass_t > 0 ? totalWithTransport / offer.mass_t : offer.cost_per_ton ?? 0)} {currCode}/t</Text>
          </View>
        </View>

        {/* ── STAWKA ZA KOLEJNY TYDZIEŃ ── */}
        {offer.price_per_week_1 != null && (
          <View style={[s.priceBox, { marginTop: 10 }]}>
            <Text style={s.priceLabel}>{t.weeklyRateTitle}</Text>
            <Text style={s.priceValue}>
              {isEUR ? formatEUR(offer.price_per_week_1) : formatPLN(offer.price_per_week_1)}
              <Text style={s.priceSuffix}> {currCode}{t.weeklyRateSuffix}</Text>
            </Text>
            <View style={s.priceRow}>
              <Text>{t.weeklyRateNote}</Text>
            </View>
          </View>
        )}

        {/* ── TRANSPORT ── */}
        {(offer.transport_cost_per_truck != null || tPaidBy === 'fca') && (
          <>
            <Text style={s.sectionTitle}>{t.sectionTransport}</Text>
            <View style={s.transportBox}>
              {tPaidBy === 'dap_included' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueDapIncluded}</Text>
                  </View>
                  {offer.transport_from && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}`, alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelRoute}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{offer.transport_from}{offer.transport_to ? ` — ${offer.transport_to}` : ''}</Text>
                    </View>
                  )}
                </>
              )}
              {tPaidBy === 'dap_extra' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueDapExtra}</Text>
                  </View>
                  {offer.transport_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelRoute}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{offer.transport_from}{offer.transport_to ? ` — ${offer.transport_to}` : ''}</Text>
                    </View>
                  )}
                  {offer.transport_trucks != null && (
                    <View style={s.transportRow}>
                      <Text style={s.transportLabel}>{t.labelTrucks}</Text>
                      <Text style={s.transportValue}>{offer.transport_trucks}</Text>
                    </View>
                  )}
                  {offer.transport_cost_per_truck != null && offer.transport_cost_per_truck > 0 && (
                    <View style={s.transportRow}>
                      <Text style={s.transportLabel}>{t.labelCostPerTruck}</Text>
                      <Text style={s.transportValue}>{isEUR ? formatEUR(offer.transport_cost_per_truck / exRate) : formatPLN(offer.transport_cost_per_truck)} {currCode} {t.netSuffix}</Text>
                    </View>
                  )}
                  {offer.transport_cost_total != null && offer.transport_cost_total > 0 && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}` }]}>
                      <Text style={s.transportLabel}>{t.labelTotalTransport}</Text>
                      <Text style={[s.transportValue, { color: C.orange }]}>
                        {isEUR ? formatEUR(offer.transport_cost_total / exRate) : formatPLN(offer.transport_cost_total)} {currCode} {t.netSuffix}
                      </Text>
                    </View>
                  )}
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelSettlement}</Text>
                    <Text style={[s.transportValue, { color: C.orange }]}>{t.valueRecharge}</Text>
                  </View>
                </>
              )}
              {tPaidBy === 'fca' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueFca}</Text>
                  </View>
                  {offer.transport_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelPickupFrom}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{offer.transport_from}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </>
        )}

        {/* ── WARUNKI DZIERŻAWY ── */}
        <Text style={s.sectionTitle}>{t.sectionRentalTerms}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>{tPaidBy === 'fca' ? t.rentalTerm1Fca : t.rentalTerm1}</Text>
          <Text style={s.conditionItem}>{t.rentalTerm2}</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>{t.rentalTerm3}</Text>
        </View>

        <Text style={s.paragraph}>{t.para1}</Text>
        <Text style={s.paragraph}>{t.para2(offer.loss_price_pln ?? 3950, dmgUnit)}</Text>
        <Text style={s.paragraph}>{t.para3}</Text>
        <Text style={s.paragraph}>{t.para4}</Text>

        {/* ── CENNIK SZKÓD ── */}
        <Text style={s.sectionTitle}>{t.sectionDamages}</Text>
        <View style={s.cennikBox}>
          <Text style={s.cennikItem}>{t.damage1(offer.loss_price_pln ?? 3950, dmgUnit)}</Text>
          <Text style={s.cennikItem}>{t.damage2(offer.sorting_price_pln ?? 99, dmgUnit)}</Text>
          <Text style={s.cennikItem}>{t.damage3(offer.grinding_price_pln ?? 250, dmgUnit)}</Text>
          <Text style={s.cennikItem}>{t.damage4(offer.welding_price_pln ?? 250, dmgUnit)}</Text>
          <Text style={s.cennikItem}>{t.damage5(offer.cutting_price_pln ?? 59, dmgUnit)}</Text>
          <Text style={[s.cennikItem, { marginBottom: 0 }]}>{t.damage6(offer.repair_price_pln ?? 250, dmgUnit)}</Text>
        </View>

        {/* ── TERMIN DOSTAWY ── */}
        <Text style={s.sectionTitle}>{t.sectionDelivery}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {offer.delivery_info ? `- ${offer.delivery_info}` : t.deliveryPlaceholder}
          </Text>
        </View>

        {/* ── WARUNKI TECHNICZNE ── */}
        <Text style={s.sectionTitle}>{t.sectionTechnical}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>{t.techStandard}</Text>
          <Text style={s.conditionItem}>{t.techGrade}</Text>
          <Text style={s.conditionItem}>{t.techTolerance}</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>{t.techWeighing}</Text>
        </View>

        {/* ── WARUNKI PŁATNOŚCI ── */}
        <Text style={s.sectionTitle}>{t.sectionPayment}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {offer.payment_days === 0
              ? t.paymentPrepaid
              : t.paymentCredit(offer.payment_days ?? 30)
            }
          </Text>
        </View>

        {/* ── WAŻNOŚĆ OFERTY ── */}
        <Text style={s.sectionTitle}>{t.sectionValidity}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {t.validityLine(t.validityLabel(offer.valid_days))}
          </Text>
        </View>

        <Text style={[s.paragraph, { color: C.gray500 }]}>{t.validityDisclaimer}</Text>

        {/* ── NOTATKI (opcjonalne) ── */}
        {offer.notes && (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>{t.notesLabel}</Text>
            <Text style={s.notesText}>{offer.notes}</Text>
          </View>
        )}

        {/* ── PODPIS HANDLOWCA ── */}
        {offer.prepared_by && SIGNATURES[offer.prepared_by] && (
          <View style={s.signatureBlock}>
            <Image style={s.signatureImg} src={SIGNATURES[offer.prepared_by]} />
          </View>
        )}
      </Page>
    </Document>
  );
}

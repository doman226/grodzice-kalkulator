import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { Offer } from '../types';
import { formatPLN, formatNumber } from '../lib/calculations';

const SALES_REPS: Record<string, string> = {
  'Szymon Sobczak': '579 376 107',
  'Mateusz Cieślicki': '579 141 243',
  'Marzena Sobczak': '579 241 508',
  'Piotr Domański': '729 393 743',
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

export default function OfferPDF({ offer }: Props) {
  const dateStr = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(new Date(offer.created_at));

  // Używamy > 0 zamiast truthy – chroni przed edge case transport_cost_per_truck = 0
  // backward compat: 'intra' (stare) = dap_included
  const tPaidByRaw = offer.transport_paid_by as string | undefined;
  const tPaidBy = tPaidByRaw === 'intra' ? 'dap_included'
                : tPaidByRaw === 'klient' ? 'dap_extra'
                : offer.transport_paid_by;
  const totalWithTransport =
    offer.transport_cost_per_truck != null && offer.transport_cost_per_truck > 0
      ? offer.rental_cost_pln + (tPaidBy === 'dap_included' ? (offer.transport_cost_total ?? 0) : 0)
      : offer.rental_cost_pln;

  function formatMonths(n: number): string {
    if (n === 1) return '1 miesiąc';
    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} miesiące`;
    return `${n} miesięcy`;
  }
  const rentalPeriodLabel = offer.display_unit === 'months'
    ? formatMonths(offer.rental_weeks / 4)
    : `${offer.rental_weeks} tygodni`;

  const headerUrl = `${window.location.origin}/header-logo.png`;
  const footerUrl = `${window.location.origin}/footer-logo.png`;

  function formatValidDays(days: number): string {
    if (days === 1) return '24 godziny';
    if (days === 2 || days === 3 || days === 4) return `${days} dni`;
    return `${days} dni`;
  }

  return (
    <Document title={`Oferta ${offer.offer_number}`} author="Intra B.V." language="pl">
      <Page size="A4" style={s.page}>
        {/* ── HEADER IMAGE ── */}
        <Image fixed style={s.headerImg} src={headerUrl} />

        {/* ── FOOTER IMAGE ── */}
        <Image fixed style={s.footerImg} src={footerUrl} />

        {/* ── TYTUŁ ── */}
        <Text style={s.title}>OFERTA WYNAJMU</Text>

        {/* ── META + KLIENT ── */}
        <View style={s.metaRow}>
          <View style={s.metaLeft}>
            <Text style={s.metaLine}>
              <Text style={s.metaBold}>Data: </Text>
              {dateStr}
            </Text>
            <Text style={s.metaLine}>
              <Text style={s.metaBold}>Numer oferty: </Text>
              {offer.offer_number}
            </Text>
            <Text style={s.metaLine}>
              <Text style={s.metaBold}>Opiekun handlowy: </Text>
              {offer.prepared_by ?? 'Intra B.V.'}
            </Text>
            {offer.prepared_by && SALES_REPS[offer.prepared_by] && (
              <Text style={s.metaLine}>
                <Text style={s.metaBold}>Telefon: </Text>
                {SALES_REPS[offer.prepared_by]}
              </Text>
            )}
          </View>
          <View style={s.metaRight}>
            <Text style={[s.metaBold, { fontSize: 9, marginBottom: 3, color: C.navy }]}>Dane klienta:</Text>
            {offer.client ? (
              <>
                <Text style={[s.metaLine, { fontFamily: 'Roboto', fontWeight: 700, textAlign: 'right' }]}>{offer.client.name}</Text>
                <Text style={[s.metaLine, { textAlign: 'right', color: C.gray500 }]}>
                  {offer.client.country === 'PL' ? `NIP: ${offer.client.nip}` : `VAT: ${offer.client.vat_number}`}
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
        <Text style={s.greeting}>Dzień dobry,</Text>
        <Text style={s.intro}>
          W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności oferujemy usługę dzierżawy grodzic stalowych:
        </Text>

        {/* ── TABELA POZYCJI ── */}
        {offer.items && offer.items.length > 0 ? (
          // Wielopozycyjna tabela (nowe oferty)
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 3 }]}>Profil</Text>
              <Text style={[s.thCell, { flex: 2 }]}>Gatunek stali</Text>
              <Text style={[s.thCell, { flex: 1.5, textAlign: 'center' }]}>Ilość</Text>
              <Text style={[s.thCell, { flex: 1.5, textAlign: 'right' }]}>Dług. [m]</Text>
              <Text style={[s.thCell, { flex: 1.5, textAlign: 'right' }]}>kg/m</Text>
              <Text style={[s.thCell, { flex: 1.5, textAlign: 'right' }]}>Masa [t]</Text>
            </View>
            {[...offer.items].sort((a, b) => a.sort_order - b.sort_order).map((item, idx) => (
              <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                <Text style={[s.tdLabel, { flex: 3, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{item.profile_name} ({item.profile_type})</Text>
                <Text style={[s.tdLabel, { flex: 2, color: C.gray700 }]}>{item.steel_grade ?? '—'}</Text>
                <Text style={[s.tdLabel, { flex: 1.5, textAlign: 'center' }]}>{item.quantity} szt.</Text>
                <Text style={[s.tdLabel, { flex: 1.5, textAlign: 'right' }]}>{item.length_m != null ? `${item.length_m} m` : '–'}</Text>
                <Text style={[s.tdLabel, { flex: 1.5, textAlign: 'right' }]}>{formatNumber(item.total_length_m > 0 ? item.mass_t * 1000 / item.total_length_m : 0, 1)}</Text>
                <Text style={[s.tdLabel, { flex: 1.5, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(item.mass_t, 3)} t</Text>
              </View>
            ))}
            {/* Podsumowanie */}
            <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
              <Text style={[s.tdLabel, { flex: 3, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>Łącznie</Text>
              <Text style={[s.tdLabel, { flex: 1.5 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.5 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.5 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.5, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{formatNumber(offer.mass_t, 3)} t</Text>
            </View>
            {/* Okres */}
            <View style={[s.tableBodyRow, { borderBottom: 0 }]}>
              <Text style={[s.tdLabel, { flex: 3, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>Podstawowy okres dzierżawy</Text>
              <Text style={[s.tdLabel, { flex: 1.5, textAlign: 'center', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{rentalPeriodLabel}</Text>
              <Text style={[s.tdLabel, { flex: 1.5 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.5 }]}></Text>
              <Text style={[s.tdLabel, { flex: 1.5 }]}></Text>
            </View>
          </View>
        ) : (
          // Fallback – stare oferty (jeden profil)
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 1 }]}>Parametr</Text>
              <Text style={[s.thCell, { width: '45%' }]}>Wartość</Text>
            </View>
            <Row label="Profil grodzicy" value={`${offer.profile_name} (${offer.profile_type})`} alt={false} />
            <Row label="Ilość" value={`${offer.quantity} szt.`} alt={true} />
            <Row label="Długość jednej grodzicy" value={offer.length_m != null ? `${offer.length_m} m` : '–'} alt={false} />
            <Row label="Łączna długość" value={`${formatNumber(offer.total_length_m, 1)} m`} alt={true} />
            <Row label="Masa całkowita" value={`${formatNumber(offer.mass_t, 3)} t`} alt={false} />
            <Row label="Powierzchnia ścianki" value={`${formatNumber(offer.wall_area_m2, 2)} m²`} alt={true} />
            <Row label="Podstawowy okres dzierżawy" value={rentalPeriodLabel} alt={false} />
          </View>
        )}

        {/* ── CENA DZIERŻAWY ── */}
        <View style={s.priceBox}>
          <Text style={s.priceLabel}>Koszt dzierżawy</Text>
          <Text style={s.priceValue}>
            {formatPLN(totalWithTransport)}
            <Text style={s.priceSuffix}> PLN netto</Text>
          </Text>
          <View style={s.priceRow}>
            <Text>Koszt dzierżawy za m²: {formatPLN(offer.wall_area_m2 > 0 ? totalWithTransport / offer.wall_area_m2 : offer.cost_per_m2)} PLN/m²</Text>
            <Text>Koszt dzierżawy za tonę: {formatPLN(offer.mass_t > 0 ? totalWithTransport / offer.mass_t : offer.cost_per_ton)} PLN/t</Text>
          </View>
        </View>

        {/* ── STAWKA ZA KOLEJNY TYDZIEŃ ── */}
        {offer.price_per_week_1 != null && (
          <View style={[s.priceBox, { marginTop: 10 }]}>
            <Text style={s.priceLabel}>KAŻDY KOLEJNY TYDZIEŃ DZIERŻAWY</Text>
            <Text style={s.priceValue}>
              {formatPLN(offer.price_per_week_1)}
              <Text style={s.priceSuffix}> PLN/tona netto</Text>
            </Text>
            <View style={s.priceRow}>
              <Text>po upływie podstawowego okresu dzierżawy</Text>
            </View>
          </View>
        )}

        {/* ── TRANSPORT ── */}
        {(offer.transport_cost_per_truck != null || tPaidBy === 'fca') && (
          <>
            <Text style={s.sectionTitle}>Transport:</Text>
            <View style={s.transportBox}>
              {tPaidBy === 'dap_included' && (
                // DAP w cenie – brak kwot dla klienta
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Dostawa:</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>DAP – w cenie / Intra B.V.</Text>
                  </View>
                  {offer.transport_from && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}`, alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>Trasa:</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{offer.transport_from}{offer.transport_to ? ` — ${offer.transport_to}` : ''}</Text>
                    </View>
                  )}
                </>
              )}
              {tPaidBy === 'dap_extra' && (
                // DAP refaktura – Intra organizuje, klient płaci osobno
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Dostawa:</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>DAP / Intra B.V.</Text>
                  </View>
                  {offer.transport_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>Trasa:</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{offer.transport_from}{offer.transport_to ? ` — ${offer.transport_to}` : ''}</Text>
                    </View>
                  )}
                  {offer.transport_trucks != null && (
                    <View style={s.transportRow}>
                      <Text style={s.transportLabel}>Liczba aut:</Text>
                      <Text style={s.transportValue}>{offer.transport_trucks}</Text>
                    </View>
                  )}
                  {offer.transport_cost_per_truck != null && offer.transport_cost_per_truck > 0 && (
                    <View style={s.transportRow}>
                      <Text style={s.transportLabel}>Koszt / auto:</Text>
                      <Text style={s.transportValue}>{formatPLN(offer.transport_cost_per_truck)} PLN netto</Text>
                    </View>
                  )}
                  {offer.transport_cost_total != null && offer.transport_cost_total > 0 && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}` }]}>
                      <Text style={s.transportLabel}>Łączny koszt transportu:</Text>
                      <Text style={[s.transportValue, { color: C.orange }]}>
                        {formatPLN(offer.transport_cost_total)} PLN netto
                      </Text>
                    </View>
                  )}
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Rozliczenie:</Text>
                    <Text style={[s.transportValue, { color: C.orange }]}>Refaktura kosztów transportu na klienta</Text>
                  </View>
                </>
              )}
              {tPaidBy === 'fca' && (
                // FCA – klient organizuje odbiór własny
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Dostawa:</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>FCA – odbiór własny</Text>
                  </View>
                  {offer.transport_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>Odbiór z:</Text>
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
        <Text style={s.sectionTitle} break={offer.transport_cost_per_truck != null}>Warunki dzierżawy:</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>1) Oferowana cena jest ceną z transportami po stronie Intra: magazyn→budowa. Zwrot do magazynu Intra BV (Cieśle 42 k. Wrocławia) jest obowiązkiem i kosztem Klienta.</Text>
          <Text style={s.conditionItem}>2) Na budowie grodzice muszą zostać rozładowane i załadowane na koszt Klienta.</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>3) Podane ceny są cenami netto.</Text>
        </View>

        <Text style={s.paragraph}>
          Pragniemy zaznaczyć, że są to grodzice wypożyczone i w każdym przypadku należy je zwrócić. Zwracamy uwagę, że zwrotowi mogą podlegać wyłącznie materiały dostarczone przez Intra.
        </Text>
        <Text style={s.paragraph}>
          Dostawa i zwrot grodzic muszą nastąpić wg. EN10248-1/2. Za straty materialne, także spowodowane cięciami uszkodzonych części grodzic, obciążymy Państwa dodatkową kwotą w wysokości {offer.loss_price_pln ?? 3950},- zł/tona grodzic.
        </Text>
        <Text style={s.paragraph}>
          Grodzice po zwrocie muszą nadawać się do ponownego użycia – bez konieczności ponownej obróbki, czyszczenia oraz napraw. Grodzice nie mogą posiadać uszkodzeń, zabrudzeń, przylegającej ziemi i innych niedoskonałości ponad normatywne zużycie.
        </Text>
        <Text style={s.paragraph}>W przeciwnym razie obciążymy Państwa następującymi kosztami:</Text>

        {/* ── CENNIK SZKÓD ── */}
        <Text style={s.sectionTitle}>Cennik:</Text>
        <View style={s.cennikBox}>
          <Text style={s.cennikItem}>- Zagubienie / całkowita strata uszkodzonych grodzic = +{offer.loss_price_pln ?? 3950},- zł / tona;</Text>
          <Text style={s.cennikItem}>- Sortowanie oraz czyszczenie grodzic = +{offer.sorting_price_pln ?? 99},- zł / tona;</Text>
          <Text style={s.cennikItem}>- Szlifowanie pozostałości przyspawanych kształtowników = +{offer.grinding_price_pln ?? 250},- zł/mb;</Text>
          <Text style={s.cennikItem}>- Spawanie (zamykanie) otworów pod kotwy = +{offer.welding_price_pln ?? 250},- zł / szt.;</Text>
          <Text style={s.cennikItem}>- Głowica tnąca - w celu np. ucięcia uszkodzenia = +{offer.cutting_price_pln ?? 59},- zł / za cięcie;</Text>
          <Text style={[s.cennikItem, { marginBottom: 0 }]}>- Naprawa / prostowanie zamków = +{offer.repair_price_pln ?? 250},- zł / mb;</Text>
        </View>

        {/* ── TERMIN DOSTAWY ── */}
        <Text style={s.sectionTitle}>Termin dostawy:</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {offer.delivery_info ? `- ${offer.delivery_info}` : '- ............'}
          </Text>
        </View>

        {/* ── WARUNKI TECHNICZNE ── */}
        <Text style={s.sectionTitle}>Warunki techniczne:</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>- dostawa wg. EN10248-1/2.</Text>
          <Text style={s.conditionItem}>- gatunek stali zgodny z ofertą.</Text>
          <Text style={s.conditionItem}>- tolerancja długości +-200mm.</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>- fakturowanie wg. wagi teoretycznej.</Text>
        </View>

        {/* ── WARUNKI PŁATNOŚCI ── */}
        <Text style={s.sectionTitle}>Warunki płatności:</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {offer.payment_days === 0
              ? '- Przedpłata – płatność wymagana przed realizacją zlecenia.'
              : `- ${offer.payment_days ?? 30} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`
            }
          </Text>
        </View>

        {/* ── WAŻNOŚĆ OFERTY ── */}
        <Text style={s.sectionTitle}>Ważność oferty:</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {formatValidDays(offer.valid_days)} od daty przesłania oferty.
          </Text>
        </View>

        <Text style={[s.paragraph, { color: C.gray500 }]}>
          Oferta nie rezerwuje dostępności z magazynu oraz możliwości produkcyjnych i wymaga finalnego potwierdzenia.
        </Text>

        {/* ── NOTATKI (opcjonalne) ── */}
        {offer.notes && (
          <View style={s.notesBox}>
            <Text style={s.notesLabel}>Uwagi</Text>
            <Text style={s.notesText}>{offer.notes}</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}

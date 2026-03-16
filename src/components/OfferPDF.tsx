import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { Offer } from '../types';
import { formatPLN, formatNumber } from '../lib/calculations';

// Rejestracja fontów obsługujących polskie znaki (ą ę ó ś ź ż ć ń ł)
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxP.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmEU9fBBc4AMP6lQ.ttf',
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

  const totalWithTransport =
    offer.transport_cost_per_truck
      ? offer.rental_cost_pln + (offer.transport_paid_by === 'intra' ? (offer.transport_cost_total ?? 0) : 0)
      : offer.rental_cost_pln;

  const headerUrl = `${window.location.origin}/header-logo.png`;
  const footerUrl = `${window.location.origin}/footer-logo.png`;

  return (
    <Document title={`Oferta ${offer.offer_number}`} author="Intra B.V." language="pl">
      <Page size="A4" style={s.page}>
        {/* ── HEADER IMAGE ── */}
        <Image fixed style={s.headerImg} src={headerUrl} />

        {/* ── FOOTER IMAGE ── */}
        <Image fixed style={s.footerImg} src={footerUrl} />

        {/* ── TYTUŁ ── */}
        <Text style={s.title}>OFERTA</Text>

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
              Intra B.V.
            </Text>
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

        {/* ── TABELA PARAMETRÓW ── */}
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.thCell, { flex: 1 }]}>Parametr</Text>
            <Text style={[s.thCell, { width: '45%' }]}>Wartość</Text>
          </View>
          <Row label="Profil grodzicy" value={`${offer.profile_name} (${offer.profile_type})`} alt={false} />
          <Row label="Ilość" value={`${offer.quantity} szt.`} alt={true} />
          <Row label="Długość jednej grodzicy" value={`${offer.length_m} m`} alt={false} />
          <Row label="Łączna długość" value={`${offer.total_length_m} m`} alt={true} />
          <Row label="Masa całkowita" value={`${formatNumber(offer.mass_t, 3)} t`} alt={false} />
          <Row label="Powierzchnia ścianki" value={`${formatPLN(offer.wall_area_m2)} m²`} alt={true} />
          <Row label="Okres dzierżawy" value={`${offer.rental_weeks} tygodni`} alt={false} />
        </View>

        {/* ── CENA DZIERŻAWY ── */}
        <View style={s.priceBox}>
          <Text style={s.priceLabel}>Koszt dzierżawy</Text>
          <Text style={s.priceValue}>
            {formatPLN(offer.rental_cost_pln)}
            <Text style={s.priceSuffix}> PLN netto</Text>
          </Text>
          <View style={s.priceRow}>
            <Text>{formatPLN(offer.cost_per_m2)} PLN/m²</Text>
            <Text>{formatPLN(offer.cost_per_ton)} PLN/t</Text>
          </View>
        </View>

        {/* ── KOSZT KOLEJNEGO TYGODNIA ── */}
        {offer.weekly_cost_pln != null && (
          <View style={s.priceBox}>
            <Text style={s.priceLabel}>Koszt każdego kolejnego tygodnia</Text>
            <Text style={s.priceValue}>
              {formatPLN(offer.weekly_cost_pln)}
              <Text style={s.priceSuffix}> PLN netto</Text>
            </Text>
            {offer.price_per_week_1 != null && (
              <View style={s.priceRow}>
                <Text>Stawka: {formatPLN(offer.price_per_week_1)} PLN/t/tydz.</Text>
              </View>
            )}
          </View>
        )}

        {/* ── TRANSPORT ── */}
        {offer.transport_cost_per_truck != null && (
          <>
            <Text style={s.sectionTitle}>Transport:</Text>
            <View style={s.transportBox}>
              <View style={s.transportRow}>
                <Text style={s.transportLabel}>Liczba aut:</Text>
                <Text style={s.transportValue}>{offer.transport_trucks}</Text>
              </View>
              <View style={s.transportRow}>
                <Text style={s.transportLabel}>Koszt / auto:</Text>
                <Text style={s.transportValue}>{formatPLN(offer.transport_cost_per_truck)} PLN</Text>
              </View>
              <View style={s.transportRow}>
                <Text style={s.transportLabel}>Łączny koszt transportu:</Text>
                <Text style={[s.transportValue, { color: offer.transport_paid_by === 'klient' ? '#D97706' : C.gray800 }]}>
                  {formatPLN(offer.transport_cost_total ?? 0)} PLN
                </Text>
              </View>
              <View style={s.transportRow}>
                <Text style={s.transportLabel}>Koszt transportu pokrywa:</Text>
                <Text style={[s.transportValue, { color: offer.transport_paid_by === 'klient' ? '#D97706' : C.gray800 }]}>
                  {offer.transport_paid_by === 'klient' ? 'Klient' : 'Intra B.V.'}
                </Text>
              </View>
              {offer.transport_from && (
                <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}` }]}>
                  <Text style={s.transportLabel}>Trasa:</Text>
                  <Text style={s.transportValue}>{offer.transport_from} → {offer.transport_to || '—'}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── ŁĄCZNA KWOTA (jeśli jest transport po stronie Intra) ── */}
        {offer.transport_cost_per_truck != null && offer.transport_paid_by === 'intra' && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Łączna kwota oferty:</Text>
            <Text style={s.totalValue}>{formatPLN(totalWithTransport)} PLN netto</Text>
          </View>
        )}

        {/* ── WARUNKI DZIERŻAWY ── */}
        <Text style={s.sectionTitle}>Warunki dzierżawy:</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>1) Oferowana cena jest ceną z transportami po stronie Intra: magazyn→budowa. Zwrot do magazynu Intra BV (Cieśle 42 k. Wrocławia) jest obowiązkiem i kosztem Klienta.</Text>
          <Text style={s.conditionItem}>2) Podstawowy okres dzierżawy to 2 miesiące (8 tygodni).</Text>
          <Text style={s.conditionItem}>3) Każdy dodatkowy tydzień dzierżawy to koszt +{offer.price_per_week_1 ?? 25},- zł/tona.</Text>
          <Text style={s.conditionItem}>4) Na budowie grodzice muszą zostać rozładowane i załadowane na koszt Klienta.</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>5) Podane ceny są cenami netto.</Text>
        </View>

        <Text style={s.paragraph}>
          Pragniemy zaznaczyć, że są to grodzice wypożyczone i w każdym przypadku należy je zwrócić. Zwracamy uwagę, że zwrotowi mogą podlegać wyłącznie materiały dostarczone przez Intra.
        </Text>
        <Text style={s.paragraph}>
          Dostawa i zwrot grodzic muszą nastąpić wg. EN10248-1/2. Za straty materialne, także spowodowane cięciami uszkodzonych części grodzic, obciążymy Państwa dodatkową kwotą w wysokości 3 950,- zł/tona grodzic.
        </Text>
        <Text style={s.paragraph}>
          Grodzice po zwrocie muszą nadawać się do ponownego użycia – bez konieczności ponownej obróbki, czyszczenia oraz napraw. Grodzice nie mogą posiadać uszkodzeń, zabrudzeń, przylegającej ziemi i innych niedoskonałości ponad normatywne zużycie.
        </Text>
        <Text style={s.paragraph}>W przeciwnym razie obciążymy Państwa następującymi kosztami:</Text>

        {/* ── CENNIK SZKÓD ── */}
        <Text style={s.sectionTitle}>Cennik:</Text>
        <View style={s.cennikBox}>
          <Text style={s.cennikItem}>- Zagubienie / całkowita strata uszkodzonych grodzic = +3 950,- zł / tona;</Text>
          <Text style={s.cennikItem}>- Sortowanie oraz czyszczenie grodzic = +99,- zł / tona;</Text>
          <Text style={s.cennikItem}>- Szlifowanie pozostałości przyspawanych kształtowników = +250,- zł/mb;</Text>
          <Text style={s.cennikItem}>- Spawanie (zamykanie) otworów pod kotwy = +250,- zł / szt.;</Text>
          <Text style={s.cennikItem}>- Głowica tnąca - w celu np. ucięcia uszkodzenia = +59,- zł / za cięcie;</Text>
          <Text style={[s.cennikItem, { marginBottom: 0 }]}>- Naprawa / prostowanie zamków = +250,- zł / mb;</Text>
        </View>

        {/* ── WAŻNOŚĆ ── */}
        <Text style={s.validityText}>
          Oferta ważna {offer.valid_days} dni od daty wystawienia.
        </Text>

        {/* ── NOTATKI ── */}
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

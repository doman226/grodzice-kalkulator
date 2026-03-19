import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import type { SaleOffer } from '../../types';
import { formatEUR, formatPLN, formatNumber } from '../../lib/calculations';

// ─── Fonty (identyczne z OfferPDF) ───────────────────────────────────────────

const SALES_REPS: Record<string, string> = {
  'Szymon Sobczak':    '579 376 107',
  'Mateusz Cieślicki': '579 141 243',
  'Marzena Sobczak':   '579 241 508',
  'Piotr Domański':    '729 393 743',
};

Font.register({
  family: 'Roboto',
  fonts: [
    { src: `${window.location.origin}/fonts/Roboto-Regular.ttf`, fontWeight: 400 },
    { src: `${window.location.origin}/fonts/Roboto-Bold.ttf`,    fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(word => [word]);

// ─── Kolory (identyczne z OfferPDF) ──────────────────────────────────────────

const C = {
  navy:      '#1E3A5F',
  navyLight: '#2D5080',
  blue100:   '#DBEAFE',
  blue200:   '#BFDBFE',
  blueText:  '#1D4ED8',
  gray50:    '#F9FAFB',
  gray100:   '#F3F4F6',
  gray200:   '#E5E7EB',
  gray400:   '#9CA3AF',
  gray500:   '#6B7280',
  gray700:   '#374151',
  gray800:   '#1F2937',
  white:     '#FFFFFF',
  orange:    '#D97706',
};

// ─── Style (identyczne z OfferPDF, bez zmian) ─────────────────────────────────

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
  headerImg: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  footerImg: { position: 'absolute', bottom: 0, left: 0, right: 0, width: '100%' },

  title: {
    textAlign: 'center',
    fontSize: 13,
    fontFamily: 'Roboto',
    fontWeight: 700,
    letterSpacing: 2,
    marginBottom: 14,
    color: C.navy,
  },

  metaRow:   { flexDirection: 'row', marginBottom: 14 },
  metaLeft:  { flex: 1 },
  metaRight: { width: '42%', alignItems: 'flex-end' },
  metaLine:  { marginBottom: 2, fontSize: 9 },
  metaBold:  { fontFamily: 'Roboto', fontWeight: 700 },

  sep: { borderBottom: `1 solid ${C.gray200}`, marginBottom: 10, marginTop: 4 },

  greeting: { marginBottom: 5, fontSize: 9 },
  intro:     { marginBottom: 10, lineHeight: 1.5, fontSize: 9, color: C.gray700 },

  table:          { marginBottom: 10, border: `1 solid ${C.gray200}`, borderRadius: 4, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: C.navy },
  tableBodyRow:   { flexDirection: 'row', borderBottom: `1 solid ${C.gray200}` },
  tableBodyRowAlt:{ flexDirection: 'row', borderBottom: `1 solid ${C.gray200}`, backgroundColor: C.gray50 },
  thCell: { padding: 5, color: C.white, fontFamily: 'Roboto', fontWeight: 700, fontSize: 8 },
  tdLabel:{ padding: 4, color: C.gray500, fontSize: 8, flex: 1 },
  tdValue:{ padding: 4, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800, fontSize: 8, width: '45%' },

  priceBox: {
    backgroundColor: C.navy,
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  priceLabel: { fontSize: 7, color: C.blue200, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  priceValue: { fontSize: 18, fontFamily: 'Roboto', fontWeight: 700, color: C.white },
  priceSuffix:{ fontSize: 10, fontFamily: 'Roboto', color: C.blue200 },
  priceRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
    paddingTop: 5,
    borderTop: `1 solid ${C.navyLight}`,
    fontSize: 7,
    color: C.blue200,
  },

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
  transportLabel: { color: C.gray500 },
  transportValue: { fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 },

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
  totalLabel: { fontFamily: 'Roboto', fontWeight: 700, fontSize: 10, color: C.navy },
  totalValue: { fontFamily: 'Roboto', fontWeight: 700, fontSize: 11, color: C.navy },

  conditionsBox: {
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    backgroundColor: C.gray50,
  },
  conditionItem: { marginBottom: 4, lineHeight: 1.5, fontSize: 8, color: C.gray700 },
  paragraph:     { marginBottom: 5, lineHeight: 1.5, fontSize: 8, color: C.gray700 },

  validityText: { marginTop: 6, fontSize: 8, fontFamily: 'Roboto', fontWeight: 700, color: C.navy },
  notesBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: C.blue100,
    borderRadius: 4,
    border: `1 solid ${C.blue200}`,
  },
  notesLabel: { fontSize: 7, fontFamily: 'Roboto', fontWeight: 700, color: C.blueText, marginBottom: 3, textTransform: 'uppercase' },
  notesText:  { fontSize: 8, color: C.gray700, lineHeight: 1.5 },
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  offer: SaleOffer;
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function SaleOfferPDF({ offer }: Props) {
  const dateStr     = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(new Date(offer.created_at));
  const headerUrl   = `${window.location.origin}/header-logo.png`;
  const footerUrl   = `${window.location.origin}/footer-logo.png`;
  const currency    = offer.currency ?? 'EUR';
  const exchRate    = offer.exchange_rate ?? 4.25;
  const isEUR       = currency === 'EUR';

  const totalSellEUR = offer.total_sell_eur ?? 0;
  const totalSellPLN = offer.total_sell_pln ?? 0;
  const delivCostPLN = (offer.delivery_paid_by === 'intra' && offer.delivery_cost_total)
    ? offer.delivery_cost_total : 0;
  const delivCostEUR = delivCostPLN / exchRate;
  const totalForClientPLN = totalSellPLN + delivCostPLN;
  const totalForClientEUR = totalSellEUR + delivCostEUR;

  // Posortowane pozycje
  const sortedItems = [...(offer.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  // Masa łączna
  const totalMassT = sortedItems.reduce((sum, i) => sum + (i.mass_t ?? 0), 0);

  // Termin dostawy → tekst na PDF
  function deliveryTimelineText(): string {
    if (offer.delivery_timeline === 'huta') {
      const kampania = offer.campaign_weeks ?? '??';
      const dostawa  = offer.campaign_delivery_weeks;
      return `produkcja w planowanej kampanii w tyg. ${kampania}`
        + (dostawa ? ` – dostawy wstępnie możliwe od ${dostawa} tygodnia` : '')
        + ' – do potwierdzenia po zakończonej produkcji.';
    }
    return `z magazynu${offer.warehouse_delivery_time ? `, ${offer.warehouse_delivery_time}` : ''}.`;
  }

  // Warunki dostawy → tekst na PDF
  function deliveryTermsText(): string {
    if (offer.delivery_terms === 'FCA') {
      return `odbiór własny wg. FCA (${offer.fca_location ?? 'magazyn odbioru'}).`;
    }
    const addr = offer.delivery_to ?? 'adres dostawy';
    return `dostawa w cenie wg. DAP (${addr}).`;
  }

  // Warunki handlowe → tekst na PDF
  function paymentText(): string {
    if (offer.payment_days === 0) return 'przedpłata 100%.';
    return `${offer.payment_days} dni od daty wystawienia faktury, z zastrzeżeniem uzyskania zabezpieczenia wartości zamówienia (Limit kupiecki, gwarancja bankowa, gwarancja płatności publicznego inwestora lub inne zabezpieczenie zaakceptowane przez Intra BV).`;
  }

  // Ważność oferty → tekst
  function validityLabel(): string {
    if (offer.valid_days === 1) return '24h';
    return `${offer.valid_days} dni`;
  }

  return (
    <Document title={`Oferta ${offer.offer_number}`} author="Intra B.V." language="pl">
      <Page size="A4" style={s.page}>

        {/* ── HEADER / FOOTER IMAGE ── */}
        <Image fixed style={s.headerImg} src={headerUrl} />
        <Image fixed style={s.footerImg} src={footerUrl} />

        {/* ── TYTUŁ ── */}
        <Text style={s.title}>OFERTA SPRZEDAŻY</Text>

        {/* ── META + KLIENT ── */}
        <View style={s.metaRow}>
          <View style={s.metaLeft}>
            <Text style={s.metaLine}><Text style={s.metaBold}>Data: </Text>{dateStr}</Text>
            <Text style={s.metaLine}><Text style={s.metaBold}>Numer oferty: </Text>{offer.offer_number}</Text>
            <Text style={s.metaLine}><Text style={s.metaBold}>Opiekun handlowy: </Text>{offer.prepared_by ?? 'Intra B.V.'}</Text>
            {offer.prepared_by && SALES_REPS[offer.prepared_by] && (
              <Text style={s.metaLine}><Text style={s.metaBold}>Telefon: </Text>{SALES_REPS[offer.prepared_by]}</Text>
            )}
            <Text style={s.metaLine}><Text style={s.metaBold}>Kurs EUR/PLN: </Text>{exchRate.toFixed(4)} (NBP)</Text>
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
          W nawiązaniu do przesłanego zapytania oraz naszych Ogólnych Warunków Sprzedaży i Płatności,
          oferujemy sprzedaż grodzic stalowych na poniższych warunkach:
        </Text>

        {/* ── TABELA POZYCJI ── */}
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.thCell, { flex: 2.6 }]}>Profil</Text>
            <Text style={[s.thCell, { flex: 2.0 }]}>Gatunek stali</Text>
            <Text style={[s.thCell, { flex: 1.0, textAlign: 'center' }]}>Ilość</Text>
            <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>Dług. [m]</Text>
            <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>kg/m</Text>
            <Text style={[s.thCell, { flex: 1.2, textAlign: 'right' }]}>Masa [t]</Text>
          </View>

          {sortedItems.map((item, idx) => {
            const kgPerM = item.total_length_m > 0
              ? (item.mass_t * 1000) / item.total_length_m
              : 0;
            return (
              <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                <Text style={[s.tdLabel, { flex: 2.6, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                  {item.profile_name}
                  {item.is_paired ? ' ×2' : ''}
                </Text>
                <Text style={[s.tdLabel, { flex: 2.0, color: C.gray700 }]}>
                  {item.steel_grade ?? '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'center' }]}>
                  {item.is_paired
                    ? `${item.quantity} par`
                    : `${item.quantity} szt.`}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right' }]}>
                  {item.length_m != null ? `${item.length_m} m` : '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 0.8, textAlign: 'right', color: C.gray700 }]}>
                  {formatNumber(kgPerM, 1)}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                  {formatNumber(item.mass_t, 3)} t
                </Text>
              </View>
            );
          })}

          {/* Wiersz sumy */}
          <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
            <Text style={[s.tdLabel, { flex: 2.6, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>Łącznie</Text>
            <Text style={[s.tdLabel, { flex: 2.0 }]} />
            <Text style={[s.tdLabel, { flex: 1.0 }]} />
            <Text style={[s.tdLabel, { flex: 1.0 }]} />
            <Text style={[s.tdLabel, { flex: 0.8 }]} />
            <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
              {formatNumber(totalMassT, 3)} t
            </Text>
          </View>
        </View>

        {/* ── CENA SPRZEDAŻY ── */}
        <View style={s.priceBox}>
          <Text style={s.priceLabel}>Cena sprzedaży</Text>
          <Text style={s.priceValue}>
            {isEUR ? formatEUR(totalSellEUR) : formatPLN(totalSellPLN)}
            <Text style={s.priceSuffix}> {currency} netto</Text>
          </Text>
          <View style={s.priceRow}>
            {(() => {
              const priced = sortedItems.filter(item => item.sell_eur_t != null);
              const allSame = priced.length > 0 && priced.every(i => i.sell_eur_t === priced[0].sell_eur_t);
              if (allSame) {
                return (
                  <Text>Cena sprzedaży za tonę: {priced[0].sell_eur_t} EUR/t</Text>
                );
              }
              return priced.map((item, i) => (
                <Text key={i}>
                  {item.profile_name}: {item.sell_eur_t} EUR/t
                </Text>
              ));
            })()}
            {!isEUR && (
              <Text style={{ marginLeft: 'auto' }}>
                kurs {exchRate.toFixed(4)} PLN/EUR
              </Text>
            )}
          </View>
        </View>

        {/* ── DOSTAWA ── */}
        {offer.delivery_cost_total != null && offer.delivery_cost_total > 0 && (
          <>
            <Text style={s.sectionTitle}>Dostawa:</Text>
            <View style={s.transportBox}>
              {offer.delivery_paid_by === 'intra' ? (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Dostawa:</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>W cenie / Intra B.V.</Text>
                  </View>
                  {(offer.delivery_from || offer.delivery_to) && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}`, alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>Trasa:</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>
                        {offer.delivery_from}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Liczba aut:</Text>
                    <Text style={s.transportValue}>{offer.delivery_trucks ?? '—'}</Text>
                  </View>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>Koszt dostawy:</Text>
                    <Text style={[s.transportValue, { color: C.orange }]}>
                      {isEUR
                        ? `${formatEUR(offer.delivery_cost_total! / exchRate)} EUR (po stronie Klienta)`
                        : `${formatPLN(offer.delivery_cost_total!)} PLN (po stronie Klienta)`
                      }
                    </Text>
                  </View>
                  {(offer.delivery_from || offer.delivery_to) && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}`, alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>Trasa:</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>
                        {offer.delivery_from}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Łącznie dla Klienta gdy dostawa po stronie Intra */}
            {offer.delivery_paid_by === 'intra' && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Łącznie dla Klienta (netto, towary + dostawa)</Text>
                <Text style={s.totalValue}>
                  {isEUR
                    ? `${formatEUR(totalForClientEUR)} EUR`
                    : `${formatPLN(totalForClientPLN)} PLN`
                  }
                </Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════
            WARUNKI OFERTY
        ══════════════════════════════════════ */}

        {/* ── TERMIN DOSTAWY ── */}
        <Text style={s.sectionTitle}>Termin dostawy:</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {deliveryTimelineText()}
          </Text>
        </View>

        {/* ── WARUNKI DOSTAWY (Incoterms) ── */}
        <Text style={s.sectionTitle}>Warunki dostawy:</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {deliveryTermsText()}
          </Text>
        </View>

        {/* ── WARUNKI TECHNICZNE ── */}
        <Text style={s.sectionTitle}>Warunki techniczne:</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>- dostawa wg. EN10248-1/2.</Text>
          <Text style={s.conditionItem}>- gatunek stali zgodny z ofertą.</Text>
          <Text style={s.conditionItem}>- tolerancja długości +-200mm.</Text>
          <Text style={s.conditionItem}>- certyfikat 3.1/EN10204.</Text>
          <Text style={s.conditionItem}>- fakturowanie wg. wagi teoretycznej.</Text>
          {!isEUR && (
            <Text style={[s.conditionItem, { marginBottom: 0 }]}>
              - oferta kalkulowana po kursie €/zł z dnia przesłania oferty.
            </Text>
          )}
          {isEUR && (
            <Text style={[s.conditionItem, { marginBottom: 0 }]}>
              - ceny podane w EUR netto.
            </Text>
          )}
        </View>

        {/* ── WARUNKI HANDLOWE ── */}
        <Text style={s.sectionTitle}>Warunki handlowe:</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {paymentText()}
          </Text>
        </View>

        {/* ── WAŻNOŚĆ OFERTY ── */}
        <Text style={s.sectionTitle}>Ważność oferty:</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>
            - Oferta ważna {validityLabel()} od daty wysłania i wymaga finalnego potwierdzenia.
          </Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - Oferta nie rezerwuje dostępności magazynowych oraz możliwości produkcyjnych.
          </Text>
        </View>

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

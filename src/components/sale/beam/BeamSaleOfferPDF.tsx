import { Document, Page, View, Text, Image, StyleSheet, Font, Link } from '@react-pdf/renderer';
import type { BeamSaleOffer } from '../../../types';
import { formatPLN, formatEUR, formatNumber, formatRound } from '../../../lib/calculations';
import { BEAM_SALE_PDF_STRINGS, translateWarehouseLocation, translateWarehouseDeliveryTime } from '../../../lib/pdfStrings';
import type { PdfLang } from '../../../lib/pdfStrings';
import { SALES_REPS as SALES_REPS_LIST } from '../../../lib/constants';

// Lookup map name → phone
const SALES_REPS: Record<string, string> = Object.fromEntries(
  SALES_REPS_LIST.map(r => [r.name, r.phone])
);

const SIGNATURES: Record<string, string> = {
  'Szymon Sobczak':    `${window.location.origin}/signatures/Sobczak.png`,
  'Mateusz Cieślicki': `${window.location.origin}/signatures/${encodeURIComponent('Cieślicki.png')}`,
  'Marzena Sobczak':   `${window.location.origin}/signatures/M.Sobczak.png`,
};

Font.register({
  family: 'Roboto',
  fonts: [
    { src: `${window.location.origin}/fonts/Roboto-Regular.ttf`, fontWeight: 400 },
    { src: `${window.location.origin}/fonts/Roboto-Bold.ttf`,    fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(word => [word]);

interface Props {
  offer: BeamSaleOffer;
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
    paddingBottom: 130,
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

  metaRow: { flexDirection: 'row', marginBottom: 14 },
  metaLeft: { flex: 1 },
  metaRight: { width: '42%', alignItems: 'flex-end' },
  metaLine: { marginBottom: 2, fontSize: 9 },
  metaBold: { fontFamily: 'Roboto', fontWeight: 700 },

  sep: { borderBottom: `1 solid ${C.gray200}`, marginBottom: 10, marginTop: 4 },

  greeting: { marginBottom: 5, fontSize: 9 },
  intro: { marginBottom: 10, lineHeight: 1.5, fontSize: 9, color: C.gray700 },
  introLink: { color: '#1D4ED8', textDecoration: 'underline' },

  signatureBlock: { marginTop: 28 },
  signatureImg:   { width: 160, height: 80, objectFit: 'contain' },

  table: {
    marginBottom: 10,
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: C.navy },
  tableBodyRow: { flexDirection: 'row', borderBottom: `1 solid ${C.gray200}` },
  tableBodyRowAlt: { flexDirection: 'row', borderBottom: `1 solid ${C.gray200}`, backgroundColor: C.gray50 },
  thCell: { padding: 5, color: C.white, fontFamily: 'Roboto', fontWeight: 700, fontSize: 8 },
  tdLabel: { padding: 4, color: C.gray500, fontSize: 8, flex: 1 },

  priceBox: { backgroundColor: C.navy, padding: 10, borderRadius: 4, marginBottom: 8 },
  priceLabel: { fontSize: 7, color: C.blue200, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  priceValue: { fontSize: 18, fontFamily: 'Roboto', fontWeight: 700, color: C.white },
  priceSuffix: { fontSize: 10, fontFamily: 'Roboto', color: C.blue200 },
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
  transportRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3, fontSize: 8 },
  transportLabel: { color: C.gray500 },
  transportValue: { fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 },

  conditionsBox: {
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    backgroundColor: C.gray50,
  },
  conditionItem: { marginBottom: 4, lineHeight: 1.5, fontSize: 8, color: C.gray700 },
  paragraph: { marginBottom: 5, lineHeight: 1.5, fontSize: 8, color: C.gray700 },

  notesBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: C.blue100,
    borderRadius: 4,
    border: `1 solid ${C.blue200}`,
  },
  notesLabel: { fontSize: 7, fontFamily: 'Roboto', fontWeight: 700, color: C.blueText, marginBottom: 3, textTransform: 'uppercase' },
  notesText: { fontSize: 8, color: C.gray700, lineHeight: 1.5 },
});

export default function BeamSaleOfferPDF({ offer, lang = 'pl' }: Props) {
  const t = BEAM_SALE_PDF_STRINGS[lang];

  const dateLocale = lang === 'en' ? 'en-GB' : 'pl-PL';
  const dateStr = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'long' }).format(new Date(offer.created_at));

  const currency = offer.currency ?? 'PLN';
  const isEUR    = currency === 'EUR';
  const exchRate = offer.exchange_rate ?? 4.25;
  const isUsed   = offer.is_used === true;   // dwuteowniki używane → skrócona sekcja techniczna

  // Nagłówki kolumn zależne od waluty oferty
  const thPriceT = isEUR ? t.thPricePerT : (lang === 'pl' ? 'Cena [PLN/t]'   : 'Price [PLN/t]');
  const thValueC = isEUR ? t.thValue     : (lang === 'pl' ? 'Wartość [PLN]'  : 'Value [PLN]');

  const sortedItems = [...(offer.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const totalMassT   = offer.total_mass_t ?? sortedItems.reduce((sum, i) => sum + (i.mass_t ?? 0), 0);
  const totalSellEUR = sortedItems.reduce((sum, i) => sum + (i.sell_value_eur ?? 0), 0);
  const totalSellPLN = sortedItems.reduce((sum, i) => sum + (i.sell_value_pln ?? 0), 0);

  const dPaidBy = offer.delivery_paid_by;
  const isFcaLike = dPaidBy === 'fca' || dPaidBy === 'cif';

  // delivery_cost_total zawsze w PLN → przelicz na EUR jeśli potrzeba
  const deliveryCostPLN = (dPaidBy === 'dap_included' && (offer.delivery_cost_total ?? 0) > 0)
    ? (offer.delivery_cost_total ?? 0) : 0;
  const deliveryCostEUR = exchRate > 0 ? deliveryCostPLN / exchRate : 0;
  // Cena dla klienta = dwuteowniki + transport (gdy DAP w cenie)
  const totalForClientEUR = totalSellEUR + deliveryCostEUR;
  const totalForClientPLN = totalSellPLN + deliveryCostPLN;

  function deliveryTimelineText(): string {
    if (offer.delivery_timeline === 'huta') {
      const kampania = offer.campaign_weeks ?? '??';
      const dostawa  = offer.campaign_delivery_weeks;
      return t.deliveryFromMill(String(kampania), dostawa ? String(dostawa) : undefined);
    }
    return t.deliveryFromStock(translateWarehouseDeliveryTime(offer.warehouse_delivery_time, lang));
  }

  function deliveryTermsText(): string {
    const destination = offer.delivery_to ?? (lang === 'en' ? 'delivery address' : 'adres dostawy');
    if (offer.delivery_terms === 'FCA') {
      return t.deliveryFca(offer.fca_location ?? (lang === 'en' ? 'collection warehouse' : 'magazyn odbioru'));
    }
    if (offer.delivery_terms === 'CIF') {
      return t.deliveryCif(offer.delivery_from ?? (lang === 'en' ? 'destination port' : 'port docelowy'));
    }
    if (offer.delivery_terms === 'DAP_EXTRA') {
      return t.deliveryDapExtra(destination);
    }
    return t.deliveryDap(destination);
  }

  const headerUrl = `${window.location.origin}/header-logo.png`;
  const footerUrl = `${window.location.origin}/footer-logo.png`;

  // Wartość dwuteowników w rozbiciu: przy DAP w cenie transport wliczony w kwotę belek
  // (wzorzec SP — dzięki temu rozbicie sumuje się do totalForClient bez osobnej linii transportu).
  const beamValEUR = totalForClientEUR;
  const beamValPLN = totalForClientPLN;
  const pricePerT  = totalMassT > 0 ? (isEUR ? beamValEUR : beamValPLN) / totalMassT : null;

  return (
    <Document title={t.docTitle(offer.offer_number)} author="Intra B.V." language={t.docLanguage}>
      <Page size="A4" style={s.page}>
        <Image fixed style={s.headerImg} src={headerUrl} />
        <Image fixed style={s.footerImg} src={footerUrl} />

        <Text style={s.title}>{t.offerTitle}</Text>

        {/* ── META + KLIENT ── */}
        <View style={s.metaRow}>
          <View style={s.metaLeft}>
            <Text style={s.metaLine}><Text style={s.metaBold}>{t.date} </Text>{dateStr}</Text>
            <Text style={s.metaLine}><Text style={s.metaBold}>{t.offerNumber} </Text>{offer.offer_number}</Text>
            <Text style={s.metaLine}><Text style={s.metaBold}>{t.salesRep} </Text>{offer.prepared_by ?? 'Intra B.V.'}</Text>
            {offer.prepared_by && SALES_REPS[offer.prepared_by] && (
              <Text style={s.metaLine}><Text style={s.metaBold}>{t.phone} </Text>{SALES_REPS[offer.prepared_by]}</Text>
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
            {offer.task_name && (
              <Text style={[s.metaLine, { textAlign: 'right', color: C.navy }]}>
                <Text style={s.metaBold}>{t.taskLabel} </Text>{offer.task_name}
              </Text>
            )}
          </View>
        </View>

        <View style={s.sep} />

        {/* ── POWITANIE ── */}
        <Text style={s.greeting}>{t.greeting}</Text>
        {(() => {
          const OWH_URL = 'https://www.intrabv.com/wp-content/uploads/2026/01/IntraBV-Algemene-Voorwaarden-PL-2026.pdf';
          const linkText = lang === 'pl' ? 'Ogólnych Warunków Sprzedaży i Płatności' : 'General Terms and Conditions of Sale and Payment';
          const [before, after] = t.intro.split(linkText);
          return (
            <Text style={s.intro}>
              {before}
              <Link src={OWH_URL} style={s.introLink}>{linkText}</Link>
              {after}
            </Text>
          );
        })()}

        {/* ── TABELA POZYCJI (7 kolumn sprzedażowych) ── */}
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.thCell, { flex: 2.2 }]}>{t.thProfile}</Text>
            <Text style={[s.thCell, { flex: 1.4 }]}>{t.thSteelGrade}</Text>
            <Text style={[s.thCell, { flex: 1.0, textAlign: 'center' }]}>{t.thQty}</Text>
            <Text style={[s.thCell, { flex: 1.1, textAlign: 'right' }]}>{t.thLength}</Text>
            <Text style={[s.thCell, { flex: 1.2, textAlign: 'right' }]}>{t.thMass}</Text>
            <Text style={[s.thCell, { flex: 1.3, textAlign: 'right' }]}>{thPriceT}</Text>
            <Text style={[s.thCell, { flex: 1.4, textAlign: 'right' }]}>{thValueC}</Text>
          </View>
          {sortedItems.map((item, idx) => (
            <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
              <Text style={[s.tdLabel, { flex: 2.2, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{item.profile_name}</Text>
              <Text style={[s.tdLabel, { flex: 1.4, color: C.gray700 }]}>{item.steel_grade ?? '—'}</Text>
              <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'center' }]}>{item.quantity_pcs} {t.unitPcs}</Text>
              <Text style={[s.tdLabel, { flex: 1.1, textAlign: 'right' }]}>{item.length_m != null ? `${item.length_m} m` : '–'}</Text>
              <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(item.mass_t, 3)} t</Text>
              <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', color: C.gray700 }]}>{formatRound(item.sell_per_ton)} {currency}/t</Text>
              <Text style={[s.tdLabel, { flex: 1.4, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                {isEUR ? formatEUR(item.sell_value_eur) : formatPLN(item.sell_value_pln)} {currency}
              </Text>
            </View>
          ))}
          {/* Podsumowanie */}
          <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
            <Text style={[s.tdLabel, { flex: 2.2, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.totalRow}</Text>
            <Text style={[s.tdLabel, { flex: 1.4 }]}></Text>
            <Text style={[s.tdLabel, { flex: 1.0 }]}></Text>
            <Text style={[s.tdLabel, { flex: 1.1 }]}></Text>
            <Text style={[s.tdLabel, { flex: 1.2, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{formatNumber(totalMassT, 3)} t</Text>
            <Text style={[s.tdLabel, { flex: 1.3 }]}></Text>
            <Text style={[s.tdLabel, { flex: 1.4, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
              {isEUR ? formatEUR(totalSellEUR) : formatPLN(totalSellPLN)} {currency}
            </Text>
          </View>
        </View>

        {/* ── CENA SPRZEDAŻY ── */}
        <View style={s.priceBox}>
          <Text style={s.priceLabel}>{t.priceLabel}</Text>
          <Text style={s.priceValue}>
            {isEUR ? formatEUR(totalForClientEUR) : formatPLN(totalForClientPLN)}
            <Text style={s.priceSuffix}> {currency} {t.netSuffix}</Text>
          </Text>
          <View style={[s.priceRow, { flexDirection: 'column', gap: 3 }]}>
            <Text>
              {t.breakdownBeams}: {isEUR ? formatEUR(beamValEUR) : formatPLN(beamValPLN)} {currency}
              {pricePerT != null ? `  ·  ${formatRound(pricePerT)} ${currency}/t` : ''}
            </Text>
            {/* DAP w cenie – transport zawarty w kwocie dwuteowników powyżej; nie pokazujemy osobnej linii */}
          </View>
        </View>

        {/* ── TRANSPORT ── */}
        {(offer.delivery_cost_per_truck != null || isFcaLike) && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>{t.sectionTransport}</Text>
            <View style={s.transportBox}>
              {dPaidBy === 'dap_included' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueDapIncluded}</Text>
                  </View>
                  {offer.delivery_from && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}`, alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelRoute}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{translateWarehouseLocation(offer.delivery_from, lang)}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}</Text>
                    </View>
                  )}
                </>
              )}
              {dPaidBy === 'dap_extra' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueDapExtra}</Text>
                  </View>
                  {offer.delivery_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelRoute}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{translateWarehouseLocation(offer.delivery_from, lang)}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}</Text>
                    </View>
                  )}
                  {offer.delivery_trucks != null && (
                    <View style={s.transportRow}>
                      <Text style={s.transportLabel}>{t.labelTrucks}</Text>
                      <Text style={s.transportValue}>{offer.delivery_trucks}</Text>
                    </View>
                  )}
                  {offer.delivery_cost_per_truck != null && offer.delivery_cost_per_truck > 0 && (
                    <View style={s.transportRow}>
                      <Text style={s.transportLabel}>{t.labelCostPerTruck}</Text>
                      <Text style={s.transportValue}>{isEUR ? formatEUR(offer.delivery_cost_per_truck / exchRate) : formatPLN(offer.delivery_cost_per_truck)} {currency} {t.netSuffix}</Text>
                    </View>
                  )}
                  {offer.delivery_cost_total != null && offer.delivery_cost_total > 0 && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}` }]}>
                      <Text style={s.transportLabel}>{t.labelTotalTransport}</Text>
                      <Text style={[s.transportValue, { color: C.orange }]}>
                        {isEUR ? formatEUR(offer.delivery_cost_total / exchRate) : formatPLN(offer.delivery_cost_total)} {currency} {t.netSuffix}
                      </Text>
                    </View>
                  )}
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelSettlement}</Text>
                    <Text style={[s.transportValue, { color: C.orange }]}>{t.valueRecharge}</Text>
                  </View>
                </>
              )}
              {dPaidBy === 'fca' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueFca}</Text>
                  </View>
                  {offer.delivery_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelPickupFrom}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{translateWarehouseLocation(offer.delivery_from, lang)}</Text>
                    </View>
                  )}
                </>
              )}
              {dPaidBy === 'cif' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueCif}</Text>
                  </View>
                  {offer.delivery_from && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelPickupFrom}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{translateWarehouseLocation(offer.delivery_from, lang)}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* ── TERMIN DOSTAWY ── */}
        <Text style={s.sectionTitle}>{t.sectionDeliveryTime}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {deliveryTimelineText()}
          </Text>
        </View>

        {/* ── WARUNKI DOSTAWY (Incoterms) ── */}
        <Text style={s.sectionTitle}>{t.sectionDeliveryTerms}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {deliveryTermsText()}
          </Text>
        </View>

        {/* ── WARUNKI TECHNICZNE ── */}
        <Text style={s.sectionTitle}>{t.sectionTechnical}</Text>
        <View style={s.conditionsBox}>
          {isUsed ? (
            <>
              <Text style={[s.conditionItem, { fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.techUsedLabel}</Text>
              <Text style={s.conditionItem}>{t.techTolerance}</Text>
              <Text style={s.conditionItem}>{t.techWeighing}</Text>
              <Text style={s.conditionItem}>{t.techUsedNote}</Text>
            </>
          ) : (
            <>
              <Text style={s.conditionItem}>{t.techStandard}</Text>
              <Text style={s.conditionItem}>{t.techGrade}</Text>
              <Text style={s.conditionItem}>{t.techTolerance}</Text>
              <Text style={s.conditionItem}>{t.techCert}</Text>
              <Text style={s.conditionItem}>{t.techWeighing}</Text>
            </>
          )}
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {isEUR ? t.techCurrencyEUR : t.techCurrencyPLN(exchRate)}
          </Text>
        </View>

        {/* ── WARUNKI PŁATNOŚCI ── */}
        <Text style={s.sectionTitle}>{t.sectionPayment}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {offer.payment_days === 0 ? t.paymentPrepaid : t.paymentCredit(offer.payment_days ?? 30)}
          </Text>
        </View>

        {/* ── WAŻNOŚĆ OFERTY ── */}
        <Text style={s.sectionTitle}>{t.sectionValidity}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>
            {t.validityLine1(t.validityLabel(offer.valid_days))}
          </Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {t.validityLine2}
          </Text>
        </View>

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

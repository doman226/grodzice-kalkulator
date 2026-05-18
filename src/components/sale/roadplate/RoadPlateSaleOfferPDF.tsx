import { Document, Page, View, Text, Image, StyleSheet, Font, Link } from '@react-pdf/renderer';
import type { RoadPlateSaleOffer } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import { ROAD_PLATE_SALE_PDF_STRINGS, type PdfLang } from '../../../lib/pdfStrings';
import { SALES_REPS as SALES_REPS_LIST } from '../../../lib/constants';

// ─── Fonty (identyczne z PipeOfferPDF i SaleOfferPDF) ────────────────────────

const SALES_REPS: Record<string, string> = Object.fromEntries(
  SALES_REPS_LIST.map(r => [r.name, r.phone]),
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

// ─── Kolory (1:1 z PipeOfferPDF) ─────────────────────────────────────────────

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

// ─── Style (1:1 z PipeOfferPDF) ───────────────────────────────────────────────

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

  greeting:  { marginBottom: 5, fontSize: 9 },
  intro:     { marginBottom: 10, lineHeight: 1.5, fontSize: 9, color: C.gray700 },
  introLink: { color: C.blueText, textDecoration: 'underline' },

  signatureBlock: { marginTop: 28 },
  signatureImg:   { width: 160, height: 80, objectFit: 'contain' },

  table:          { marginBottom: 10, border: `1 solid ${C.gray200}`, borderRadius: 4, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: C.navy },
  tableBodyRow:   { flexDirection: 'row', borderBottom: `1 solid ${C.gray200}`, alignItems: 'flex-start' },
  tableBodyRowAlt:{ flexDirection: 'row', borderBottom: `1 solid ${C.gray200}`, backgroundColor: C.gray50, alignItems: 'flex-start' },
  thCell: { padding: 5, color: C.white, fontFamily: 'Roboto', fontWeight: 700, fontSize: 8 },
  tdLabel:{ padding: 4, color: C.gray500, fontSize: 8, flex: 1 },

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

  conditionsBox: {
    border: `1 solid ${C.gray200}`,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    backgroundColor: C.gray50,
  },
  conditionItem: { marginBottom: 4, lineHeight: 1.5, fontSize: 8, color: C.gray700 },

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
  offer: RoadPlateSaleOffer;
  lang?: PdfLang;
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function RoadPlateSaleOfferPDF({ offer, lang = 'pl' }: Props) {
  const t = ROAD_PLATE_SALE_PDF_STRINGS[lang];

  const dateLocale = lang === 'en' ? 'en-GB' : 'pl-PL';
  const dateStr    = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'long' }).format(new Date(offer.created_at));
  const headerUrl  = `${window.location.origin}/header-logo.png`;
  const footerUrl  = `${window.location.origin}/footer-logo.png`;
  const currency   = offer.currency ?? 'EUR';
  const exchRate   = offer.exchange_rate ?? 4.25;
  const isEUR      = currency === 'EUR';

  const sortedItems = [...(offer.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasItems    = sortedItems.length > 0;

  // ── Sumy ──
  const totalMassT   = sortedItems.reduce((sum, i) => sum + (i.mass_t ?? 0), 0);
  const totalSellEUR = sortedItems.reduce((sum, i) => sum + (i.sell_eur_total ?? 0), 0);
  const totalSellPLN = sortedItems.reduce((sum, i) => sum + (i.sell_pln_total ?? 0), 0);

  // ── Transport — delivery_cost_total zawsze w PLN (kanon DB) ──
  const deliveryCostPLN = (offer.delivery_paid_by === 'dap_included' && (offer.delivery_cost_total ?? 0) > 0)
    ? (offer.delivery_cost_total ?? 0) : 0;
  const deliveryCostEUR = exchRate > 0 ? deliveryCostPLN / exchRate : 0;
  const totalForClientEUR = totalSellEUR + deliveryCostEUR;
  const totalForClientPLN = totalSellPLN + deliveryCostPLN;

  // Backward compat (jakby kiedyś trafiły się legacy wartości)
  const dPaidByRaw = offer.delivery_paid_by as string | undefined;
  const dPaidBy = dPaidByRaw === 'intra' ? 'dap_included'
                : dPaidByRaw === 'klient' ? 'dap_extra'
                : offer.delivery_paid_by;

  function deliveryTimelineText(): string {
    if (offer.delivery_timeline === 'huta') {
      const kampania = offer.campaign_weeks ?? '??';
      const dostawa  = offer.campaign_delivery_weeks;
      return t.deliveryFromMill(String(kampania), dostawa ? String(dostawa) : undefined);
    }
    // Płyty drogowe — czas dostawy z magazynu jest snapshotem PL.
    // Dla EN PDF pozostawiamy oryginalny string (lista WAREHOUSE_DELIVERY_OPTIONS
    // identyczna jak w pipe — w przyszłości można dodać `translatePipeAttr`).
    return t.deliveryFromStock(offer.warehouse_delivery_time ?? undefined);
  }

  function deliveryTermsText(): string {
    const destination = offer.delivery_to ?? (lang === 'en' ? 'delivery address' : 'adres dostawy');
    if (offer.delivery_terms === 'FCA') {
      return t.deliveryFca(offer.fca_location ?? (lang === 'en' ? 'collection warehouse' : 'magazyn odbioru'));
    }
    if (offer.delivery_terms === 'DAP_EXTRA') {
      return t.deliveryDapExtra(destination);
    }
    return t.deliveryDap(destination);
  }

  function paymentText(): string {
    if (offer.payment_days === 0) return t.paymentPrepaid;
    return t.paymentCredit(offer.payment_days ?? 30);
  }

  return (
    <Document title={t.docTitle(offer.offer_number)} author="Intra B.V." language={t.docLanguage}>
      <Page size="A4" style={s.page}>

        {/* ── HEADER / FOOTER (image fixed) ── */}
        <Image fixed style={s.headerImg} src={headerUrl} />
        <Image fixed style={s.footerImg} src={footerUrl} />

        {/* ── TYTUŁ ── */}
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
            {isEUR && (
              <Text style={s.metaLine}><Text style={s.metaBold}>{t.exchangeRate} </Text>{exchRate.toFixed(4)} (NBP)</Text>
            )}
          </View>
          <View style={s.metaRight}>
            <Text style={[s.metaBold, { fontSize: 9, marginBottom: 3, color: C.navy }]}>{t.customerLabel}</Text>
            {offer.client ? (
              <>
                <Text style={[s.metaLine, { fontFamily: 'Roboto', fontWeight: 700, textAlign: 'right' }]}>{offer.client.name}</Text>
                <Text style={[s.metaLine, { textAlign: 'right', color: C.gray500 }]}>
                  {t.vatLabel(offer.client.country ?? '')} {offer.client.country === 'PL' ? offer.client.nip : offer.client.vat_number}
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

        {/* ── POWITANIE + WSTĘP z linkiem OWH ── */}
        <Text style={s.greeting}>{t.greeting}</Text>
        {(() => {
          const OWH_URL = 'https://www.intrabv.com/wp-content/uploads/2026/01/IntraBV-Algemene-Voorwaarden-PL-2026.pdf';
          const linkText = lang === 'pl' ? 'Ogólnych Warunków Sprzedaży i Płatności' : 'General Terms and Conditions of Sale and Payment';
          const [before, after] = t.intro.split(linkText);
          if (after == null) return <Text style={s.intro}>{t.intro}</Text>;
          return (
            <Text style={s.intro}>
              {before}
              <Link src={OWH_URL} style={s.introLink}>{linkText}</Link>
              {after}
            </Text>
          );
        })()}

        {/* ── TABELA POZYCJI — 9 kolumn ── */}
        {/* Flex weights: dobrano analogicznie do pipe (suma ~10.0):
            Profil 2.0 | Gatunek 1.0 | Wymiary 1.4 | Grub. 0.7 | Ilość 0.7
            | Pow. 0.9 | Masa 0.8 | Cena/t 1.1 | Wartość 1.4               */}
        {hasItems && (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 2.0 }]}>{t.thProfile}</Text>
              <Text style={[s.thCell, { flex: 1.0 }]}>{t.thSteelGrade}</Text>
              <Text style={[s.thCell, { flex: 1.4, textAlign: 'right' }]}>{t.thDimensions}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'right' }]}>{t.thThickness}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>{t.thQty}</Text>
              <Text style={[s.thCell, { flex: 0.9, textAlign: 'right' }]}>{t.thArea}</Text>
              <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>{t.thMass}</Text>
              <Text style={[s.thCell, { flex: 1.1, textAlign: 'right' }]}>{t.thPricePerT}</Text>
              <Text style={[s.thCell, { flex: 1.4, textAlign: 'right' }]}>{t.thValue}</Text>
            </View>

            {sortedItems.map((item, idx) => {
              const massT          = item.mass_t ?? 0;
              // Koszt transportu DAP rozkładamy pro-rata po masie pozycji (pattern z pipe/grodzice)
              const dapCost        = isEUR ? deliveryCostEUR : deliveryCostPLN;
              const transportShare = totalMassT > 0 ? dapCost * massT / totalMassT : 0;
              const sellTotal      = (isEUR ? (item.sell_eur_total ?? 0) : (item.sell_pln_total ?? 0)) + transportShare;
              const effectivePriceT = massT > 0 ? sellTotal / massT : (item.sell_price_per_ton ?? 0);

              return (
                <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                  <Text style={[s.tdLabel, { flex: 2.0, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {item.profile_name}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.0, color: C.gray700 }]}>
                    {item.steel_grade}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.4, textAlign: 'right', color: C.gray700 }]}>
                    {formatNumber(item.sheet_width_m, 2)} × {formatNumber(item.sheet_length_m, 2)}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'right', color: C.gray700 }]}>
                    {item.thickness_mm}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'center' }]}>
                    {item.quantity_szt} {t.unitPcs}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.9, textAlign: 'right', color: C.gray700 }]}>
                    {formatNumber(item.total_area_m2, 1)}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.8, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {formatNumber(item.mass_t, 3)} t
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.1, textAlign: 'right', color: C.gray700 }]}>
                    {effectivePriceT > 0
                      ? `${isEUR ? formatEUR(effectivePriceT) : formatPLN(effectivePriceT)} ${currency}/t`
                      : '—'}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.4, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {isEUR ? `${formatEUR(sellTotal)} EUR` : `${formatPLN(sellTotal)} PLN`}
                  </Text>
                </View>
              );
            })}

            {/* Wiersz sumy */}
            <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
              <Text style={[s.tdLabel, { flex: 2.0, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.totalRow}</Text>
              <Text style={[s.tdLabel, { flex: 1.0 }]} />
              <Text style={[s.tdLabel, { flex: 1.4 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.9, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {formatNumber(sortedItems.reduce((s, i) => s + (i.total_area_m2 ?? 0), 0), 1)}
              </Text>
              <Text style={[s.tdLabel, { flex: 0.8, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {formatNumber(totalMassT, 3)} t
              </Text>
              <Text style={[s.tdLabel, { flex: 1.1 }]} />
              <Text style={[s.tdLabel, { flex: 1.4, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {isEUR
                  ? `${formatEUR(totalSellEUR + deliveryCostEUR)} EUR`
                  : `${formatPLN(totalSellPLN + deliveryCostPLN)} PLN`}
              </Text>
            </View>
          </View>
        )}

        {/* ── CENA BOX (navy) — cena sprzedaży + cena/t ── */}
        {hasItems && (() => {
          const dapIncludedHasCost = dPaidBy === 'dap_included' && deliveryCostPLN > 0;
          const totalToShow = dapIncludedHasCost
            ? (isEUR ? totalForClientEUR : totalForClientPLN)
            : (isEUR ? totalSellEUR : totalSellPLN);
          const effectivePerT = totalMassT > 0 ? totalToShow / totalMassT : 0;

          return (
            <View style={s.priceBox} wrap={false}>
              <Text style={s.priceLabel}>{t.priceLabel}</Text>
              <Text style={s.priceValue}>
                {isEUR ? `${formatEUR(totalToShow)} ` : `${formatPLN(totalToShow)} `}
                <Text style={s.priceSuffix}>{currency} {t.netSuffix}</Text>
              </Text>
              <View style={s.priceRow}>
                {effectivePerT > 0 && (
                  <Text>
                    {isEUR ? formatEUR(effectivePerT) : formatPLN(effectivePerT)} {currency}/t {t.netSuffix}
                  </Text>
                )}
                {dPaidBy === 'dap_extra' && deliveryCostPLN > 0 && (
                  <Text>{t.priceBreakdownRecharge}</Text>
                )}
              </View>
            </View>
          );
        })()}

        {/* ── TRANSPORT (warunkowy) ── */}
        {(dPaidBy === 'dap_extra' || dPaidBy === 'fca' ||
          (dPaidBy === 'dap_included' && offer.delivery_cost_total != null && offer.delivery_cost_total > 0)) && (
          <View wrap={false}>
            <Text style={s.sectionTitle}>{t.sectionTransport}</Text>
            <View style={s.transportBox}>
              {dPaidBy === 'dap_included' && (
                <>
                  <View style={s.transportRow}>
                    <Text style={s.transportLabel}>{t.labelDelivery}</Text>
                    <Text style={[s.transportValue, { color: C.navy }]}>{t.valueDapIncluded}</Text>
                  </View>
                  {(offer.delivery_from || offer.delivery_to) && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}`, alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelRoute}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>
                        {offer.delivery_from ?? ''}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
                      </Text>
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
                  {(offer.delivery_from || offer.delivery_to) && (
                    <View style={[s.transportRow, { alignItems: 'flex-end' }]}>
                      <Text style={s.transportLabel}>{t.labelRoute}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>
                        {offer.delivery_from ?? ''}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
                      </Text>
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
                      <Text style={s.transportValue}>
                        {isEUR
                          ? `${formatEUR(offer.delivery_cost_per_truck ?? 0)} EUR ${t.netSuffix}`
                          : `${formatPLN(offer.delivery_cost_per_truck ?? 0)} PLN ${t.netSuffix}`}
                      </Text>
                    </View>
                  )}
                  {offer.delivery_cost_total != null && offer.delivery_cost_total > 0 && (
                    <View style={[s.transportRow, { marginTop: 3, paddingTop: 5, borderTop: `1 solid ${C.gray200}` }]}>
                      <Text style={s.transportLabel}>{t.labelTotalDelivery}</Text>
                      <Text style={[s.transportValue, { color: C.orange }]}>
                        {isEUR
                          ? `${formatEUR(offer.delivery_cost_total / exchRate)} EUR ${t.netSuffix}`
                          : `${formatPLN(offer.delivery_cost_total)} PLN ${t.netSuffix}`}
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
                      <Text style={s.transportValue}>{offer.delivery_from}</Text>
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
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>- {deliveryTimelineText()}</Text>
        </View>

        {/* ── WARUNKI DOSTAWY (Incoterms) ── */}
        <Text style={s.sectionTitle}>{t.sectionDeliveryTerms}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>- {deliveryTermsText()}</Text>
        </View>

        {/* ── WARUNKI TECHNICZNE — 4 statyczne linie (zgodne z PDF wynajmu płyt) ── */}
        <Text style={s.sectionTitle}>{t.sectionTechnical}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>- {t.techGrade}</Text>
          <Text style={s.conditionItem}>- {t.techToleranceWidth}</Text>
          <Text style={s.conditionItem}>- {t.techToleranceLength}</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>- {t.techWeighing}</Text>
        </View>

        {/* ── WARUNKI HANDLOWE ── */}
        <Text style={s.sectionTitle}>{t.sectionCommercial}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>- {paymentText()}</Text>
        </View>

        {/* ── WAŻNOŚĆ OFERTY ── */}
        <Text style={s.sectionTitle}>{t.sectionValidity}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>{t.validityLine1(t.validityLabel(offer.valid_days ?? 1))}</Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>{t.validityLine2}</Text>
        </View>

        {/* ── UWAGI ── */}
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

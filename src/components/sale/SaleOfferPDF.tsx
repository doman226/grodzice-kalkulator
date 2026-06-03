import { Document, Page, View, Text, Image, StyleSheet, Font, Link } from '@react-pdf/renderer';
import type { SaleOffer } from '../../types';
import { formatEUR, formatPLN, formatRound, formatNumber } from '../../lib/calculations';
import { PDF_STRINGS, translateWarehouseLocation, translateWarehouseDeliveryTime, type PdfLang } from '../../lib/pdfStrings';
import { SALES_REPS as SALES_REPS_LIST } from '../../lib/constants';

// ─── Fonty (identyczne z OfferPDF) ───────────────────────────────────────────

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

  greeting:  { marginBottom: 5, fontSize: 9 },
  intro:     { marginBottom: 10, lineHeight: 1.5, fontSize: 9, color: C.gray700 },
  introLink: { color: C.blueText, textDecoration: 'underline' },

  signatureBlock: { marginTop: 28 },
  signatureImg:   { width: 160, height: 80, objectFit: 'contain' },

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
  lang?: PdfLang;
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function SaleOfferPDF({ offer, lang = 'pl' }: Props) {
  const t = PDF_STRINGS[lang];

  const dateLocale  = lang === 'en' ? 'en-GB' : 'pl-PL';
  const dateStr     = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'long' }).format(new Date(offer.created_at));
  const headerUrl   = `${window.location.origin}/header-logo.png`;
  const footerUrl   = `${window.location.origin}/footer-logo.png`;
  const currency    = offer.currency ?? 'EUR';
  const exchRate    = offer.exchange_rate ?? 4.25;
  const isEUR       = currency === 'EUR';

  // Nagłówki kolumn zależne od waluty oferty
  const thPriceT  = isEUR ? t.thPricePerT  : (lang === 'pl' ? 'Cena [PLN/t]'   : 'Price [PLN/t]');
  const thPriceM2 = isEUR ? t.thPricePerM2 : (lang === 'pl' ? 'Cena [PLN/m²]'  : 'Price [PLN/m²]');
  const thValueC  = isEUR ? t.thValueEUR   : (lang === 'pl' ? 'Wartość [PLN]'  : 'Value [PLN]');
  const thPriceMb = isEUR ? t.thPricePerMb : (lang === 'pl' ? 'Cena PLN/mb'    : 'Price PLN/lm');

  // backward compat: 'intra' (stare) = dap_included
  const dPaidByRaw = offer.delivery_paid_by as string | undefined;
  const dPaidBy = dPaidByRaw === 'intra' ? 'dap_included'
                : dPaidByRaw === 'klient' ? 'dap_extra'
                : offer.delivery_paid_by;

  // Posortowane pozycje grodzic
  const sortedItems = [...(offer.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasSheetPiles = sortedItems.length > 0;

  // Posortowane zamki
  const sortedLocks = [...(offer.lock_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasLocks = sortedLocks.length > 0;

  // Masa i powierzchnia grodzic
  const totalMassT      = sortedItems.reduce((sum, i) => sum + (i.mass_t       ?? 0), 0);
  const totalWallAreaM2 = sortedItems.reduce((sum, i) => sum + (i.wall_area_m2 ?? 0), 0);

  // Grodzice: sumujemy z pozycji (nie z offer.total_sell_eur) – offer.total_sell_eur może zawierać
  // wartość zamków, co prowadziłoby do podwójnego liczenia przy dodawaniu locksTotalEUR poniżej.
  const totalSellEUR = sortedItems.reduce((sum, i) => sum + (i.sell_eur_total ?? 0), 0);
  const totalSellPLN = sortedItems.reduce((sum, i) => sum + (i.sell_pln_total ?? 0), 0);

  // Sumy zamków – muszą być zdefiniowane PRZED totalForClient*
  const locksTotalEUR   = sortedLocks.reduce((sum, l) => sum + (l.sell_eur_total ?? l.total_eur ?? 0), 0);
  const locksTotalPLN   = sortedLocks.reduce((sum, l) => sum + (l.sell_pln_total ?? l.total_pln ?? 0), 0);
  const locksTotalMassT = sortedLocks.reduce((sum, l) => sum + (l.mass_t   ?? 0), 0);

  // delivery_cost_total zawsze w PLN → przelicz na EUR jeśli potrzeba
  const deliveryCostPLN = (dPaidBy === 'dap_included' && (offer.delivery_cost_total ?? 0) > 0)
    ? (offer.delivery_cost_total ?? 0) : 0;
  const deliveryCostEUR = exchRate > 0 ? deliveryCostPLN / exchRate : 0;
  // Cena dla klienta = grodzice (z pozycji) + zamki + transport (gdy DAP w cenie)
  const totalForClientEUR = totalSellEUR + locksTotalEUR + deliveryCostEUR;
  const totalForClientPLN = totalSellPLN + locksTotalPLN + deliveryCostPLN;

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

  function paymentText(): string {
    if (offer.payment_days === 0) return t.paymentPrepaid;
    return t.paymentCredit(offer.payment_days ?? 30);
  }

  return (
    <Document title={t.docTitle(offer.offer_number)} author="Intra B.V." language={t.docLanguage}>
      <Page size="A4" style={s.page}>

        {/* ── HEADER / FOOTER IMAGE ── */}
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
            {currency === 'EUR' && (
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

        {/* ── TABELA GRODZIC ── 9 kolumn: Profil|Gatunek|Ilość|Dług.|Masa[t]|Pow.[m²]|Cena/t|Cena/m²|Wartość */}
        {hasSheetPiles && <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <Text style={[s.thCell, { flex: 1.5 }]}>{t.thProfile}</Text>
            <Text style={[s.thCell, { flex: 1.2 }]}>{t.thSteelGrade}</Text>
            <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>{t.thQty}</Text>
            <Text style={[s.thCell, { flex: 0.7, textAlign: 'right' }]}>{t.thLength}</Text>
            <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thMass}</Text>
            <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thWallArea}</Text>
            <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{thPriceT}</Text>
            <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{thPriceM2}</Text>
            <Text style={[s.thCell, { flex: 1.3, textAlign: 'right' }]}>{thValueC}</Text>
          </View>

          {sortedItems.map((item, idx) => {
            const wallArea    = item.wall_area_m2 ?? 0;
            const massT       = item.mass_t ?? 0;
            // Koszt transportu DAP rozkładamy proporcjonalnie do masy pozycji
            const dapCost        = isEUR ? deliveryCostEUR : deliveryCostPLN;
            const transportShare = totalMassT > 0 ? dapCost * massT / totalMassT : 0;
            const sellTotal   = (isEUR ? (item.sell_eur_total ?? 0) : (item.sell_pln_total ?? 0)) + transportShare;
            const pricePerM2  = wallArea > 0 ? sellTotal / wallArea : 0;
            const effectivePriceT = massT > 0 ? sellTotal / massT : (item.sell_eur_t ?? 0);
            return (
              <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                  {item.profile_name}{item.is_paired ? ' ×2' : ''}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.2, color: C.gray700 }]}>
                  {item.steel_grade?.toUpperCase() ?? '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'center' }]}>
                  {item.is_paired
                    ? `${item.quantity} ${t.unitPairs}`
                    : `${item.quantity} ${t.unitPcs}`}
                </Text>
                <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'right' }]}>
                  {item.length_m != null ? `${item.length_m} m` : '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                  {formatNumber(item.mass_t, 3)} t
                </Text>
                <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', color: C.gray700 }]}>
                  {wallArea > 0 ? `${formatNumber(wallArea, 1)} m²` : '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', color: C.gray700 }]}>
                  {effectivePriceT > 0
                    ? `${isEUR ? formatEUR(effectivePriceT) : formatPLN(effectivePriceT)} ${currency}/t`
                    : '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', color: C.gray700 }]}>
                  {pricePerM2 > 0
                    ? `${isEUR ? formatEUR(pricePerM2) : formatPLN(pricePerM2)} ${currency}/m²`
                    : '—'}
                </Text>
                <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                  {isEUR ? `${formatEUR(sellTotal)} EUR` : `${formatPLN(sellTotal)} PLN`}
                </Text>
              </View>
            );
          })}

          {/* Wiersz sumy grodzic */}
          <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
            <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.totalRow}</Text>
            <Text style={[s.tdLabel, { flex: 1.2 }]} />
            <Text style={[s.tdLabel, { flex: 0.7 }]} />
            <Text style={[s.tdLabel, { flex: 0.7 }]} />
            <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
              {formatNumber(totalMassT, 3)} t
            </Text>
            <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
              {totalWallAreaM2 > 0 ? `${formatNumber(totalWallAreaM2, 1)} m²` : ''}
            </Text>
            <Text style={[s.tdLabel, { flex: 1.0 }]} />
            <Text style={[s.tdLabel, { flex: 1.0 }]} />
            <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
              {isEUR
                ? `${formatEUR(totalSellEUR + deliveryCostEUR)} EUR`
                : `${formatPLN(totalSellPLN + deliveryCostPLN)} PLN`}
            </Text>
          </View>
        </View>}

        {/* ── TABELA ZAMKÓW ── (bez tytułu sekcji – tabela jest samoopisująca) */}
        {hasLocks && (
          <View style={[s.table, { marginTop: hasSheetPiles ? 6 : 0 }]}>
            {/* Nagłówek: Zamek | Gatunek | Ilość | Dł.[m] | kg/m | mb łącznie | EUR/mb | Wartość EUR */}
            {/* 9 kolumn: Zamek|Gatunek|Szt.|Dług.|kg/mb|Masa[t]|mb łącznie|Cena/mb|Wartość */}
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 1.5 }]}>{t.thLock}</Text>
              <Text style={[s.thCell, { flex: 1.2 }]}>{t.thSteelGrade}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>{t.thLockQtySzt}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'right' }]}>{t.thLength}</Text>
              <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thKgPerM}</Text>
              <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thLockMassT}</Text>
              <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{t.thMb}</Text>
              <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{thPriceMb}</Text>
              <Text style={[s.thCell, { flex: 1.3, textAlign: 'right' }]}>{thValueC}</Text>
            </View>

            {/* Pozycje */}
            {sortedLocks.map((lock, idx) => {
              const qMb    = lock.quantity_mb ?? 0;
              const massT  = lock.mass_t ?? 0;
              const kgPerM = qMb > 0 ? (massT * 1000) / qMb : 0;
              const qtySzt = lock.quantity_szt ?? null;
              const lenM   = lock.length_m   ?? null;
              return (
                <View key={lock.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                  <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {lock.lock_name}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.2, color: C.gray700 }]}>
                    {lock.steel_grade?.toUpperCase() ?? '—'}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'center' }]}>
                    {qtySzt != null ? `${qtySzt} ${t.unitPcs}` : '—'}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'right' }]}>
                    {lenM != null ? `${lenM} m` : '—'}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', color: C.gray700 }]}>
                    {formatNumber(kgPerM, 1)}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {formatNumber(massT, 3)} t
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {formatNumber(qMb, 1)}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', color: C.gray700 }]}>
                    {isEUR
                      ? `${formatEUR(lock.sell_price_eur_mb ?? lock.price_eur_mb)} EUR/mb`
                      : `${formatPLN((lock.sell_price_eur_mb ?? lock.price_eur_mb) * exchRate)} PLN/mb`}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>
                    {isEUR
                      ? `${formatEUR(lock.sell_eur_total ?? lock.total_eur)} EUR`
                      : `${formatPLN(lock.sell_pln_total ?? lock.total_pln ?? 0)} PLN`}
                  </Text>
                </View>
              );
            })}

            {/* Wiersz sumy zamków */}
            <View style={[s.tableBodyRow, { backgroundColor: C.gray100 }]}>
              <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {t.lockTotalRow}
              </Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.85 }]} />
              <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {formatNumber(locksTotalMassT, 3)} t
              </Text>
              <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {formatNumber(sortedLocks.reduce((acc, l) => acc + (l.quantity_mb ?? 0), 0), 1)}
              </Text>
              <Text style={[s.tdLabel, { flex: 1.0 }]} />
              <Text style={[s.tdLabel, { flex: 1.3, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>
                {isEUR ? `${formatEUR(locksTotalEUR)} EUR` : `${formatPLN(locksTotalPLN)} PLN`}
              </Text>
            </View>
          </View>
        )}

        {/* ── CENA SPRZEDAŻY ── */}
        <View style={s.priceBox}>
          <Text style={s.priceLabel}>{t.priceLabel}</Text>
          <Text style={s.priceValue}>
            {isEUR ? formatEUR(totalForClientEUR) : formatPLN(totalForClientPLN)}
            <Text style={s.priceSuffix}> {currency} {t.netSuffix}</Text>
          </Text>

          {/* ── Rozbicie ceny ── */}
          <View style={[s.priceRow, { flexDirection: 'column', gap: 3 }]}>
            {hasSheetPiles && (() => {
              const unitLabelT  = isEUR ? 'EUR/t'  : 'PLN/t';
              const sheetLabel  = lang === 'en' ? 'Sheet piles' : 'Grodzice';
              const sheetSellOnly = isEUR ? totalSellEUR : totalSellPLN;
              // DAP w cenie: transport wliczamy do wartości grodzic (identycznie jak moduł wynajmu)
              // Dzięki temu breakdown sumuje się do total: (grodzice+transport) + zamki = totalForClient
              const deliveryCostC = isEUR ? deliveryCostEUR : deliveryCostPLN;
              const sheetVal      = dPaidBy === 'dap_included' && deliveryCostC > 0
                ? sheetSellOnly + deliveryCostC
                : sheetSellOnly;

              // Cena/t zawsze z przeliczonego sheetVal (uwzględnia transport gdy DAP w cenie)
              const pricePerT = totalMassT > 0 ? sheetVal / totalMassT : null;

              // Skrót allSame stosujemy tylko gdy nie ma transportu do amortyzacji
              const priced   = sortedItems.filter(i => i.sell_eur_t != null);
              const allSame  = priced.length > 0 && priced.every(i => i.sell_eur_t === priced[0].sell_eur_t);
              const perTLabel = (deliveryCostC === 0 && allSame && priced.length > 0)
                ? `${formatRound(priced[0].sell_eur_t ?? 0)} ${unitLabelT}`
                : pricePerT != null ? `${formatRound(pricePerT)} ${unitLabelT}` : null;

              return (
                <>
                  <Text>
                    {sheetLabel}: {isEUR ? formatEUR(sheetVal) : formatPLN(sheetVal)} {currency}
                    {perTLabel ? `  ·  ${perTLabel}` : ''}
                  </Text>
                  {/* DAP w cenie – transport zawarty w kwocie grodzic powyżej; nie pokazujemy osobnej linii */}
                </>
              );
            })()}

            {hasLocks && (
              <>
                <Text>
                  {t.lockSectionTitle}: {formatEUR(isEUR ? locksTotalEUR : locksTotalPLN)} {currency}
                </Text>
                {!hasSheetPiles && (
                  <Text style={{ fontSize: 7, color: C.blue200 }}>
                    {t.lockMassRow}: {formatNumber(locksTotalMassT, 3)} t
                  </Text>
                )}
              </>
            )}

            {/* DAP w cenie – dostawa wliczona w total, nie pokazujemy osobnej linii klientowi */}
          </View>
        </View>

        {/* ── TRANSPORT ── */}
        {(dPaidBy === 'dap_extra' || dPaidBy === 'fca' || dPaidBy === 'cif' ||
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
                        {translateWarehouseLocation(offer.delivery_from, lang)}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
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
                        {translateWarehouseLocation(offer.delivery_from, lang)}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
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
                      <Text style={s.transportLabel}>{lang === 'en' ? 'Pick-up from:' : 'Odbiór z:'}</Text>
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
                      <Text style={s.transportLabel}>{lang === 'en' ? 'Collection from:' : 'Odbiór z:'}</Text>
                      <View style={{ flex: 1, borderBottom: `0.5 solid ${C.gray200}`, marginHorizontal: 5, marginBottom: 1.5 }} />
                      <Text style={s.transportValue}>{translateWarehouseLocation(offer.delivery_from, lang)}</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════
            WARUNKI OFERTY
        ══════════════════════════════════════ */}

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
          <Text style={s.conditionItem}>{t.techStandard}</Text>
          <Text style={s.conditionItem}>{t.techGrade}</Text>
          <Text style={s.conditionItem}>{t.techTolerance}</Text>
          <Text style={s.conditionItem}>{t.techCert}</Text>
          <Text style={s.conditionItem}>{t.techWeighing}</Text>
          {!isEUR && (
            <Text style={[s.conditionItem, { marginBottom: 0 }]}>
              {t.techCurrencyPLN(exchRate)}
            </Text>
          )}
          {isEUR && (
            <Text style={[s.conditionItem, { marginBottom: 0 }]}>
              {t.techCurrencyEUR}
            </Text>
          )}
        </View>

        {/* ── WARUNKI HANDLOWE ── */}
        <Text style={s.sectionTitle}>{t.sectionCommercial}</Text>
        <View style={s.conditionsBox}>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            - {paymentText()}
          </Text>
        </View>

        {/* ── WAŻNOŚĆ OFERTY ── */}
        <Text style={s.sectionTitle}>{t.sectionValidity}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>
            {t.validityLine1(t.validityLabel(offer.valid_days ?? 14))}
          </Text>
          <Text style={[s.conditionItem, { marginBottom: 0 }]}>
            {t.validityLine2}
          </Text>
        </View>

        {/* ── NOTATKI ── */}
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

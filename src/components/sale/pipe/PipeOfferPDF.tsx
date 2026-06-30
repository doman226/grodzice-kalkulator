import { Document, Page, View, Text, Image, StyleSheet, Font, Link } from '@react-pdf/renderer';
import type { PipeSaleOffer, PipeSaleOfferItem } from '../../../types';
import { formatEUR, formatPLN, formatNumber } from '../../../lib/calculations';
import { PIPE_SALE_PDF_STRINGS, type PdfLang } from '../../../lib/pdfStrings';
import { SALES_REPS as SALES_REPS_LIST } from '../../../lib/constants';
import {
  PIPE_NORM_DESCRIPTIONS,
  PIPE_NORM_DESCRIPTIONS_EN,
  PIPE_NORMS,
  PIPE_PRODUCT_TYPES_EN,
  PIPE_CONDITIONS_EN,
  PIPE_SURFACES_EN,
  PIPE_WAREHOUSES_EN,
  PIPE_WAREHOUSE_DELIVERY_OPTIONS_EN,
  translatePipeAttr,
} from '../../../lib/pipeConstants';
import type { PipeNorm } from '../../../lib/pipeConstants';

// ─── Fonty (identyczne z SaleOfferPDF) ───────────────────────────────────────

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

// ─── Kolory (1:1 z SaleOfferPDF) ──────────────────────────────────────────────

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

// ─── Style (1:1 z SaleOfferPDF) ───────────────────────────────────────────────

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
  tdValue:{ padding: 4, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800, fontSize: 8, width: '45%' },

  // Drugi wiersz specyfikacji (mniejszy, szary)
  specSubLine: { fontSize: 7, color: C.gray500, marginTop: 1 },

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

// ─── Pomocnicze: agreg unique values dla warunków technicznych ────────────────

function uniqueNorms(items: PipeSaleOfferItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    if (it.norm) set.add(it.norm);
  }
  return Array.from(set);
}

function uniqueGrades(items: PipeSaleOfferItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) set.add(it.steel_grade);
  return Array.from(set);
}

function uniqueSurfaces(items: PipeSaleOfferItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) set.add(it.surface);
  return Array.from(set);
}

function uniqueConditions(items: PipeSaleOfferItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) set.add(it.condition);
  return Array.from(set);
}

function noItemHasCert(items: PipeSaleOfferItem[]): boolean {
  return items.length > 0 && items.every(it => !it.norm);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  offer: PipeSaleOffer;
  lang?: PdfLang;
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function PipeOfferPDF({ offer, lang = 'pl' }: Props) {
  const t = PIPE_SALE_PDF_STRINGS[lang];

  const dateLocale = lang === 'en' ? 'en-GB' : 'pl-PL';
  const dateStr    = new Intl.DateTimeFormat(dateLocale, { dateStyle: 'long' }).format(new Date(offer.created_at));
  const headerUrl  = `${window.location.origin}/header-logo.png`;
  const footerUrl  = `${window.location.origin}/footer-logo.png`;
  const currency   = offer.currency ?? 'EUR';
  const exchRate   = offer.exchange_rate ?? 4.25;
  const isEUR      = currency === 'EUR';

  const sortedItems = [...(offer.items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasItems    = sortedItems.length > 0;

  // Zamki (katalog współdzielony sale_locks; ceny w EUR, przeliczane na PLN w display)
  const sortedLocks = [...(offer.lock_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasLocks    = sortedLocks.length > 0;
  const locksTotalEUR   = sortedLocks.reduce((s, l) => s + (l.sell_eur_total ?? l.total_eur ?? 0), 0);
  const locksTotalPLN   = sortedLocks.reduce((s, l) => s + (l.sell_pln_total ?? l.total_pln ?? 0), 0);
  const locksTotalMassT = sortedLocks.reduce((s, l) => s + (l.mass_t ?? 0), 0);

  // Nagłówki kolumn zamków zależne od waluty oferty
  const thPriceMb = isEUR ? (lang === 'pl' ? 'Cena EUR/mb' : 'Price EUR/lm')
                          : (lang === 'pl' ? 'Cena PLN/mb' : 'Price PLN/lm');
  const thValueC  = isEUR ? (lang === 'pl' ? 'Wartość [EUR]' : 'Value [EUR]')
                          : (lang === 'pl' ? 'Wartość [PLN]' : 'Value [PLN]');

  // Sumy
  const totalMassT   = sortedItems.reduce((sum, i) => sum + (i.mass_t ?? 0), 0);
  const totalSellEUR = sortedItems.reduce((sum, i) => sum + (i.sell_eur_total ?? 0), 0);
  const totalSellPLN = sortedItems.reduce((sum, i) => sum + (i.sell_pln_total ?? 0), 0);

  // Transport — delivery_cost_total zawsze w PLN
  const deliveryCostPLN = (offer.delivery_paid_by === 'dap_included' && (offer.delivery_cost_total ?? 0) > 0)
    ? (offer.delivery_cost_total ?? 0) : 0;
  const deliveryCostEUR = exchRate > 0 ? deliveryCostPLN / exchRate : 0;
  // Cena dla klienta = rury + transport (gdy DAP w cenie) + zamki
  const totalForClientEUR = totalSellEUR + deliveryCostEUR + locksTotalEUR;
  const totalForClientPLN = totalSellPLN + deliveryCostPLN + locksTotalPLN;

  // Backward compat: stare oferty mogą mieć 'intra'/'klient' zamiast nowych wartości
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
    // Tłumaczenie czasu dostawy z magazynu PL→EN (wartość w bazie jako polski snapshot).
    const whTime = offer.warehouse_delivery_time
      ? translatePipeAttr(offer.warehouse_delivery_time, PIPE_WAREHOUSE_DELIVERY_OPTIONS_EN, lang)
      : undefined;
    return t.deliveryFromStock(whTime);
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

  // ─── Warunki techniczne — dynamiczne wg unique values ────────────────────
  const norms      = uniqueNorms(sortedItems);
  const grades     = uniqueGrades(sortedItems);
  const surfaces   = uniqueSurfaces(sortedItems);
  const conditions = uniqueConditions(sortedItems);
  const noCert     = noItemHasCert(sortedItems);

  // Słownik opisów norm zależny od języka (kody norm — międzynarodowe, nie tłumaczone)
  const normDescMap = lang === 'en' ? PIPE_NORM_DESCRIPTIONS_EN : PIPE_NORM_DESCRIPTIONS;

  // Magazyn wysyłki — tłumaczony PL→EN (np. "Lanaken, Belgia" → "Lanaken, Belgium")
  const deliveryFromT = offer.delivery_from
    ? translatePipeAttr(offer.delivery_from, PIPE_WAREHOUSES_EN, lang)
    : '';

  // Norma — 3 warianty:
  function normLine(): string {
    if (noCert) return t.techNormNoCert;
    if (norms.length === 1) {
      const n = norms[0];
      const desc = PIPE_NORMS.includes(n as PipeNorm) ? normDescMap[n as PipeNorm] : '';
      return desc ? t.techNormSingle(n, desc) : `${n}.`;
    }
    return t.techNormMultiple(norms.join(', '));
  }

  // Stan — 2 warianty (wartości w bazie są PL → tłumaczymy przy lang='en'):
  //   jeden unique stan → pokaż konkretną wartość
  //   mieszane stany → "wg specyfikacji w tabeli" + ostrzeżenie o atestach
  const conditionLine = conditions.length === 1
    ? t.techConditionSingle(translatePipeAttr(conditions[0], PIPE_CONDITIONS_EN, lang))
    : t.techConditionMixed;

  // Powierzchnia — jak gatunek/norma: wypisz WSZYSTKIE wybrane wartości
  // (NIE odsyłaj do tabeli — powierzchnia nie ma kolumny w tabeli pozycji).
  // Pusta lista (oferta samych zamków) = linia ukryta w renderze (surfaces.length > 0).
  const surfaceLine = surfaces.length === 1
    ? t.techSurfaceSingle(translatePipeAttr(surfaces[0], PIPE_SURFACES_EN, lang))
    : t.techSurfaceMultiple(surfaces.map(srf => translatePipeAttr(srf, PIPE_SURFACES_EN, lang)).join(', '));

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
            {offer.task_name && (
              <Text style={[s.metaLine, { textAlign: 'right', color: C.navy }]}>
                <Text style={s.metaBold}>{t.taskLabel} </Text>{offer.task_name}
              </Text>
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
        {/* Powierzchnia usunieta z tabeli (jest w Warunkach technicznych).
            Ilosc i dlugosc rozdzielone na osobne kolumny.                */}
        {hasItems && (
          <View style={s.table}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 2.4 }]}>{t.thSpec}</Text>
              <Text style={[s.thCell, { flex: 1.1 }]}>{t.thNorm}</Text>
              <Text style={[s.thCell, { flex: 1.0 }]}>{t.thSteelGrade}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>{t.thQty}</Text>
              <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>{t.thLengthM}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'right' }]}>{t.thKgPerM}</Text>
              <Text style={[s.thCell, { flex: 0.8, textAlign: 'right' }]}>{t.thMass}</Text>
              <Text style={[s.thCell, { flex: 1.1, textAlign: 'right' }]}>{t.thPricePerT}</Text>
              <Text style={[s.thCell, { flex: 1.4, textAlign: 'right' }]}>{t.thValue}</Text>
            </View>

            {sortedItems.map((item, idx) => {
              const massT          = item.mass_t ?? 0;
              // Koszt transportu DAP rozkładamy pro-rata po masie pozycji (jak w grodzicach)
              const dapCost        = isEUR ? deliveryCostEUR : deliveryCostPLN;
              const transportShare = totalMassT > 0 ? dapCost * massT / totalMassT : 0;
              const sellTotal      = (isEUR ? (item.sell_eur_total ?? 0) : (item.sell_pln_total ?? 0)) + transportShare;
              const effectivePriceT = massT > 0 ? sellTotal / massT : (item.sell_price_per_ton ?? 0);
              // Tłumaczenie atrybutów PL→EN (w bazie zapisane po polsku)
              const productTypeT = translatePipeAttr(item.product_type, PIPE_PRODUCT_TYPES_EN, lang);
              const conditionT   = translatePipeAttr(item.condition, PIPE_CONDITIONS_EN, lang);

              return (
                <View key={item.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                  {/* Specyfikacja: 2 linie (produkt + stan) */}
                  <View style={[s.tdLabel, { flex: 2.4 }]}>
                    <Text style={{ fontFamily: 'Roboto', fontWeight: 700, color: C.gray800, fontSize: 8 }}>
                      {productTypeT} Ø{formatNumber(item.diameter_mm, 1)} × {formatNumber(item.wall_thickness_mm, 1)} mm
                    </Text>
                    <Text style={s.specSubLine}>{conditionT}</Text>
                  </View>
                  <Text style={[s.tdLabel, { flex: 1.1, color: C.gray700, fontFamily: 'Roboto', fontWeight: 700 }]}>
                    {item.norm ?? '—'}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 1.0, color: C.gray700 }]}>
                    {item.steel_grade}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'center' }]}>
                    {item.quantity_szt} {t.unitPcs}
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.8, textAlign: 'right', color: C.gray700 }]}>
                    {formatNumber(item.length_m, 2)} m
                  </Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'right', color: C.gray700 }]}>
                    {formatNumber(item.kg_per_m, 3)}
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
              <Text style={[s.tdLabel, { flex: 2.4, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.totalRow}</Text>
              <Text style={[s.tdLabel, { flex: 1.1 }]} />
              <Text style={[s.tdLabel, { flex: 1.0 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.8 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
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

        {/* ── TABELA ZAMKÓW ── (katalog współdzielony z grodzicami) */}
        {hasLocks && (
          <View style={[s.table, { marginTop: hasItems ? 6 : 0 }]}>
            <View style={s.tableHeaderRow}>
              <Text style={[s.thCell, { flex: 1.5 }]}>{t.thLock}</Text>
              <Text style={[s.thCell, { flex: 1.2 }]}>{t.thSteelGrade}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'center' }]}>{t.thLockQtySzt}</Text>
              <Text style={[s.thCell, { flex: 0.7, textAlign: 'right' }]}>{t.thLengthM}</Text>
              <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thKgPerM}</Text>
              <Text style={[s.thCell, { flex: 0.85, textAlign: 'right' }]}>{t.thLockMassT}</Text>
              <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{t.thMb}</Text>
              <Text style={[s.thCell, { flex: 1.0, textAlign: 'right' }]}>{thPriceMb}</Text>
              <Text style={[s.thCell, { flex: 1.3, textAlign: 'right' }]}>{thValueC}</Text>
            </View>

            {sortedLocks.map((lock, idx) => {
              const qMb    = lock.quantity_mb ?? 0;
              const massT  = lock.mass_t ?? 0;
              const kgPerM = qMb > 0 ? (massT * 1000) / qMb : 0;
              const qtySzt = lock.quantity_szt ?? null;
              const lenM   = lock.length_m   ?? null;
              return (
                <View key={lock.id || idx} style={idx % 2 === 0 ? s.tableBodyRow : s.tableBodyRowAlt}>
                  <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{lock.lock_name}</Text>
                  <Text style={[s.tdLabel, { flex: 1.2, color: C.gray700 }]}>{lock.steel_grade?.toUpperCase() ?? '—'}</Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'center' }]}>{qtySzt != null ? `${qtySzt} ${t.unitPcs}` : '—'}</Text>
                  <Text style={[s.tdLabel, { flex: 0.7, textAlign: 'right' }]}>{lenM != null ? `${lenM} m` : '—'}</Text>
                  <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', color: C.gray700 }]}>{formatNumber(kgPerM, 1)}</Text>
                  <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(massT, 3)} t</Text>
                  <Text style={[s.tdLabel, { flex: 1.0, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.gray800 }]}>{formatNumber(qMb, 1)}</Text>
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
              <Text style={[s.tdLabel, { flex: 1.5, fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{t.lockTotalRow}</Text>
              <Text style={[s.tdLabel, { flex: 1.2 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.7 }]} />
              <Text style={[s.tdLabel, { flex: 0.85 }]} />
              <Text style={[s.tdLabel, { flex: 0.85, textAlign: 'right', fontFamily: 'Roboto', fontWeight: 700, color: C.navy }]}>{formatNumber(locksTotalMassT, 3)} t</Text>
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

        {/* ── CENA BOX (navy) — cena sprzedaży + cena/t ── */}
        {/* Reguła: DAP w cenie → transport "schowany" w cenie (klient nie zna jego kosztu).
            DAP_EXTRA → cena rur bez transportu, transport pokazany jako refaktura.
            FCA → cena rur bez transportu (klient odbiera sam).               */}
        {(hasItems || hasLocks) && (() => {
          // Czy DAP "schowany" w cenie ma rzeczywisty koszt transportu?
          const dapIncludedHasCost = dPaidBy === 'dap_included' && deliveryCostPLN > 0;

          // Suma do wyświetlenia: rury (+transport gdy DAP w cenie) + zamki
          const totalToShow = dapIncludedHasCost
            ? (isEUR ? totalForClientEUR : totalForClientPLN)
            : (isEUR ? totalSellEUR + locksTotalEUR : totalSellPLN + locksTotalPLN);

          // Baza ceny za tonę = wartość rur (+transport przy DAP), BEZ zamków — jak w grodzicach
          const pipeBase = dapIncludedHasCost
            ? (isEUR ? totalSellEUR + deliveryCostEUR : totalSellPLN + deliveryCostPLN)
            : (isEUR ? totalSellEUR : totalSellPLN);
          const effectivePerT = totalMassT > 0 ? pipeBase / totalMassT : 0;

          return (
            <View style={s.priceBox} wrap={false}>
              <Text style={s.priceLabel}>{t.priceLabel}</Text>
              <Text style={s.priceValue}>
                {isEUR ? `${formatEUR(totalToShow)} ` : `${formatPLN(totalToShow)} `}
                <Text style={s.priceSuffix}>{currency} {t.netSuffix}</Text>
              </Text>
              <View style={s.priceRow}>
                {/* Cena za tonę rur — efektywna (z transportem przy DAP w cenie) */}
                {effectivePerT > 0 && (
                  <Text>
                    {isEUR ? formatEUR(effectivePerT) : formatPLN(effectivePerT)} {currency}/t {t.netSuffix}
                  </Text>
                )}
                {/* Zamki — osobna linia rozbicia ceny */}
                {hasLocks && (
                  <Text>{t.lockSectionTitle}: {isEUR ? `${formatEUR(locksTotalEUR)} EUR` : `${formatPLN(locksTotalPLN)} PLN`}</Text>
                )}
                {/* DAP_EXTRA: klient wie, że transport jest refakturowany osobno */}
                {dPaidBy === 'dap_extra' && deliveryCostPLN > 0 && (
                  <Text>{t.priceBreakdownRecharge}</Text>
                )}
              </View>
            </View>
          );
        })()}

        {/* ── TRANSPORT (warunkowy) ── */}
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
                        {deliveryFromT}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
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
                        {deliveryFromT}{offer.delivery_to ? ` — ${offer.delivery_to}` : ''}
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
                      <Text style={s.transportValue}>{deliveryFromT}</Text>
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
                      <Text style={s.transportValue}>{deliveryFromT}</Text>
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

        {/* ── WARUNKI TECHNICZNE (DYNAMICZNE) ── */}
        <Text style={s.sectionTitle}>{t.sectionTechnical}</Text>
        <View style={s.conditionsBox}>
          <Text style={s.conditionItem}>- {normLine()}</Text>
          <Text style={s.conditionItem}>- {t.techTolerance}</Text>
          <Text style={s.conditionItem}>- {conditionLine}</Text>
          {grades.length > 0 && (
            <Text style={s.conditionItem}>- {t.techGrades(grades.join(', '))}</Text>
          )}
          {surfaces.length > 0 && (
            <Text style={[s.conditionItem, { marginBottom: 0 }]}>- {surfaceLine}</Text>
          )}
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

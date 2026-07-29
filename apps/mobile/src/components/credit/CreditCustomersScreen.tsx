import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MoneyText } from '@/components/MoneyText';
import { KpiCard } from '@/components/monitor/KpiCard';
import { ModalShell } from '@/components/ModalShell';
import { Screen } from '@/components/Screen';
import { BrandColors } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useCompanyScope } from '@/hooks/useCompanyScope';
import {
  getCreditCustomer,
  getCreditSummary,
  listCreditCustomers,
  recordCreditPayment,
} from '@/services/api';
import type {
  CreditCustomerDetail,
  CreditCustomerListItem,
  CreditCustomerStatus,
  CreditSummary,
} from '@/types/api';
import { formatDateTime, formatMoney } from '@/utils/datetime';

const STATUS_LABEL: Record<CreditCustomerStatus, string> = {
  CLEAR: 'À jour',
  PARTIAL: 'En dette',
  OVERDUE: 'Retard',
  AT_LIMIT: 'Plafond',
  BLOCKED: 'Bloqué',
};

const STATUS_COLOR: Record<CreditCustomerStatus, string> = {
  CLEAR: BrandColors.ok,
  PARTIAL: BrandColors.primaryHover,
  OVERDUE: BrandColors.danger,
  AT_LIMIT: '#B45309',
  BLOCKED: '#78716C',
};

export type CreditListMode = 'all' | 'PARTIAL' | 'OVERDUE';

type Props = {
  mode: CreditListMode;
};

function matchesMode(c: CreditCustomerListItem, mode: CreditListMode): boolean {
  if (mode === 'all') return true;
  if (mode === 'PARTIAL') return c.status === 'PARTIAL';
  return c.status === 'OVERDUE' || c.status === 'AT_LIMIT';
}

export function CreditCustomersScreen({ mode }: Props) {
  const { can, canPerm } = useAuth();
  const { companyId, ready } = useCompanyScope();
  const allowed = can(['ADMIN', 'MANAGER']) || canPerm('credit.view');
  const canManage = canPerm('credit.manage') || can(['ADMIN', 'MANAGER']);

  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [customers, setCustomers] = useState<CreditCustomerListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<CreditCustomerDetail | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'CARD' | 'MOBILE_MONEY'>('CASH');
  const [paySaleId, setPaySaleId] = useState<number | null>(null);
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [payStatus, setPayStatus] = useState<string | null>(null);

  const filtered = useMemo(
    () => customers.filter((c) => matchesMode(c, mode)),
    [customers, mode],
  );

  const load = useCallback(async () => {
    if (!allowed || companyId == null) return;
    try {
      setError(null);
      const [sum, list] = await Promise.all([
        getCreditSummary(companyId),
        listCreditCustomers({ companyId, q: query || undefined }),
      ]);
      setSummary(sum);
      setCustomers(list);
    } catch {
      setSummary(null);
      setCustomers([]);
      setError('Impossible de charger le crédit');
    }
  }, [allowed, companyId, query]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void load();
    }, [load, ready]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openDetail(row: CreditCustomerListItem) {
    setPayStatus(null);
    setPayAmount('');
    setPayNote('');
    setPaySaleId(null);
    setPayMethod('CASH');
    try {
      setDetail(await getCreditCustomer(row.id));
    } catch {
      setError('Impossible d’ouvrir la fiche');
    }
  }

  async function refreshDetail(id: number) {
    const next = await getCreditCustomer(id);
    setDetail(next);
    await load();
  }

  async function submitPayment() {
    if (!detail) return;
    const amount = Number(payAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0.01) {
      setPayStatus('Montant invalide');
      return;
    }
    setPaying(true);
    setPayStatus(null);
    try {
      const res = await recordCreditPayment({
        creditCustomerId: detail.id,
        amount,
        method: payMethod,
        saleId: paySaleId ?? undefined,
        note: payNote.trim() || undefined,
      });
      setPayAmount('');
      setPayNote('');
      setPaySaleId(null);
      setPayStatus(
        `Encaissé ${formatMoney(res.applied)}${
          res.unused > 0.009 ? ` (reste non alloué ${formatMoney(res.unused)})` : ''
        }`,
      );
      await refreshDetail(detail.id);
    } catch {
      setPayStatus('Échec encaissement');
    } finally {
      setPaying(false);
    }
  }

  if (!allowed) {
    return (
      <Screen>
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>Crédit réservé aux administrateurs et gestionnaires.</Text>
        </View>
      </Screen>
    );
  }

  if (ready && companyId == null) {
    return (
      <Screen>
        <View style={styles.blocked}>
          <Text style={styles.blockedText}>Aucune entreprise disponible pour le crédit.</Text>
        </View>
      </Screen>
    );
  }

  if (companyId == null) {
    return (
      <Screen>
        <View style={styles.blocked}>
          <ActivityIndicator color={BrandColors.accent} />
        </View>
      </Screen>
    );
  }

  const openSales = (detail?.sales ?? []).filter((s) => s.balanceDue > 0.009);

  return (
    <Screen keyboard={detail != null}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Rechercher un client…"
          placeholderTextColor={BrandColors.textMuted}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          onSubmitEditing={() => setQuery(q.trim())}
        />
        <Pressable style={styles.searchBtn} onPress={() => setQuery(q.trim())}>
          <Text style={styles.searchBtnText}>OK</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filtered}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => void onRefresh()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          mode === 'all' && summary ? (
            <View style={styles.headerBlock}>
              <View style={styles.kpiGrid}>
                <KpiCard label="Créances" value={summary.totalReceivable} money />
                <KpiCard label="En dette" value={String(summary.withDebt)} />
                <KpiCard label="À jour" value={String(summary.clear)} tone="ok" />
                <KpiCard label="Retard / plafond" value={String(summary.overdue)} tone="warn" />
              </View>
              {summary.topDebtors.length > 0 ? (
                <>
                  <Text style={styles.section}>Top débiteurs</Text>
                  {summary.topDebtors.slice(0, 5).map((c) => (
                    <Pressable key={`top-${c.id}`} style={styles.card} onPress={() => void openDetail(c)}>
                      <Text style={styles.cardName}>{c.name}</Text>
                      <MoneyText value={c.balance} style={styles.cardBalance} />
                    </Pressable>
                  ))}
                </>
              ) : null}
              <Text style={styles.section}>Clients ({filtered.length})</Text>
            </View>
          ) : (
            <Text style={styles.section}>{filtered.length} client(s)</Text>
          )
        }
        ListEmptyComponent={<Text style={styles.empty}>Aucun client</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => void openDetail(item)}>
            <View style={styles.cardTop}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={[styles.badge, { backgroundColor: `${STATUS_COLOR[item.status]}22` }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {item.phone || 'Sans téléphone'}
              {item.openSalesCount > 0 ? ` · ${item.openSalesCount} fiche(s)` : ''}
            </Text>
            <MoneyText value={item.balance} style={styles.cardBalance} />
          </Pressable>
        )}
      />

      <ModalShell
        visible={detail != null}
        onRequestClose={() => setDetail(null)}
        body={
          detail ? (
            <FlatList
              data={detail.timeline}
              keyExtractor={(t, i) => `${t.kind}-${t.at}-${i}`}
              contentContainerStyle={styles.detailList}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>{detail.name}</Text>
                  <Text style={styles.meta}>
                    {STATUS_LABEL[detail.status]} · {detail.phone || 'Sans téléphone'}
                  </Text>
                  {detail.address ? <Text style={styles.meta}>{detail.address}</Text> : null}
                  <View style={styles.kpiGrid}>
                    <KpiCard label="Solde" value={detail.balance} money tone="warn" />
                    <KpiCard label="Disponible" value={detail.availableCredit} money />
                    <KpiCard label="Plafond" value={detail.creditLimit} money />
                  </View>

                  <Text style={styles.section}>Fiches ouvertes</Text>
                  {openSales.length === 0 ? (
                    <Text style={styles.empty}>Aucune fiche ouverte</Text>
                  ) : (
                    openSales.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => setPaySaleId(s.id)}
                        style={[styles.saleRow, paySaleId === s.id && styles.saleRowActive]}>
                        <View style={styles.rowInfo}>
                          <Text style={styles.rowTitle}>#{s.id}</Text>
                          <Text style={styles.meta}>{formatDateTime(s.createdAt)}</Text>
                        </View>
                        <MoneyText value={s.balanceDue} style={styles.rowValue} />
                      </Pressable>
                    ))
                  )}

                  {detail.balance > 0.009 && canManage ? (
                    <>
                      <Text style={styles.section}>Encaisser un paiement</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Montant"
                        placeholderTextColor={BrandColors.textMuted}
                        keyboardType="decimal-pad"
                        value={payAmount}
                        onChangeText={setPayAmount}
                      />
                      <View style={styles.methodRow}>
                        {(['CASH', 'CARD', 'MOBILE_MONEY'] as const).map((m) => (
                          <Pressable
                            key={m}
                            onPress={() => setPayMethod(m)}
                            style={[styles.methodChip, payMethod === m && styles.methodChipActive]}>
                            <Text
                              style={[
                                styles.methodChipText,
                                payMethod === m && styles.methodChipTextActive,
                              ]}>
                              {m === 'CASH' ? 'Espèces' : m === 'CARD' ? 'Carte' : 'Mobile'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {paySaleId != null ? (
                        <Pressable onPress={() => setPaySaleId(null)}>
                          <Text style={styles.link}>Fiche #{paySaleId} (toucher pour FIFO)</Text>
                        </Pressable>
                      ) : (
                        <Text style={styles.meta}>Allocation FIFO si aucune fiche choisie</Text>
                      )}
                      <TextInput
                        style={styles.input}
                        placeholder="Note (optionnel)"
                        placeholderTextColor={BrandColors.textMuted}
                        value={payNote}
                        onChangeText={setPayNote}
                      />
                      <Pressable
                        style={[styles.primaryBtn, paying && styles.disabled]}
                        disabled={paying}
                        onPress={() => void submitPayment()}>
                        {paying ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryBtnText}>Encaisser</Text>
                        )}
                      </Pressable>
                      {payStatus ? <Text style={styles.payStatus}>{payStatus}</Text> : null}
                    </>
                  ) : null}

                  <Text style={styles.section}>Historique</Text>
                </View>
              }
              ListEmptyComponent={<Text style={styles.empty}>Aucun mouvement</Text>}
              renderItem={({ item: t }) => (
                <View style={styles.timelineRow}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle}>{t.label}</Text>
                    <Text style={styles.meta}>
                      {t.kind === 'SALE' ? 'Vente' : 'Paiement'} · {formatDateTime(t.at)}
                    </Text>
                  </View>
                  <MoneyText
                    value={t.amount}
                    style={[
                      styles.rowValue,
                      { color: t.kind === 'PAYMENT' ? BrandColors.ok : BrandColors.text },
                    ]}
                  />
                </View>
              )}
            />
          ) : null
        }
        footer={
          <View style={styles.footer}>
            <Pressable style={styles.secondaryBtn} onPress={() => setDetail(null)}>
              <Text style={styles.secondaryBtnText}>Fermer</Text>
            </Pressable>
          </View>
        }>
        <View style={styles.modalTop}>
          <Text style={styles.modalTopTitle}>Fiche crédit</Text>
          <Pressable onPress={() => setDetail(null)} hitSlop={12}>
            <Text style={styles.modalClose}>Fermer</Text>
          </Pressable>
        </View>
      </ModalShell>
    </Screen>
  );
}

const styles = StyleSheet.create({
  blocked: { flex: 1, justifyContent: 'center', padding: Spacing.five },
  blockedText: { textAlign: 'center', color: BrandColors.textMuted },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  search: {
    flex: 1,
    borderWidth: 1,
    borderColor: BrandColors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    backgroundColor: BrandColors.surface,
    color: BrandColors.text,
  },
  searchBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  error: {
    color: BrandColors.danger,
    fontWeight: '600',
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  headerBlock: { gap: Spacing.two, marginBottom: Spacing.two },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  section: { marginTop: Spacing.two, fontSize: 15, fontWeight: '700', color: BrandColors.text },
  empty: { color: BrandColors.textMuted, textAlign: 'center', marginTop: Spacing.four },
  card: {
    backgroundColor: BrandColors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BrandColors.border,
    padding: Spacing.three,
    gap: 4,
    marginBottom: Spacing.two,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardName: { flex: 1, fontSize: 16, fontWeight: '700', color: BrandColors.text },
  cardBalance: { fontWeight: '700', color: BrandColors.text, fontSize: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 12, color: BrandColors.textMuted },
  modalTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  modalTopTitle: { fontSize: 18, fontWeight: '700', color: BrandColors.text },
  modalClose: { color: BrandColors.primary, fontWeight: '600' },
  detailList: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four },
  detailHeader: { gap: Spacing.two, marginBottom: Spacing.two },
  detailTitle: { fontSize: 22, fontWeight: '700', color: BrandColors.text },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: BrandColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.border,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  saleRowActive: { borderColor: BrandColors.primary, backgroundColor: BrandColors.primarySoft },
  input: {
    borderWidth: 1,
    borderColor: BrandColors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
    color: BrandColors.text,
    backgroundColor: BrandColors.surface,
  },
  methodRow: { flexDirection: 'row', gap: Spacing.two },
  methodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BrandColors.borderStrong,
    alignItems: 'center',
  },
  methodChipActive: { backgroundColor: BrandColors.primary, borderColor: BrandColors.primary },
  methodChipText: { fontWeight: '600', color: BrandColors.text, fontSize: 12 },
  methodChipTextActive: { color: '#fff' },
  link: { color: BrandColors.primary, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: BrandColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.55 },
  payStatus: { color: BrandColors.primaryHover, fontWeight: '600' },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: BrandColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BrandColors.border,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { fontWeight: '600', color: BrandColors.text },
  rowValue: { fontWeight: '700', color: BrandColors.text },
  footer: { padding: Spacing.three, backgroundColor: BrandColors.bg },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: BrandColors.borderStrong,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: BrandColors.surface,
  },
  secondaryBtnText: { fontWeight: '700', color: BrandColors.text },
});

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandColors } from '@/constants/brand';
import { Spacing } from '@/constants/theme';
import {
  downloadAndInstallAndroidUpdate,
  getInstalledAppVersion,
  inspectAndroidUpdate,
  isUnknownSourcesError,
  openUnknownSourcesSettings,
  type AndroidUpdateManifest,
} from '@/services/app-update';

type Phase = 'idle' | 'checking' | 'ready' | 'downloading' | 'installing' | 'current' | 'error';

export function AndroidUpdateCard() {
  const installed = getInstalledAppVersion();
  const [phase, setPhase] = useState<Phase>('idle');
  const [update, setUpdate] = useState<AndroidUpdateManifest | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function check() {
    setPhase('checking');
    setMessage(null);
    setUpdate(null);
    try {
      const result = await inspectAndroidUpdate();
      if (result.status === 'update') {
        setUpdate(result.manifest);
        setPhase('ready');
        return;
      }
      if (result.status === 'current') {
        setPhase('current');
        setMessage(`Application à jour (${installed.version})`);
        return;
      }
      setPhase('error');
      setMessage(result.message);
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Vérification impossible');
    }
  }

  async function startUpdate() {
    if (!update) return;
    setPhase('downloading');
    setProgress(0);
    setMessage(null);
    try {
      await downloadAndInstallAndroidUpdate(update, (ratio, nextPhase) => {
        setProgress(ratio);
        setPhase(nextPhase);
      });
      setPhase('ready');
    } catch (err) {
      if (isUnknownSourcesError(err)) {
        setPhase('error');
        setMessage('Autorisez « Installer des applis inconnues » pour cette application, puis réessayez.');
        await openUnknownSourcesSettings().catch(() => undefined);
        return;
      }
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Mise à jour impossible');
    }
  }

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const percent = Math.round(progress * 100);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Mise à jour de l’application</Text>
      <Text style={styles.meta}>
        Version installée : {installed.version} ({installed.versionCode})
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {update && phase === 'ready' ? (
        <Text style={styles.message}>La version {update.version} est disponible.</Text>
      ) : null}
      {phase === 'downloading' || phase === 'installing' ? (
        <Text style={styles.meta}>
          {phase === 'installing' ? 'Ouverture de l’installateur…' : `Téléchargement… ${percent} %`}
        </Text>
      ) : null}
      {phase === 'ready' && update ? (
        <Pressable style={styles.button} onPress={() => void startUpdate()} disabled={busy}>
          <Text style={styles.buttonText}>Mettre à jour vers {update.version}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.button} onPress={() => void check()} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Vérifier la mise à jour</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: BrandColors.borderStrong,
    backgroundColor: BrandColors.surface,
  },
  title: { fontSize: 15, fontWeight: '700', color: BrandColors.text },
  meta: { fontSize: 13, color: BrandColors.textMuted },
  message: { fontSize: 14, color: BrandColors.text, lineHeight: 20 },
  button: {
    backgroundColor: BrandColors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});

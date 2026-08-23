import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

const UPDATE_BASE_URL =
  'https://storage.googleapis.com/pos-entrprise-israel-assets/installers/mobile/android';
const UPDATE_MANIFEST_URL = `${UPDATE_BASE_URL}/latest.json`;

const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456;
const APK_MIME = 'application/vnd.android.package-archive';
const LOCAL_APK_NAME = 'pending-update.apk';

export type AndroidUpdateManifest = {
  version: string;
  versionCode: number;
  apkUrl: string;
  sha256: string;
  size: number;
  publishedAt: string;
  notes?: string;
  mandatory?: boolean;
};

export type AndroidInstallPhase = 'downloading' | 'installing';

function parseVersion(value: string): number[] {
  return value
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function isVersionNewer(remote: string, local: string): boolean {
  const remoteParts = parseVersion(remote);
  const localParts = parseVersion(local);
  const length = Math.max(remoteParts.length, localParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (remoteParts[index] ?? 0) - (localParts[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function isTrustedApkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'storage.googleapis.com' &&
      url.pathname.startsWith('/pos-entrprise-israel-assets/installers/mobile/android/') &&
      url.pathname.endsWith('.apk')
    );
  } catch {
    return false;
  }
}

function isManifest(value: unknown): value is AndroidUpdateManifest {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<AndroidUpdateManifest>;
  return (
    typeof row.version === 'string' &&
    row.version.trim().length > 0 &&
    typeof row.versionCode === 'number' &&
    Number.isInteger(row.versionCode) &&
    row.versionCode > 0 &&
    typeof row.apkUrl === 'string' &&
    isTrustedApkUrl(row.apkUrl) &&
    typeof row.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(row.sha256) &&
    typeof row.size === 'number' &&
    row.size > 0 &&
    typeof row.publishedAt === 'string'
  );
}

function androidPackageName(): string {
  return Constants.expoConfig?.android?.package ?? 'com.entrepriseisrael.pos.mobile';
}

function localApkUri(): string {
  const cache = FileSystem.cacheDirectory;
  if (!cache) throw new Error('Stockage local indisponible');
  return `${cache}${LOCAL_APK_NAME}`;
}

export function getInstalledAppVersion() {
  const version = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '0.0.0';
  const rawVersionCode =
    Constants.nativeBuildVersion ?? Constants.expoConfig?.android?.versionCode ?? '0';
  const versionCode = Number(rawVersionCode);
  return {
    version,
    versionCode: Number.isInteger(versionCode) ? versionCode : 0,
  };
}

export async function checkForAndroidUpdate(): Promise<AndroidUpdateManifest | null> {
  if (Platform.OS !== 'android' || __DEV__) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const manifest: unknown = await response.json();
    if (!isManifest(manifest)) return null;

    const installed = getInstalledAppVersion();
    if (manifest.versionCode > installed.versionCode) return manifest;
    if (
      manifest.versionCode === installed.versionCode &&
      isVersionNewer(manifest.version, installed.version)
    ) {
      return manifest;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function isUnknownSourcesError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /unknown.?app|REQUEST_INSTALL|install.?permission|PACKAGE_VERIFICATION|not allowed to install/i.test(
    message,
  );
}

export async function openUnknownSourcesSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${androidPackageName()}`,
  });
}

export async function installLocalAndroidApk(): Promise<void> {
  const uri = localApkUri();
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('Fichier de mise à jour introuvable');
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}

export async function downloadAndInstallAndroidUpdate(
  manifest: AndroidUpdateManifest,
  onProgress?: (ratio: number, phase: AndroidInstallPhase) => void,
): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Mise à jour APK réservée à Android');
  if (!isTrustedApkUrl(manifest.apkUrl)) throw new Error('URL APK non autorisée');

  const dest = localApkUri();
  await FileSystem.deleteAsync(dest, { idempotent: true });

  const task = FileSystem.createDownloadResumable(
    manifest.apkUrl,
    dest,
    { headers: { Accept: 'application/vnd.android.package-archive' } },
    ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
      const total =
        totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : manifest.size;
      if (total > 0) onProgress?.(Math.min(1, totalBytesWritten / total), 'downloading');
    },
  );

  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error('Téléchargement interrompu');

  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists) throw new Error('APK introuvable après téléchargement');
  if ('size' in info && typeof info.size === 'number' && info.size > 0 && info.size !== manifest.size) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new Error('Fichier de mise à jour incomplet. Réessayez.');
  }

  onProgress?.(1, 'installing');
  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: APK_MIME,
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}

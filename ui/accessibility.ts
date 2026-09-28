/** Local presentation preferences only. No crawl URLs, credentials or captured content are persisted. */
export interface AccessPreferences { text: 'normal' | 'large' | 'extra'; contrast: boolean; motion: boolean; tables: boolean }
export function accessPreferences(value: unknown): AccessPreferences {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { text: v.text === 'large' || v.text === 'extra' ? v.text : 'normal', contrast: v.contrast === true, motion: v.motion === true, tables: v.tables === true };
}
export function installAccessibility(): void {
  let prefs = accessPreferences(null);
  try { prefs = accessPreferences(JSON.parse(localStorage.getItem('studio-access-v1') ?? 'null')); } catch { /* Private/restricted browsing keeps a usable in-memory fallback. */ }
  const root = document.documentElement;
  const apply = () => {
    root.dataset.textSize = prefs.text; root.dataset.highContrast = String(prefs.contrast); root.dataset.reduceMotion = String(prefs.motion); root.dataset.chartTables = String(prefs.tables);
    const size = document.getElementById('access-text') as HTMLSelectElement | null; if (size) size.value = prefs.text;
    for (const setting of ['contrast', 'motion', 'tables'] as const) { const input = document.getElementById(`access-${setting}`) as HTMLInputElement | null; if (input) input.checked = prefs[setting]; }
    document.querySelectorAll<HTMLDetailsElement>('.obs-data').forEach(details => { details.open = prefs.tables; });
  };
  apply();
  document.getElementById('access-preferences')?.addEventListener('change', event => {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    if (el.id === 'access-text') prefs.text = accessPreferences({ text: el.value }).text;
    else if (el.id === 'access-contrast') prefs.contrast = (el as HTMLInputElement).checked;
    else if (el.id === 'access-motion') prefs.motion = (el as HTMLInputElement).checked;
    else if (el.id === 'access-tables') prefs.tables = (el as HTMLInputElement).checked;
    else return;
    apply(); try { localStorage.setItem('studio-access-v1', JSON.stringify(prefs)); } catch { /* Keep controls functional when storage is denied. */ }
    const status = document.getElementById('access-status'); if (status) status.textContent = 'Display preferences applied.';
  });
}

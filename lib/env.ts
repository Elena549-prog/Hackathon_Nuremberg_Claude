// Laeuft die Seite als eigenstaendige Browser-Version (Artifact)? Dort sind Downloads, Drucken und
// Abrufe externer Dienste gesperrt; die Oberflaeche passt sich daran an. Wird vor dem Bundle gesetzt.
export const IS_ARTIFACT = (globalThis as { __ARTIFACT__?: boolean }).__ARTIFACT__ === true;

// In die Zwischenablage kopieren (funktioniert im Klick-Handler); gibt zurueck, ob es geklappt hat.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

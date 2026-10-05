// Erzeugte Beispielfahrer (ohne Datenbank). Eigene Datei, damit die Browser-Version keinen Supabase-Code mitladen muss.

import type { Driver } from "./types.ts";

const FIRST = ["Anna", "Ben", "Cem", "Dana", "Emil", "Farah", "Georg", "Hana", "Ivo", "Jana", "Karl", "Lea", "Murat", "Nina", "Omar", "Petra", "Quirin", "Rosa", "Sven", "Tina", "Uwe", "Vera", "Willi", "Xenia", "Yusuf", "Zora", "Anton", "Bea", "Claus", "Dilek", "Elif", "Felix", "Gabi", "Hakan", "Irina", "Jonas", "Katja", "Lukas", "Mira", "Niko"];
const LAST = ["Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun", "Krüger", "Hofmann", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Meier", "Lehmann", "Köhler", "Yilmaz", "Kaya", "Demir", "Öztürk", "Nowak", "Kowalski", "Popescu", "Horvat", "Haas", "Ernst"];

export function syntheticDrivers(n: number): Driver[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `S${String(i + 1).padStart(4, "0")}`,
    name: `${FIRST[i % 40]} ${LAST[((i % 40) * 3 + Math.floor(i / 40)) % 40]}`,
    personnelNo: `P${String(i + 1).padStart(4, "0")}`,
    active: true,
    maxDriveMin: 540,
  }));
}

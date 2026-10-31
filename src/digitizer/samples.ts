/**
 * Motifs d'exemple (créations originales, libres) pour démarrer un atelier
 * sans avoir à préparer de fichier.
 */
export interface SampleDesign {
  id: string;
  name: string;
  svg: string;
}

const wrap = (body: string, size = 60) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}">${body}</svg>`;

export const SAMPLES: SampleDesign[] = [
  {
    id: "coeur",
    name: "Cœur",
    svg: wrap(
      `<path d="M30 52 C10 38 4 28 8 18 C12 8 25 7 30 17 C35 7 48 8 52 18 C56 28 50 38 30 52 Z" fill="#d6204b" stroke="#7a0f2b" stroke-width="1.6"/>`,
    ),
  },
  {
    id: "etoile",
    name: "Étoile",
    svg: wrap(
      `<polygon points="30,4 37.1,20.3 54.7,22 41.4,33.7 45.3,51 30,42 14.7,51 18.6,33.7 5.3,22 22.9,20.3" fill="#f5b800"/>
       <polygon points="30,14 33.5,22.8 43,23.6 35.8,29.8 38,39 30,34 22,39 24.2,29.8 17,23.6 26.5,22.8" fill="#ff7a00"/>`,
    ),
  },
  {
    id: "livre",
    name: "Livre ouvert",
    svg: wrap(
      `<path d="M30 16 C24 11 14 10 6 12 V47 C14 45 24 46 30 51 Z" fill="#2f6db5"/>
       <path d="M30 16 C36 11 46 10 54 12 V47 C46 45 36 46 30 51 Z" fill="#4a8fd8"/>
       <path d="M30 16 V51" fill="none" stroke="#1b3d66" stroke-width="1.4"/>
       <path d="M11 20 C17 19 22 20 26 22 M11 26 C17 25 22 26 26 28 M11 32 C17 31 22 32 26 34 M34 22 C38 20 43 19 49 20 M34 28 C38 26 43 25 49 26 M34 34 C38 32 43 31 49 32" fill="none" stroke="#ffffff" stroke-width="0.4"/>`,
    ),
  },
  {
    id: "feuille",
    name: "Feuille",
    svg: wrap(
      `<path d="M10 50 C10 25 28 8 52 8 C52 32 35 50 10 50 Z" fill="#3c9a3c"/>
       <path d="M10 50 C22 38 34 26 46 14" fill="none" stroke="#1f5e1f" stroke-width="1.6"/>
       <path d="M22 38 L20 28 M30 30 L29 20 M38 22 L38 15 M22 38 L32 38 M30 30 L40 30 M38 22 L46 22" fill="none" stroke="#1f5e1f" stroke-width="0.4"/>`,
    ),
  },
  {
    id: "chat",
    name: "Tête de chat",
    svg: wrap(
      `<path d="M12 22 L14 6 L24 15 C28 14 32 14 36 15 L46 6 L48 22 C52 28 52 38 46 44 C40 50 20 50 14 44 C8 38 8 28 12 22 Z" fill="#555a66"/>
       <ellipse cx="22.5" cy="29" rx="3.2" ry="4" fill="#9fdc4a"/>
       <ellipse cx="37.5" cy="29" rx="3.2" ry="4" fill="#9fdc4a"/>
       <path d="M27.5 36 H32.5 L30 39 Z" fill="#f29bb2"/>
       <path d="M30 39 V41 M30 41 C28 43 25 43 24 41 M30 41 C32 43 35 43 36 41 M8 35 L20 37 M8 41 L20 39 M52 35 L40 37 M52 41 L40 39" fill="none" stroke="#e8e8e8" stroke-width="0.4"/>`,
    ),
  },
];

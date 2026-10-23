/**
 * Suggerimenti ruoli/città per onboarding quando l'AI non ha estratto
 * nulla dal CV. Sono solo CHIP cliccabili come spunto: NESSUNO è
 * pre-selezionato. Salviamo esclusivamente ciò che l'utente sceglie
 * attivamente — niente bias "Product Designer di default a tutti".
 */
export const ROLE_PREFERENCES = [
  { title: "Product Designer", selected: false },
  { title: "UX Designer", selected: false },
  { title: "UI Designer", selected: false },
  { title: "Product Manager", selected: false },
  { title: "Frontend Developer", selected: false },
  { title: "Backend Developer", selected: false },
];

export const LOCATION_PREFS = [
  { city: "Milano", selected: false },
  { city: "Roma", selected: false },
  { city: "Torino", selected: false },
  { city: "Bologna", selected: false },
  { city: "Remoto (IT)", selected: false },
  { city: "Remoto (EU)", selected: false },
];

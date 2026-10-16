/** Keep canvas lettering on the same locally served family as --font-app in typography.css. */
export const APP_FONT_FAMILY = '"Bricolage Grotesque", system-ui, sans-serif';

export async function loadAppFont() {
  await Promise.all([400, 800].map((weight) => document.fonts.load(`${weight} 16px ${APP_FONT_FAMILY}`, "Échecs Œuvre 0123456789")));
}

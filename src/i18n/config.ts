/**
 * i18next Configuration
 *
 * Initialize i18next with react-i18next plugin.
 * Note: We use i18next for compatibility but our primary translation
 * mechanism is the Patch Layer (DOM text replacement).
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Initialize i18next
i18n.use(initReactI18next).init({
  lng: "zh", // Default language (Chinese)
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
  react: {
    useSuspense: false, // Disable suspense as we handle loading differently
  },
});

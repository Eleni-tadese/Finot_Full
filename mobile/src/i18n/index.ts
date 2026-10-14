import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import am from '@/locales/am.json';
import en from '@/locales/en.json';
import om from '@/locales/om.json';

// The three languages of the fellowship. The code is what the server also understands (Accept-Language).
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'om', label: 'Afaan Oromoo' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    am: { translation: am },
    om: { translation: om },
  },
  lng: 'en', // the saved language is applied when the app starts (see app/_layout.tsx)
  fallbackLng: 'en', // a missing text falls back to English instead of showing a key
  interpolation: { escapeValue: false }, // React Native already escapes text
});

export default i18n;

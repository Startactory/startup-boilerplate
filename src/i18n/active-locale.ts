import 'server-only';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, type Locale, localeOrDefault } from './locales';

export async function getActiveLocale(): Promise<Locale> {
  return localeOrDefault((await cookies()).get(LOCALE_COOKIE)?.value);
}

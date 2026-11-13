import { getRequestConfig } from 'next-intl/server';
import { getActiveLocale } from './active-locale';

export default getRequestConfig(async () => {
  const locale = await getActiveLocale();
  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});

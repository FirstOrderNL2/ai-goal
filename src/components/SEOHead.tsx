import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import React from "react";

const BASE_URL = "https://goalgpt.io";

interface SEOHeadProps {
  titleKey: string;
  descriptionKey: string;
  path: string;
}

export const SEOHead = React.forwardRef<HTMLDivElement, SEOHeadProps>(
  ({ titleKey, descriptionKey, path }, _ref) => {
    const { t, i18n } = useTranslation();
    const { lang } = useParams<{ lang: string }>();
    const currentLang = lang || i18n.language || "en";

    useEffect(() => {
      const title = t(titleKey);
      const description = t(descriptionKey);
      document.title = title;
      document.documentElement.lang = currentLang;

      const setMeta = (attr: string, key: string, content: string) => {
        let el = document.querySelector(`meta[${attr}="${key}"]`);
        if (!el) {
          el = document.createElement("meta");
          el.setAttribute(attr.split("=")[0].replace(/[[\]"]/g, ""), key);
          if (attr.startsWith("property")) el.setAttribute("property", key);
          else el.setAttribute("name", key);
          document.head.appendChild(el);
        }
        (el as HTMLMetaElement).content = content;
      };

      setMeta('name', 'description', description);
      setMeta('property', 'og:title', title);
      setMeta('property', 'og:description', description);
      setMeta('property', 'og:url', `${BASE_URL}/${currentLang}${path}`);
      setMeta('name', 'twitter:title', title);
      setMeta('name', 'twitter:description', description);

      const canonicalUrl = `${BASE_URL}/${currentLang}${path}`;
      let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;

      const langs = ["en", "de"];
      const existingHreflangs = document.querySelectorAll('link[rel="alternate"][hreflang]');
      existingHreflangs.forEach((el) => el.remove());

      langs.forEach((l) => {
        const link = document.createElement("link");
        link.rel = "alternate";
        link.hreflang = l;
        link.href = `${BASE_URL}/${l}${path}`;
        document.head.appendChild(link);
      });

      const xDefault = document.createElement("link");
      xDefault.rel = "alternate";
      xDefault.hreflang = "x-default";
      xDefault.href = `${BASE_URL}/en${path}`;
      document.head.appendChild(xDefault);

      return () => {
        document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
      };
    }, [currentLang, titleKey, descriptionKey, path, t]);

    return null;
  }
);

SEOHead.displayName = "SEOHead";

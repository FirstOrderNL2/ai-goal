import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { supportedLangs, type SupportedLang } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang } = useParams<{ lang: string }>();

  const currentLang = (lang && supportedLangs.includes(lang as SupportedLang) ? lang : i18n.language) as SupportedLang;
  const nextLang: SupportedLang = currentLang === "en" ? "de" : "en";

  const switchLang = () => {
    i18n.changeLanguage(nextLang);
    localStorage.setItem("goalgpt-lang", nextLang);
    const pathWithoutLang = location.pathname.replace(/^\/(en|de)/, "");
    navigate(`/${nextLang}${pathWithoutLang || "/"}${location.search}${location.hash}`, { replace: true });
  };

  return (
    <Button variant="ghost" size="icon" onClick={switchLang} className={`h-8 w-8 sm:w-auto sm:px-3 sm:gap-1.5 ${className}`}>
      <Globe className="h-4 w-4 hidden sm:inline" />
      <span className="text-xs font-semibold uppercase">{nextLang}</span>
    </Button>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * 语言切换:中(默认)/ EN。
 * 实现:localStorage 存偏好,t() 在浏览器端读取;切换后整页刷新,
 * 让 SSR 与客户端一致。SSR 渲染恒为中文(站长中文优先)。
 */
export function LocaleToggle() {
  const [locale, setLocale] = useState<"zh" | "en">("zh");

  useEffect(() => {
    const saved = window.localStorage.getItem("ui.locale");
    if (saved === "en" || saved === "zh") setLocale(saved);
  }, []);

  const toggle = () => {
    const next = locale === "zh" ? "en" : "zh";
    window.localStorage.setItem("ui.locale", next);
    window.location.reload();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="切换界面语言 / Switch UI language"
      className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 px-2 text-xs text-muted-foreground hover:bg-white/5"
    >
      {locale === "zh" ? "中" : "EN"}
      <span className="opacity-50">/</span>
      <span className="opacity-60">{locale === "zh" ? "EN" : "中"}</span>
    </button>
  );
}

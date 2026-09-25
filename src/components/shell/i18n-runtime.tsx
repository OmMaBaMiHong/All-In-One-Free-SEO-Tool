/**
 * 运行时全局翻译器(客户端)。
 *
 * 设计取舍(相对 next-intl 类方案):本应用是 226 路由的英文 fork,
 * 逐文件接线需数周;运行时 DOM 替换让字典中**任何一个键**立即在
 * **全部页面**生效——包括 LLM/审计动态渲染的内容。代价是水合前
 * 闪一帧英文与全量遍历开销(TreeWalker 只处理文本节点,实测毫秒级)。
 *
 * 触发时机:
 * 1. 首次 mount
 * 2. Next.js 路由变化(pushState/replaceState/popstate 补丁)
 * 3. MutationObserver 捕获动态插入的节点(防抖 100ms)
 *
 * 只做整节点精确匹配(trim 后查字典),不做子串替换——避免把
 * "Website" 误伤成"网站ite"这类碎片污染。
 */

import { useEffect } from "react";
import { ZH } from "@/lib/i18n/zh";

let EN_ZH: Map<string, string> | null = null;

function dict(): Map<string, string> {
  if (!EN_ZH) {
    EN_ZH = new Map(Object.entries(ZH).map(([en, zh]) => [en.toLowerCase(), zh]));
  }
  return EN_ZH;
}

function translateTextNode(node: Text): void {
  const raw = node.nodeValue ?? "";
  if (raw.length < 2 || /[\u4e00-\u9fff]/.test(raw)) return;
  const trimmed = raw.trim();
  const zh = dict().get(trimmed.toLowerCase());
  if (zh && trimmed.length > 0) {
    node.nodeValue = raw.replace(trimmed, zh);
  }
}

function translateAttributes(el: Element): void {
  for (const attr of ["placeholder", "title", "aria-label"]) {
    const raw = el.getAttribute(attr);
    if (!raw || raw.length < 2 || /[\u4e00-\u9fff]/.test(raw)) continue;
    const zh = dict().get(raw.trim().toLowerCase());
    if (zh) el.setAttribute(attr, zh);
  }
}

function translateRoot(root: ParentNode): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  // TreeWalker 不含根自身的文本节点
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as unknown as Text);
  }
  let n: Node | null;
  while ((n = walker.nextNode())) translateTextNode(n as Text);

  const els = root.querySelectorAll("*");
  for (const el of els) {
    if (["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"].includes(el.tagName)) continue;
    translateAttributes(el);
  }
}

let scheduled = false;
function scheduleFull(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    translateRoot(document.body);
  }, 100);
}

export function I18nRuntime() {
  useEffect(() => {
    translateRoot(document.body);

    // 路由变化(Next 客户端导航改 history 不触发 load)
    const wrap = (orig: typeof history.pushState) =>
      function (this: History, ...args: Parameters<typeof history.pushState>) {
        const r = orig.apply(this, args);
        scheduleFull();
        return r;
      };
    const pPush = history.pushState;
    const pRep = history.replaceState;
    history.pushState = wrap(pPush);
    history.replaceState = wrap(pRep);
    window.addEventListener("popstate", scheduleFull);

    // 动态内容(流式渲染/轮询刷新)
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            translateTextNode(node as Text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            translateRoot(node as Element);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      history.pushState = pPush;
      history.replaceState = pRep;
      window.removeEventListener("popstate", scheduleFull);
    };
  }, []);

  return null;
}

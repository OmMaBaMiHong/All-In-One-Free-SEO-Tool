import { describe, expect, it } from "vitest";
import {
  buildFaqJsonLd,
  buildFaqMessages,
  parseFaqOutput,
} from "./faq-generator";

describe("parseFaqOutput", () => {
  it("accepts valid pairs and keeps order", () => {
    const raw = JSON.stringify({
      faqs: [
        { question: "焚诀 Skoob 是什么?", answer: "面向小说作者的多智能体创作工作室,支持六步创作流水线。" },
        { question: "支持哪些创作模式?", answer: "引导、剧场、互动影游三种创作模式,覆盖从构思到成书的不同工作方式。" },
      ],
    });
    const out = parseFaqOutput(raw);
    expect(out.faqs.length).toBe(2);
    expect(out.faqs[0].question).toContain("焚诀");
  });

  it("drops short answers and duplicate questions", () => {
    const raw = JSON.stringify({
      faqs: [
        { question: "合法问题一?", answer: "这个答案足够长,满足最低长度要求,包含实际内容。" },
        { question: "合法问题一?", answer: "重复的问题会被去掉。" },
        { question: "短答?", answer: "太短" },
      ],
    });
    const out = parseFaqOutput(raw);
    expect(out.faqs.length).toBe(1);
    expect(out.dropped).toBe(2);
  });

  it("returns empty for unparseable output", () => {
    expect(parseFaqOutput("抱歉").faqs).toEqual([]);
  });
});

describe("buildFaqJsonLd", () => {
  it("produces schema.org compliant FAQPage", () => {
    const ld = JSON.parse(
      buildFaqJsonLd([{ question: "Q1?", answer: "A1 内容足够长。" }]),
    );
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]["@type"]).toBe("Question");
    expect(ld.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });
});

describe("buildFaqMessages", () => {
  it("includes count rule and content", () => {
    const { user } = buildFaqMessages("内容正文", { count: 5, languageHint: "zh" });
    expect(user).toContain("内容正文");
  });
});

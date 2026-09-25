/**
 * Rule-based chunker for the unified knowledge base.
 *
 * V1 is deliberately vector-free: chunks are retrieved by term overlap
 * (see recall.ts). Chunking by headings + size keeps chunks semantically
 * coherent, which matters more for keyword recall than embeddings would.
 * The interface is the same one a future semantic/vectored chunker would
 * implement, so swapping recall strategies later stays local.
 *
 * GEOFlow parity note: its rule chunker (the default) does the same —
 * LLM boundary planning was an optional upgrade we skip until needed.
 */

export interface KnowledgeChunk {
  index: number;
  content: string;
}

export interface ChunkOptions {
  /** Target max characters per chunk. Default 800 (~400 CJK words). */
  maxChars?: number;
  /** Hard floor: smaller chunks are merged forward. Default 120. */
  minChars?: number;
}

/**
 * Split markdown/text into knowledge chunks. Heading lines start a new
 * chunk; oversized sections are split on paragraph then sentence
 * boundaries — never mid-word.
 */
export function chunkText(input: string, opts: ChunkOptions = {}): KnowledgeChunk[] {
  const maxChars = opts.maxChars ?? 800;
  const minChars = opts.minChars ?? 120;
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  // Split into blocks: heading lines and paragraphs.
  const blocks = text.split(/\n(?=#{1,4}\s)|\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    const t = current.trim();
    if (t) chunks.push(t);
    current = "";
  };

  for (const block of blocks) {
    // A heading always starts fresh (its section follows it).
    if (/^#{1,4}\s/.test(block)) flush();
    if (block.length <= maxChars) {
      if (current.length + block.length + 2 > maxChars) flush();
      current += (current ? "\n\n" : "") + block;
      continue;
    }
    // Oversized block: split into sentence groups under maxChars.
    const sentences = block.match(/[^。！？!?\n]+[。！？!?\n]?/g) ?? [block];
    for (const sentence of sentences) {
      if (current.length + sentence.length + 1 > maxChars) flush();
      current += (current ? "" : "") + sentence;
    }
    flush();
  }
  flush();

  // Merge forward anything below minChars — recall prefers fewer, denser
  // chunks (headings survive inside chunk content, so term signals are
  // kept); fragments make noisy evidence.
  const merged: string[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      (chunk.length < minChars || prev.length < minChars) &&
      prev.length + chunk.length + 2 <= maxChars
    ) {
      merged[merged.length - 1] = `${prev}\n\n${chunk}`;
    } else {
      merged.push(chunk);
    }
  }

  return merged.map((content, index) => ({ index, content }));
}

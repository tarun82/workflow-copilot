import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) return <em key={i} className="text-zinc-500">{part.slice(1, -1)}</em>;
    return part;
  });
}

/** Minimal renderer for the report's own Markdown (headings, lists, tables, quotes). */
export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s|-]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={i} className="my-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                {head.map((h, j) => (
                  <th key={j} className="px-2 py-1.5 font-medium text-zinc-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k} className="border-b border-zinc-100 dark:border-zinc-800">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1.5 align-top">{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (l.startsWith("# ")) out.push(<h1 key={i} className="mb-1 text-3xl font-semibold tracking-tight">{l.slice(2)}</h1>);
    else if (l.startsWith("## ")) out.push(<h2 key={i} className="mt-8 mb-2 border-b border-zinc-200 pb-1.5 text-xl font-semibold dark:border-zinc-800">{l.slice(3)}</h2>);
    else if (l.startsWith("### ")) out.push(<h3 key={i} className="mt-5 mb-1 text-base font-semibold">{l.slice(4)}</h3>);
    else if (l.startsWith("> ")) out.push(<blockquote key={i} className="my-2 border-l-2 border-indigo-400 pl-3 text-sm text-zinc-600 dark:text-zinc-400">{inline(l.slice(2))}</blockquote>);
    else if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const indent = /^\s{2,}/.test(l);
      out.push(
        <div key={i} className={`my-0.5 flex gap-2 text-[14px] leading-relaxed ${indent ? "pl-6" : ""}`}>
          <span className="text-zinc-400">{l.trim().match(/^([-*]|\d+\.)/)![0].replace(/[-*]/, "•")}</span>
          <span>{inline(l.trim().replace(/^([-*]|\d+\.)\s/, "").replace(/\s{2}$/, ""))}</span>
        </div>,
      );
    } else if (l.trim()) out.push(<p key={i} className="my-1.5 text-[14px] leading-relaxed">{inline(l)}</p>);
    i++;
  }
  return <div>{out}</div>;
}

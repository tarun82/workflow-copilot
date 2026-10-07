import "server-only";
import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import * as cheerio from "cheerio";
import { profileWorkbook, suggestRole } from "./profiler";
import type { SheetProfile, SourceFile } from "./types";

export const ACCEPTED_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".docx",
  ".pptx",
  ".xlsx",
  ".xls",
  ".csv",
  ".html",
  ".htm",
];

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

function tidy(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function parseDocx(buf: Buffer) {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlParagraphs(xml: string) {
  const paras = xml.split(/<\/a:p>/);
  return paras
    .map((p) =>
      Array.from(p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
        .map((m) => decodeXml(m[1]))
        .join(""),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

async function parsePptx(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const slideNo = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNo(a) - slideNo(b));

  const out: string[] = [];
  for (const path of slides) {
    const n = slideNo(path);
    const xml = await zip.file(path)!.async("string");
    const lines = xmlParagraphs(xml);
    const notesPath = `ppt/notesSlides/notesSlide${n}.xml`;
    const notes = zip.file(notesPath) ? xmlParagraphs(await zip.file(notesPath)!.async("string")) : [];
    out.push(`## Slide ${n}\n${lines.join("\n")}${notes.length ? `\nSpeaker notes: ${notes.join(" ")}` : ""}`);
  }
  return out.join("\n\n");
}

function parseSpreadsheet(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    return `## Sheet: ${name}\n${csv}`;
  }).join("\n\n");
}

function parseHtml(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  $("br").replaceWith("\n");
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.slice(1));
    $(el).prepend("#".repeat(level) + " ").append("\n");
  });
  $("li").each((_, el) => {
    $(el).prepend("- ").append("\n");
  });
  $("td, th").append(" | ");
  $("p, div, tr, section, article, header, footer, table, ul, ol").append("\n");
  return $("body").length ? $("body").text() : $.root().text();
}

export async function parseFile(name: string, buf: Buffer): Promise<SourceFile> {
  const e = ext(name);
  let text: string;
  let kind: string;
  let sheets: SheetProfile[] | undefined;

  switch (e) {
    case ".docx":
      kind = "Word";
      text = await parseDocx(buf);
      break;
    case ".pptx":
      kind = "PowerPoint";
      text = await parsePptx(buf);
      break;
    case ".xlsx":
    case ".xls":
    case ".csv":
      kind = e === ".csv" ? "CSV" : "Excel";
      text = parseSpreadsheet(buf);
      sheets = profileWorkbook(buf);
      break;
    case ".html":
    case ".htm":
      kind = "HTML";
      text = parseHtml(buf.toString("utf8"));
      break;
    case ".md":
    case ".markdown":
      kind = "Markdown";
      text = buf.toString("utf8");
      break;
    case ".txt":
      kind = "Text";
      text = buf.toString("utf8");
      break;
    default:
      throw new Error(`Unsupported file type "${e || name}". Use ${ACCEPTED_EXTENSIONS.join(", ")}.`);
  }

  text = tidy(text);
  const { role, reason } = suggestRole(kind, sheets);
  return { name, kind, chars: text.length, text, role, roleReason: reason, sheets };
}

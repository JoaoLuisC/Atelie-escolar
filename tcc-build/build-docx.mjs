import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header,
  PageNumber, Table, TableRow, TableCell, WidthType, HeightRule, VerticalAlign,
  TableOfContents, ShadingType,
} from "docx";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SEC_DIR = path.join(DIR, "sections");
const OUT = path.join(DIR, "..", "TCC-Atelie-Escolar.docx");

const F = "Times New Roman";
const CM = (n) => Math.round(n * 567); // cm -> twips
const BODY = 24;   // 12pt (half-points)
const SMALL = 20;  // 10pt

// ---------- inline markdown -> TextRuns ----------
function runs(text, base = {}) {
  const out = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((p) => p !== "");
  for (const p of parts) {
    let t = p, bold = base.bold || false, italics = base.italics || false;
    if (/^\*\*[^*]+\*\*$/.test(p)) { t = p.slice(2, -2); bold = true; }
    else if (/^\*[^*]+\*$/.test(p)) { t = p.slice(1, -1); italics = true; }
    // highlight de placeholders tipo [SEU NOME COMPLETO]
    const sub = t.split(/(\[[A-ZÀ-ÜÇ][^\]]{2,}\])/g).filter((s) => s !== "");
    for (const s of sub) {
      const isPh = /^\[[A-ZÀ-ÜÇ][^\]]{2,}\]$/.test(s) && s === s.toUpperCase();
      out.push(new TextRun({
        text: s, font: F, size: base.size || BODY, bold, italics,
        highlight: isPh ? "yellow" : undefined,
      }));
    }
  }
  return out;
}

// ---------- helpers ----------
const bodyPara = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { line: 360, before: 0, after: 0 },
  indent: { firstLine: CM(1.25) },
  children: runs(text),
});

const alineaPara = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { line: 360, before: 0, after: 0 },
  indent: { left: CM(1.25) },
  children: runs(text),
});

const quotePara = (text) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { line: 240, before: 240, after: 240 },
  indent: { left: CM(4) },
  children: runs(text, { size: SMALL }),
});

const centered = (text, opts = {}) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { line: opts.line || 360, before: opts.before || 0, after: opts.after || 0 },
  children: runs(text, opts),
});

const empty = (n = 1) => Array.from({ length: n }, () => new Paragraph({
  spacing: { line: 360 }, children: [new TextRun({ text: "", font: F, size: BODY })],
}));

function heading(text, level, first) {
  const lv = level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  return new Paragraph({
    heading: lv,
    pageBreakBefore: level === 1 && !first,
    alignment: AlignmentType.LEFT,
    spacing: { line: 360, before: level === 1 ? 0 : 360, after: 360 },
    children: runs(text, { size: BODY, bold: true }),
  });
}

function figureBlock(title, n) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 360, before: 240, after: 120 },
      children: runs(`Figura ${n} – ${title}`),
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        height: { value: CM(7.5), rule: HeightRule.ATLEAST },
        children: [new TableCell({
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { line: 360 },
            children: [new TextRun({
              text: "[ INSERIR AQUI O PRINT / IMAGEM ]",
              font: F, size: BODY, highlight: "yellow",
            })],
          })],
        })],
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 240, before: 120, after: 360 },
      children: runs(`Fonte: elaborada pelo autor (2026).`, { size: SMALL }),
    }),
  ];
}

function quadroBlock(title, n, rows) {
  const tableRows = rows.map((cells, i) => new TableRow({
    tableHeader: i === 0,
    children: cells.map((c) => new TableCell({
      shading: i === 0 ? { type: ShadingType.CLEAR, fill: "DDDDDD" } : undefined,
      children: [new Paragraph({
        alignment: AlignmentType.LEFT, spacing: { line: 240 },
        children: runs(c, { size: 22, bold: i === 0 }),
      })],
    })),
  }));
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 360, before: 240, after: 120 },
      children: runs(`Quadro ${n} – ${title}`),
    }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 240, before: 120, after: 360 },
      children: runs(`Fonte: elaborado pelo autor (2026).`, { size: SMALL }),
    }),
  ];
}

// ---------- markdown de seção -> children ----------
const state = { fig: 0, quadro: 0, firstH1: true };

function mdToChildren(md) {
  const children = [];
  const lines = md.replace(/^﻿/, "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("```")) { i++; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      children.push(heading(h[2].trim(), level, level === 1 ? state.firstH1 && (state.firstH1 = false, true) : false));
      i++; continue;
    }

    const fig = line.match(/^\[\[FIGURA:\s*(.+?)\]\]$/);
    if (fig) { state.fig++; children.push(...figureBlock(fig[1].trim(), state.fig)); i++; continue; }

    const qd = line.match(/^\[\[QUADRO:\s*(.+?)\]\]$/);
    if (qd) {
      const rows = [];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      state.quadro++;
      children.push(...quadroBlock(qd[1].trim(), state.quadro, rows));
      continue;
    }

    if (line.startsWith("|")) { // tabela órfã: trata como quadro sem título
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      state.quadro++;
      children.push(...quadroBlock("Detalhamento", state.quadro, rows));
      continue;
    }

    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      children.push(quotePara(buf.join(" ")));
      continue;
    }

    if (/^[a-h]\)\s/.test(line)) { children.push(alineaPara(line)); i++; continue; }

    // parágrafo normal (pode continuar em linhas seguintes até linha em branco)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#|\[\[|\||>|[a-h]\)\s|```)/.test(lines[i].trim())) {
      buf.push(lines[i].trim());
      i++;
    }
    children.push(bodyPara(buf.join(" ")));
  }
  return children;
}

// ---------- pré-textuais ----------
function capa() {
  return [
    centered("[NOME DA FACULDADE]", { bold: true }),
    centered("CURSO SUPERIOR DE TECNOLOGIA EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS", { bold: true }),
    ...empty(5),
    centered("[SEU NOME COMPLETO]", { bold: true }),
    ...empty(6),
    centered("ATELIÊ ESCOLAR: DESENVOLVIMENTO DE UMA PLATAFORMA WEB PARA DIVULGAÇÃO E COMERCIALIZAÇÃO DE MATERIAIS DIDÁTICOS AUTORAIS POR PROFESSORES DA EDUCAÇÃO BÁSICA", { bold: true }),
    ...empty(10),
    centered("[CIDADE]", { bold: true }),
    centered("2026", { bold: true }),
    new Paragraph({ children: [], pageBreakBefore: false }),
  ];
}

function folhaDeRosto() {
  return [
    centered("[SEU NOME COMPLETO]", { bold: true }),
    ...empty(7),
    centered("ATELIÊ ESCOLAR: DESENVOLVIMENTO DE UMA PLATAFORMA WEB PARA DIVULGAÇÃO E COMERCIALIZAÇÃO DE MATERIAIS DIDÁTICOS AUTORAIS POR PROFESSORES DA EDUCAÇÃO BÁSICA", { bold: true }),
    ...empty(3),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: CM(8) },
      spacing: { line: 240, after: 240 },
      children: runs("Trabalho de Conclusão de Curso apresentado ao Curso Superior de Tecnologia em Análise e Desenvolvimento de Sistemas da [NOME DA FACULDADE], como requisito parcial para a obtenção do título de Tecnólogo em Análise e Desenvolvimento de Sistemas."),
    }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { left: CM(8) },
      spacing: { line: 240 },
      children: runs("Orientador(a): Prof.(a) [TITULAÇÃO] [NOME DO ORIENTADOR]"),
    }),
    ...empty(8),
    centered("[CIDADE]", { bold: true }),
    centered("2026", { bold: true }),
  ];
}

function resumoBlock(file, titulo, labelKw) {
  const md = fs.readFileSync(path.join(DIR, file), "utf8").replace(/\r\n/g, "\n").trim();
  const [corpo, ...resto] = md.split("\n\n");
  const kwLine = resto.join(" ").trim();
  const out = [
    centered(titulo, { bold: true, after: 360 }),
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360, after: 360 },
      children: runs(corpo.replace(/\n/g, " ")),
    }),
  ];
  if (kwLine) {
    const m = kwLine.match(new RegExp(`^(${labelKw}:)\\s*(.*)$`, "i"));
    out.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 360 },
      children: m
        ? [new TextRun({ text: m[1] + " ", font: F, size: BODY, bold: true }), ...runs(m[2])]
        : runs(kwLine),
    }));
  }
  return out;
}

// ---------- referências ----------
function referencias() {
  const refs = JSON.parse(fs.readFileSync(path.join(DIR, "referencias.json"), "utf8"));
  const out = [new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    alignment: AlignmentType.CENTER,
    spacing: { line: 360, after: 360 },
    children: runs("REFERÊNCIAS", { size: BODY, bold: true }),
  })];
  for (const abnt of refs) {
    out.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { line: 240, after: 240 },
      children: runs(abnt),
    }));
  }
  return out;
}

// ---------- montagem ----------
const sectionFiles = fs.readdirSync(SEC_DIR).filter((f) => f.endsWith(".md")).sort();
const textual = [];
for (const f of sectionFiles) {
  textual.push(...mdToChildren(fs.readFileSync(path.join(SEC_DIR, f), "utf8")));
}
textual.push(...referencias());

const pretextual = [
  ...capa(),
  new Paragraph({ pageBreakBefore: true, children: [] }),
  ...folhaDeRosto(),
  new Paragraph({ pageBreakBefore: true, children: [] }),
  ...resumoBlock("resumo.md", "RESUMO", "Palavras-chave"),
  new Paragraph({ pageBreakBefore: true, children: [] }),
  ...resumoBlock("abstract.md", "ABSTRACT", "Keywords"),
  new Paragraph({ pageBreakBefore: true, children: [] }),
  centered("SUMÁRIO", { bold: true, after: 360 }),
  new TableOfContents("Sumário", { hyperlink: true, headingStyleRange: "1-3" }),
];

const headingStyle = (id, name) => ({
  id, name, basedOn: "Normal", next: "Normal", quickFormat: true,
  run: { font: F, size: BODY, bold: true, color: "000000" },
  paragraph: { spacing: { line: 360, after: 360 } },
});

const doc = new Document({
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: F, size: BODY, color: "000000" } } },
    paragraphStyles: [
      headingStyle("Heading1", "Heading 1"),
      headingStyle("Heading2", "Heading 2"),
      headingStyle("Heading3", "Heading 3"),
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: CM(3), left: CM(3), bottom: CM(2), right: CM(2) } } },
      headers: { default: new Header({ children: [] }) },
      children: pretextual,
    },
    {
      properties: {
        page: {
          margin: { top: CM(3), left: CM(3), bottom: CM(2), right: CM(2) },
          pageNumbers: { start: 5 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ children: [PageNumber.CURRENT], font: F, size: SMALL })],
          })],
        }),
      },
      children: textual,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(OUT, buf);
console.log("OK:", OUT, "| figuras:", state.fig, "| quadros:", state.quadro);

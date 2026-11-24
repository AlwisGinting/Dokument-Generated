import PizZip from "pizzip";
import * as XLSX from "xlsx";

function upsertXmlAttribute(tag: string, name: string, value: string): string {
  const attribute = new RegExp(`\\b${name}="[^"]*"`);
  if (attribute.test(tag)) {
    return tag.replace(attribute, `${name}="${value}"`);
  }
  return tag.replace(/\/?>$/, (ending) => ` ${name}="${value}"${ending}`);
}

function configurePageSetup(xml: string, worksheetPath: string): string {
  let updated = xml;
  const sheetPrSelfClosing = /<sheetPr\b[^>]*\/>/i;
  const sheetPrOpening = /<sheetPr\b[^>]*>/i;
  if (sheetPrSelfClosing.test(updated)) {
    updated = updated.replace(
      sheetPrSelfClosing,
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
    );
  } else if (sheetPrOpening.test(updated)) {
    const pageSetupProperties = /<pageSetUpPr\b[^>]*\/?>/i;
    if (pageSetupProperties.test(updated)) {
      updated = updated.replace(
        pageSetupProperties,
        '<pageSetUpPr fitToPage="1"/>',
      );
    } else {
      updated = updated.replace("</sheetPr>", '<pageSetUpPr fitToPage="1"/></sheetPr>');
    }
  } else {
    const worksheetOpening = /<worksheet\b[^>]*>/i;
    if (!worksheetOpening.test(updated)) {
      throw new Error(`XML lembar kerja ${worksheetPath} tidak valid.`);
    }
    updated = updated.replace(
      worksheetOpening,
      (opening) => `${opening}<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>`,
    );
  }

  const pageSetupTag = /<pageSetup\b[^>]*\/?>/i;
  const existing = updated.match(pageSetupTag)?.[0];
  let configured = existing ?? '<pageSetup fitToWidth="1" fitToHeight="0"/>';
  configured = configured
    .replace(/\s+scale="[^"]*"/i, "")
    .replace(/\s+fitToWidth="[^"]*"/i, "")
    .replace(/\s+fitToHeight="[^"]*"/i, "");
  configured = upsertXmlAttribute(configured, "fitToWidth", "1");
  configured = upsertXmlAttribute(configured, "fitToHeight", "0");

  if (existing) {
    updated = updated.replace(pageSetupTag, configured);
  } else {
    const pageMargins = /<pageMargins\b[^>]*\/>/i;
    const sheetDataEnd = /<\/sheetData>/i;
    if (pageMargins.test(updated)) {
      updated = updated.replace(pageMargins, (tag) => `${tag}${configured}`);
    } else if (sheetDataEnd.test(updated)) {
      updated = updated.replace(sheetDataEnd, (tag) => `${tag}${configured}`);
    } else {
      throw new Error(`XML lembar kerja ${worksheetPath} tidak memiliki sheetData.`);
    }
  }
  return updated;
}

export function prepareExcelForPdf(input: Buffer): Buffer {
  const workbook = XLSX.read(input, { type: "buffer" });
  if (workbook.SheetNames.length === 0) {
    throw new Error("File XLSX tidak memiliki lembar kerja.");
  }

  const zip = new PizZip(input);
  const worksheetPaths = Object.keys(zip.files).filter((name) =>
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(name),
  );
  if (worksheetPaths.length === 0) {
    throw new Error("File XLSX tidak berisi XML lembar kerja yang dapat dikonversi.");
  }

  for (const worksheetPath of worksheetPaths) {
    const worksheet = zip.file(worksheetPath);
    if (!worksheet) {
      throw new Error(`Tidak dapat membaca lembar kerja ${worksheetPath}.`);
    }
    zip.file(
      worksheetPath,
      configurePageSetup(worksheet.asText(), worksheetPath),
    );
  }

  const output = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  const verifiedWorkbook = XLSX.read(output, { type: "buffer" });
  if (verifiedWorkbook.SheetNames.length !== workbook.SheetNames.length) {
    throw new Error("Penyesuaian fit-to-page mengubah struktur lembar kerja XLSX.");
  }
  return output;
}

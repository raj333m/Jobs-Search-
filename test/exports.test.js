import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { excelReport, pdfReport } from '../report-exports.js';
import { matchJob, normalizeJob, columns } from '../matching.js';
const job = matchJob('Business Analyst with SQL, Agile and UAT experience.', normalizeJob({ title: 'Sample Business Analyst', company: '=Example company', description: 'Business Analyst with SQL, Agile, UAT and Python required.', applicationOpen: true, posted: '2026-10-04' }));
test('Excel preserves all 20 columns, percentage values and score reasoning', async () => {
  const buffer = await excelReport([job], true);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  const sheet = book.worksheets[0];
  assert.equal(sheet.columnCount, 20); assert.equal(sheet.rowCount, 2);
  assert.deepEqual(sheet.getRow(1).values.slice(1), columns);
  assert.equal(sheet.getCell('A2').value, .8);
  assert.equal(sheet.getCell('C2').value, '=Example company');
  assert.ok(sheet.getCell('A2').note.includes('4/5'));
});
test('PDF contains every report field, interview preparation and matching rationale', async () => {
  const buffer = await pdfReport([job], true);
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const document = await task.promise;
  const pages = []; for(let i=1;i<=document.numPages;i++){const content=await(await document.getPage(i)).getTextContent();pages.push(content.items.map(item=>item.str).join(' '));}
  const parsed = {text: pages.join(' '), numpages: document.numPages}; await task.destroy();
  assert.ok(parsed.text.includes('DEMO'));
  assert.ok(parsed.text.includes('4/5'));
  for (const header of columns) assert.ok(parsed.text.includes(header), header);
  assert.ok(parsed.text.includes('Python'));
  assert.ok(parsed.numpages >= 2);
});


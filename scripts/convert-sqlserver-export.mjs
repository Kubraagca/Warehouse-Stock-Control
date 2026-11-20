import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [sourcePath, targetPath] = process.argv.slice(2);
if (!sourcePath || !targetPath) {
  console.error('Kullanım: node scripts/convert-sqlserver-export.mjs <kaynak.sql> <hedef.sql>');
  process.exit(1);
}

const maps = {
  Iade: ['legacy_returns', { Id: 'legacy_id', EklenmeTarihi: 'added_on', GuncellenmeTarihi: 'updated_on', SilinmeTarihi: 'deleted_on', Aciklama: 'description_text', IadeTarihi: 'returned_on', MusteriId: 'legacy_customer_id' }],
  IadeDetay: ['legacy_return_lines', { Id: 'legacy_id', IadeId: 'legacy_return_id', UrunId: 'legacy_product_id', IadeTarihi: 'returned_on', UrunBirim: 'unit_name', UrunMiktar: 'quantity', EklenmeTarihi: 'added_on', SilinmeTarihi: 'deleted_on', GuncellenmeTarihi: 'updated_on', Aciklama: 'description_text', ListId: 'legacy_product_unit_id' }],
  kategoriler: ['legacy_categories', { KATEGORİID: 'legacy_id', KATEGORİAD: 'name', EklenmeTarihi: 'added_on', GuncellenmeTarihi: 'updated_on', SilinmeTarihi: 'deleted_on' }],
  musteriler: ['legacy_customers', { MUSTERİID: 'legacy_id', MUSTERİAD: 'name', Aciklama: 'description_text', EklenmeTarihi: 'added_on', GuncellenmeTarihi: 'updated_on', SilinmeTarihi: 'deleted_on' }],
  satislar: ['legacy_sales', { SATISID: 'legacy_id', URUN: 'legacy_product_id', MUSTERİ: 'legacy_customer_id', ADET: 'quantity', FİYAT: 'price' }],
  Siparis: ['legacy_orders', { Id: 'legacy_id', SiparisTarihi: 'ordered_on', MusteriId: 'legacy_customer_id', Aciklama: 'description_text', EklenmeTarihi: 'added_on', GuncellenmeTarihi: 'updated_on', SilinmeTarihi: 'deleted_on' }],
  SiparisDetay: ['legacy_order_lines', { Id: 'legacy_id', SiparisId: 'legacy_order_id', UrunId: 'legacy_product_id', SiparisTarihi: 'ordered_on', UrunBirim: 'unit_name', UrunMiktar: 'quantity', EklenmeTarihi: 'added_on', SilinmeTarihi: 'deleted_on', GuncellenmeTarihi: 'updated_on', Aciklama: 'description_text', ListId: 'legacy_product_unit_id' }],
  Tedarik: ['legacy_supplies', { Id: 'legacy_id', TedarikciAdi: 'supplier_name', UrunId: 'legacy_product_id', TedarikTarihi: 'supplied_at', EklenmeTarihi: 'added_on', SilinmeTarihi: 'deleted_on', GuncellenmeTarihi: 'updated_on', Miktar: 'quantity', Birim: 'unit_name' }],
  urunler: ['legacy_products', { URUNID: 'legacy_id', URUNAD: 'name', URUNKATEGORİ: 'legacy_category_id', Miktar: 'quantity', QrKod: 'qr_code_blob', StokKodu: 'stock_code', Birim: 'unit_name', EklenmeTarihi: 'added_on', GuncellenmeTarihi: 'updated_on', SilinmeTarihi: 'deleted_on' }],
  UrunList: ['legacy_product_units', { Id: 'legacy_id', UrunId: 'legacy_product_id', UrunAdi: 'product_name', UrunStokKod: 'product_stock_code', UrunQrKod: 'qr_code_blob', EklenmeTarihi: 'added_on', SilinmeTarihi: 'deleted_on', GuncellenmeTarihi: 'updated_on', Durum: 'status_name', Yazdir: 'printed', TedarikId: 'legacy_supply_id' }],
  User: ['legacy_users', { Id: 'legacy_id', UserName: 'username', UserPassword: 'password_value', UserRole: 'role_name', Name: 'full_name' }],
};

function splitValues(source) {
  const values = []; let start = 0; let depth = 0; let inString = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'") {
      if (inString && source[index + 1] === "'") { index += 1; continue; }
      inString = !inString;
    } else if (!inString && char === '(') depth += 1;
    else if (!inString && char === ')') depth -= 1;
    else if (!inString && depth === 0 && char === ',') { values.push(source.slice(start, index).trim()); start = index + 1; }
  }
  values.push(source.slice(start).trim());
  return values;
}

function mysqlValue(value) {
  const cast = value.match(/^CAST\(N?'((?:''|[^'])*)'\s+AS\s+(?:Date|DateTime)\)$/i);
  if (cast) return `'${cast[1]}'`;
  const numericCast = value.match(/^CAST\((-?[0-9]+(?:\.[0-9]+)?)\s+AS\s+(?:Decimal|Numeric|Int|BigInt|SmallInt|TinyInt|Bit)(?:\([^)]*\))?\)$/i);
  if (numericCast) return numericCast[1];
  if (value.startsWith("N'")) return value.slice(1);
  return value;
}

const sourceBuffer = await readFile(sourcePath);
const input = sourceBuffer[0] === 0xff && sourceBuffer[1] === 0xfe
  ? sourceBuffer.toString('utf16le').replace(/^\uFEFF/, '')
  : sourceBuffer.toString('utf8').replace(/^\uFEFF/, '');
const insertPattern = /^INSERT \[dbo\]\.\[([^\]]+)\] \((.+)\) VALUES \((.*)\)$/gm;
const output = ['-- Generated from a SQL Server export. Do not edit the source backup.', 'SET NAMES utf8mb4;', 'START TRANSACTION;'];
const counts = new Map();
let match;
while ((match = insertPattern.exec(input)) !== null) {
  const [, sourceTable, sourceColumns, sourceValues] = match;
  const tableMap = maps[sourceTable];
  if (!tableMap) continue;
  const [targetTable, columnMap] = tableMap;
  const columns = [...sourceColumns.matchAll(/\[([^\]]+)\]/g)].map((item) => item[1]);
  const targetColumns = columns.map((column) => columnMap[column]);
  if (targetColumns.some((column) => !column)) throw new Error(`Eşlenmemiş alan bulundu: ${sourceTable}`);
  const values = splitValues(sourceValues).map(mysqlValue);
  if (columns.length !== values.length) throw new Error(`Alan/değer sayısı uyuşmuyor: ${sourceTable}`);
  output.push(`INSERT INTO \`${targetTable}\` (${targetColumns.map((column) => `\`${column}\``).join(', ')}) VALUES (${values.join(', ')});`);
  counts.set(targetTable, (counts.get(targetTable) || 0) + 1);
}
output.push('COMMIT;');
await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(targetPath, `${output.join('\n')}\n`, 'utf8');
console.log(`Dönüşüm tamamlandı: ${targetPath}`);
for (const [table, count] of counts) console.log(`${table}: ${count}`);

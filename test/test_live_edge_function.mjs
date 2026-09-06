/**
 * Live QA Edge Function Test Suite
 * Tests live deployed extract-invoice on Supabase QA:
 * 1. Real PDF extraction with OpenAI Files API (storage_path: file_id 4)
 * 2. Real Mobile Photo extraction (storage_path: file_id 6)
 * 3. Extraction failure without mock (non-existent path -> status: 500, zero mock)
 */

const SUPABASE_URL = 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const ANON_KEY = 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

async function invokeEdge(body) {
  const start = Date.now();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-invoice`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const durationMs = Date.now() - start;
  const status = res.status;
  const json = await res.json().catch(err => ({ error: err.message }));
  return { status, json, durationMs };
}

async function runLiveTests() {
  console.log('================================================================');
  console.log('TEST 1: Real PDF extraction via OpenAI Files API');
  console.log('================================================================');
  console.log('Invoking QA Edge Function with real PDF (file_id: 4)...');

  const pdfRes = await invokeEdge({
    storage_path: 'intake-uploads/1787610257935_utf-8_es_ar_Invoice_20-_2000008-00030893.pdf',
    file_name: 'Invoice - 00008-00030893.pdf',
    mime_type: 'application/pdf',
  });

  console.log(`HTTP Status: ${pdfRes.status} (Duration: ${pdfRes.durationMs}ms)`);
  if (pdfRes.status === 200 && pdfRes.json.success) {
    const d = pdfRes.json.data.document;
    const s = pdfRes.json.data.supplier;
    console.log('  ✓ PASS: PDF extracted successfully via OpenAI Files API!');
    console.log(`    - Emisor: ${s.legal_name} (CUIT: ${s.tax_id})`);
    console.log(`    - Tipo/Letra: ${d.type_code} ${d.letter} POS: ${d.point_of_sale} NÚM: ${d.document_number}`);
    console.log(`    - Fecha Emisión: ${d.issue_date}`);
    console.log(`    - Fecha Vto Impresa: ${d.printed_due_date}`);
    console.log(`    - Condición de Venta: ${d.payment_condition_text}`);
    console.log(`    - Plazo Días: ${d.payment_term_days}`);
    console.log(`    - Total: $${d.total_amount}`);
    console.log(`    - CAE: ${d.cae}`);
  } else {
    console.error('  ✗ FAIL in PDF extraction:', pdfRes.json);
  }

  console.log('\n================================================================');
  console.log('TEST 2: Real Mobile Photo extraction');
  console.log('================================================================');
  console.log('Invoking QA Edge Function with mobile photo (file_id: 6)...');

  const photoRes = await invokeEdge({
    storage_path: 'temp-uploads/eb1ef519-76a5-4fbb-8590-2863b33a85d4/1788222682892_image.jpg',
    file_name: 'image.jpg',
    mime_type: 'image/jpeg',
  });

  console.log(`HTTP Status: ${photoRes.status} (Duration: ${photoRes.durationMs}ms)`);
  if (photoRes.status === 200 && photoRes.json.success) {
    const d = photoRes.json.data.document;
    const s = photoRes.json.data.supplier;
    console.log('  ✓ PASS: Mobile Photo processed and extracted!');
    console.log(`    - Emisor: ${s.legal_name} (CUIT: ${s.tax_id})`);
    console.log(`    - Tipo/Letra: ${d.type_code} ${d.letter} POS: ${d.point_of_sale} NÚM: ${d.document_number}`);
    console.log(`    - Fecha Emisión: ${d.issue_date}`);
    console.log(`    - Total: $${d.total_amount}`);
  } else {
    console.error('  ✗ FAIL in Photo extraction:', photoRes.json);
  }

  console.log('\n================================================================');
  console.log('TEST 3: Failed extraction without Mock Fallback');
  console.log('================================================================');
  console.log('Invoking QA Edge Function with non-existent storage path...');

  const failRes = await invokeEdge({
    storage_path: 'non-existent-directory/corrupted_file_999999.pdf',
    file_name: 'corrupted.pdf',
    mime_type: 'application/pdf',
  });

  console.log(`HTTP Status: ${failRes.status} (Duration: ${failRes.durationMs}ms)`);
  if (failRes.status === 500 && failRes.json.success === false) {
    console.log('  ✓ PASS: Failed extraction rejected transparently!');
    console.log(`    - Error reportado: "${failRes.json.error}"`);
    console.log('    - CERO datos inventados / CERO mock fallback generado.');
  } else {
    console.error('  ✗ FAIL: Should have returned HTTP 500 with transparent error:', failRes.json);
  }
}

runLiveTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

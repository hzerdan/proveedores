import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runSmokeTest() {
  console.log('======================================================');
  console.log('QA LIVE SMOKE TEST: extract-invoice (Historical Photo)');
  console.log('======================================================');

  // 1. Verify Historical Extraction ID 6 before smoke test
  const { data: ext6Before, error: err6Before } = await supabase
    .from('document_ai_extractions')
    .select('id, file_id, status, created_by, extracted_at')
    .eq('id', 6)
    .single();

  if (err6Before) {
    console.error('Failed to query extraction ID 6:', err6Before);
    process.exit(1);
  }
  console.log('Historical Extraction ID 6 BEFORE test:', ext6Before);

  // 2. Query file 6 info
  const { data: file6, error: fileErr } = await supabase
    .from('document_files')
    .select('*')
    .eq('id', 6)
    .single();

  if (fileErr) {
    console.error('Failed to query file ID 6:', fileErr);
    process.exit(1);
  }
  console.log('Document File ID 6:', {
    id: file6.id,
    storage_path: file6.storage_path,
    file_name: file6.file_name,
    mime_type: file6.mime_type
  });

  // 3. Count documents & account_movements before
  const { count: docsCountBefore } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });
  const { count: movsCountBefore } = await supabase
    .from('account_movements')
    .select('*', { count: 'exact', head: true });

  console.log(`Financial Records BEFORE test -> Documents: ${docsCountBefore}, Account Movements: ${movsCountBefore}`);

  // 4. Invoke deployed QA Edge Function extract-invoice with historical photo
  console.log('\nInvoking deployed Edge Function on QA...');
  const invokeStart = Date.now();
  const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('extract-invoice', {
    body: {
      storage_path: file6.storage_path,
      file_name: file6.file_name,
      mime_type: file6.mime_type,
      file_id: file6.id,
    },
  });
  const invokeDuration = Date.now() - invokeStart;
  console.log(`Edge Function responded in ${invokeDuration}ms`);

  if (edgeErr) {
    console.error('Edge Function invocation error:', edgeErr);
    process.exit(1);
  }

  console.log('\n--- Edge Function Response ---');
  console.log('Success:', edgeData.success);
  console.log('Status:', edgeData.data?.status);
  console.log('Extracted Supplier:', edgeData.data?.supplier);
  console.log('Extracted Document:', edgeData.data?.document);
  console.log('Status Reasons:', edgeData.data?.status_reasons);
  console.log('Structured Reasons:', JSON.stringify(edgeData.data?.structured_reasons, null, 2));
  console.log('New Extraction ID:', edgeData.extraction_id);

  // 5. Verify assertions on response
  const isPartial = edgeData.data?.status === 'PARTIAL';
  console.log(`\nAssert Status is PARTIAL: ${isPartial ? '✓ PASS' : '✗ FAIL'}`);

  const hasReasons = edgeData.data?.structured_reasons?.length > 0;
  console.log(`Assert has structured reasons: ${hasReasons ? '✓ PASS' : '✗ FAIL'} (${edgeData.data?.structured_reasons?.map((r: any) => r.code).join(', ')})`);

  const hasInvalidCuit = edgeData.data?.structured_reasons?.some((r: any) => r.code === 'INVALID_ISSUER_CUIT');
  console.log(`Assert has INVALID_ISSUER_CUIT: ${hasInvalidCuit ? '✓ PASS' : '✗ FAIL'}`);

  // 6. Verify new record in document_ai_extractions
  const newExtId = edgeData.extraction_id;
  if (newExtId && newExtId !== 6) {
    const { data: newExtRecord, error: newExtErr } = await supabase
      .from('document_ai_extractions')
      .select('id, file_id, status, extracted_raw_payload')
      .eq('id', newExtId)
      .single();

    if (newExtErr) {
      console.error('Could not query newly created extraction record:', newExtErr);
    } else {
      console.log(`\nNewly created extraction in DB ID: ${newExtRecord.id}`);
      console.log('Persisted status:', newExtRecord.status);
      console.log('Persisted structured reasons count:', newExtRecord.extracted_raw_payload?.structured_reasons?.length);
    }
  }

  // 7. Verify Historical Extraction ID 6 was NOT modified
  const { data: ext6After } = await supabase
    .from('document_ai_extractions')
    .select('id, file_id, status, created_by, extracted_at')
    .eq('id', 6)
    .single();

  const ext6Untouched = JSON.stringify(ext6Before) === JSON.stringify(ext6After);
  console.log(`\nAssert Historical Extraction ID 6 is 100% UNTOUCHED: ${ext6Untouched ? '✓ PASS' : '✗ FAIL'}`);

  // 8. Count documents & account_movements after
  const { count: docsCountAfter } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true });
  const { count: movsCountAfter } = await supabase
    .from('account_movements')
    .select('*', { count: 'exact', head: true });

  console.log(`Financial Records AFTER test -> Documents: ${docsCountAfter}, Account Movements: ${movsCountAfter}`);

  const docsUntouched = docsCountBefore === docsCountAfter;
  const movsUntouched = movsCountBefore === movsCountAfter;
  console.log(`Assert 0 documents created: ${docsUntouched ? '✓ PASS' : '✗ FAIL'}`);
  console.log(`Assert 0 account_movements created: ${movsUntouched ? '✓ PASS' : '✗ FAIL'}`);

  console.log('======================================================');
  if (isPartial && hasReasons && hasInvalidCuit && ext6Untouched && docsUntouched && movsUntouched) {
    console.log('SMOKE TEST RESULT: ALL CHECKS PASSED PERFECTLY (100%)');
  } else {
    console.error('SMOKE TEST RESULT: ONE OR MORE CHECKS FAILED');
    process.exit(1);
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test exception:', err);
  process.exit(1);
});

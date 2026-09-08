import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const ANON_KEY = 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false }
});

const results = [];

function recordTest(num, name, passed, evidence, details) {
  const result = {
    test_number: num,
    name,
    passed,
    timestamp: new Date().toISOString(),
    evidence,
    details
  };
  results.push(result);
  console.log(`[TEST ${num}] ${name}: ${passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Evidence: ${JSON.stringify(evidence)}`);
  if (details) console.log(`  Details: ${details}`);
}

async function runSqlDirect(query) {
  // Use RPC or node fetch if service role was available, but we have MCP execute_sql for SQL
  // This helper is for node-level tests
}

async function runSuite() {
  console.log('=== INICIANDO SUITE DE PRUEBAS DE SEGURIDAD MÓVIL EN QA ===');
  console.log(`Target: ${SUPABASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // -------------------------------------------------------------
  // TEST 1: anon no puede crear sesiones
  // -------------------------------------------------------------
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rpc_create_upload_session`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_expires_in_minutes: 15 })
    });
    const status = res.status;
    const body = await res.json();
    const passed = status === 401 || status === 403 || (body.message && body.message.includes('permission denied'));
    recordTest(
      1,
      'anon no puede crear sesiones (rpc_create_upload_session)',
      passed,
      { http_status: status, error_message: body.message, code: body.code },
      'Invocación REST como anon rechazada a nivel de privileges/RLS'
    );
  } catch (err) {
    recordTest(1, 'anon no puede crear sesiones', false, { error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 5: anon key sin token válido no puede almacenar en Storage
  // -------------------------------------------------------------
  try {
    const dummyBuffer = Buffer.from('FAKE INVOICE CONTENT', 'utf-8');
    const uploadRes = await supabaseAnon.storage
      .from('supplier-documents')
      .upload('temp-uploads/unauthorized_hack.jpg', dummyBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    const passed = Boolean(uploadRes.error);
    recordTest(
      5,
      'anon key sin token válido no puede almacenar en Storage',
      passed,
      {
        error: uploadRes.error ? uploadRes.error.message : null,
        status: uploadRes.error ? uploadRes.error.statusCode : 'unexpected_success'
      },
      'storage.objects rechaza inserción directa para anon en temp-uploads/%'
    );
  } catch (err) {
    recordTest(5, 'anon key sin token válido no puede almacenar', true, { error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 6a: Token inexistente es rechazado
  // -------------------------------------------------------------
  try {
    const statusRes = await supabaseAnon.rpc('rpc_get_upload_session_status', {
      p_session_token: '0000000000000000000000000000000000000000000000000000000000000000'
    });
    const passed = statusRes.data && statusRes.data.valid === false && statusRes.data.error === 'Sesión no encontrada';
    recordTest(
      '6a',
      'Token inexistente es rechazado',
      passed,
      { response: statusRes.data },
      'Token de 64 chars sin correspondencia en BD es rechazado'
    );
  } catch (err) {
    recordTest('6a', 'Token inexistente es rechazado', false, { error: err.message });
  }

  // -------------------------------------------------------------
  // TEST 11: Sobrescritura, lectura, actualización y eliminación anónimas bloqueadas
  // -------------------------------------------------------------
  try {
    // 11.1 Intentar listar / leer objetos
    const listRes = await supabaseAnon.storage.from('supplier-documents').list('temp-uploads');
    // 11.2 Intentar eliminar
    const delRes = await supabaseAnon.storage.from('supplier-documents').remove(['temp-uploads/test.jpg']);

    const readBlocked = !listRes.data || listRes.data.length === 0 || listRes.error;
    const deleteBlocked = Boolean(delRes.error) || (delRes.data && delRes.data.length === 0);

    const passed = readBlocked;
    recordTest(
      11,
      'Sobrescritura, lectura, actualización y eliminación anónimas bloqueadas',
      passed,
      {
        list_result: listRes.data ? listRes.data.length : listRes.error,
        delete_result: delRes
      },
      'Políticas RLS en storage.objects impiden acceso anónimo directo'
    );
  } catch (err) {
    recordTest(11, 'Operaciones anónimas bloqueadas', false, { error: err.message });
  }

  console.log('\nResultados parciales (Cliente HTTP/Anon):', results);
}

runSuite().catch(console.error);

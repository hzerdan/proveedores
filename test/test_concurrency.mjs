import { createClient } from '@supabase/supabase-js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execAsync = promisify(exec);

const SUPABASE_URL = 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

async function runCliQuery(sql) {
  const tmpFile = path.join(os.tmpdir(), `test_query_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  await fs.writeFile(tmpFile, sql, 'utf8');
  try {
    const { stdout, stderr } = await execAsync(`supabase db query --linked -f "${tmpFile}"`, {
      cwd: process.cwd(),
      timeout: 30000,
    });
    const jsonMatch = stdout.match(/\{[\s\S]*"rows":\s*\[[\s\S]*?\][\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Failed to parse query output: ${stdout}\nStderr: ${stderr}`);
    }
    return JSON.parse(jsonMatch[0]).rows;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

async function getServiceRoleKey() {
  const envText = await fs.readFile('.env', 'utf8');
  const match = envText.match(/SUPABASE_ACCESS_TOKEN=["']?([^"'\r\n]+)["']?/);
  if (!match) throw new Error('SUPABASE_ACCESS_TOKEN no encontrado en .env');
  const token = match[1];

  const res = await fetch('https://api.supabase.com/v1/projects/hdkfeonbmhxkagdrbdio/api-keys', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Error al obtener API keys: ${res.statusText}`);
  const keys = await res.json();
  const serviceKey = keys.find(k => k.name === 'service_role' || k.tags?.includes('service_role'));
  if (!serviceKey) throw new Error('service_role key no encontrada');
  return serviceKey.api_key;
}

async function runConcurrencyTest() {
  console.log('=== INICIANDO PRUEBA DE CONCURRENCIA REAL ===');
  console.log('Entorno: QA (hdkfeonbmhxkagdrbdio)');
  console.log('Arquitectura: Conexiones concurrentes paralelas reales vía PostgREST + SELECT FOR UPDATE');

  // 1. Verificación negativa del rol anon
  console.log('\n[0/4] Verificando rechazo negativo del rol anon sobre el asignador...');
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: anonData, error: anonErr } = await anonClient.rpc('fn_allocate_internal_document_number', {
    p_series_id: 1,
    p_doc_type_code: 'ORDEN_PAGO',
    p_is_reversal: false,
  });

  if (anonErr) {
    console.log(`PASS: Rol anon rechazado correctamente: ${anonErr.message}`);
  } else {
    throw new Error('FAIL: Rol anon pudo invocar el asignador de numeración!');
  }

  // 2. Obtención de credencial autorizada para prueba de concurrencia
  console.log('\nObteniendo credencial autorizada temporal para conexiones concurrentes...');
  const serviceKey = await getServiceRoleKey();
  const authClient = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false },
  });
  console.log('Cliente autenticado inicializado correctamente.');

  // 3. Preparación de Serie de Prueba Dedicada (POS 999)
  console.log('\n[1/4] Creando serie de prueba temporal (POS 999, next_number 1)...');
  await runCliQuery(`
    DELETE FROM document_numbering_series WHERE point_of_sale = 999;
    INSERT INTO document_numbering_series (
      document_type_id, letter, point_of_sale, next_number, is_active, description, created_by
    ) VALUES (
      (SELECT id FROM document_types WHERE code = 'ORDEN_PAGO' LIMIT 1),
      NULL, 999, 1, true, 'Test Concurrencia Real',
      (SELECT id FROM profiles WHERE is_active = true ORDER BY id LIMIT 1)
    );
  `);

  const seriesRows = await runCliQuery('SELECT id, next_number FROM document_numbering_series WHERE point_of_sale = 999;');
  const seriesId = seriesRows[0].id;
  console.log(`Serie creada exitosamente con ID: ${seriesId}`);

  // 4. Disparo de 10 Transacciones Concurrentes Simultáneas vía HTTP/PostgREST Autenticado
  const CONCURRENT_WORKERS = 10;
  console.log(`\n[2/4] Disparando ${CONCURRENT_WORKERS} peticiones concurrentes simultáneas autenticadas compitiendo por la misma fila...`);

  const startTime = Date.now();
  const promises = Array.from({ length: CONCURRENT_WORKERS }, (_, index) => {
    return authClient.rpc('fn_allocate_internal_document_number', {
      p_series_id: seriesId,
      p_doc_type_code: 'ORDEN_PAGO',
      p_is_reversal: false,
    }).then(({ data, error }) => {
      if (error) {
        throw new Error(`Worker ${index + 1} falló: ${error.message}`);
      }
      return { worker: index + 1, data: data[0] };
    });
  });

  const results = await Promise.all(promises);
  const durationMs = Date.now() - startTime;
  console.log(`Todas las ${CONCURRENT_WORKERS} transacciones concurrentes completadas en ${durationMs}ms.`);

  // 5. Verificación de Resultados
  console.log('\n[3/4] Analizando asignaciones recibidas:');
  const assignedNumbers = results.map(r => parseInt(r.data.assigned_number, 10));

  results.forEach(r => {
    console.log(`  Worker ${r.worker.toString().padStart(2, ' ')} -> Asignado: ${r.data.assigned_number} (${r.data.human_reference})`);
  });

  // A. Verificación de Duplicados
  const uniqueNumbers = new Set(assignedNumbers);
  const hasDuplicates = uniqueNumbers.size !== assignedNumbers.length;
  console.log(`\n-> Total números asignados: ${assignedNumbers.length}`);
  console.log(`-> Total números únicos: ${uniqueNumbers.size}`);

  if (hasDuplicates) {
    console.error('FAIL: SE DETECTARON COLISIONES / DUPLICADOS EN ASIGNACIÓN CONCURRENTE!');
    process.exit(1);
  } else {
    console.log('PASS: Cero duplicados detectados bajo concurrencia real.');
  }

  // B. Verificación de Secuencia Estricta Correlativa
  assignedNumbers.sort((a, b) => a - b);
  const expectedSequence = Array.from({ length: CONCURRENT_WORKERS }, (_, i) => i + 1);
  const isSequenceCorrect = JSON.stringify(assignedNumbers) === JSON.stringify(expectedSequence);

  if (isSequenceCorrect) {
    console.log(`PASS: Secuencia correlativa exacta sin saltos ni huecos: [${assignedNumbers.join(', ')}]`);
  } else {
    console.error(`FAIL: Secuencia inesperada: [${assignedNumbers.join(', ')}], esperada: [${expectedSequence.join(', ')}]`);
    process.exit(1);
  }

  // C. Verificación de Ausencia de Actualizaciones Perdidas (Lost Updates)
  const finalSeriesState = await runCliQuery(`SELECT next_number FROM document_numbering_series WHERE id = ${seriesId};`);
  const finalNextNumber = parseInt(finalSeriesState[0].next_number, 10);
  const expectedNextNumber = CONCURRENT_WORKERS + 1;

  if (finalNextNumber === expectedNextNumber) {
    console.log(`PASS: Estado final del contador consistente: next_number = ${finalNextNumber} (esperado: ${expectedNextNumber}). No hubo actualizaciones perdidas.`);
  } else {
    console.error(`FAIL: Estado final del contador inconsistente: next_number = ${finalNextNumber} (esperado: ${expectedNextNumber})`);
    process.exit(1);
  }

  // 6. Verificación de Rollback Atómico ante Errores
  console.log('\n[4/4] Verificando Rollback Atómico ante error en la transacción...');
  try {
    await runCliQuery(`
      DO $$
      BEGIN
        PERFORM fn_allocate_internal_document_number(${seriesId}, 'ORDEN_PAGO', false);
        RAISE EXCEPTION 'ERROR_INTENCIONAL_PARA_ROLLBACK';
      END $$;
    `);
  } catch (err) {
    // Se esperaba error
  }

  const stateAfterRollback = await runCliQuery(`SELECT next_number FROM document_numbering_series WHERE id = ${seriesId};`);
  const numberAfterRollback = parseInt(stateAfterRollback[0].next_number, 10);

  if (numberAfterRollback === finalNextNumber) {
    console.log(`PASS: Rollback atómico verificado. El contador permaneció en ${numberAfterRollback} tras abortar la transacción con error.`);
  } else {
    console.error(`FAIL: El contador no respetó el rollback y avanzó a ${numberAfterRollback}`);
    process.exit(1);
  }

  // Limpieza de datos de prueba
  await runCliQuery(`DELETE FROM document_numbering_series WHERE id = ${seriesId};`);
  console.log('\nLimpieza completada: Serie de prueba eliminada.');
  console.log('\n=== RESULTADO FINAL DE CONCURRENCIA: PASS ===');
}

runConcurrencyTest().catch(err => {
  console.error('Error durante la prueba de concurrencia:', err);
  process.exit(1);
});

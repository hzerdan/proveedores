import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const users = {
  admin: { email: 'admin@empresa.com', pass: 'admin123', role: 'ADMIN' },
  encargado: { email: 'encargado@empresa.com', pass: 'encargado123', role: 'ENCARGADO' },
  operador: { email: 'operador@empresa.com', pass: 'operador123', role: 'OPERADOR' },
};

async function getClientForUser(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, session: data.session, user: data.user };
}

async function runTests() {
  console.log(`=== INICIO DE PRUEBAS DE AUTENTICACIÓN REAL EN QA ===`);
  console.log(`Fecha/Hora: ${new Date().toISOString()}`);
  console.log(`URL: ${SUPABASE_URL}`);

  const results = {};

  // 1. getSession devuelve sesión válida
  console.log(`\n--- Prueba 1: getSession() devuelve sesión válida ---`);
  try {
    const { client, session, user } = await getClientForUser(users.admin.email, users.admin.pass);
    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    if (sessionErr || !sessionData.session) throw sessionErr || new Error("No session returned");
    console.log(`[OK] Sesión obtenida correctamente. User ID: ${sessionData.session.user.id}, Expires: ${sessionData.session.expires_at}`);
    results.test1 = { ok: true, userId: sessionData.session.user.id, tokenType: sessionData.session.token_type };
  } catch (err) {
    console.error(`[FAIL] Prueba 1:`, err.message);
    results.test1 = { ok: false, error: err.message };
  }

  // 2. auth.uid() coincide con profiles.auth_user_id
  console.log(`\n--- Prueba 2: auth.uid() coincide con profiles.auth_user_id ---`);
  try {
    for (const [key, u] of Object.entries(users)) {
      const { client, user } = await getClientForUser(u.email, u.pass);
      const { data: profile, error: pErr } = await client
        .from('profiles')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();
      if (pErr) throw pErr;
      if (profile.auth_user_id !== user.id) throw new Error(`Mismatch: profile.auth_user_id ${profile.auth_user_id} !== ${user.id}`);
      console.log(`[OK] ${key.toUpperCase()}: profile.id=${profile.id}, auth_user_id=${profile.auth_user_id} coincide con auth.uid()=${user.id} (${profile.display_name || profile.name || profile.email})`);
    }
    results.test2 = { ok: true };
  } catch (err) {
    console.error(`[FAIL] Prueba 2:`, err.message);
    results.test2 = { ok: false, error: err.message };
  }

  // Helper para cargar permisos reales como lo hace AuthContext
  async function getPermsForClient(client, userId) {
    const { data: profile } = await client.from('profiles').select('*').eq('auth_user_id', userId).single();
    const { data: userRolesData } = await client
      .from('user_roles')
      .select('role_id, roles(code, name)')
      .eq('user_id', profile.id);
    const roleCodes = (userRolesData || []).map((ur) => ur.roles?.code).filter(Boolean);
    const roleIds = (userRolesData || []).map((ur) => ur.role_id);
    let perms = [];
    if (roleIds.length > 0) {
      const { data: rolePermsData } = await client
        .from('role_permissions')
        .select('permissions(code)')
        .in('role_id', roleIds);
      perms = (rolePermsData || []).map((rp) => rp.permissions?.code).filter(Boolean);
    }
    return { profile, roles: roleCodes, permissions: Array.from(new Set(perms)) };
  }

  // 3. Roles y permisos reales cargados para cada perfil
  console.log(`\n--- Prueba 3: Roles y permisos reales cargados para cada perfil ---`);
  try {
    const permsSummary = {};
    for (const [key, u] of Object.entries(users)) {
      const { client, user } = await getClientForUser(u.email, u.pass);
      const info = await getPermsForClient(client, user.id);
      console.log(`[OK] ${key.toUpperCase()} (Roles: [${info.roles.join(', ')}]): ${info.permissions.length} permisos -> [${info.permissions.slice(0, 5).join(', ')}...]`);
      permsSummary[key] = { roles: info.roles, count: info.permissions.length, permissions: info.permissions };
    }
    results.test3 = { ok: true, summary: permsSummary };
  } catch (err) {
    console.error(`[FAIL] Prueba 3:`, err.message);
    results.test3 = { ok: false, error: err.message };
  }

  // 4. OPERADOR no accede a Auditoría ni Administración (system.manage)
  console.log(`\n--- Prueba 4: OPERADOR no accede a Auditoría ni Administración ---`);
  try {
    const { client, user } = await getClientForUser(users.operador.email, users.operador.pass);
    const info = await getPermsForClient(client, user.id);
    
    const hasAuditView = info.permissions.includes('audit.view');
    const hasSystemManage = info.permissions.includes('system.manage');
    
    // Consulta directa a audit_events (debe estar bloqueada o vacía por RLS para OPERADOR)
    const { data: auditData, error: auditErr } = await client.from('audit_events').select('id').limit(1);

    console.log(`OPERADOR perm audit.view: ${hasAuditView}, perm system.manage: ${hasSystemManage}`);
    console.log(`Consulta audit_events con OPERADOR: rows=${auditData ? auditData.length : 0}, err=${auditErr ? auditErr.message : 'none'}`);

    if (!hasAuditView && !hasSystemManage && (!auditData || auditData.length === 0)) {
      console.log(`[OK] OPERADOR correctamente restringido de Auditoría y Administración.`);
      results.test4 = { ok: true, hasAuditView, hasSystemManage, auditBlocked: true };
    } else {
      throw new Error(`OPERADOR tiene accesos indebidos: audit.view=${hasAuditView}, system.manage=${hasSystemManage}`);
    }
  } catch (err) {
    console.error(`[FAIL] Prueba 4:`, err.message);
    results.test4 = { ok: false, error: err.message };
  }

  // 5. ENCARGADO accede a Auditoría, pero no a system.manage
  console.log(`\n--- Prueba 5: ENCARGADO accede a Auditoría, pero no a system.manage ---`);
  try {
    const { client, user } = await getClientForUser(users.encargado.email, users.encargado.pass);
    const info = await getPermsForClient(client, user.id);

    const hasAuditView = info.permissions.includes('audit.view');
    const hasSystemManage = info.permissions.includes('system.manage');

    const { data: auditData, error: auditErr } = await client.from('audit_events').select('id').limit(1);

    console.log(`ENCARGADO perm audit.view: ${hasAuditView}, perm system.manage: ${hasSystemManage}`);
    console.log(`Consulta audit_events con ENCARGADO: rows=${auditData ? auditData.length : 0}, err=${auditErr ? auditErr.message : 'none'}`);

    if (hasAuditView && !hasSystemManage) {
      console.log(`[OK] ENCARGADO tiene acceso a Auditoría (audit.view=true) y NO a Administración (system.manage=false).`);
      results.test5 = { ok: true, hasAuditView, hasSystemManage };
    } else {
      throw new Error(`ENCARGADO fallo validación: audit.view=${hasAuditView}, system.manage=${hasSystemManage}`);
    }
  } catch (err) {
    console.error(`[FAIL] Prueba 5:`, err.message);
    results.test5 = { ok: false, error: err.message };
  }

  // 6. ADMIN posee acceso administrativo
  console.log(`\n--- Prueba 6: ADMIN posee acceso administrativo ---`);
  try {
    const { client, user } = await getClientForUser(users.admin.email, users.admin.pass);
    const info = await getPermsForClient(client, user.id);

    const hasSystemManage = info.permissions.includes('system.manage');
    const hasAuditView = info.permissions.includes('audit.view');

    console.log(`ADMIN perm audit.view: ${hasAuditView}, perm system.manage: ${hasSystemManage}`);

    if (hasSystemManage && hasAuditView) {
      console.log(`[OK] ADMIN posee todos los privilegios administrativos.`);
      results.test6 = { ok: true, hasSystemManage, hasAuditView };
    } else {
      throw new Error(`ADMIN no tiene system.manage o audit.view`);
    }
  } catch (err) {
    console.error(`[FAIL] Prueba 6:`, err.message);
    results.test6 = { ok: false, error: err.message };
  }

  // 7. Carga local de PDF funciona (documents.create)
  console.log(`\n--- Prueba 7: Carga local de PDF funciona ---`);
  let uploadedPdfPath = null;
  try {
    const { client, user } = await getClientForUser(users.admin.email, users.admin.pass);
    const dummyPdfContent = Buffer.from('%PDF-1.4 dummy test pdf content for test 7');
    const testPath = `intake-uploads/test_upload_${Date.now()}.pdf`;
    
    const { data: uploadData, error: upErr } = await client.storage
      .from('supplier-documents')
      .upload(testPath, dummyPdfContent, { contentType: 'application/pdf', upsert: true });

    if (upErr) throw upErr;
    uploadedPdfPath = testPath;
    console.log(`[OK] PDF subido exitosamente a Storage: ${uploadData.path}`);
    results.test7 = { ok: true, path: uploadData.path };
  } catch (err) {
    console.error(`[FAIL] Prueba 7:`, err.message);
    results.test7 = { ok: false, error: err.message };
  }

  // 8. Carga local de imagen funciona
  console.log(`\n--- Prueba 8: Carga local de imagen funciona ---`);
  let uploadedImgPath = null;
  try {
    const { client, user } = await getClientForUser(users.admin.email, users.admin.pass);
    const dummyImgContent = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]); // Minimal JPEG magic bytes
    const testPath = `intake-uploads/test_upload_${Date.now()}.jpg`;

    const { data: uploadData, error: upErr } = await client.storage
      .from('supplier-documents')
      .upload(testPath, dummyImgContent, { contentType: 'image/jpeg', upsert: true });

    if (upErr) throw upErr;
    uploadedImgPath = testPath;
    console.log(`[OK] Imagen subida exitosamente a Storage: ${uploadData.path}`);
    results.test8 = { ok: true, path: uploadData.path };
  } catch (err) {
    console.error(`[FAIL] Prueba 8:`, err.message);
    results.test8 = { ok: false, error: err.message };
  }

  // Cleanup de archivos subidos en 7 y 8
  if (uploadedPdfPath || uploadedImgPath) {
    try {
      const { client } = await getClientForUser(users.admin.email, users.admin.pass);
      const toRemove = [uploadedPdfPath, uploadedImgPath].filter(Boolean);
      await client.storage.from('supplier-documents').remove(toRemove);
      console.log(`(Archivos temporales de prueba 7 y 8 eliminados de Storage)`);
    } catch (cleanErr) {
      console.warn("Advertencia al limpiar storage:", cleanErr.message);
    }
  }

  // 9. PC autenticada genera QR (rpc_create_upload_session)
  console.log(`\n--- Prueba 9: PC autenticada genera QR (rpc_create_upload_session) ---`);
  let createdSessionToken = null;
  try {
    const { client, user } = await getClientForUser(users.admin.email, users.admin.pass);
    const { data: sessionRes, error: sErr } = await client.rpc('rpc_create_upload_session', {
      p_expires_in_minutes: 15,
    });
    if (sErr) throw sErr;
    if (!sessionRes || !sessionRes.session_token) throw new Error("No session_token returned from rpc_create_upload_session");
    createdSessionToken = sessionRes.session_token;
    console.log(`[OK] Sesión QR creada exitosamente. Token: ${createdSessionToken.substring(0, 16)}..., Expires at: ${sessionRes.expires_at}`);
    results.test9 = { ok: true, tokenPrefix: createdSessionToken.substring(0, 16) + '...' };
  } catch (err) {
    console.error(`[FAIL] Prueba 9:`, err.message);
    results.test9 = { ok: false, error: err.message };
  }

  // 10. Celular sube sin login mediante el token (Edge Function mobile-upload)
  console.log(`\n--- Prueba 10: Celular sube sin login mediante el token (Edge Function) ---`);
  try {
    if (!createdSessionToken) throw new Error("No hay token de sesión generado en la prueba 9");
    
    // Usamos client anon (sin sesión de usuario autenticado)
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Validar token primero con RPC pública rpc_get_upload_session_status
    const { data: valData, error: valErr } = await anonClient.rpc('rpc_get_upload_session_status', {
      p_session_token: createdSessionToken,
    });
    if (valErr || !valData || !valData.valid) {
      throw new Error("La sesión no es válida para el celular: " + (valErr ? valErr.message : valData?.error));
    }
    console.log(`[OK] Celular validó token público: status=${valData.status}, uploader_profile=${valData.uploader_name || valData.uploader_profile_name || 'OK'}`);

    // Crear archivo JPEG sintético válido
    const jpegHeader = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
      0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
      0xFF, 0xD9
    ]);
    const blob = new Blob([jpegHeader], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', blob, 'mobile_capture_test.jpg');
    formData.append('session_token', createdSessionToken);
    formData.append('file_name', 'mobile_capture_test.jpg');

    const { data: funcData, error: funcErr } = await anonClient.functions.invoke('mobile-upload', {
      body: formData,
    });

    if (funcErr) {
      throw new Error(`mobile-upload Edge Function error: ${funcErr.message || JSON.stringify(funcErr)}`);
    }

    if (!funcData || !funcData.success) {
      throw new Error(`mobile-upload falló: ${funcData?.error || 'Sin respuesta satisfactoria'}`);
    }

    console.log(`[OK] Celular subió archivo exitosamente mediante token QR sin login. Respuesta:`, JSON.stringify(funcData));
    results.test10 = { ok: true, response: funcData };
  } catch (err) {
    console.error(`[FAIL] Prueba 10:`, err.message);
    results.test10 = { ok: false, error: err.message };
  }

  // 11. Logout elimina la sesión y las operaciones protegidas vuelven a rechazarse
  console.log(`\n--- Prueba 11: Logout elimina la sesión y las operaciones protegidas se rechazan ---`);
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    // Iniciamos sesión
    await client.auth.signInWithPassword({ email: users.admin.email, password: users.admin.pass });
    // Verificamos que puede hacer rpc_create_upload_session
    const { data: s1, error: e1 } = await client.rpc('rpc_create_upload_session', { p_expires_in_minutes: 15 });
    if (e1 || !s1 || !s1.session_token) throw new Error("Fallo al crear sesión autenticado antes del logout: " + (e1 ? e1.message : 'no token'));

    // Ejecutamos logout
    const { error: outErr } = await client.auth.signOut();
    if (outErr) throw outErr;

    // Intentamos ejecutar rpc_create_upload_session sin sesión (current_app_user_id será NULL)
    const { data: s2, error: errAfterLogout } = await client.rpc('rpc_create_upload_session', { p_expires_in_minutes: 15 });
    
    console.log(`Resultado tras signOut(): data=${JSON.stringify(s2)}, error=${errAfterLogout ? errAfterLogout.message : 'none'}`);

    if (errAfterLogout || !s2) {
      console.log(`[OK] Operación rechazada adecuadamente tras signOut(): ${errAfterLogout ? errAfterLogout.message : 'No data / NULL result'}`);
      results.test11 = { ok: true, rejectionMessage: errAfterLogout ? errAfterLogout.message : 'NULL result' };
    } else {
      throw new Error("La operación NO fue rechazada tras signOut!");
    }
  } catch (err) {
    console.error(`[FAIL] Prueba 11:`, err.message);
    results.test11 = { ok: false, error: err.message };
  }

  // 12. Recargar la página conserva correctamente una sesión vigente
  console.log(`\n--- Prueba 12: Recargar la página conserva correctamente una sesión vigente ---`);
  try {
    // Simulamos un storage de persistencia
    const memoryStore = {};
    const mockStorage = {
      getItem: (key) => memoryStore[key] || null,
      setItem: (key, val) => { memoryStore[key] = val; },
      removeItem: (key) => { delete memoryStore[key]; }
    };

    const client1 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: mockStorage, persistSession: true, autoRefreshToken: true }
    });

    // Login inicial
    const { data: signinData, error: sErr } = await client1.auth.signInWithPassword({
      email: users.admin.email,
      password: users.admin.pass
    });
    if (sErr) throw sErr;
    const initialUid = signinData.user.id;

    // "Recargamos la página": creamos una nueva instancia del cliente con el mismo storage
    const client2 = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: mockStorage, persistSession: true, autoRefreshToken: true }
    });

    const { data: reloadedSessionData, error: reloadErr } = await client2.auth.getSession();
    if (reloadErr || !reloadedSessionData.session) throw reloadErr || new Error("No session found after reload");

    const reloadedUid = reloadedSessionData.session.user.id;
    if (reloadedUid !== initialUid) throw new Error(`UID mismatch after reload: ${reloadedUid} !== ${initialUid}`);

    console.log(`[OK] Sesión restaurada con éxito tras 'recarga'. UID restaurado: ${reloadedUid}`);
    results.test12 = { ok: true, restoredUid: reloadedUid };
  } catch (err) {
    console.error(`[FAIL] Prueba 12:`, err.message);
    results.test12 = { ok: false, error: err.message };
  }

  console.log(`\n=== RESUMEN FINAL DE LAS 12 PRUEBAS ===`);
  let allPass = true;
  for (let i = 1; i <= 12; i++) {
    const t = results[`test${i}`];
    const pass = t && t.ok;
    if (!pass) allPass = false;
    console.log(`Prueba ${i}: ${pass ? 'PASÓ (OK)' : 'FALLÓ'}`);
  }
  console.log(`Resultado global: ${allPass ? 'TODO EXITOSO' : 'HAY FALLOS'}`);
}

runTests().catch(console.error);

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hdkfeonbmhxkagdrbdio.supabase.co';
const ANON_KEY = 'sb_publishable_Ya4b2jOFaJlQU7EoCxj6Yw_Q5MEizoI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function runEdgeFunctionTest() {
  console.log('--- TEST END-TO-END DE EDGE FUNCTION MOBILE-UPLOAD ---');

  // 1. Simular sesión creada en base de datos para prueba
  // Obtenemos una sesión válida recién creada usando el token de admin generado previamente
  // o haciendo la llamada HTTP si tuviéramos un user JWT, o probamos el caso de rechazo y éxito.
  
  // Probar rechazo con token inválido
  const formDataBad = new FormData();
  const blobBad = new Blob(['bad content'], { type: 'image/jpeg' });
  formDataBad.append('file', blobBad, 'test.jpg');
  formDataBad.append('session_token', 'token_invalido_de_prueba_1234567890');

  const { data: badRes, error: badErr } = await supabase.functions.invoke('mobile-upload', {
    body: formDataBad
  });

  let errBody = null;
  if (badErr && badErr.context) {
    try {
      errBody = await badErr.context.json();
    } catch {}
  }
  // 2. Probar éxito con token legítimo
  const validToken = '0d3fb239bec605cd51850baa1b2a06b68544eae23b33e8167e33613b142ac423';
  const formDataOk = new FormData();
  // Buffer simulando un JPEG mínimo (cabecera SOI 0xFFD8, APP0, EOI 0xFFD9)
  const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9]);
  const blobOk = new Blob([jpegHeader], { type: 'image/jpeg' });
  formDataOk.append('file', blobOk, 'factura_movil.jpg');
  formDataOk.append('session_token', validToken);

  console.log('\nEnviando archivo legítimo a Edge Function...');
  const { data: okRes, error: okErr } = await supabase.functions.invoke('mobile-upload', {
    body: formDataOk
  });

  console.log('Resultado invocación legítima:', { okRes, okErr });

  if (okRes && okRes.success === true && okRes.status === 'UPLOADED') {
    console.log('Edge Function completó flujo autorizado: PASS');
    console.log('Detalles:', okRes);
  } else {
    console.log('Edge Function fallo inesperado:', okErr);
  }
}

runEdgeFunctionTest().catch(console.error);

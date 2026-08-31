# PROYECTO — SISTEMA DE CUENTAS CORRIENTES DE PROVEEDORES

## 1. Objetivo del proyecto

Desarrollar un sistema de **cuentas corrientes de proveedores** que permita registrar, consultar, aplicar y auditar todos los movimientos económicos relacionados con proveedores de la empresa.

El sistema debe priorizar:

- simplicidad operativa;
- trazabilidad;
- consistencia contable;
- capacidad de auditoría;
- manejo correcto de aplicaciones parciales;
- separación estricta por moneda;
- posibilidad de incorporar automatización mediante IA;
- escalabilidad funcional futura.

La cuenta corriente debe poder reconstruirse íntegramente a partir de los movimientos registrados, evitando modificaciones destructivas de información histórica.

---

# 2. Principios generales de diseño

## 2.1. Inmutabilidad lógica

Un hecho económico confirmado no debería desaparecer.

Como principio general:

- no eliminar movimientos contables;
- evitar `ON DELETE CASCADE` en información económica;
- corregir errores mediante movimientos compensatorios, reversos o documentos específicos;
- conservar información suficiente para reconstruir qué ocurrió.

Esto no significa que absolutamente ningún dato administrativo pueda editarse, sino que una modificación que cambie el significado económico de una operación debe quedar adecuadamente registrada.

---

## 2.2. Trazabilidad

El sistema debe permitir responder preguntas como:

- ¿Quién cargó este comprobante?
- ¿Cuándo?
- ¿Qué proveedor corresponde?
- ¿Qué documento originó este saldo?
- ¿Qué pago lo canceló?
- ¿Fue cancelado total o parcialmente?
- ¿Qué aplicaciones posteriores existieron?
- ¿Se corrigió alguna imputación?
- ¿Quién realizó esa corrección?
- ¿Qué vendedor estaba asociado originalmente?
- ¿Fue modificado posteriormente?
- ¿Por qué?

La trazabilidad no debe depender exclusivamente de logs técnicos.

Las operaciones relevantes de negocio deben quedar representadas explícitamente en el modelo de datos.

---

# 3. Entidades conceptuales principales

Inicialmente identificamos las siguientes entidades:

### Proveedores

Representan a las empresas o personas con las cuales existe una relación de cuenta corriente.

### Comprobantes

Representan documentos económicos o administrativos.

Ejemplos:

- FAC — Factura
- NC — Nota de Crédito
- ND — Nota de Débito
- OP — Orden de Pago
- REC — Recibo
- APL — Aplicación
- otros tipos configurables

### Movimientos de cuenta corriente

Representan el verdadero impacto económico sobre la cuenta corriente.

Conceptualmente constituyen un **ledger**.

Un mismo comprobante puede eventualmente originar uno o varios movimientos.

### Vendedores

Representan contactos comerciales asociados a los proveedores y eventualmente a determinados comprobantes.

### Usuarios

Personas autorizadas a operar el sistema.

### Auditoría

Información relacionada con cambios relevantes, correcciones o intervenciones administrativas.

---

# 4. Identificación de comprobantes

Cada comprobante debe tener dos formas diferentes de identificación.

## 4.1. Identificador técnico

Identificador interno utilizado por el sistema.

Preferentemente:

`bigint`

Ejemplo:

`documents.id = 18274`

Este identificador nunca debe utilizarse como referencia humana del comprobante.

---

## 4.2. Identificación humana

Un comprobante puede identificarse mediante una combinación similar a:

- proveedor;
- tipo de comprobante;
- letra;
- punto de venta / terminal;
- número.

Ejemplo:

`FAC A 0003-00000035`

Debe evitarse la duplicación accidental de comprobantes.

Como regla inicial:

**Proveedor + tipo + letra + punto de venta + número**

debería permitir detectar potenciales duplicados.

La detección no necesariamente implica rechazo automático: puede existir una confirmación explícita cuando sea necesario admitir una excepción.

---

# 5. Modelo conceptual de movimientos

La cuenta corriente no debería depender únicamente del estado almacenado en una factura.

El saldo debe derivarse de movimientos registrados.

Conceptualmente:

`Saldo proveedor = SUM(account_movements.amount_signed)`

siempre dentro de una misma moneda.

Ejemplo:

| Movimiento | Importe |
|---|---:|
| Factura | +1000 |
| Nota de Crédito | -200 |
| Pago | -500 |
| Saldo | +300 |

La convención exacta de signos deberá mantenerse de manera uniforme en todo el sistema.

---

# 6. Separación por moneda

Las monedas no deben mezclarse.

Todos los cálculos de saldo deben considerar como mínimo:

`provider_id + currency`

Ejemplo:

Un proveedor podría tener simultáneamente:

- ARS: $1.500.000 a pagar
- USD: USD 3.200 a pagar

No corresponde sumar ambas monedas ni convertirlas automáticamente para obtener un supuesto saldo total.

Una eventual funcionalidad futura de conversión deberá presentarse como información analítica y no alterar los saldos originales.

---

# 7. Facturas

La factura genera una obligación.

Ejemplo:

Factura:

`+1000`

Saldo:

`+1000`

Si posteriormente se paga parcialmente:

Factura:

`+1000`

Aplicación del pago:

`-400`

Saldo pendiente:

`600`

Debe poder conocerse tanto:

- el saldo global del proveedor;
- como el saldo individual de cada documento.

---

# 8. Órdenes de Pago

Una Orden de Pago representa un pago realizado al proveedor.

Ejemplo:

Factura:

`FAC1 = +1000`

Orden de Pago:

`OP1 = -1000`

La OP puede aplicarse contra una o varias facturas.

También puede existir una OP por un importe superior al saldo actualmente adeudado.

Ejemplo:

`OP1 = -1000`

sin factura disponible.

Esto representa un saldo a favor que pertenece al proveedor y podrá aplicarse posteriormente.

---

# 9. Aplicaciones

Se utilizará conceptualmente un documento denominado:

`APL — Aplicación`

Su objetivo es relacionar y transferir saldos entre documentos sin modificar el saldo global de la cuenta corriente.

Ejemplo:

Existe:

`OP1 = -1000`

Posteriormente llegan:

`FAC1 = +400`

`FAC2 = +600`

Puede generarse:

`APL1`

con movimientos conceptuales:

- `+1000` contra OP1
- `-400` contra FAC1
- `-600` contra FAC2

Suma:

`0`

Por lo tanto:

**una APL no cambia el saldo global del proveedor.**

Su función es redistribuir o cancelar saldos documentales.

---

# 10. Aplicaciones parciales

El sistema debe soportar aplicaciones parciales.

Ejemplo:

Factura:

`FAC1 = +1000`

Pago:

`OP1 = -400`

Después de la aplicación:

`FAC1 pendiente = +600`

La aplicación debe permitir reconstruir exactamente qué importe de cada documento fue cancelado.

---

# 11. Desimputación y correcciones

Una aplicación incorrecta no debería eliminarse silenciosamente.

Ejemplo:

Se aplicó OP1 contra FAC1 pero correspondía FAC2.

El sistema debe realizar una operación de reversión/desimputación auditable.

Después puede generarse la aplicación correcta.

Debe quedar registrado:

- qué aplicación se revirtió;
- cuándo;
- quién;
- motivo;
- relación con la nueva operación, cuando corresponda.

---

# 12. Vendedores

Un proveedor puede estar relacionado con múltiples vendedores.

Un vendedor también puede representar múltiples proveedores.

Por lo tanto la relación es:

**Proveedor N : M Vendedor**

Debe existir una tabla de relación específica.

---

# 13. Vendedor asociado a comprobantes

La asociación proveedor-vendedor no implica necesariamente que todos los documentos históricos tengan automáticamente el mismo vendedor.

Por esa razón determinados comprobantes pueden almacenar explícitamente:

`seller_id`

Reglas iniciales:

### Proveedor con un único vendedor activo

Puede sugerirse automáticamente ese vendedor al cargar el comprobante.

### Proveedor con varios vendedores

El operador debe seleccionar el vendedor correspondiente.

### Vendedor inactivo

Puede conservarse en documentos históricos, pero no debería ofrecerse para nuevas operaciones.

---

# 14. Órdenes de Pago y vendedores

Como principio inicial:

**una Orden de Pago pertenece al proveedor, no al vendedor.**

Por lo tanto una OP normalmente:

`seller_id = NULL`

Si posee saldo sin aplicar, ese saldo:

- forma parte de la cuenta corriente del proveedor;
- no debe atribuirse arbitrariamente a un vendedor.

---

# 15. APL y vendedores

Los movimientos de una aplicación deben respetar el vendedor del documento afectado.

Ejemplo:

Si una APL cancela una factura perteneciente al vendedor Juan:

el movimiento correspondiente a esa factura queda relacionado conceptualmente con Juan.

Si otro movimiento de la misma APL cancela una OP:

ese movimiento no posee vendedor.

Esto permite mantener consistencia cuando se construyen vistas de saldos por vendedor.

---

# 16. Corrección de vendedor de comprobantes

El sistema deberá permitir dos situaciones diferentes.

## Regularización histórica

Documento existente:

`seller_id IS NULL`

Se asigna posteriormente un vendedor.

## Corrección

Documento existente:

`seller_id IS NOT NULL`

Se reemplaza por otro vendedor.

Estas operaciones deben ser auditadas.

Se propuso una estructura conceptual como:

`document_seller_history`

con información similar a:

- document_id
- old_seller_id
- new_seller_id
- change_type
- reason
- changed_by
- changed_at

Tipos:

- HISTORICAL_ASSIGNMENT
- CORRECTION

---

# 17. Aging de proveedores

El sistema debe permitir visualizar saldos pendientes agrupados según vencimiento.

Una estructura inicial de columnas:

- vencidos más de 60 días;
- vencidos entre 31 y 60 días;
- vencidos entre 1 y 30 días;
- a vencer entre 0 y 30 días;
- a vencer entre 31 y 60 días;
- a vencer en más de 60 días;
- total.

Cada fila debe representar:

`proveedor + moneda`

Nunca deben mezclarse monedas.

---

# 18. Proyección de pagos

Debe existir una vista destinada a planificación financiera.

La proyección debe mostrar documentos pendientes agrupados semanalmente.

Semana:

**lunes a domingo**

Debe permitir analizar:

- proveedor;
- moneda;
- documentos pendientes;
- vencimientos;
- importe pendiente;
- semana estimada de pago.

El filtro por fechas debería ser opcional.

Sin filtro deberían poder visualizarse todas las obligaciones pendientes.

---

# 19. Vista por proveedor

Debe permitir navegar:

Proveedor  
→ vendedores  
→ comprobantes  
→ aplicaciones/movimientos

Debe mostrar claramente:

- saldo total por moneda;
- saldo vencido;
- saldo a vencer;
- composición documental.

---

# 20. Vista por vendedor

Debe permitir navegar:

Vendedor  
→ proveedores  
→ comprobantes

El saldo debe construirse exclusivamente con movimientos legítimamente atribuibles al vendedor.

Una OP no aplicada no debe distribuirse artificialmente entre vendedores.

---

# 21. Ingreso de comprobantes

Se prevén tres modalidades.

## Manual

El operador carga directamente los campos.

## Documento digital

Carga de:

- PDF;
- fotografía;
- imagen escaneada.

Una función de IA/OCR podrá extraer datos y proponer valores.

El operador revisa y confirma.

## Captura móvil

Se prevé un flujo simplificado desde teléfono.

Una alternativa analizada es generar mediante QR una sesión de captura.

La imagen queda almacenada inicialmente en estado:

**listo para completar**

Posteriormente el operador ingresa al sistema principal, revisa la información y confirma el alta definitiva.

---

# 22. Creación de proveedores durante la carga

Si el proveedor no existe, debería poder crearse desde el mismo proceso de ingreso de comprobante, según los permisos del usuario.

La funcionalidad no debe obligar al operador a abandonar completamente el flujo de carga.

---

# 23. Usuarios y permisos

Roles iniciales posibles:

### Administrador

Acceso completo.

### Encargado

Operaciones avanzadas y determinadas correcciones.

### Operador

Carga y gestión operativa ordinaria.

El sistema debería utilizar permisos explícitos y no depender exclusivamente del nombre del rol.

Ejemplo:

`system.manage`

Podrán incorporarse permisos adicionales a medida que evolucione el sistema.

---

# 24. Auditoría

Además del ledger económico deberán existir mecanismos complementarios de auditoría.

Registrar especialmente:

- cambios administrativos importantes;
- cambio de vendedor;
- reversión de aplicaciones;
- cambios de configuración;
- operaciones de seguridad;
- acciones excepcionales.

Debe distinguirse entre:

**movimiento de negocio**

y

**log técnico/auditoría**.

No deben utilizarse indistintamente.

---

# 25. Interfaz principal

La navegación actualmente concebida utiliza sidebar.

Estructura tentativa:

## Cuentas Corrientes

- Cuentas Corrientes
- Saldo General
- Proyección de Pagos

## Maestros

- Proveedores
- Vendedores
- Tipos de Comprobantes

## Administración

- Usuarios & Seguridad
- Auditoría

La arquitectura debe permitir incorporar nuevas funciones sin saturar la navegación.

---

# 26. Tecnología

Stack actualmente considerado:

### Frontend

- React
- Vite
- Tailwind CSS

### Backend / Base de datos

- Supabase
- PostgreSQL

### Seguridad

- Supabase Auth
- RLS
- RBAC a nivel de aplicación

### Automatización / IA

- Supabase Edge Functions
- servicios LLM/OCR según necesidad

### Almacenamiento documental

Supabase Storage.

Bucket conceptual:

`supplier-documents`

---

# 27. Principio arquitectónico central

La decisión conceptual más importante del proyecto es separar:

### Documento

Representa el comprobante y sus datos administrativos.

### Movimiento

Representa el impacto económico.

### Aplicación

Representa la relación mediante la cual un saldo documental cancela o absorbe otro saldo.

Esto permite construir un sistema:

- auditable;
- reversible;
- extensible;
- consistente;
- capaz de manejar aplicaciones parciales;
- capaz de reconstruir saldos históricos.

---

# 28. Aspectos que debemos validar antes de cerrar el diseño

Este documento todavía no debe considerarse un esquema SQL definitivo.

Debemos validar especialmente:

1. estructura final de `documents`;
2. estructura final de `account_movements`;
3. forma exacta de representar aplicaciones;
4. conveniencia de usar exclusivamente movimientos o mantener además una tabla explícita de relaciones;
5. reglas exactas de signos por tipo de documento;
6. cálculo formal del saldo por documento;
7. comportamiento de anulaciones;
8. tratamiento de NC y ND;
9. comportamiento contable de REC;
10. estados de documentos;
11. flujo exacto de confirmación;
12. permisos por operación;
13. reglas RLS;
14. consistencia del modelo de vendedores;
15. reglas históricas de modificación;
16. necesidades fiscales o administrativas futuras.

---

# 29. Metodología de desarrollo

Antes de implementar una funcionalidad nueva, el agente debería:

1. inspeccionar el código existente;
2. identificar tablas, funciones, componentes y contratos afectados;
3. comparar la implementación actual con este documento;
4. informar incompatibilidades;
5. proponer el cambio;
6. implementar únicamente después de resolver contradicciones funcionales;
7. verificar la implementación.

Como controles técnicos habituales:

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

Además deberán existir pruebas funcionales específicas para las reglas económicas críticas.

---

# 30. Estado del documento

**Versión:** 0.1  
**Estado:** Documento maestro inicial  
**Objetivo:** consolidar decisiones y servir como base para diseño e implementación.

Este documento es evolutivo.

Las decisiones aquí escritas deberán clasificarse progresivamente como:

- DEFINIDA
- PROPUESTA
- PENDIENTE DE VALIDACIÓN
- DESCARTADA

Una vez estabilizado el modelo conceptual deberá generarse una versión formal del modelo de datos y sus invariantes.
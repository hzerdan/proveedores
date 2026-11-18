-- Migración: Generación automática de código de proveedor y trigger preventivo
-- Fecha: 2026-11-18

DROP FUNCTION IF EXISTS public.fn_next_supplier_code();
CREATE OR REPLACE FUNCTION public.fn_next_supplier_code()
RETURNS character varying
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_num integer;
    v_candidate character varying;
    v_exists boolean;
BEGIN
    SELECT COALESCE(
      MAX(
        CASE 
          WHEN code ~ '^PROV-[0-9]+$' THEN SUBSTRING(code FROM 6)::integer
          ELSE 0
        END
      ), 0
    ) + 1 INTO v_next_num FROM public.suppliers;

    LOOP
        v_candidate := 'PROV-' || LPAD(v_next_num::text, 3, '0');
        SELECT EXISTS(SELECT 1 FROM public.suppliers WHERE code = v_candidate) INTO v_exists;
        EXIT WHEN NOT v_exists;
        v_next_num := v_next_num + 1;
    END LOOP;

    RETURN v_candidate;
END;
$$;

ALTER FUNCTION public.fn_next_supplier_code() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.fn_next_supplier_code() TO anon, authenticated, service_role;

-- Función trigger para asignar código automáticamente si es nulo o vacío
DROP FUNCTION IF EXISTS public.trg_fn_set_supplier_code() CASCADE;
CREATE OR REPLACE FUNCTION public.trg_fn_set_supplier_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.code IS NULL OR TRIM(NEW.code) = '' THEN
        NEW.code := public.fn_next_supplier_code();
    ELSE
        NEW.code := TRIM(NEW.code);
    END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.trg_fn_set_supplier_code() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_set_supplier_code ON public.suppliers;
CREATE TRIGGER trg_set_supplier_code
BEFORE INSERT ON public.suppliers
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_set_supplier_code();

-- Actualizar rpc_quick_create_supplier para utilizar fn_next_supplier_code()
DROP FUNCTION IF EXISTS public.rpc_quick_create_supplier(character varying, character varying, character varying);
CREATE OR REPLACE FUNCTION public.rpc_quick_create_supplier(
    p_tax_id character varying, 
    p_trade_name character varying, 
    p_legal_name character varying DEFAULT NULL::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_cuit VARCHAR;
  v_formatted_cuit VARCHAR;
  v_existing_id BIGINT;
  v_new_supplier suppliers%ROWTYPE;
  v_next_code VARCHAR(20);
  v_user_id BIGINT;
BEGIN
  v_user_id := current_app_user_id();

  -- Clean CUIT
  v_clean_cuit := regexp_replace(p_tax_id, '[^0-9]', '', 'g');

  IF length(v_clean_cuit) <> 11 THEN
    RAISE EXCEPTION 'El CUIT debe tener exactamente 11 dígitos numéricos.';
  END IF;

  IF NOT fn_validate_cuit(v_clean_cuit) THEN
    RAISE EXCEPTION 'El CUIT ingresado (%) no posee un dígito verificador válido.', p_tax_id;
  END IF;

  -- Standard format: XX-XXXXXXXX-X
  v_formatted_cuit := substring(v_clean_cuit from 1 for 2) || '-' || 
                      substring(v_clean_cuit from 3 for 8) || '-' || 
                      substring(v_clean_cuit from 11 for 1);

  -- Check if already exists by clean or formatted CUIT
  SELECT id INTO v_existing_id 
  FROM suppliers 
  WHERE regexp_replace(tax_id, '[^0-9]', '', 'g') = v_clean_cuit 
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT * INTO v_new_supplier FROM suppliers WHERE id = v_existing_id;
    RETURN jsonb_build_object(
      'success', true,
      'is_existing', true,
      'supplier', row_to_json(v_new_supplier)
    );
  END IF;

  -- Generate Next Code using centralized sequence
  v_next_code := public.fn_next_supplier_code();

  -- Insert new supplier
  INSERT INTO suppliers (
    code,
    tax_id,
    legal_name,
    trade_name,
    is_active,
    created_by
  ) VALUES (
    v_next_code,
    v_formatted_cuit,
    COALESCE(NULLIF(trim(p_legal_name), ''), trim(p_trade_name)),
    trim(p_trade_name),
    true,
    v_user_id
  ) RETURNING * INTO v_new_supplier;

  RETURN jsonb_build_object(
    'success', true,
    'is_existing', false,
    'supplier', row_to_json(v_new_supplier)
  );
END;
$$;

ALTER FUNCTION public.rpc_quick_create_supplier(character varying, character varying, character varying) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_quick_create_supplier(character varying, character varying, character varying) TO PUBLIC, anon, authenticated, service_role;

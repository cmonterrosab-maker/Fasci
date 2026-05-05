-- Corrige la recursion infinita en las politicas RLS de admins.
-- Ejecutar en Supabase SQL Editor.

DROP POLICY IF EXISTS "Admins ven admins" ON admins;
DROP POLICY IF EXISTS "Super admins gestionan admins" ON admins;

CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = p_user_id
      AND activo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = p_user_id
      AND rol = 'super_admin'
      AND activo = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_user(uuid) TO authenticated;

CREATE POLICY "Admins ven admins"
  ON admins FOR SELECT
  TO authenticated
  USING (public.is_admin_user(auth.uid()));

CREATE POLICY "Super admins gestionan admins"
  ON admins FOR ALL
  TO authenticated
  USING (public.is_super_admin_user(auth.uid()))
  WITH CHECK (public.is_super_admin_user(auth.uid()));

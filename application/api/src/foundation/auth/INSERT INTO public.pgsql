INSERT INTO public.users
  (id, email, name, password_hash, role, branch_id, status)
VALUES
  ('dev-superadmin-001', 'superadmin@example.test',
   'Development Super Admin', '$2a$12$PhnD8shGynPSBdtgFGNBruj8Qi1WOwZnvJ9wVSZw1KSGSrlz7NkPW', 'SUPER_ADMIN', NULL, 'ACTIVE');
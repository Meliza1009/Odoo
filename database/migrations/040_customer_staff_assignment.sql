-- Explicit ownership limits staff access. Unassigned customers stay visible to admins only.
ALTER TABLE customers ADD COLUMN assigned_staff_id INTEGER REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX idx_customers_assigned_staff ON customers (assigned_staff_id);

-- Preserve an existing handling relationship only when all staff-created subscriptions
-- for a customer point to one active staff member. Ambiguous customers require admin assignment.
UPDATE customers c SET assigned_staff_id = owners.staff_id
FROM (
  SELECT s.customer_id, min(s.created_by) AS staff_id
  FROM subscriptions s JOIN users u ON u.id = s.created_by
  WHERE u.role = 'staff' AND u.is_active
  GROUP BY s.customer_id HAVING count(DISTINCT s.created_by) = 1
) owners WHERE owners.customer_id = c.id;

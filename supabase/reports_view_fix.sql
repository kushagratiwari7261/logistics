-- Redefine reporting views to include live data from shipments and jobs
-- This also incorporates revenue from completed payments

-- 1. Status Distribution
DROP VIEW IF EXISTS v_status_distribution CASCADE;
CREATE VIEW v_status_distribution AS
SELECT 
    status AS name,
    COUNT(*)::float / (SELECT COUNT(*) FROM shipments WHERE status IS NOT NULL) * 100 AS value
FROM shipments
WHERE status IS NOT NULL
GROUP BY status;

-- 2. Jobs by Type (Monthly)
DROP VIEW IF EXISTS v_jobs_by_type CASCADE;
CREATE VIEW v_jobs_by_type AS
WITH months AS (
    SELECT DISTINCT date_trunc('month', created_at) AS month_date
    FROM shipments
    UNION
    SELECT DISTINCT date_trunc('month', job_date) AS month_date
    FROM jobs
)
SELECT 
    to_char(m.month_date, 'Mon') AS month,
    m.month_date AS month_date,
    COUNT(s.id) FILTER (WHERE lower(s.shipment_type) LIKE '%air%') AS "Air",
    COUNT(s.id) FILTER (WHERE lower(s.shipment_type) LIKE '%sea%') AS "Sea",
    COUNT(s.id) FILTER (WHERE lower(s.shipment_type) NOT LIKE '%air%' AND lower(s.shipment_type) NOT LIKE '%sea%') AS "Road"
FROM months m
LEFT JOIN shipments s ON date_trunc('month', s.created_at) = m.month_date
GROUP BY m.month_date
ORDER BY m.month_date ASC;

-- 3. Monthly Volume and Revenue (from actual payments only)
DROP VIEW IF EXISTS v_monthly_stats CASCADE;
CREATE VIEW v_monthly_stats AS
WITH months AS (
    SELECT generate_series(
        date_trunc('month', current_date) - interval '6 months',
        date_trunc('month', current_date),
        interval '1 month'
    )::date AS month_date
),
monthly_shipments AS (
    SELECT 
        date_trunc('month', created_at)::date AS month_date,
        COUNT(*) AS shipment_count
    FROM shipments
    GROUP BY 1
),
monthly_payments AS (
    SELECT 
        date_trunc('month', p.paid_at)::date AS month_date,
        SUM(p.amount::numeric) AS total_collected
    FROM payments p
    WHERE p.status = 'paid' AND p.paid_at IS NOT NULL
    GROUP BY 1
)
SELECT 
    to_char(m.month_date, 'Mon') AS month,
    m.month_date AS month_date,
    COALESCE(ms.shipment_count, 0) AS shipments,
    COALESCE(mp.total_collected, 0) AS revenue
FROM months m
LEFT JOIN monthly_shipments ms ON ms.month_date = m.month_date
LEFT JOIN monthly_payments mp ON mp.month_date = m.month_date
ORDER BY m.month_date ASC;

-- 4. Top Clients
DROP VIEW IF EXISTS v_top_clients CASCADE;
CREATE VIEW v_top_clients AS
WITH client_stats AS (
    SELECT 
        client,
        COUNT(id) AS shipment_count,
        SUM(CASE 
            WHEN freight IS NOT NULL AND freight ~ '^\d+\.?\d*$' 
            THEN freight::numeric 
            ELSE 0 
        END) AS total_revenue
    FROM shipments
    WHERE client IS NOT NULL AND client != ''
    GROUP BY client
)
SELECT 
    ROW_NUMBER() OVER (ORDER BY shipment_count DESC, total_revenue DESC) AS rank,
    client AS name,
    shipment_count AS shipments,
    total_revenue AS revenue
FROM client_stats
LIMIT 10;

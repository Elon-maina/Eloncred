-- M-Pesa Express (STK Push) payments. One row per PIN prompt sent; an order can have
-- several if the customer retries. Run once on an existing database:
--   mysql -u root -p eloncred_db < Backend/migrations/2026-11-17-mpesa-payments.sql

CREATE TABLE IF NOT EXISTS mpesa_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT,
  phone VARCHAR(15) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  merchant_request_id VARCHAR(64),
  checkout_request_id VARCHAR(64) NOT NULL,
  status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  result_code INT,
  result_desc VARCHAR(255),
  mpesa_receipt VARCHAR(32),
  transaction_date DATETIME,
  last_queried_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  UNIQUE KEY uq_checkout_request (checkout_request_id),
  KEY idx_order (order_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

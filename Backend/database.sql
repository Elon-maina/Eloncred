-- Create database
CREATE DATABASE IF NOT EXISTS eloncred_db;
USE eloncred_db;

-- Create users table
-- 1) Create new users table (users_new)
CREATE TABLE IF NOT EXISTS users_new (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fullname VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50) DEFAULT NULL,
  password VARCHAR(255) NOT NULL,            -- bcrypt/hash stored here
  role ENUM('user','admin','moderator') NOT NULL DEFAULT 'user',
  is_admin TINYINT(1) AS (role = 'admin') STORED,
  email_verified TINYINT(1) DEFAULT 0,
  verification_token VARCHAR(255) DEFAULT NULL,
  last_login_at DATETIME DEFAULT NULL,
  failed_login_attempts INT DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  password_reset_token VARCHAR(255) DEFAULT NULL,
  password_reset_expires DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_phone (phone),
  INDEX idx_role (role),
  INDEX idx_last_login (last_login_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for better performance
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_phone ON users(phone);

-- Create products table (for future use)
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(100) DEFAULT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(100) DEFAULT NULL,
    image_url VARCHAR(1000) DEFAULT NULL,
    image_alt VARCHAR(255) DEFAULT NULL,
    stock_quantity INT DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FULLTEXT KEY idx_product_fulltext (name, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create orders table (for future use)
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    total_amount DECIMAL(10, 2) NOT NULL,
    status ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create messages table for user feedback and admin communication
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('unread', 'read', 'responded') DEFAULT 'unread',
    admin_response TEXT NULL,
    response_date TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
    price DECIMAL(10, 2) NOT NULL,
    category VARCHAR(100) DEFAULT NULL,
    image LONGTEXT DEFAULT NULL,
    stock_quantity INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_created (created_at)
);

-- Sessions table to track user sessions created on login
CREATE TABLE IF NOT EXISTS sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    ip VARCHAR(100) DEFAULT NULL,
    user_agent VARCHAR(1000) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_token (token),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert sample products
INSERT INTO products (name, description, price, category, image_url, stock_quantity) VALUES
('Premium Laptop', 'High-performance laptop for professionals', 1299.99, 'Electronics', '/images/laptop.jpg', 50),
('Designer T-Shirt', 'Comfortable and stylish cotton t-shirt', 29.99, 'Fashion', '/images/tshirt.jpg', 100),
('Smart Home Speaker', 'Voice-controlled smart speaker', 89.99, 'Electronics', '/images/speaker.jpg', 75),
('Coffee Maker', 'Automatic drip coffee maker', 49.99, 'Home', '/images/coffee-maker.jpg', 30);

-- Create database user (run these commands in MySQL separately)
-- CREATE USER 'eloncred_user'@'localhost' IDENTIFIED BY 'secure_password_123';
-- GRANT ALL PRIVILEGES ON eloncred_db.* TO 'eloncred_user'@'localhost';
-- FLUSH PRIVILEGES;
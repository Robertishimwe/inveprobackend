// Set environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '3600'; // Seconds
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-must-be-at-least-32-characters-long';
process.env.JWT_REFRESH_EXPIRES_IN_DAYS = '30';
process.env.PASSWORD_RESET_SECRET = 'test-password-reset-secret-must-be-at-least-32-characters-long';
process.env.PASSWORD_RESET_EXPIRES_IN = '600'; // Seconds
process.env.DATABASE_URL = 'postgresql://myuser:mypassword@localhost:5434/myappdb';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.EMAIL_FROM_ADDRESS = 'no-reply@example.com';
process.env.EMAIL_SMTP_HOST = 'smtp.example.com';
process.env.EMAIL_SMTP_PORT = '587';
process.env.EMAIL_SMTP_USER = 'user';
process.env.EMAIL_SMTP_PASS = 'pass';
process.env.CORS_ORIGIN = '*';

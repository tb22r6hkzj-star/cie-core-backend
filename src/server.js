import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Simple test route for the core app
app.get('/', (req, res) => {
  res.json({ message: 'CIE Core Backend is running.' });
});

// Health check route for deployment monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Use the PORT from the environment (for platforms like Render/Railway)
const port = process.env.PORT || 4000;

const server = app.listen(port, () => {
  console.log(`🚀 CIE Core Backend listening on port ${port}`);
});

// Graceful shutdown (in case we add a DB or other resources later)
const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
